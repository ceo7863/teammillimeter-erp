/**
 * Bank · calendar · report parity gates (canonical Receipt/Allocation is the only authority).
 * Run: node --import tsx scripts/test-bank-calendar-report-parity.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-bank-cal-parity-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.JWT_SECRET = "test-bank-cal-parity";
process.env.PDF_ARCHIVE_DIR = path.join(tmpDir, "pdf");

const { initDb, getErpState, saveErpState } = await import("../server/db.mjs");
const {
  createAndPostReceipt,
  planCreateAndPostReceipt,
  proposeFifoAllocations,
  registerCanonicalReceipt,
  replaceReceiptAllocations,
  reverseReceipt,
} = await import("../server/receipts.mjs");
const { buildLegacyAppliedBySale } = await import("../server/legacyAppliedBySale.mjs");
const { collectSentStatementSaleIds } = await import("../server/canonicalCollection.mjs");
const {
  decideBankDepositAction,
  findExactStatementMatches,
  planBankDepositReceiptAllocation,
} = await import("../server/bankDepositDecision.mjs");
const {
  resetErpDomainSubscribersForTests,
  listRecentErpDomainEventsForTests,
  assertErpDomainEventPrivacy,
} = await import("../server/erpDomainEvents.mjs");
const { resolveCanonicalSaleCollection } = await import("../src/utils/calendarFinanceStatus.ts");
const { resolveCalendarEntryPaymentState } = await import("../src/utils/bankReceivableMatch.ts");
const {
  resolveBankDepositCanonicalStatus,
  buildBankDepositStatusByTxId,
  bankDepositHasReceiptStatus,
} = await import("../src/utils/bankDepositCanonicalStatus.ts");
const { buildCollectionLedgerSummary } = await import("../src/utils/reportCollectionSummary.ts");
const { buildClientPivotReport } = await import("../src/utils/pivotReports.ts");
const {
  applyUnifiedArBalancesToSales,
  buildPrepaidByClientName,
  buildSaleArBalances,
} = await import("../src/utils/unifiedArReadModel.ts");
const {
  planFinanceRefetch,
  needsFullFinanceRevalidation,
  FULL_FINANCE_REVALIDATION_DOMAINS,
} = await import("../src/utils/erpDomainSync.ts");

let failed = 0;
let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log("PASS: " + name); }
  catch (error) { failed += 1; console.error("FAIL: " + name); console.error(error); }
}

/* --------------------------------------------------------------- fixtures */

const CLIENT = { id: "c-ind", name: "인디퍼" };
const OTHER = { id: "c-oth", name: "다른업체" };
const CLIENTS = [CLIENT, OTHER];
const MAY_SALES = [
  { id: "s-may1", client: CLIENT.name, clientId: CLIENT.id, date: "2026-05-10", amount: 3_000_000 },
  { id: "s-may2", client: CLIENT.name, clientId: CLIENT.id, date: "2026-05-20", amount: 2_000_000 },
];
const SEP_SALES = [
  { id: "s-sep1", client: CLIENT.name, clientId: CLIENT.id, date: "2026-09-01", amount: 4_000_000 },
  { id: "s-sep2", client: CLIENT.name, clientId: CLIENT.id, date: "2026-09-05", amount: 3_000_000 },
];
const SALES = [...MAY_SALES, ...SEP_SALES];
// Frozen legacy vouchers (VAT-inclusive cash) that already settled the May sales.
const LEGACY_VOUCHERS = [
  { id: "v-may1", salesId: "s-may1", client: CLIENT.name, date: "2026-06-10", amount: 3_300_000, bankTransactionId: "btx-legacy-1" },
  { id: "v-may2", salesId: "s-may2", client: CLIENT.name, date: "2026-06-12", amount: 2_200_000, bankTransactionId: "btx-legacy-2" },
];
const archive = (id, saleIds, total, createdAt) => ({
  id,
  category: "statement-client",
  subjectName: CLIENT.name,
  sentViaLink: true,
  statementSalesIds: saleIds,
  statementTotalAmount: total,
  createdAt,
});
const ARCHIVES = [
  archive("stmt-may", ["s-may1", "s-may2"], 5_500_000, "2026-06-01T00:00:00.000Z"),
  archive("stmt-sep", ["s-sep1", "s-sep2"], 7_700_000, "2026-09-12T00:00:00.000Z"),
];
const LEGACY_MAP = buildLegacyAppliedBySale({ sales: SALES, clients: CLIENTS, paymentVouchers: LEGACY_VOUCHERS });

function balancesFor(data, asOfDate = "2026-09-30") {
  const balances = buildSaleArBalances(data, { asOfDate });
  return applyUnifiedArBalancesToSales(data.sales, balances);
}

/* ------------------------------------------------ allocation capacity (write side) */

check("01 legacy map measures voucher-settled capacity per sale", () => {
  assert.equal(LEGACY_MAP.get("s-may1"), 3_000_000);
  assert.equal(LEGACY_MAP.get("s-may2"), 2_000_000);
  assert.equal(LEGACY_MAP.has("s-sep1"), false);
});

check("02 FIFO skips legacy-settled sales (Indiper Sep deposit reaches Sep sales)", () => {
  const blind = proposeFifoAllocations(SALES, CLIENT, 7_700_000, [], [], CLIENTS, "2026-09-15");
  assert.deepEqual(blind.allocations.map((row) => row.saleId).slice(0, 2), ["s-may1", "s-may2"], "regression fixture");
  const aware = proposeFifoAllocations(SALES, CLIENT, 7_700_000, [], [], CLIENTS, "2026-09-15", {
    legacyAppliedBySale: LEGACY_MAP,
  });
  assert.deepEqual(aware.allocations, [
    { saleId: "s-sep1", amount: 4_000_000 },
    { saleId: "s-sep2", amount: 3_000_000 },
  ]);
  assert.equal(aware.unallocatedAmount, 700_000);
});

check("03 explicit allocation onto a legacy-settled sale is rejected", () => {
  assert.throws(
    () =>
      planCreateAndPostReceipt(
        { receipts: [], allocations: [], sales: SALES, clients: CLIENTS, legacyAppliedBySale: LEGACY_MAP },
        {
          operationId: "explicit-over",
          clientId: CLIENT.id,
          receiptDate: "2026-09-15",
          grossAmount: 1_000_000,
          channel: "cash",
          source: "receivables",
          allocations: [{ saleId: "s-may1", amount: 1_000_000 }],
        },
        "test",
      ),
    (error) => error.code === "ALLOCATION_EXCEEDS_SALE",
  );
});

/* ------------------------------------------------------ bank auto allocation */

check("04 exact statement match settles only that statement; VAT remainder unapplied", () => {
  const plan = planBankDepositReceiptAllocation({
    client: CLIENT,
    grossAmount: 7_700_000,
    sales: SALES,
    clients: CLIENTS,
    asOfDate: "2026-09-15",
    archives: ARCHIVES,
    legacyAppliedBySale: LEGACY_MAP,
    proposeFifoAllocations,
  });
  assert.equal(plan.scope.mode, "STATEMENT_EXACT");
  assert.equal(plan.scope.matchedStatementId, "stmt-sep");
  assert.deepEqual(plan.allocations.map((row) => row.saleId), ["s-sep1", "s-sep2"]);
  assert.equal(plan.unallocatedAmount, 700_000);
  assert.equal(plan.processingStatus, "partially_allocated");
});

check("05 re-sent copies of one statement collapse to a single exact match", () => {
  const docs = collectSentStatementSaleIds(
    [...ARCHIVES, archive("stmt-sep-resend", ["s-sep2", "s-sep1"], 7_700_000, "2026-09-20T00:00:00.000Z")],
    { clientName: CLIENT.name, requireSent: true },
  ).documents;
  const matches = findExactStatementMatches(docs, 7_700_000);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].archiveId, "stmt-sep-resend");
});

check("06 two different statements with the same total stay on union FIFO", () => {
  const twin = archive("stmt-twin", ["s-may1", "s-sep2"], 7_700_000, "2026-09-13T00:00:00.000Z");
  const plan = planBankDepositReceiptAllocation({
    client: CLIENT,
    grossAmount: 7_700_000,
    sales: SALES,
    clients: CLIENTS,
    asOfDate: "2026-09-15",
    archives: [...ARCHIVES, twin],
    legacyAppliedBySale: LEGACY_MAP,
    proposeFifoAllocations,
  });
  assert.equal(plan.scope.mode, "STATEMENT");
  assert.equal(plan.scope.exactStatementMatchCount, 2);
  assert.ok(plan.allocations.every((row) => !String(row.saleId).startsWith("s-may")));
});

check("07 overlapping statements contribute each saleId once", () => {
  const union = collectSentStatementSaleIds(
    [
      archive("a1", ["s-sep1"], 4_400_000, "2026-09-02T00:00:00.000Z"),
      archive("a2", ["s-sep1", "s-sep2"], 7_700_000, "2026-09-12T00:00:00.000Z"),
      archive("a3", ["s-sep2"], 3_300_000, "2026-09-13T00:00:00.000Z"),
    ],
    { clientName: CLIENT.name, requireSent: true },
  );
  assert.deepEqual([...union.saleIds].sort(), ["s-sep1", "s-sep2"]);
});

check("08 decideBankDepositAction: client first, legacy-aware, duplicate deposit skipped", () => {
  const tx = { id: "btx-sep", deposit: 7_700_000, counterpartyName: CLIENT.name, transactionAt: "2026-09-15T10:00:00+09:00" };
  const context = {
    clients: CLIENTS,
    sales: SALES,
    paymentVouchers: LEGACY_VOUCHERS,
    archives: ARCHIVES,
    proposeFifoAllocations,
  };
  const decision = decideBankDepositAction(tx, context);
  assert.equal(decision.action, "post_receipt");
  assert.equal(decision.matchedStatementId, "stmt-sep");
  assert.equal(decision.allocations.reduce((sum, row) => sum + row.amount, 0), 7_000_000);

  const unknown = decideBankDepositAction({ ...tx, id: "btx-unknown", counterpartyName: "모르는입금자" }, context);
  assert.equal(unknown.action, "queue");

  const dup = decideBankDepositAction(tx, {
    ...context,
    receipts: [{ id: "r-existing", bankTransactionId: "btx-sep", status: "posted", grossAmount: 7_700_000 }],
  });
  assert.equal(dup.reasonCode, "DUPLICATE_BANK_RECEIPT");
});

/* ------------------------------------------------------------ calendar tone */

check("09 calendar formula GREEN / AMBER / RED / NEUTRAL", () => {
  assert.equal(resolveCanonicalSaleCollection({ amount: 100, appliedAmount: 100, outstandingAmount: 0 }).tone, "GREEN");
  assert.equal(resolveCanonicalSaleCollection({ amount: 100, appliedAmount: 40, outstandingAmount: 60 }).tone, "AMBER");
  assert.equal(resolveCanonicalSaleCollection({ amount: 100, appliedAmount: 0, outstandingAmount: 100 }).tone, "RED");
  assert.equal(resolveCanonicalSaleCollection({ amount: 0 }).tone, "NEUTRAL");
  assert.equal(resolveCanonicalSaleCollection({ amount: 100, cancelled: true }).tone, "NEUTRAL");
});

check("10 bank link / statement cache never turns a calendar sale green", () => {
  const sale = {
    id: "s-sep1",
    client: CLIENT.name,
    amount: 4_000_000,
    appliedAmount: 0,
    outstandingAmount: 4_000_000,
    linkedReceiptId: "r-any",
    paymentStatus: "confirmed",
  };
  const state = resolveCalendarEntryPaymentState(sale, { receiptUnappliedByClientName: { [CLIENT.name]: 700_000 } });
  assert.equal(state.tone, "RED");
  assert.equal(state.hasUnpaid, true);
  assert.equal(state.hasUnappliedCredit, true, "unapplied cash is a separate badge");
  const settled = resolveCalendarEntryPaymentState(
    { ...sale, appliedAmount: 4_000_000, outstandingAmount: 0 },
    { receiptUnappliedByClientName: { [CLIENT.name]: 700_000 } },
  );
  assert.equal(settled.tone, "GREEN");
  assert.equal(settled.hasUnappliedCredit, false);
});

check("11 partial payment is AMBER and unallocated remainder shows as client credit", () => {
  const data = {
    sales: SEP_SALES,
    clients: CLIENTS,
    receipts: [{ id: "r-part", clientId: CLIENT.id, clientName: CLIENT.name, receiptDate: "2026-09-15", grossAmount: 5_000_000, status: "posted" }],
    receiptAllocations: [{ id: "a-part", receiptId: "r-part", saleId: "s-sep1", amount: 2_500_000, status: "posted", effectiveFrom: "2026-09-15" }],
  };
  const applied = balancesFor(data);
  const sep1 = resolveCalendarEntryPaymentState(applied.find((row) => row.id === "s-sep1"));
  const sep2 = resolveCalendarEntryPaymentState(applied.find((row) => row.id === "s-sep2"));
  assert.equal(sep1.tone, "AMBER");
  assert.equal(sep1.unpaid, 1_500_000);
  assert.equal(sep2.tone, "RED");
  assert.equal(buildPrepaidByClientName(data, { asOfDate: "2026-09-30" })[CLIENT.name], 2_500_000);
});

/* ---------------------------------------------------------- bank status split */

check("12 bank status: client review / unapplied / partial / fully applied", () => {
  const receipts = [
    { id: "r-un", bankTransactionId: "t-un", grossAmount: 500, status: "posted" },
    { id: "r-pa", bankTransactionId: "t-pa", grossAmount: 500, status: "posted" },
    { id: "r-fu", bankTransactionId: "t-fu", grossAmount: 500, status: "posted" },
  ];
  const receiptAllocations = [
    { id: "x1", receiptId: "r-pa", saleId: "s-sep1", amount: 200, status: "posted" },
    { id: "x2", receiptId: "r-fu", saleId: "s-sep2", amount: 500, status: "posted" },
  ];
  const ctx = { receipts, receiptAllocations, paymentVouchers: [] };
  assert.equal(resolveBankDepositCanonicalStatus({ id: "t-none", deposit: 500 }, ctx).label, "거래처 확인 필요");
  const unapplied = resolveBankDepositCanonicalStatus({ id: "t-un", deposit: 500, linkedReceiptId: "r-un" }, ctx);
  assert.equal(unapplied.status, "unapplied", "a link alone never means settled");
  assert.equal(unapplied.label, "입금전표 생성 완료 · 미배정 입금");
  assert.equal(resolveBankDepositCanonicalStatus({ id: "t-pa", deposit: 500 }, ctx).status, "partial");
  const full = resolveBankDepositCanonicalStatus({ id: "t-fu", deposit: 500 }, ctx);
  assert.equal(full.status, "fully_applied");
  assert.equal(full.unallocatedAmount, 0);
});

check("13 bank status: reversed / legacy / conflicts", () => {
  const receipts = [
    { id: "r-rev", bankTransactionId: "t-rev", grossAmount: 500, status: "reversed", reversedEffectiveDate: "2026-09-20" },
    { id: "r-rev-x", bankTransactionId: "t-rev", grossAmount: -500, status: "posted", reversalOfReceiptId: "r-rev", reversedEffectiveDate: "2026-09-20" },
    { id: "r-both", bankTransactionId: "t-both", grossAmount: 500, status: "posted" },
    { id: "r-dbl", bankTransactionId: "t-dbl", grossAmount: 500, status: "posted" },
  ];
  const receiptAllocations = [{ id: "y1", receiptId: "r-dbl", saleId: "s-may1", amount: 500, status: "posted" }];
  const paymentVouchers = [
    { id: "v1", bankTransactionId: "t-leg" },
    { id: "v2", bankTransactionId: "t-both" },
    { id: "receipt-alloc:r-dbl:y1", bankTransactionId: "t-dbl", sourceLedger: "receipt" },
  ];
  const map = buildBankDepositStatusByTxId(
    ["t-rev", "t-leg", "t-both", "t-dbl"].map((id) => ({ id, deposit: 500 })),
    { receipts, receiptAllocations, paymentVouchers, doubleCoverageSaleIds: new Set(["s-may1"]) },
  );
  assert.equal(map.get("t-rev").label, "취소");
  assert.equal(map.get("t-leg").label, "레거시 연결");
  assert.equal(map.get("t-both").conflictReason, "BANK_REFERENCE_CONFLICT");
  assert.equal(map.get("t-dbl").conflictReason, "LEGACY_RECEIPT_DOUBLE_COVERAGE");
  assert.equal(map.get("t-dbl").label, "중복/충돌 검토 필요");
  for (const status of ["unapplied", "partial", "fully_applied", "reversed", "legacy", "conflict"]) {
    assert.equal(bankDepositHasReceiptStatus(status), true, status);
  }
  for (const status of ["client_review", "none", null]) {
    assert.equal(bankDepositHasReceiptStatus(status), false, String(status));
  }
});

/* ----------------------------------------------------------------- reports */

const REPORT_BASE = {
  clients: CLIENTS,
  receipts: [
    { id: "r1", clientId: CLIENT.id, receiptDate: "2026-09-15", grossAmount: 7_700_000, channel: "bank", bankTransactionId: "btx-sep", status: "posted" },
    { id: "r2", clientId: OTHER.id, receiptDate: "2026-09-16", grossAmount: 1_000_000, channel: "cash", status: "posted" },
  ],
  receiptAllocations: [
    { id: "a1", receiptId: "r1", saleId: "s-sep1", amount: 4_000_000, effectiveFrom: "2026-09-15", status: "posted" },
    { id: "a2", receiptId: "r1", saleId: "s-sep2", amount: 3_000_000, effectiveFrom: "2026-09-15", status: "posted" },
  ],
  paymentVouchers: [
    ...LEGACY_VOUCHERS,
    // Same bank deposit as r1: must not be summed a second time.
    { id: "v-dup", client: CLIENT.name, date: "2026-09-15", amount: 7_700_000, bankTransactionId: "btx-sep" },
    { id: "receipt-alloc:r1:a1", client: CLIENT.name, date: "2026-09-15", amount: 4_000_000, sourceLedger: "receipt" },
  ],
  arAdjustments: [{ clientId: CLIENT.id, effectiveDate: "2026-09-20", signedAmount: -100_000 }],
};

check("14 report: actual receipts by date and channel, legacy never double-summed", () => {
  const summary = buildCollectionLedgerSummary({ ...REPORT_BASE, sales: [], startDate: "2026-09-01", endDate: "2026-09-30" });
  assert.equal(summary.actualReceipts.receiptTotal, 8_700_000);
  assert.equal(summary.actualReceipts.byChannel.bank, 7_700_000);
  assert.equal(summary.actualReceipts.byChannel.cash, 1_000_000);
  assert.equal(summary.actualReceipts.legacyTotal, 0, "June legacy out of period; voucher on btx-sep suppressed");
  assert.equal(summary.actualReceipts.byClientName[CLIENT.name], 7_700_000);
  const june = buildCollectionLedgerSummary({ ...REPORT_BASE, sales: [], startDate: "2026-06-01", endDate: "2026-06-30" });
  assert.equal(june.actualReceipts.legacyTotal, 5_500_000);
  assert.equal(june.actualReceipts.byChannel.legacy, 5_500_000);
});

check("15 report: allocations, unapplied prepaid, adjustment and closing outstanding", () => {
  const sales = balancesFor({ ...REPORT_BASE, sales: SALES, paymentVouchers: LEGACY_VOUCHERS }).filter(
    (row) => row.date >= "2026-09-01",
  );
  const summary = buildCollectionLedgerSummary({ ...REPORT_BASE, sales, startDate: "2026-09-01", endDate: "2026-09-30" });
  assert.equal(summary.periodAllocations.total, 7_000_000);
  assert.equal(summary.unappliedPrepaid.total, 700_000 + 1_000_000);
  assert.equal(summary.adjustments.net, -100_000);
  assert.equal(summary.periodSales.billed, 7_000_000);
  assert.equal(summary.periodSales.outstanding, 0);
  assert.equal(summary.closingOutstanding, 0);
});

check("16 report: reversal is counted once (receipt and allocation)", () => {
  const data = {
    clients: CLIENTS,
    receipts: [
      { id: "rv", clientId: CLIENT.id, receiptDate: "2026-08-20", grossAmount: 1_000_000, channel: "bank", status: "reversed", reversedEffectiveDate: "2026-09-10" },
      { id: "rv-x", clientId: CLIENT.id, receiptDate: "2026-09-10", grossAmount: -1_000_000, channel: "bank", status: "posted", reversalOfReceiptId: "rv", reversedEffectiveDate: "2026-09-10" },
    ],
    receiptAllocations: [
      { id: "av", receiptId: "rv", saleId: "s-sep1", amount: 1_000_000, effectiveFrom: "2026-08-20", reversedEffectiveDate: "2026-09-10", status: "reversed" },
      { id: "av-x", receiptId: "rv-x", saleId: "s-sep1", amount: -1_000_000, effectiveFrom: "2026-09-10", auditOnly: true, status: "posted" },
    ],
  };
  const aug = buildCollectionLedgerSummary({ ...data, startDate: "2026-08-01", endDate: "2026-08-31" });
  const sep = buildCollectionLedgerSummary({ ...data, startDate: "2026-09-01", endDate: "2026-09-30" });
  const both = buildCollectionLedgerSummary({ ...data, startDate: "2026-08-01", endDate: "2026-09-30" });
  assert.equal(aug.actualReceipts.total, 1_000_000);
  assert.equal(sep.actualReceipts.total, -1_000_000);
  assert.equal(both.actualReceipts.total, 0);
  assert.equal(aug.periodAllocations.total, 1_000_000);
  assert.equal(sep.periodAllocations.total, -1_000_000);
  assert.equal(both.periodAllocations.total, 0);
  assert.equal(sep.unappliedPrepaid.total, 0);
});

check("17 client pivot report uses canonical applied / outstanding / actual receipts", () => {
  const sales = balancesFor({ ...REPORT_BASE, sales: SALES, paymentVouchers: LEGACY_VOUCHERS });
  const summary = buildCollectionLedgerSummary({ ...REPORT_BASE, sales, startDate: "2026-05-01", endDate: "2026-09-30" });
  const report = buildClientPivotReport(sales, { startDate: "2026-05-01", endDate: "2026-09-30" }, {
    actualReceiptsByClientName: summary.actualReceipts.byClientName,
  });
  const row = report.rows.find((item) => item.key === CLIENT.name);
  assert.equal(row.bill, 12_000_000);
  assert.equal(row.avgPaid, 12_000_000, "매출충당 = legacy 5.0M + receipt 7.0M");
  assert.equal(row.paidVat, 0, "잔여미수");
  assert.equal(row.totalPaid, 5_500_000 + 7_700_000, "실제입금 = legacy cash + receipt gross, once");
});

/* ---------------------------------------------------------------- realtime */

check("18 finance refetch plan and version-gap revalidation", () => {
  assert.deepEqual(planFinanceRefetch(["receipts"]), { ledgers: true, bank: false });
  assert.deepEqual(planFinanceRefetch(["arAdjustments", "bankTransactions"]), { ledgers: true, bank: true });
  assert.deepEqual(planFinanceRefetch(["workers"]), { ledgers: false, bank: false });
  assert.equal(needsFullFinanceRevalidation({ helloVersion: 12, knownVersion: 10 }), true);
  assert.equal(needsFullFinanceRevalidation({ helloVersion: 10, knownVersion: 10 }), false);
  assert.equal(needsFullFinanceRevalidation({ helloVersion: null, knownVersion: 10 }), false);
  assert.deepEqual([...FULL_FINANCE_REVALIDATION_DOMAINS].sort(), ["arAdjustments", "bankTransactions", "receipts", "sales"]);
});

/* -------------------------------------------------------- DB integration */

initDb();
{
  const state = getErpState();
  saveErpState(
    {
      ...(state.data || {}),
      clients: CLIENTS,
      sales: SALES,
      paymentVouchers: LEGACY_VOUCHERS,
      receipts: [],
      receiptAllocations: [],
      bankTransactions: [],
    },
    state.version,
    "parity-seed",
    { allowReceiptMutation: true, allowPaymentVoucherMutation: true },
  );
}
const reload = () => getErpState().data;
const saleView = (id) => balancesFor(reload()).find((row) => String(row.id) === id);

check("19 save publishes only changed domains; receipt events carry no payload", () => {
  resetErpDomainSubscribersForTests();
  const before = getErpState();
  saveErpState({ ...before.data }, before.version, "noop", {});
  assert.equal(listRecentErpDomainEventsForTests().length, 0, "unchanged save broadcasts nothing");

  createAndPostReceipt(
    {
      operationId: "evt-1",
      clientId: OTHER.id,
      receiptDate: "2026-09-16",
      grossAmount: 10_000,
      channel: "cash",
      source: "receivables",
      allocations: [],
    },
    "test",
  );
  const events = listRecentErpDomainEventsForTests();
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].domains, ["receipts"]);
  assert.ok(events[0].eventId);
  assertErpDomainEventPrivacy(events[0]);
  assert.throws(() => assertErpDomainEventPrivacy({ ...events[0], receipts: [{}] }));
});

check("20 GLOBAL_FIFO receipt respects stored legacy vouchers", () => {
  const result = registerCanonicalReceipt(
    {
      operationId: "fifo-legacy",
      clientId: CLIENT.id,
      receiptDate: "2026-09-15",
      grossAmount: 5_000_000,
      channel: "bank",
      source: "receivables",
      targetMode: "GLOBAL_FIFO",
    },
    "test",
  );
  assert.deepEqual(
    result.allocations.map((row) => [row.saleId, row.amount]),
    [["s-sep1", 4_000_000], ["s-sep2", 1_000_000]],
  );
  assert.equal(resolveCalendarEntryPaymentState(saleView("s-sep1")).tone, "GREEN");
  assert.equal(resolveCalendarEntryPaymentState(saleView("s-sep2")).tone, "AMBER");
  assert.equal(resolveCalendarEntryPaymentState(saleView("s-may1")).tone, "GREEN");
});

check("21 duplicate protection: same operationId never creates a second receipt", () => {
  const countBefore = reload().receipts.length;
  const exact = {
    operationId: "evt-1",
    clientId: OTHER.id,
    receiptDate: "2026-09-16",
    grossAmount: 10_000,
    channel: "cash",
    source: "receivables",
    allocations: [],
  };
  assert.equal(createAndPostReceipt(exact, "test").idempotent, true);
  // A FIFO replay re-plans against the committed allocations, so it is refused, not re-posted.
  assert.throws(
    () =>
      registerCanonicalReceipt(
        {
          operationId: "fifo-legacy",
          clientId: CLIENT.id,
          receiptDate: "2026-09-15",
          grossAmount: 5_000_000,
          channel: "bank",
          source: "receivables",
          targetMode: "GLOBAL_FIFO",
        },
        "test",
      ),
    (error) => error.code === "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(reload().receipts.length, countBefore);
});

check("22 reallocation: legacy-settled target rejected, valid move closes old rows", () => {
  const receipt = reload().receipts.find((row) => row.operationId === "fifo-legacy");
  assert.throws(
    () =>
      replaceReceiptAllocations(
        receipt.id,
        { operationId: "realloc-bad", effectiveDate: "2026-09-20", allocations: [{ saleId: "s-may2", amount: 500_000 }] },
        "test",
      ),
    (error) => error.code === "ALLOCATION_EXCEEDS_SALE",
  );
  replaceReceiptAllocations(
    receipt.id,
    {
      operationId: "realloc-ok",
      effectiveDate: "2026-09-20",
      allocations: [
        { saleId: "s-sep2", amount: 3_000_000 },
        { saleId: "s-sep1", amount: 2_000_000 },
      ],
    },
    "test",
  );
  assert.equal(resolveCalendarEntryPaymentState(saleView("s-sep2")).tone, "GREEN");
  assert.equal(resolveCalendarEntryPaymentState(saleView("s-sep1")).tone, "AMBER");
  const data = reload();
  const sep = buildCollectionLedgerSummary({ ...data, startDate: "2026-09-01", endDate: "2026-09-30" });
  const mine = data.receiptAllocations.filter((row) => row.receiptId === receipt.id);
  assert.ok(mine.some((row) => row.reversedEffectiveDate === "2026-09-20"), "history kept append-only");
  assert.equal(sep.periodAllocations.byClientName[CLIENT.name], 5_000_000, "reallocation nets to one allocation");
});

check("23 reversal restores balances and the bank row reads 취소", () => {
  const receipt = reload().receipts.find((row) => row.operationId === "fifo-legacy");
  reverseReceipt(receipt.id, { operationId: "rev-fifo", reversalEffectiveDate: "2026-09-25" }, "test");
  const data = reload();
  assert.equal(resolveCalendarEntryPaymentState(saleView("s-sep1")).tone, "RED");
  assert.equal(resolveCalendarEntryPaymentState(saleView("s-sep2")).tone, "RED");
  const sep = buildCollectionLedgerSummary({ ...data, startDate: "2026-09-01", endDate: "2026-09-30" });
  assert.equal(sep.actualReceipts.byClientName[CLIENT.name], 0, "receipt + reversal net once");
  assert.equal(sep.periodAllocations.byClientName[CLIENT.name] || 0, 0);
  const original = data.receipts.find((row) => row.id === receipt.id);
  assert.equal(
    resolveBankDepositCanonicalStatus(
      { id: "btx-x", deposit: 5_000_000 },
      { receipts: [{ ...original, bankTransactionId: "btx-x" }], receiptAllocations: data.receiptAllocations },
    ).status,
    "reversed",
  );
});

console.log(failed === 0 ? `\nbank-calendar-report parity: ALL PASS (${passed})` : `\n${failed} failed, ${passed} passed`);
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
if (failed) process.exit(1);
