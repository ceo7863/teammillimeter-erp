/**
 * Phase 4 migration readiness tests (SQLite integration on a temp DB, no mocks).
 * Run: npx tsx scripts/test-phase4-migration-readiness.mjs
 *
 * Required cases:
 *   1  identical dry-run plan hash twice        7  ambiguous client → MANUAL_REVIEW
 *   2  one bank transaction → one Receipt       8  basePaid alone → OPENING_BALANCE_CANDIDATE
 *   3  multi voucher batch → N allocations      9  unattributed FIFO → MANUAL_REVIEW
 *   4  deposit shortfall → prepaid             10  legacy + receipt on one bank tx → BLOCKED
 *   5  over-allocation → BLOCKED               11  temp-clone simulation parity (AUTO_SAFE)
 *   6  missing saleId → BLOCKED                12  mutations = 0 across the whole audit
 *
 * Plus: organic receipt audit gating, sale-diff classification coverage, and the Phase 4
 * apply refusal in scripts/legacy-receipt-migration-plan.mjs.
 *
 * The suite never touches a real database: DATABASE_PATH is redirected to a temp directory
 * before server/db.mjs is imported.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-phase4-migration-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.PDF_ARCHIVE_DIR = path.join(tmpDir, "pdf-archives");
process.env.JWT_SECRET = "test-phase4-migration-readiness";

const { initDb, getErpState, saveErpState, getErpVersionMeta } = await import("../server/db.mjs");
const { todaySeoul, shiftSeoulDate } = await import("../server/receipts.mjs");
const { buildArParityReport } = await import("../server/unifiedArReadModel.mjs");
const {
  AUTO_SAFE_BUCKETS,
  SALE_DIFF_CLASSES,
  auditOrganicReceipts,
  buildDeterministicMigrationPlan,
  buildGoNoGoChecklist,
  buildMigrationReadinessReport,
  classifyLegacyVouchers,
  classifySaleDiffsDetailed,
  computeMigrationSnapshotHash,
  investigateUnattributedFifo,
  maskClientName,
  simulateMigrationOnClone,
} = await import("../server/legacyReceiptMigrationAudit.mjs");
const { APPLY_REFUSAL, assertApplyForbidden, evaluateApplyPreconditions, parseArgs } = await import(
  "./legacy-receipt-migration-plan.mjs"
);

initDb();

let failed = 0;
let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error);
  }
}

/* ------------------------------------------------------------------ fixture */

const TODAY = todaySeoul();
const SALE_DAY = shiftSeoulDate(TODAY, -40);
const PAY_DAY = shiftSeoulDate(TODAY, -20);

const PLAIN = { id: 800, name: "\uD3C9\uBC94\uAC70\uB798\uCC98" };
const TWIN_A = { id: 801, name: "\uC911\uBCF5\uC0C1\uD638" };
const TWIN_B = { id: 802, name: "\uC911\uBCF5\uC0C1\uD638" };
const BANKY = { id: 803, name: "\uC740\uD589\uAC70\uB798\uCC98" };
const OPENING = { id: 804, name: "\uAE30\uCD08\uC794\uC561\uAC70\uB798\uCC98" };
const STATEMENT = { id: 805, name: "\uB0B4\uC5ED\uC11C\uAC70\uB798\uCC98" };
const CONFLICT = { id: 806, name: "\uCDA9\uB3CC\uAC70\uB798\uCC98" };

function sale(id, client, amount, extra = {}) {
  return {
    id,
    date: SALE_DAY,
    client: client.name,
    clientId: client.id,
    amount,
    paid: 0,
    site: `site-${id}`,
    ...extra,
  };
}

const SEED_SALES = [
  sale(2001, BANKY, 300_000), // case 2: one bank tx → one receipt
  sale(2002, BANKY, 100_000), // case 4: deposit shortfall → prepaid
  sale(2003, BANKY, 100_000),
  sale(2004, PLAIN, 100_000), // case 5: voucher total exceeds deposit
  sale(2005, PLAIN, 100_000),
  sale(2006, PLAIN, 100_000), // case 5b: single voucher exceeds sale capacity
  // case 7: legacy sale carrying only a duplicated client name (no clientId)
  { id: 2010, date: SALE_DAY, client: TWIN_A.name, amount: 120_000, paid: 0, site: "site-2010" },
  sale(2020, OPENING, 200_000, { paid: 200_000, basePaid: 200_000 }), // case 8: stored paid, no voucher
  sale(2030, STATEMENT, 100_000), // case 9: statement-scoped legacy cash
  sale(2040, CONFLICT, 400_000), // case 10: legacy + receipt on one bank tx
  sale(2050, PLAIN, 70_000), // case 3: input-log batch
  sale(2051, PLAIN, 30_000),
  sale(2060, PLAIN, 50_000), // AUTO_SAFE_MANUAL
  sale(2070, PLAIN, 150_000), // organic receipt target
  sale(2071, PLAIN, 150_000), // organic receipt with unallocated cash
  sale(2080, PLAIN, 100_000), // parity diff: voucher dated after the as-of date
  sale(2090, PLAIN, 100_000), // VAT-inclusive voucher against a VAT-exclusive sale
  // parity diff: the legacy view still counts a manual paid amount that was cleared
  sale(2085, PLAIN, 100_000, { paid: 50_000, manualPaidCleared: true }),
  // prod shape: basePaid 0 while paid/voucherPaid already mirror the voucher
  sale(2095, PLAIN, 500_000, { paid: 400_000, basePaid: 0, voucherPaid: 400_000 }),
];

const FUTURE_DAY = shiftSeoulDate(TODAY, 5);

const BATCH_CREATED_AT = "2026-01-02T03:04:05.000Z";

const SEED_VOUCHERS = [
  { id: "pv-bank-a", salesId: 2001, client: BANKY.name, date: PAY_DAY, amount: 300_000, finalAmount: 300_000, bankTransactionId: "btx-a" },
  { id: "pv-bank-b1", salesId: 2002, client: BANKY.name, date: PAY_DAY, amount: 100_000, finalAmount: 100_000, bankTransactionId: "btx-b" },
  { id: "pv-bank-b2", salesId: 2003, client: BANKY.name, date: PAY_DAY, amount: 100_000, finalAmount: 100_000, bankTransactionId: "btx-b" },
  { id: "pv-over-1", salesId: 2004, client: PLAIN.name, date: PAY_DAY, amount: 100_000, finalAmount: 100_000, bankTransactionId: "btx-over" },
  { id: "pv-over-2", salesId: 2005, client: PLAIN.name, date: PAY_DAY, amount: 100_000, finalAmount: 100_000, bankTransactionId: "btx-over" },
  { id: "pv-over-sale", salesId: 2006, client: PLAIN.name, date: PAY_DAY, amount: 200_000, finalAmount: 200_000 },
  { id: "pv-missing-sale", salesId: 999_999, client: PLAIN.name, date: PAY_DAY, amount: 10_000, finalAmount: 10_000 },
  { id: "pv-ambiguous", salesId: 2010, client: TWIN_A.name, date: PAY_DAY, amount: 120_000, finalAmount: 120_000 },
  {
    id: "pv-statement",
    client: STATEMENT.name,
    date: PAY_DAY,
    amount: 180_000,
    finalAmount: 180_000,
    statementSalesIds: [2030],
    linkedPdfArchiveId: "archive-statement-1",
  },
  { id: "pv-conflict", salesId: 2040, client: CONFLICT.name, date: PAY_DAY, amount: 400_000, finalAmount: 400_000, bankTransactionId: "btx-conflict" },
  { id: "pv-batch-1", salesId: 2050, client: PLAIN.name, date: PAY_DAY, amount: 70_000, finalAmount: 70_000 },
  { id: "pv-batch-2", salesId: 2051, client: PLAIN.name, date: PAY_DAY, amount: 30_000, finalAmount: 30_000 },
  { id: "pv-manual", salesId: 2060, client: PLAIN.name, date: PAY_DAY, amount: 50_000, finalAmount: 50_000, depositChannel: "cash" },
  { id: "pv-future", salesId: 2080, client: PLAIN.name, date: FUTURE_DAY, amount: 100_000, finalAmount: 100_000 },
  { id: "pv-vat", salesId: 2090, client: PLAIN.name, date: PAY_DAY, amount: 100_000, vatAmount: 10_000, finalAmount: 110_000 },
  { id: "pv-dup-base", salesId: 2095, client: PLAIN.name, date: PAY_DAY, amount: 400_000, finalAmount: 400_000 },
];

const SEED_INPUT_LOGS = [
  {
    id: "pil-1",
    createdAt: BATCH_CREATED_AT,
    paymentDate: PAY_DAY,
    client: PLAIN.name,
    salesId: 2050,
    supplyAmount: 70_000,
    vatAmount: 0,
    finalAmount: 70_000,
    vatIncluded: false,
    savedBy: "tester",
    paymentVoucherId: "pv-batch-1",
  },
  {
    id: "pil-2",
    createdAt: BATCH_CREATED_AT,
    paymentDate: PAY_DAY,
    client: PLAIN.name,
    salesId: 2051,
    supplyAmount: 30_000,
    vatAmount: 0,
    finalAmount: 30_000,
    vatIncluded: false,
    savedBy: "tester",
    paymentVoucherId: "pv-batch-2",
  },
];

const SEED_BANK = [
  { id: "btx-a", deposit: 300_000, withdrawal: 0, linkedPaymentVoucherId: "pv-bank-a" },
  { id: "btx-b", deposit: 250_000, withdrawal: 0, linkedPaymentVoucherId: "pv-bank-b1" },
  { id: "btx-over", deposit: 150_000, withdrawal: 0, linkedPaymentVoucherId: "pv-over-1" },
  { id: "btx-conflict", deposit: 400_000, withdrawal: 0 },
];

/** Organic Receipts: one clean, one holding unallocated cash, one colliding with a voucher. */
const SEED_RECEIPTS = [
  {
    id: "rcpt-clean",
    receiptNo: "R-0001",
    clientId: PLAIN.id,
    clientName: PLAIN.name,
    receiptDate: PAY_DAY,
    grossAmount: 150_000,
    channel: "cash",
    source: "receivables",
    status: "posted",
  },
  {
    id: "rcpt-prepaid",
    receiptNo: "R-0002",
    clientId: PLAIN.id,
    clientName: PLAIN.name,
    receiptDate: PAY_DAY,
    grossAmount: 200_000,
    channel: "bank",
    source: "bank_manual",
    status: "posted",
  },
  {
    id: "rcpt-conflict",
    receiptNo: "R-0003",
    clientId: CONFLICT.id,
    clientName: CONFLICT.name,
    receiptDate: PAY_DAY,
    grossAmount: 400_000,
    channel: "bank",
    source: "bank_auto",
    status: "posted",
    bankTransactionId: "btx-conflict",
  },
  {
    id: "rcpt-orig-rev",
    receiptNo: "R-0004",
    clientId: PLAIN.id,
    clientName: PLAIN.name,
    receiptDate: PAY_DAY,
    grossAmount: 80_000,
    channel: "other",
    source: "calendar",
    status: "reversed",
    reversedEffectiveDate: PAY_DAY,
  },
  {
    id: "rcpt-reversal",
    receiptNo: "R-0005",
    clientId: PLAIN.id,
    clientName: PLAIN.name,
    receiptDate: PAY_DAY,
    grossAmount: -80_000,
    channel: "other",
    source: "calendar",
    status: "posted",
    reversalOfReceiptId: "rcpt-orig-rev",
  },
];

const SEED_ALLOCATIONS = [
  { id: "alloc-clean", receiptId: "rcpt-clean", saleId: 2070, amount: 150_000, status: "posted", effectiveFrom: PAY_DAY },
  { id: "alloc-prepaid", receiptId: "rcpt-prepaid", saleId: 2071, amount: 150_000, status: "posted", effectiveFrom: PAY_DAY },
  { id: "alloc-conflict", receiptId: "rcpt-conflict", saleId: 2040, amount: 400_000, status: "posted", effectiveFrom: PAY_DAY },
];

function seed() {
  const state = getErpState();
  saveErpState(
    {
      ...state.data,
      clients: [PLAIN, TWIN_A, TWIN_B, BANKY, OPENING, STATEMENT, CONFLICT],
      sales: SEED_SALES,
      paymentVouchers: SEED_VOUCHERS,
      paymentInputLogs: SEED_INPUT_LOGS,
      receipts: SEED_RECEIPTS,
      receiptAllocations: SEED_ALLOCATIONS,
      bankTransactions: SEED_BANK,
      bankSyncMeta: {},
    },
    state.version,
    "phase4-seed",
    { allowReceiptMutation: true, allowPaymentVoucherMutation: true, allowPaymentInputLogMutation: true, allowSalePaidMutation: true },
  );
}
seed();

function data() {
  return getErpState().data || {};
}

const ARCHIVES = [
  {
    id: "archive-statement-1",
    category: "statement-client",
    subjectName: STATEMENT.name,
    sentViaLink: true,
    periodStart: SALE_DAY,
    periodEnd: TODAY,
    statementTotalAmount: 100_000,
    statementSalesIds: [2030],
  },
];

const snapshotBefore = computeMigrationSnapshotHash(data());
const versionBefore = getErpVersionMeta().version;

const buckets = classifyLegacyVouchers(data(), { asOfDate: TODAY });
const plan = buildDeterministicMigrationPlan(data(), { asOfDate: TODAY, buckets: AUTO_SAFE_BUCKETS });
const organic = auditOrganicReceipts(data(), { asOfDate: TODAY, archives: ARCHIVES });
const fifo = investigateUnattributedFifo(data(), { asOfDate: TODAY, archives: ARCHIVES });
const parity = buildArParityReport(data(), { asOfDate: TODAY, archives: ARCHIVES });
const saleDiffs = classifySaleDiffsDetailed(data(), parity, { asOfDate: TODAY, archives: ARCHIVES });
const simulation = simulateMigrationOnClone(data(), { asOfDate: TODAY, archives: ARCHIVES, plan });

function itemFor(voucherId) {
  const row = buckets.items.find((item) => item.voucherId === voucherId);
  assert.ok(row, `voucher ${voucherId} missing from the bucket report`);
  return row;
}

function plannedFor(groupKey) {
  return plan.receipts.find((row) => row.groupKey === groupKey) || null;
}

/* -------------------------------------------------------------------- cases */

check("1) the same snapshot produces the same plan hash twice", () => {
  const first = buildDeterministicMigrationPlan(data(), { asOfDate: TODAY, buckets: AUTO_SAFE_BUCKETS });
  const second = buildDeterministicMigrationPlan(data(), { asOfDate: TODAY, buckets: AUTO_SAFE_BUCKETS });
  assert.equal(first.planHash, second.planHash, "plan hash is not deterministic");
  assert.equal(first.snapshotHash, second.snapshotHash, "snapshot hash is not deterministic");
  assert.deepEqual(
    first.receipts.map((row) => row.deterministicReceiptId),
    second.receipts.map((row) => row.deterministicReceiptId),
    "deterministic receipt ids drifted between runs",
  );
  assert.deepEqual(
    first.receipts.map((row) => row.receiptNoCandidate),
    second.receipts.map((row) => row.receiptNoCandidate),
    "receipt number candidates drifted between runs",
  );
  // A different snapshot must produce a different plan hash.
  const mutatedSnapshot = { ...data(), paymentVouchers: (data().paymentVouchers || []).slice(0, -1) };
  const third = buildDeterministicMigrationPlan(mutatedSnapshot, { asOfDate: TODAY, buckets: AUTO_SAFE_BUCKETS });
  assert.notEqual(first.planHash, third.planHash, "plan hash ignored a snapshot change");
});

check("2) one bank transaction becomes exactly one Receipt with gross = deposit", () => {
  assert.equal(itemFor("pv-bank-a").bucket, "AUTO_SAFE_BANK");
  const bankPlans = plan.receipts.filter((row) => row.bankTransactionId === "btx-a");
  assert.equal(bankPlans.length, 1, "expected exactly one planned Receipt for btx-a");
  assert.equal(bankPlans[0].grossAmount, 300_000, "grossAmount must equal the bank deposit");
  assert.equal(bankPlans[0].allocationCount, 1);
  assert.equal(bankPlans[0].allocatedAmount, 300_000);
  assert.equal(bankPlans[0].prepaidAmount, 0);
  assert.equal(bankPlans[0].channel, "bank");
  assert.equal(bankPlans[0].source, "migration");
  const perBankTx = new Map();
  for (const row of plan.receipts) {
    if (!row.bankTransactionId) continue;
    perBankTx.set(row.bankTransactionId, (perBankTx.get(row.bankTransactionId) || 0) + 1);
  }
  for (const [bankTxId, count] of perBankTx) {
    assert.equal(count, 1, `bank transaction ${bankTxId} planned ${count} receipts`);
  }
});

check("3) a multi-voucher input-log batch becomes one Receipt with N allocations", () => {
  assert.equal(itemFor("pv-batch-1").bucket, "AUTO_SAFE_BATCH");
  assert.equal(itemFor("pv-batch-2").bucket, "AUTO_SAFE_BATCH");
  assert.equal(itemFor("pv-batch-1").groupKey, itemFor("pv-batch-2").groupKey, "batch members must share a group");
  const batchPlan = plannedFor(itemFor("pv-batch-1").groupKey);
  assert.ok(batchPlan, "batch group produced no planned Receipt");
  assert.equal(batchPlan.allocationCount, 2, "expected N allocations for N vouchers");
  assert.equal(batchPlan.grossAmount, 100_000);
  assert.equal(batchPlan.allocatedAmount, 100_000);
  assert.deepEqual(batchPlan.sourceVoucherIds.sort(), ["pv-batch-1", "pv-batch-2"]);
  assert.deepEqual(batchPlan.sourcePaymentInputLogIds.sort(), ["pil-1", "pil-2"]);
  // A lone voucher without batch evidence must not be merged into anything.
  const manualPlan = plannedFor("voucher:pv-manual");
  assert.ok(manualPlan, "AUTO_SAFE_MANUAL voucher produced no planned Receipt");
  assert.equal(manualPlan.allocationCount, 1);
  assert.equal(manualPlan.channel, "cash");
});

check("4) a deposit larger than its vouchers keeps the shortfall as prepaid", () => {
  const shortfall = plan.receipts.find((row) => row.bankTransactionId === "btx-b");
  assert.ok(shortfall, "btx-b produced no planned Receipt");
  assert.equal(shortfall.grossAmount, 250_000, "gross must follow the bank deposit, not the vouchers");
  assert.equal(shortfall.allocatedAmount, 200_000);
  assert.equal(shortfall.unallocatedAmount, 50_000);
  assert.equal(shortfall.prepaidAmount, 50_000, "unclaimed deposit cash must survive as prepaid");
  assert.equal(shortfall.allocationCount, 2);
  assert.equal(shortfall.status, "PLANNED");
});

check("5) over-allocation is BLOCKED, never trimmed to fit", () => {
  const overDeposit = itemFor("pv-over-1");
  assert.equal(overDeposit.bucket, "BLOCKED_CONFLICT");
  assert.ok(
    overDeposit.blockers.includes("voucher_total_exceeds_deposit"),
    `expected voucher_total_exceeds_deposit, got ${overDeposit.blockers.join(",")}`,
  );
  assert.equal(itemFor("pv-over-2").bucket, "BLOCKED_CONFLICT");

  const overSale = itemFor("pv-over-sale");
  assert.equal(overSale.bucket, "BLOCKED_CONFLICT");
  assert.ok(
    overSale.blockers.includes("allocation_exceeds_sale"),
    `expected allocation_exceeds_sale, got ${overSale.blockers.join(",")}`,
  );

  assert.equal(plannedFor("bank:btx-over"), null, "a blocked bank group must not be planned");
  assert.equal(plannedFor("voucher:pv-over-sale"), null, "a blocked voucher must not be planned");
});

check("6) a voucher pointing at a missing sale is BLOCKED", () => {
  const row = itemFor("pv-missing-sale");
  assert.equal(row.bucket, "BLOCKED_CONFLICT");
  assert.ok(row.blockers.includes("sale_missing"), `expected sale_missing, got ${row.blockers.join(",")}`);
  assert.equal(row.saleExists, false);
  assert.equal(plannedFor("voucher:pv-missing-sale"), null);
});

check("7) an ambiguous client name goes to MANUAL_REVIEW, not to a guess", () => {
  const row = itemFor("pv-ambiguous");
  assert.equal(row.bucket, "MANUAL_REVIEW");
  assert.ok(
    row.reviewReasons.includes("client_not_uniquely_resolvable"),
    `expected client_not_uniquely_resolvable, got ${row.reviewReasons.join(",")}`,
  );
  assert.equal(row.clientId, null, "an ambiguous name must not resolve to a clientId");
  assert.equal(plannedFor("voucher:pv-ambiguous"), null);
});

check("8) stored basePaid with no voucher is only an OPENING_BALANCE_CANDIDATE", () => {
  const row = buckets.items.find((item) => item.kind === "sale_stored_paid" && item.saleId === "2020");
  assert.ok(row, "stored sale.paid was not reported");
  assert.equal(row.bucket, "OPENING_BALANCE_CANDIDATE");
  assert.equal(row.amount, 200_000);
  assert.ok(row.reviewReasons.includes("stored_paid_without_voucher"));
  const plannedSaleIds = plan.receipts.flatMap((receipt) => receipt.allocations.map((alloc) => alloc.saleId));
  assert.ok(!plannedSaleIds.includes("2020"), "basePaid must never be planned as cash");
  assert.equal(
    buckets.buckets.OPENING_BALANCE_CANDIDATE.items.every((item) => !AUTO_SAFE_BUCKETS.includes(item.bucket)),
    true,
  );
});

check("9) unattributed statement cash stays MANUAL_REVIEW with candidates only", () => {
  assert.equal(itemFor("pv-statement").bucket, "MANUAL_REVIEW");
  assert.ok(itemFor("pv-statement").reviewReasons.includes("statement_scoped_fifo_required"));

  assert.equal(fifo.autoAllocate, false, "the FIFO investigation must never auto-allocate");
  const target = fifo.cases.find((row) => row.clientRef === maskClientName(STATEMENT.name));
  assert.ok(target, "expected an unattributed case for the statement client");
  assert.equal(target.decision, "MANUAL_REVIEW");
  assert.equal(target.voucherTotalAmount, 180_000);
  assert.equal(target.fifoAppliedAmount, 100_000, "FIFO placed the billed portion");
  assert.equal(target.unattributedAmount, 80_000, "the remainder stays unattributed");
  assert.ok(
    target.options.some((option) => option.action === "KEEP_AS_CLIENT_PREPAID"),
    "a prepaid option must be offered",
  );
  assert.ok(
    target.options.some((option) => option.action === "OPENING_BALANCE_ADJUSTMENT"),
    "an opening-balance option must be offered",
  );
  assert.equal(plannedFor("voucher:pv-statement"), null, "unattributed cash must not be planned");
});

check("10) a legacy voucher sharing a bank transaction with a Receipt is BLOCKED", () => {
  const row = itemFor("pv-conflict");
  assert.equal(row.bucket, "BLOCKED_CONFLICT");
  assert.ok(
    row.blockers.includes("bank_tx_already_has_receipt") || row.blockers.includes("bank_reference_conflict"),
    `expected a bank conflict blocker, got ${row.blockers.join(",")}`,
  );
  assert.equal(plannedFor("bank:btx-conflict"), null);

  const receiptRow = organic.receipts.find((item) => item.receiptId === "rcpt-conflict");
  assert.ok(receiptRow, "conflicting receipt missing from the organic audit");
  assert.equal(receiptRow.blocked, true);
  assert.deepEqual(receiptRow.bank.legacyVoucherIdsOnSameTx, ["pv-conflict"]);
  assert.equal(organic.gate, "BLOCKED");
});

check("11) the temp clone simulation keeps every AUTO_SAFE ledger number intact", () => {
  assert.equal(simulation.apply, false);
  assert.equal(simulation.gate, "PASS", `simulation failures: ${simulation.failures.join(",")}`);
  assert.equal(simulation.deltas.appliedDelta, 0, "migration must be cash neutral");
  assert.equal(simulation.deltas.salesChanged.length, 0, "no sale outstanding may move");
  assert.equal(simulation.deltas.clientsChanged.length, 0, "no client closing AR may move");
  assert.equal(simulation.deltas.statementsChanged.length, 0, "no statement status may move");
  assert.equal(simulation.deltas.bankConflicts.new.length, 0, "the migration must not create bank conflicts");
  assert.equal(simulation.deltas.newErrorCodes.length, 0);
  assert.equal(simulation.after.cashIdentity.ok, true, "cash identity must hold after the migration");
  assert.equal(
    simulation.after.cashIdentity.grossToEnd - simulation.before.cashIdentity.grossToEnd,
    plan.totals.grossAmount,
    "simulated receipt cash must equal the planned gross",
  );
  assert.equal(simulation.clone.sourceDataUnchanged, true, "the source snapshot was mutated");
});

check("12) the whole audit performs zero mutations", () => {
  const report = buildMigrationReadinessReport(data(), {
    asOfDate: TODAY,
    archives: ARCHIVES,
    parityReport: parity,
  });
  const sections = [
    report,
    report.organicReceipts,
    report.saleDiffs,
    report.unattributedFifo,
    report.legacyBuckets,
    report.plan,
    report.simulation,
  ];
  for (const section of sections) {
    assert.equal(section.mutations, 0, "a section reported a mutation");
    assert.equal(section.apply, false, "a section reported apply=true");
  }
  const snapshotAfter = computeMigrationSnapshotHash(data());
  assert.equal(snapshotAfter.hash, snapshotBefore.hash, "the ERP snapshot changed during the audit");
  assert.deepEqual(snapshotAfter.counts, snapshotBefore.counts, "record counts changed during the audit");
  assert.equal(getErpVersionMeta().version, versionBefore, "the ERP state version changed during the audit");
});

/* --------------------------------------------------------- supporting cases */

check("13) organic receipt audit reports cash identity, allocations and bank links", () => {
  const clean = organic.receipts.find((row) => row.receiptId === "rcpt-clean");
  assert.ok(clean);
  assert.equal(clean.blocked, false);
  assert.equal(clean.cashIdentity.ok, true);
  assert.equal(clean.allocatedSum, 150_000);
  assert.equal(clean.unallocatedAmount, 0);
  assert.equal(clean.saleIdsExist, true);
  assert.equal(clean.clientMatches, true);

  const prepaid = organic.receipts.find((row) => row.receiptId === "rcpt-prepaid");
  assert.equal(prepaid.unallocatedAmount, 50_000);
  assert.equal(prepaid.cashIdentity.ok, true, "unallocated cash is not an identity break");
  assert.ok(prepaid.warnings.some((row) => row.code === "UNALLOCATED_CASH_PREPAID"));

  // Names never leave the audit: only clientId plus a salted hash.
  const serialized = JSON.stringify(organic);
  for (const client of [PLAIN, BANKY, STATEMENT, CONFLICT, OPENING]) {
    assert.ok(!serialized.includes(client.name), `client name leaked into the organic report: ${client.name}`);
  }
});

check("14) every parity difference is classified with evidence and no name leak", () => {
  assert.ok(saleDiffs.counts.diffCount > 0, "the fixture should produce parity differences");
  for (const row of saleDiffs.diffs) {
    assert.ok(SALE_DIFF_CLASSES.includes(row.classification), `unknown class ${row.classification}`);
    assert.ok(row.evidence.length > 0, `sale ${row.saleId} has no evidence`);
    assert.equal(typeof row.basePaid, "number");
  }
  const futureDated = saleDiffs.diffs.find((row) => row.saleId === "2080");
  assert.ok(futureDated, "a voucher dated after the as-of date must show up as a parity difference");
  assert.equal(futureDated.classification, "EXPECTED_ASOF_DIFFERENCE");
  assert.equal(futureDated.delta, 100_000);

  const clearedManualPaid = saleDiffs.diffs.find((row) => row.saleId === "2085");
  assert.ok(clearedManualPaid, "a cleared manual paid amount must show up as a parity difference");
  assert.equal(clearedManualPaid.classification, "LEGACY_DATA_DEFECT");
  assert.equal(clearedManualPaid.basePaid, 0, "unified must ignore a cleared manual paid amount");

  const statementSale = saleDiffs.diffs.find((row) => row.saleId === "2030");
  if (statementSale) {
    assert.ok(
      ["LEGACY_UNATTRIBUTED", "LEGACY_FIFO_INFERENCE", "STATEMENT_REFERENCE_ONLY"].includes(
        statementSale.classification,
      ),
      `statement sale classified as ${statementSale.classification}`,
    );
  }
  const serialized = JSON.stringify(saleDiffs);
  for (const client of [PLAIN, BANKY, STATEMENT, CONFLICT, OPENING, TWIN_A]) {
    assert.ok(!serialized.includes(client.name), `client name leaked into the diff report: ${client.name}`);
  }
});


check("14c) basePaid:0 with mirrored paid does not create a false parity gap", () => {
  const row = saleDiffs.diffs.find((item) => item.saleId === "2095");
  assert.equal(row, undefined, "after basePaid fix, sale 2095 must not appear as a parity diff");
  const opening = buckets.items.find((item) => item.kind === "sale_stored_paid" && item.saleId === "2095");
  assert.equal(opening, undefined, "basePaid:0 must not become an opening-balance candidate");
  const voucher = itemFor("pv-dup-base");
  assert.ok(!voucher.reviewReasons.includes("sale_stored_paid_overlap"));
});

check("13b) reversal receipts with negative gross do not fail cash identity", () => {
  const reversal = organic.receipts.find((row) => row.receiptId === "rcpt-reversal");
  assert.ok(reversal, "reversal receipt missing from organic audit");
  assert.equal(reversal.grossAmount, -80_000);
  assert.equal(reversal.cashIdentity.ok, true);
  assert.equal(reversal.blocked, false);
  assert.equal(reversal.cashIdentity.isReversalReceipt, true);
});
check("14b) a VAT-inclusive voucher is MANUAL_REVIEW, not a BLOCKED conflict", () => {
  const row = itemFor("pv-vat");
  assert.equal(
    row.bucket,
    "MANUAL_REVIEW",
    `VAT face amounts are documented behaviour, not a conflict (got ${row.bucket}: ${row.blockers.join(",")})`,
  );
  assert.ok(row.reviewReasons.includes("allocation_exceeds_sale_by_vat"));
  assert.ok(row.reviewReasons.includes("vat_embedded_final_amount"));
  assert.ok(!row.blockers.includes("allocation_exceeds_sale"));
  assert.equal(plannedFor("voucher:pv-vat"), null, "a VAT decision must not be auto-migrated");
});

check("15) buckets report counts and amounts per class", () => {
  const total = Object.values(buckets.buckets).reduce((count, bucket) => count + bucket.count, 0);
  assert.equal(total, buckets.items.length, "bucket counts do not add up to the item count");
  assert.equal(
    buckets.buckets.AUTO_SAFE_BANK.bankTransactionCount,
    2,
    "expected two auto-safe bank transactions (btx-a, btx-b)",
  );
  assert.ok(buckets.buckets.BLOCKED_CONFLICT.count >= 4);
  assert.ok(buckets.buckets.MANUAL_REVIEW.count >= 2);
  assert.equal(buckets.buckets.OPENING_BALANCE_CANDIDATE.count, 1);
  for (const bucket of Object.values(buckets.buckets)) {
    assert.equal(
      bucket.amount,
      bucket.items.reduce((totalAmount, item) => totalAmount + item.amount, 0),
      `bucket ${bucket.bucket} amount does not match its items`,
    );
  }
});

check("16) plan rows carry provenance, operation id and payload hash", () => {
  assert.ok(plan.receipts.length >= 4, "expected planned receipts for the auto-safe fixture");
  const seenIds = new Set();
  const seenOperationIds = new Set();
  for (const row of plan.receipts) {
    assert.equal(row.source, "migration");
    assert.match(row.deterministicReceiptId, /^mig-rcpt-[0-9a-f]{24}$/);
    assert.match(row.operationId, /^legacy-migration:[0-9a-f]{32}$/);
    assert.match(row.receiptNoCandidate, /^MIG-\d{8}-\d{4}$/);
    assert.equal(row.payloadHash.length, 64);
    assert.equal(row.provenanceHash.length, 64);
    assert.ok(row.sourceVoucherIds.length > 0);
    assert.equal(row.allocatedAmount + row.unallocatedAmount, row.grossAmount, "plan breaks cash identity");
    assert.ok(!seenIds.has(row.deterministicReceiptId), "duplicate deterministic receipt id");
    assert.ok(!seenOperationIds.has(row.operationId), "duplicate operation id");
    seenIds.add(row.deterministicReceiptId);
    seenOperationIds.add(row.operationId);
  }
});

check("17) --apply is refused in Phase 4", () => {
  const options = parseArgs(["--apply"]);
  assert.equal(options.apply, true);
  assert.throws(
    () => assertApplyForbidden(options),
    (error) => error.message === APPLY_REFUSAL && error.code === "PHASE4_APPLY_FORBIDDEN",
    "expected the Phase 4 apply refusal",
  );
  assert.equal(assertApplyForbidden(parseArgs([])).ok, true, "dry-run must be allowed");

  const snapshot = computeMigrationSnapshotHash(data());
  const bare = evaluateApplyPreconditions(parseArgs([]), snapshot, plan);
  assert.equal(bare.satisfied, false);
  assert.deepEqual(bare.missing.sort(), [
    "--approval-token",
    "--expect-counts",
    "--expect-plan-hash",
    "--expect-snapshot",
  ]);

  const complete = evaluateApplyPreconditions(
    parseArgs([
      "--approval-token=owner-token",
      `--expect-snapshot=${snapshot.hash}`,
      `--expect-plan-hash=${plan.planHash}`,
      `--expect-counts=sales=${snapshot.counts.sales},paymentVouchers=${snapshot.counts.paymentVouchers}`,
    ]),
    snapshot,
    plan,
  );
  assert.equal(complete.satisfied, true, `unsatisfied: ${JSON.stringify(complete)}`);

  const wrong = evaluateApplyPreconditions(
    parseArgs([
      "--approval-token=owner-token",
      "--expect-snapshot=deadbeef",
      `--expect-plan-hash=${plan.planHash}`,
      `--expect-counts=sales=${snapshot.counts.sales}`,
    ]),
    snapshot,
    plan,
  );
  assert.equal(wrong.satisfied, false);
  assert.equal(wrong.mismatched[0].field, "snapshotHash");
});

check("18) the GO/NO-GO gate blocks on conflicts and holds on manual review", () => {
  const checklist = buildGoNoGoChecklist({
    organicReceipts: organic,
    saleDiffs,
    unattributedFifo: fifo,
    legacyBuckets: buckets,
    plan,
    simulation,
  });
  assert.equal(checklist.decision, "NO_GO", "the conflicted fixture must not be GO");
  assert.ok(checklist.blockingChecks.includes("no-blocked-conflict"));
  assert.ok(checklist.blockingChecks.includes("organic-receipt-integrity"));

  const clean = buildGoNoGoChecklist({
    organicReceipts: { ...organic, gate: "PASS", counts: { ...organic.counts, blockedCount: 0 }, mutations: 0, apply: false },
    saleDiffs: { ...saleDiffs, counts: { ...saleDiffs.counts, readModelBugCount: 0 }, mutations: 0, apply: false },
    unattributedFifo: { ...fifo, counts: { ...fifo.counts, unresolvedCaseCount: 0 }, mutations: 0, apply: false },
    legacyBuckets: {
      ...buckets,
      counts: { ...buckets.counts, blockedCount: 0, manualReviewCount: 0 },
      mutations: 0,
      apply: false,
    },
    plan: { ...plan, counts: { ...plan.counts, blockedReceiptCount: 0 }, mutations: 0, apply: false },
    simulation,
  });
  assert.equal(clean.decision, "GO", `expected GO, got ${clean.decision}: ${clean.holdingChecks.join(",")}`);
});

check("19) simulateMigrationOnClone works on a temp copy of a SQLite file", () => {
  const sourcePath = process.env.DATABASE_PATH;
  const sizeBefore = fs.statSync(sourcePath).size;
  const fromFile = simulateMigrationOnClone(sourcePath, { asOfDate: TODAY, archives: ARCHIVES });
  assert.equal(fromFile.clone.mode, "sqlite_copy");
  assert.equal(fromFile.clone.sourceUnchanged, true, "the source SQLite file was modified");
  assert.equal(fromFile.apply, false);
  assert.equal(fromFile.mutations, 0);
  assert.equal(fromFile.planHash, plan.planHash, "the file clone produced a different plan");
  assert.equal(fs.statSync(sourcePath).size, sizeBefore, "the source SQLite file changed size");
});

/* ------------------------------------------------------------------ summary */

console.log(`\nphase4 migration readiness: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
