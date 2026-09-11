/**
 * Cutover stabilization tests.
 * Task ID: `ERP_UNIFIED_AR_LEDGER_CUTOVER_STABILIZATION_FINAL`
 * Run: npx tsx scripts/test-ar-ledger-cutover-stabilization.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-ar-cutover-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.PDF_ARCHIVE_DIR = path.join(tmpDir, "pdf-archives");
process.env.JWT_SECRET = "test-ar-ledger-cutover";

const { initDb, getErpState, saveErpState } = await import("../server/db.mjs");
const { todaySeoul, shiftSeoulDate, createAndPostReceipt } = await import("../server/receipts.mjs");
const {
  planPaymentVoucherWriteFreeze,
  planPaymentInputLogWriteFreeze,
  freezeSalePaidFieldsForSave,
} = await import("../server/erpSaveMerge.mjs");
const {
  computeLegacyDatasetHash,
  canonicalizeLegacyDataset,
  decideGlobalArLedgerCutoverAt,
  stampGlobalArLedgerCutoverMetadata,
  buildArLedgerCutoverHealthReport,
} = await import("../server/arLedgerCutover.mjs");
const { APPLY_REFUSAL, assertApplyForbidden, parseArgs } = await import(
  "./legacy-receipt-migration-plan.mjs"
);
const { buildSaleArBalances } = await import("../server/unifiedArReadModel.mjs");

initDb();

let passed = 0;
let failed = 0;
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

const TODAY = todaySeoul();
const PAY_DAY = shiftSeoulDate(TODAY, -3);
const CLIENT = { id: 901, name: "cutover-client" };
const CUTOVER_AT = "2026-09-10T06:48:05.832Z";

function seed() {
  const state = getErpState();
  saveErpState(
    {
      ...state.data,
      clients: [CLIENT],
      sales: [
        {
          id: 5001,
          date: shiftSeoulDate(TODAY, -10),
          client: CLIENT.name,
          clientId: CLIENT.id,
          amount: 500_000,
          paid: 200_000,
          basePaid: 0,
          voucherPaid: 200_000,
          site: "site-5001",
        },
        {
          id: 5002,
          date: shiftSeoulDate(TODAY, -5),
          client: CLIENT.name,
          clientId: CLIENT.id,
          amount: 300_000,
          paid: 0,
          basePaid: 0,
          site: "site-5002",
        },
      ],
      paymentVouchers: [
        {
          id: "pv-legacy-1",
          salesId: 5001,
          client: CLIENT.name,
          date: shiftSeoulDate(TODAY, -8),
          amount: 200_000,
          finalAmount: 200_000,
        },
      ],
      paymentInputLogs: [
        {
          id: "pil-1",
          paymentVoucherId: "pv-legacy-1",
          salesId: 5001,
          client: CLIENT.name,
          paymentDate: shiftSeoulDate(TODAY, -8),
          finalAmount: 200_000,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      receipts: [],
      receiptAllocations: [],
      bankTransactions: [
        { id: "btx-1", deposit: 150_000, withdrawal: 0, transactionAt: `${PAY_DAY}T10:00:00+09:00` },
      ],
      bankSyncMeta: {
        bankReceiptCutoverAt: CUTOVER_AT,
      },
    },
    state.version,
    "cutover-seed",
    { allowPaymentVoucherMutation: true, allowPaymentInputLogMutation: true, allowSalePaidMutation: true },
  );
}

let opSeq = 0;
function postReceipt(partial) {
  opSeq += 1;
  return createAndPostReceipt(
    {
      operationId: `cutover-test-op-${opSeq}`,
      ...partial,
    },
    partial.actor || "tester",
  );
}

seed();

check("1) generic save cannot modify an existing legacy voucher amount", () => {
  const state = getErpState();
  const tampered = (state.data.paymentVouchers || []).map((row) =>
    String(row.id) === "pv-legacy-1" ? { ...row, finalAmount: 999_999, amount: 999_999 } : row,
  );
  saveErpState({ ...state.data, paymentVouchers: tampered }, state.version, "attacker");
  const after = getErpState().data.paymentVouchers.find((row) => String(row.id) === "pv-legacy-1");
  assert.equal(Number(after.finalAmount), 200_000);
  assert.equal(Number(after.amount), 200_000);
});

check("2) generic save cannot delete an existing legacy voucher", () => {
  const state = getErpState();
  saveErpState({ ...state.data, paymentVouchers: [] }, state.version, "attacker");
  assert.equal(getErpState().data.paymentVouchers.length, 1);
  assert.equal(String(getErpState().data.paymentVouchers[0].id), "pv-legacy-1");
});

check("3) generic save cannot create a new legacy voucher", () => {
  const state = getErpState();
  const before = state.data.paymentVouchers.length;
  saveErpState(
    {
      ...state.data,
      paymentVouchers: [
        ...state.data.paymentVouchers,
        { id: "pv-new-forbidden", salesId: 5002, client: CLIENT.name, date: TODAY, amount: 10_000, finalAmount: 10_000 },
      ],
    },
    state.version,
    "attacker",
  );
  const after = getErpState().data.paymentVouchers;
  assert.equal(after.length, before);
  assert.ok(!after.some((row) => String(row.id) === "pv-new-forbidden"));
});

check("4) paymentInputLogs create/update/delete are all sealed", () => {
  const state = getErpState();
  saveErpState(
    {
      ...state.data,
      paymentInputLogs: [
        { id: "pil-1", paymentVoucherId: "pv-legacy-1", finalAmount: 1, createdAt: "x" },
        { id: "pil-new", paymentVoucherId: "x", finalAmount: 2, createdAt: "y" },
      ],
    },
    state.version,
    "attacker",
  );
  const logs = getErpState().data.paymentInputLogs;
  assert.equal(logs.length, 1);
  assert.equal(String(logs[0].id), "pil-1");
  assert.equal(Number(logs[0].finalAmount), 200_000);
  const plan = planPaymentInputLogWriteFreeze(logs, [], {});
  assert.equal(plan.frozen, true);
  assert.equal(plan.logs.length, 1);
});

check("5) sale.paid / basePaid cannot be rewritten by a payment-path save", () => {
  const state = getErpState();
  const sales = (state.data.sales || []).map((row) =>
    String(row.id) === "5001" ? { ...row, paid: 0, basePaid: 50_000, voucherPaid: 0 } : row,
  );
  saveErpState({ ...state.data, sales }, state.version, "attacker");
  const sale = getErpState().data.sales.find((row) => String(row.id) === "5001");
  assert.equal(Number(sale.paid), 200_000);
  assert.equal(Number(sale.basePaid), 0);
  assert.equal(Number(sale.voucherPaid), 200_000);
  const freeze = freezeSalePaidFieldsForSave(state.data.sales, sales, {});
  assert.ok(freeze.blockedSaleIds.includes("5001"));
});

check("6) post-cutover calendar-style Receipt increases Receipt only", () => {
  const before = getErpState();
  const voucherBefore = before.data.paymentVouchers.length;
  const logBefore = before.data.paymentInputLogs.length;
  const receiptBefore = (before.data.receipts || []).length;
  postReceipt({
    clientId: CLIENT.id,
    clientName: CLIENT.name,
    receiptDate: TODAY,
    grossAmount: 100_000,
    channel: "other",
    source: "calendar",
    allocations: [{ saleId: 5002, amount: 100_000 }],
    actor: "tester",
  });
  const after = getErpState().data;
  assert.equal(after.receipts.length, receiptBefore + 1);
  assert.equal(after.paymentVouchers.length, voucherBefore);
  assert.equal(after.paymentInputLogs.length, logBefore);
});

check("7) cash / personal_account Receipt path does not write legacy rows", () => {
  const before = getErpState();
  postReceipt({
    clientId: CLIENT.id,
    clientName: CLIENT.name,
    receiptDate: TODAY,
    grossAmount: 50_000,
    channel: "personal_account",
    source: "receivables",
    allocations: [{ saleId: 5002, amount: 50_000 }],
    actor: "tester",
  });
  const after = getErpState().data;
  assert.equal(after.paymentVouchers.length, before.data.paymentVouchers.length);
  assert.equal(after.paymentInputLogs.length, before.data.paymentInputLogs.length);
  assert.ok(after.receipts.some((row) => row.channel === "personal_account"));
});

check("8-9) bank / statement sourced Receipts stay off the legacy ledger", () => {
  const before = getErpState();
  postReceipt({
    clientId: CLIENT.id,
    clientName: CLIENT.name,
    receiptDate: TODAY,
    grossAmount: 150_000,
    channel: "bank",
    source: "bank_manual",
    bankTransactionId: "btx-1",
    allocations: [],
    actor: "tester",
  });
  const after = getErpState().data;
  assert.equal(after.paymentVouchers.length, before.data.paymentVouchers.length);
  assert.equal(after.paymentInputLogs.length, before.data.paymentInputLogs.length);
  const receipt = after.receipts.find((row) => String(row.bankTransactionId) === "btx-1");
  assert.ok(receipt);
  assert.equal(Number(receipt.grossAmount), 150_000);
});

check("10) legacy + new Receipt apply without double counting on one sale", () => {
  const balances = buildSaleArBalances(getErpState().data, { asOfDate: TODAY });
  const sale = balances.sales.find((row) => row.saleId === "5001");
  assert.ok(sale);
  assert.equal(sale.legacyStoredPaidAmount, 0);
  assert.equal(sale.legacyDirectAppliedAmount, 200_000);
});

check("11) freeze planner reports create/update/delete attempts", () => {
  const existing = getErpState().data.paymentVouchers;
  const plan = planPaymentVoucherWriteFreeze(
    existing,
    [{ id: "pv-legacy-1", finalAmount: 1 }, { id: "pv-x", finalAmount: 2 }],
    {},
  );
  assert.ok(plan.blockedNewIds.includes("pv-x"));
  assert.ok(plan.blockedUpdatedIds.includes("pv-legacy-1"));
  assert.equal(plan.vouchers.length, existing.length);
});

check("12) legacy dataset hash is order-independent", () => {
  const data = getErpState().data;
  const a = computeLegacyDatasetHash(data);
  const shuffled = {
    ...data,
    paymentVouchers: [...(data.paymentVouchers || [])].reverse(),
    paymentInputLogs: [...(data.paymentInputLogs || [])].reverse(),
    sales: [...(data.sales || [])].reverse(),
  };
  assert.equal(computeLegacyDatasetHash(shuffled), a);
  assert.ok(canonicalizeLegacyDataset(data).vouchers.length >= 1);
});

check("13) changing one legacy row changes the hash", () => {
  const data = getErpState().data;
  const before = computeLegacyDatasetHash(data);
  const mutated = {
    ...data,
    paymentVouchers: data.paymentVouchers.map((row) =>
      String(row.id) === "pv-legacy-1" ? { ...row, finalAmount: 200_001 } : row,
    ),
  };
  assert.notEqual(computeLegacyDatasetHash(mutated), before);
});

check("14) creating a Receipt does not change the legacy dataset hash", () => {
  const beforeHash = computeLegacyDatasetHash(getErpState().data);
  const beforeVouchers = getErpState().data.paymentVouchers.length;
  postReceipt({
    clientId: CLIENT.id,
    clientName: CLIENT.name,
    receiptDate: TODAY,
    grossAmount: 10_000,
    channel: "cash",
    source: "receivables",
    allocations: [],
    actor: "tester",
  });
  assert.equal(getErpState().data.paymentVouchers.length, beforeVouchers);
  assert.equal(computeLegacyDatasetHash(getErpState().data), beforeHash);
});

check("15) cutover decision uses stored bankReceiptCutoverAt (no invented date)", () => {
  const decision = decideGlobalArLedgerCutoverAt(getErpState().data);
  assert.equal(decision.ok, true);
  assert.equal(decision.globalArLedgerCutoverAt, CUTOVER_AT);
  assert.equal(decision.basis, "bankReceiptCutoverAt");
});

check("16) cutover metadata stamps once and health stays readable", () => {
  const state = getErpState();
  const first = stampGlobalArLedgerCutoverMetadata(state.data, { recordedBy: "test" });
  assert.equal(first.stamped, true);
  saveErpState(first.data, state.version, "test-cutover-stamp", {});
  const second = stampGlobalArLedgerCutoverMetadata(getErpState().data, { recordedBy: "test" });
  assert.equal(second.stamped, false);
  assert.equal(second.globalArLedgerCutoverAt, CUTOVER_AT);
  const health = buildArLedgerCutoverHealthReport(getErpState().data, {});
  assert.equal(health.apply, false);
  assert.equal(health.mutations, 0);
  assert.equal(health.globalArLedgerCutoverAt, CUTOVER_AT);
  assert.equal(health.legacy.hashMatchesCutover, true);
  assert.equal(health.currentBankConflictCount, 0);
  assert.ok(["HEALTHY", "WARNING", "BLOCKED"].includes(health.status));
});

check("17) --apply remains refused after cutover stabilization", () => {
  const options = parseArgs(["--apply", "--approval-token=nope"]);
  assert.equal(options.apply, true);
  assert.throws(() => assertApplyForbidden(options), (error) => {
    assert.match(String(error?.message || error), /refused|forbids|DISCONTINUED|permanently/i);
    return true;
  });
  assert.match(APPLY_REFUSAL, /refused|preserve|permanently/i);
});

check("18) cross-screen balances stay finite and conflict-free on the fixture", () => {
  const health = buildArLedgerCutoverHealthReport(getErpState().data, { includeParity: true });
  assert.equal(health.currentBankConflictCount, 0);
  assert.equal(health.organicReceiptAudit.cashIdentityViolationCount, 0);
  assert.equal(typeof health.crossScreenBalanceDiffCount, "number");
});

console.log(`\nar ledger cutover stabilization: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
