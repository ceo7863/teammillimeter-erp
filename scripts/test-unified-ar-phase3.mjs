/**
 * Phase 3 Unified AR subledger tests (SQLite integration, no mocks).
 * Run: npx tsx scripts/test-unified-ar-phase3.mjs
 *
 * Covers the required Phase 3 cases 1-20 and 24:
 *   1  statement with 5 sales, paid in full          11  duplicate submit / failed save
 *   2  only 3 of 5 sales allocated                   12  reverse + reallocate
 *   3  statement underpayment                        13  legacy-voucher-only sale
 *   4  statement overpayment                         14  receipt-only sale
 *   5  statement regeneration                        15  legacy + receipt share a bank tx
 *   6  sale amount changed after payment             16  client renamed
 *   7  same saleId across statement versions         17  duplicate client names
 *   8  statement without trustworthy saleIds         18  zero-amount sale
 *   9  cash statement receipt                        19  period boundary / as-of
 *  10  personal-account statement receipt            20  bank reverse with a real allocation
 *  24  new deposits add zero paymentVouchers / paymentInputLogs
 *
 * Cases 21/22 (browser hard reload + wheel) are covered by
 * scripts/test-bank-link-panel-browser.mjs; case 23 (cross-screen parity) by
 * scripts/ar-parity-dry-run.mjs; case 25 by the phase1/phase2 regression suites.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-unified-ar-phase3-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.PDF_ARCHIVE_DIR = path.join(tmpDir, "pdf-archives");
process.env.JWT_SECRET = "test-unified-ar-phase3";
process.env.AUTO_DEPOSIT_RECEIPT_CUTOVER_AT = "";

const { initDb, getErpState, saveErpState } = await import("../server/db.mjs");
const { createAndPostReceipt, reverseReceipt, replaceReceiptAllocations, shiftSeoulDate, todaySeoul } =
  await import("../server/receipts.mjs");
const { createBankTransactionReceipt, reverseBankTransactionReceipt } = await import(
  "../server/bankReceipts.mjs"
);
const {
  buildSaleArBalances,
  buildClientArSummary,
  buildStatementPaymentStatus,
  dedupeBankReferences,
  buildUnifiedClientLedger,
  buildArParityReport,
  isUnifiedAllocationEffectiveAsOf,
} = await import("../server/unifiedArReadModel.mjs");
const { isAllocationEffectiveAsOf } = await import("../server/receipts.mjs");
const { createPdfArchive, initPdfArchiveStore, updatePdfArchiveMeta, replacePdfArchiveFile, getPdfArchiveMetaById } =
  await import("../server/pdfArchive.mjs");
const { normalizeBankTransaction } = await import("../src/utils/bankTransactions.ts");

initDb();
initPdfArchiveStore();

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
const PERIOD_START = shiftSeoulDate(TODAY, -60);
const SALE_DAY = shiftSeoulDate(TODAY, -30);
const PAY_DAY = shiftSeoulDate(TODAY, -20);
const LATER_DAY = shiftSeoulDate(TODAY, -10);

const ACME = { id: 900, name: "ACME건설", vat: "N" };
const TWIN_A = { id: 901, name: "?�명?�업", vat: "N" };
const TWIN_B = { id: 902, name: "?�명?�업", vat: "N" };
const BOUND = { id: 904, name: "기간경계상사", vat: "N" };
const OVER = { id: 905, name: "초과입금상사", vat: "N" };
const SOLO = { id: 903, name: "?�독?�사", vat: "N" };

/** Statement sales: 5 x 100,000 = 500,000 */
const STMT_SALES = [1001, 1002, 1003, 1004, 1005];
const SALE_AMOUNT = 100_000;

function sale(id, clientRow, amount, extra = {}) {
  return {
    id,
    date: SALE_DAY,
    client: clientRow.name,
    clientId: clientRow.id,
    amount,
    paid: 0,
    site: `?�장${id}`,
    ...extra,
  };
}

function bankTx(partial) {
  return normalizeBankTransaction({
    accountNumber: "969-046529-04-015",
    bankName: "IBK",
    balanceAfter: 0,
    withdrawal: 0,
    deposit: 0,
    description: "?�금",
    transactionAt: `${PAY_DAY}T10:00:00+09:00`,
    createdAt: new Date().toISOString(),
    ...partial,
  });
}

const SEED_SALES = [
  ...STMT_SALES.map((id) => sale(id, ACME, SALE_AMOUNT)),
  sale(1040, OVER, 300_000), // cases 3/4 under- then over-payment target
  sale(1011, ACME, 200_000), // case 6 amount-change target
  sale(1012, ACME, 400_000), // case 20 bank reverse target
  sale(1013, ACME, 400_000), // case 15 legacy+receipt bank conflict target
  sale(1014, ACME, 250_000), // case 13 legacy-only target
  sale(1015, ACME, 250_000), // case 14 receipt-only target
  sale(1016, ACME, 0), // case 18 zero-amount sale
  sale(1020, TWIN_A, 150_000), // case 17 duplicate client name
  sale(1021, TWIN_B, 170_000),
  sale(1030, SOLO, 500_000), // cases 9/10/11 statement + duplicate-submit target
  sale(1031, BOUND, 100_000), // case 19 as-of boundary target
];

function seed() {
  const state = getErpState();
  saveErpState(
    {
      ...state.data,
      clients: [ACME, TWIN_A, TWIN_B, SOLO, BOUND, OVER],
      sales: SEED_SALES,
      paymentVouchers: [
        // Case 13: a legacy-only sale must keep its historical paid amount.
        {
          id: "pv-legacy-1014",
          salesId: 1014,
          client: ACME.name,
          site: "?�장1014",
          date: PAY_DAY,
          amount: 250_000,
          finalAmount: 250_000,
        },
      ],
      paymentInputLogs: [],
      receipts: [],
      receiptAllocations: [],
      bankTransactions: [
        bankTx({ id: "btx-1012", deposit: 400_000, counterpartyName: ACME.name }),
        bankTx({ id: "btx-shared", deposit: 400_000, counterpartyName: ACME.name }),
      ],
      bankSyncMeta: {},
    },
    state.version,
    "phase3-seed",
    { allowReceiptMutation: true, allowPaymentVoucherMutation: true },
  );
}
seed();

function data() {
  return getErpState().data || {};
}
function balances(asOfDate = TODAY) {
  return buildSaleArBalances(data(), { asOfDate });
}
function saleRow(saleId, asOfDate = TODAY) {
  const row = balances(asOfDate).sales.find((item) => item.saleId === String(saleId));
  assert.ok(row, `sale ${saleId} missing from unified balances as-of ${asOfDate}`);
  return row;
}
function makeArchive(meta) {
  return createPdfArchive(Buffer.from("%PDF-1.4 test"), {
    fileName: `${meta.subjectName || "stmt"}.pdf`,
    category: "statement-client",
    sentViaLink: true,
    periodStart: PERIOD_START,
    periodEnd: TODAY,
    ...meta,
  }, "phase3-test");
}
function statementStatus(archive, asOfDate = TODAY) {
  return buildStatementPaymentStatus(archive, data(), { asOfDate });
}

/* ------------------------------------------------------- 1) full statement */

const STATEMENT_TOTAL = SALE_AMOUNT * STMT_SALES.length;
const fullArchive = makeArchive({
  subjectName: ACME.name,
  statementTotalAmount: STATEMENT_TOTAL,
  statementSalesIds: STMT_SALES,
});

const fullReceipt = createAndPostReceipt(
  {
    operationId: "phase3-stmt-full",
    clientId: ACME.id,
    receiptDate: PAY_DAY,
    grossAmount: STATEMENT_TOTAL,
    channel: "bank",
    source: "sent_statement",
    sentStatementId: fullArchive.id,
    allocations: STMT_SALES.map((id) => ({ saleId: id, amount: SALE_AMOUNT })),
  },
  "phase3-test",
);

check("1) statement of 5 sales paid in full = 1 receipt, 5 allocations, all paid", () => {
  assert.equal(fullReceipt.allocations.length, 5, "expected exactly 5 allocations");
  const receiptsForStatement = (data().receipts || []).filter(
    (row) => String(row.sentStatementId || "") === String(fullArchive.id) && !row.reversalOfReceiptId,
  );
  assert.equal(receiptsForStatement.length, 1, "expected exactly one receipt per statement");

  for (const id of STMT_SALES) {
    const row = saleRow(id);
    assert.equal(row.receiptAllocatedAmount, SALE_AMOUNT, `sale ${id} allocation`);
    assert.equal(row.outstandingAmount, 0, `sale ${id} outstanding`);
    assert.equal(row.paymentStatus, "paid", `sale ${id} status`);
    assert.equal(row.sourceLedger, "receipt", `sale ${id} source`);
  }

  const status = statementStatus(fullArchive);
  assert.equal(status.status, "paid");
  assert.equal(status.manualReview, false);
  assert.equal(status.appliedAmount, STATEMENT_TOTAL);
  assert.deepEqual(status.missingSaleIds, []);
});

/* -------------------------------------------- 2) partial sale-level coverage */

const partialSales = [1002, 1003, 1004].map((id) => ({ saleId: id, amount: SALE_AMOUNT }));
const partialArchive = makeArchive({
  subjectName: ACME.name,
  statementTotalAmount: STATEMENT_TOTAL,
  statementSalesIds: STMT_SALES,
  fileName: "acme-partial.pdf",
});

check("2) only 3 of 5 statement sales allocated = those 3 paid, 2 unpaid, statement partial", () => {
  // Reverse the full receipt first so this statement stands alone.
  reverseReceipt(fullReceipt.receipt.id, { operationId: "phase3-stmt-full-reverse", reversalEffectiveDate: LATER_DAY }, "phase3-test");

  createAndPostReceipt(
    {
      operationId: "phase3-stmt-partial",
      clientId: ACME.id,
      receiptDate: LATER_DAY,
      grossAmount: SALE_AMOUNT * 3,
      channel: "bank",
      source: "sent_statement",
      sentStatementId: partialArchive.id,
      allocations: partialSales,
    },
    "phase3-test",
  );

  for (const id of [1002, 1003, 1004]) {
    assert.equal(saleRow(id).paymentStatus, "paid", `sale ${id} should be paid`);
  }
  for (const id of [1001, 1005]) {
    const row = saleRow(id);
    assert.equal(row.receiptAllocatedAmount, 0, `sale ${id} must have no effective allocation`);
    assert.equal(row.outstandingAmount, SALE_AMOUNT, `sale ${id} outstanding`);
    assert.equal(row.paymentStatus, "unpaid", `sale ${id} status`);
  }

  const status = statementStatus(partialArchive);
  assert.equal(status.status, "partial");
  assert.equal(status.appliedAmount, SALE_AMOUNT * 3);
  assert.equal(status.billedAmount, STATEMENT_TOTAL);
});

/* ------------------------------------------------ 3) statement underpayment */

const underArchive = makeArchive({
  subjectName: OVER.name,
  statementTotalAmount: 300_000,
  statementSalesIds: [1040],
  fileName: "acme-under.pdf",
});

const underReceipt = createAndPostReceipt(
  {
    operationId: "phase3-stmt-under",
    clientId: OVER.id,
    receiptDate: PAY_DAY,
    grossAmount: 120_000,
    channel: "bank",
    source: "sent_statement",
    sentStatementId: underArchive.id,
    allocations: [{ saleId: 1040, amount: 120_000 }],
  },
  "phase3-test",
);

check("3) statement underpayment = no over-allocation, exact remaining AR", () => {
  const row = saleRow(1040);
  assert.equal(row.receiptAllocatedAmount, 120_000);
  assert.equal(row.outstandingAmount, 180_000, "AR must be exactly billed - applied");
  assert.equal(row.paymentStatus, "partial");
  assert.equal(statementStatus(underArchive).status, "partial");

  const summary = buildClientArSummary(data(), { clientId: OVER.id, startDate: PERIOD_START, endDate: TODAY });
  assert.equal(summary.reconciliationStatus, "ok", JSON.stringify(summary.errors));
  assert.ok(summary.identity.ok, "opening + sales - applied = closing must hold");
});

/* ------------------------------------------------- 4) statement overpayment */

check("4) statement overpayment = sale AR 0, excess stays unallocated prepaid, status overpaid", () => {
  // Settle the rest of sale 1040 and deliberately receive more cash than allocated.
  const over = createAndPostReceipt(
    {
      operationId: "phase3-stmt-over",
      clientId: OVER.id,
      receiptDate: LATER_DAY,
      grossAmount: 250_000,
      channel: "bank",
      source: "sent_statement",
      sentStatementId: underArchive.id,
      allocations: [{ saleId: 1040, amount: 180_000 }],
    },
    "phase3-test",
  );

  assert.equal(over.summary.unallocatedAmount, 70_000, "excess cash must stay unallocated");

  const row = saleRow(1040);
  assert.equal(row.outstandingAmount, 0);
  assert.equal(row.paymentStatus, "paid");

  const summary = buildClientArSummary(data(), { clientId: OVER.id, startDate: PERIOD_START, endDate: TODAY });
  assert.equal(summary.unallocatedPrepaid, 70_000, "unallocated cash must surface as prepaid");
  assert.ok(summary.cashIdentity.ok, "gross = allocated + unallocated must hold");

  // The statement itself is over-covered: billed 300,000 vs 370,000 received against it.
  const status = statementStatus(underArchive);
  assert.equal(status.status, "overpaid");
  assert.ok(status.unallocatedPrepaid > 0, "overpaid statement must report prepaid");
});

/* ------------------------------------------- 5) statement regeneration keeps */

check("5) regenerating the statement PDF keeps receipts/allocations by saleId (no double count)", () => {
  const beforeRows = STMT_SALES.map((id) => saleRow(id).totalAppliedAmount);
  const beforeArchive = getPdfArchiveMetaById(partialArchive.id);
  assert.ok(beforeArchive.statementSalesSnapshot?.length, "snapshot must be stored at creation");

  const regenerated = replacePdfArchiveFile(partialArchive.id, Buffer.from("%PDF-1.4 regenerated"), {
    statementTotalAmount: STATEMENT_TOTAL,
  });
  assert.ok(regenerated, "regeneration must return the archive");
  assert.equal(regenerated.id, partialArchive.id, "regeneration must not change the archive id");

  const afterRows = STMT_SALES.map((id) => saleRow(id).totalAppliedAmount);
  assert.deepEqual(afterRows, beforeRows, "regeneration must not move any applied amount");
  assert.deepEqual(
    getPdfArchiveMetaById(partialArchive.id).statementSalesSnapshot,
    beforeArchive.statementSalesSnapshot,
    "snapshot must be preserved when statementSalesIds does not change",
  );
  assert.equal(statementStatus(getPdfArchiveMetaById(partialArchive.id)).status, "partial");
});

/* ------------------------------- 6) sale amount changed after being paid */

check("6) sale amount change after payment: receipt untouched, AR/prepaid restated exactly", () => {
  const receipt = createAndPostReceipt(
    {
      operationId: "phase3-sale-amount-change",
      clientId: ACME.id,
      receiptDate: PAY_DAY,
      grossAmount: 200_000,
      channel: "bank",
      source: "receivables",
      allocations: [{ saleId: 1011, amount: 200_000 }],
    },
    "phase3-test",
  );
  assert.equal(saleRow(1011).outstandingAmount, 0);

  // Raise the billed amount; the receipt must not be rewritten.
  const state = getErpState();
  saveErpState(
    {
      ...state.data,
      sales: (state.data.sales || []).map((row) =>
        String(row.id) === "1011" ? { ...row, amount: 260_000 } : row,
      ),
    },
    state.version,
    "phase3-sale-amount-up",
  );

  const stored = (data().receipts || []).find((row) => String(row.id) === String(receipt.receipt.id));
  assert.equal(stored.grossAmount, 200_000, "receipt gross must never auto-change");
  const row = saleRow(1011);
  assert.equal(row.billedAmount, 260_000);
  assert.equal(row.receiptAllocatedAmount, 200_000);
  assert.equal(row.outstandingAmount, 60_000, "increase must reappear as AR, not as a receipt change");
  assert.equal(row.paymentStatus, "partial");

  // Lower it below what was received: the difference becomes prepaid, never negative AR.
  const state2 = getErpState();
  saveErpState(
    {
      ...state2.data,
      sales: (state2.data.sales || []).map((row2) =>
        String(row2.id) === "1011" ? { ...row2, amount: 150_000 } : row2,
      ),
    },
    state2.version,
    "phase3-sale-amount-down",
  );

  const lowered = saleRow(1011);
  assert.equal(lowered.outstandingAmount, 0, "AR must never go negative");
  assert.equal(lowered.paymentStatus, "overpaid");
  const stored2 = (data().receipts || []).find((row2) => String(row2.id) === String(receipt.receipt.id));
  assert.equal(stored2.grossAmount, 200_000, "receipt gross must still be untouched");

  // Restore for later cases.
  const state3 = getErpState();
  saveErpState(
    {
      ...state3.data,
      sales: (state3.data.sales || []).map((row3) =>
        String(row3.id) === "1011" ? { ...row3, amount: 200_000 } : row3,
      ),
    },
    state3.version,
    "phase3-sale-amount-restore",
  );
});

/* --------------------------- 7) same saleId across statement versions */

check("7) same saleId in several statement versions is never double counted", () => {
  const v2 = makeArchive({
    subjectName: ACME.name,
    statementTotalAmount: STATEMENT_TOTAL,
    statementSalesIds: STMT_SALES,
    fileName: "acme-v2.pdf",
  });

  const clientTotal = () => {
    const summary = buildClientArSummary(data(), { clientId: ACME.id, startDate: PERIOD_START, endDate: TODAY });
    return summary.closingAr;
  };
  const before = clientTotal();
  const v3 = makeArchive({
    subjectName: ACME.name,
    statementTotalAmount: STATEMENT_TOTAL,
    statementSalesIds: STMT_SALES,
    fileName: "acme-v3.pdf",
  });
  assert.equal(clientTotal(), before, "adding another statement version must not move client AR");

  // Each sale is still counted once, from a single ledger.
  for (const id of [1002, 1003, 1004]) {
    const row = saleRow(id);
    assert.equal(row.totalAppliedAmount, SALE_AMOUNT, `sale ${id} counted once`);
    assert.equal(row.receiptIds.length, 1, `sale ${id} must have exactly one effective receipt`);
  }

  // The dedupe helper reports the reuse instead of silently merging it.
  const report = buildArParityReport(data(), { asOfDate: TODAY, archives: [v2, v3] });
  const reused = report.statementSaleIdReuse.map((row) => String(row.saleId));
  for (const id of STMT_SALES) {
    assert.ok(reused.includes(String(id)), `saleId ${id} reuse across versions must be reported`);
  }
  assert.equal(report.mutations, 0);
});

/* ------------------------- 8) statement without trustworthy saleIds */

check("8) statement without resolvable saleIds blocks bulk allocation with manualReview", () => {
  const noIds = makeArchive({
    subjectName: ACME.name,
    statementTotalAmount: 500_000,
    fileName: "acme-no-ids.pdf",
  });
  const status = statementStatus(noIds);
  assert.equal(status.manualReview, true, "missing statementSalesIds must force manual review");
  assert.equal(status.bulkAllocateAllowed, false, "bulk allocation must be blocked");
  assert.ok(status.manualReviewReason, "a reason must be reported");

  const ghost = makeArchive({
    subjectName: ACME.name,
    statementTotalAmount: 500_000,
    statementSalesIds: [1001, 999999],
    fileName: "acme-ghost-id.pdf",
  });
  const ghostStatus = statementStatus(ghost);
  assert.equal(ghostStatus.manualReview, true, "unknown saleIds must force manual review");
  assert.equal(ghostStatus.bulkAllocateAllowed, false);
  assert.deepEqual(ghostStatus.missingSaleIds, ["999999"]);
});

/* --------------------------------- 9) & 10) cash / personal statement receipts */

check("9) cash statement receipt = source sent_statement, channel cash, no vouchers", () => {
  const before = (data().paymentVouchers || []).length;
  const archive = makeArchive({
    subjectName: SOLO.name,
    statementTotalAmount: 500_000,
    statementSalesIds: [1030],
    fileName: "solo-cash.pdf",
  });
  const result = createAndPostReceipt(
    {
      operationId: "phase3-cash",
      clientId: SOLO.id,
      receiptDate: PAY_DAY,
      grossAmount: 200_000,
      channel: "cash",
      source: "sent_statement",
      sentStatementId: archive.id,
      allocations: [{ saleId: 1030, amount: 200_000 }],
    },
    "phase3-test",
  );
  assert.equal(result.receipt.channel, "cash");
  assert.equal(result.receipt.source, "sent_statement");
  assert.equal(String(result.receipt.sentStatementId), String(archive.id));
  assert.equal((data().paymentVouchers || []).length, before, "no legacy voucher may be created");
  assert.equal(saleRow(1030).receiptAllocatedAmount, 200_000);
});

check("10) personal-account statement receipt = channel personal_account, no vouchers", () => {
  const before = (data().paymentVouchers || []).length;
  const archive = makeArchive({
    subjectName: SOLO.name,
    statementTotalAmount: 500_000,
    statementSalesIds: [1030],
    fileName: "solo-personal.pdf",
  });
  const result = createAndPostReceipt(
    {
      operationId: "phase3-personal",
      clientId: SOLO.id,
      receiptDate: PAY_DAY,
      grossAmount: 100_000,
      channel: "personal_account",
      source: "sent_statement",
      sentStatementId: archive.id,
      allocations: [{ saleId: 1030, amount: 100_000 }],
    },
    "phase3-test",
  );
  assert.equal(result.receipt.channel, "personal_account");
  assert.equal((data().paymentVouchers || []).length, before, "no legacy voucher may be created");
  assert.equal(saleRow(1030).receiptAllocatedAmount, 300_000, "both statement receipts must accumulate");
  assert.equal(saleRow(1030).outstandingAmount, 200_000);
});

/* ----------------------------------- 11) duplicate submit / failed save */

check("11) duplicate submit is idempotent, a rejected save writes nothing partial", () => {
  const input = {
    operationId: "phase3-duplicate-click",
    clientId: SOLO.id,
    receiptDate: PAY_DAY,
    grossAmount: 200_000,
    channel: "bank",
    source: "receivables",
    allocations: [{ saleId: 1030, amount: 200_000 }],
  };
  const first = createAndPostReceipt(input, "phase3-test");
  const second = createAndPostReceipt(input, "phase3-test");
  assert.equal(second.receipt.id, first.receipt.id, "same operationId must return the same receipt");
  assert.equal(second.idempotent, true);

  const posted = (data().receipts || []).filter((row) => !row.reversalOfReceiptId);
  const dupes = posted.filter((row) => String(row.id) === String(first.receipt.id));
  assert.equal(dupes.length, 1, "no duplicate receipt row");
  assert.equal(saleRow(1030).outstandingAmount, 0);

  // A payload that over-allocates must be rejected without leaving anything behind.
  const receiptsBefore = (data().receipts || []).length;
  const allocationsBefore = (data().receiptAllocations || []).length;
  assert.throws(
    () =>
      createAndPostReceipt(
        {
          operationId: "phase3-rejected",
          clientId: SOLO.id,
          receiptDate: PAY_DAY,
          grossAmount: 999_999,
          channel: "bank",
          source: "receivables",
          allocations: [{ saleId: 1030, amount: 999_999 }],
        },
        "phase3-test",
      ),
    (error) => error.code === "ALLOCATION_EXCEEDS_SALE",
  );
  assert.equal((data().receipts || []).length, receiptsBefore, "no partial receipt written");
  assert.equal((data().receiptAllocations || []).length, allocationsBefore, "no partial allocation written");

  // Same operationId with a different payload must conflict rather than silently diverge.
  assert.throws(
    () => createAndPostReceipt({ ...input, grossAmount: 111_111 }, "phase3-test"),
    (error) => error.code === "IDEMPOTENCY_CONFLICT" && error.status === 409,
  );
});

/* ---------------------------------------------- 12) reverse and reallocate */

check("12) reverse + reallocate is consistent everywhere and keeps the past as-of ledger", () => {
  const archive = makeArchive({
    subjectName: TWIN_A.name,
    statementTotalAmount: 150_000,
    statementSalesIds: [1020],
    fileName: "twin-a.pdf",
  });
  const receipt = createAndPostReceipt(
    {
      operationId: "phase3-reallocate",
      clientId: TWIN_A.id,
      receiptDate: PAY_DAY,
      grossAmount: 150_000,
      channel: "bank",
      source: "sent_statement",
      sentStatementId: archive.id,
      allocations: [{ saleId: 1020, amount: 150_000 }],
    },
    "phase3-test",
  );
  assert.equal(saleRow(1020).outstandingAmount, 0);

  // Move the money to the other same-named client's sale, effective later.
  replaceReceiptAllocations(
    receipt.receipt.id,
    {
      operationId: "phase3-reallocate-move",
      allocations: [{ saleId: 1020, amount: 50_000 }],
      effectiveDate: LATER_DAY,
    },
    "phase3-test",
  );

  const nowRow = saleRow(1020);
  assert.equal(nowRow.receiptAllocatedAmount, 50_000, "reallocation must be reflected now");
  assert.equal(nowRow.outstandingAmount, 100_000);
  assert.equal(nowRow.paymentStatus, "partial");

  // The closed period must still show the original 150,000.
  const pastRow = saleRow(1020, shiftSeoulDate(LATER_DAY, -1));
  assert.equal(pastRow.receiptAllocatedAmount, 150_000, "past as-of ledger must be unchanged");
  assert.equal(pastRow.outstandingAmount, 0);

  // Every read surface agrees for the same saleId.
  const ledger = buildUnifiedClientLedger(data(), { clientId: TWIN_A.id, startDate: PERIOD_START, endDate: TODAY });
  const ledgerRow = ledger.sales.find((row) => String(row.saleId) === "1020");
  assert.equal(ledgerRow.totalAppliedAmount, nowRow.totalAppliedAmount);
  assert.equal(ledgerRow.outstandingAmount, nowRow.outstandingAmount);
  assert.equal(statementStatus(archive).status, "partial");
});

/* ----------------------------- 13) & 14) legacy-only vs receipt-only sales */

check("13) legacy-voucher-only sale keeps its historical paid amount and AR", () => {
  const row = saleRow(1014);
  assert.equal(row.legacyAppliedAmount, 250_000);
  assert.equal(row.receiptAllocatedAmount, 0);
  assert.equal(row.outstandingAmount, 0);
  assert.equal(row.paymentStatus, "paid");
  assert.equal(row.sourceLedger, "legacy");
  assert.deepEqual(row.legacyVoucherIds, ["pv-legacy-1014"]);
});

check("14) receipt-only sale reads identically across balances, ledger and summary", () => {
  createAndPostReceipt(
    {
      operationId: "phase3-receipt-only",
      clientId: ACME.id,
      receiptDate: PAY_DAY,
      grossAmount: 250_000,
      channel: "bank",
      source: "receivables",
      allocations: [{ saleId: 1015, amount: 250_000 }],
    },
    "phase3-test",
  );

  const row = saleRow(1015);
  assert.equal(row.receiptAllocatedAmount, 250_000);
  assert.equal(row.legacyAppliedAmount, 0);
  assert.equal(row.sourceLedger, "receipt");
  assert.equal(row.paymentStatus, "paid");

  const ledger = buildUnifiedClientLedger(data(), { clientId: ACME.id, startDate: PERIOD_START, endDate: TODAY });
  const ledgerRow = ledger.sales.find((item) => String(item.saleId) === "1015");
  assert.equal(ledgerRow.totalAppliedAmount, 250_000);
  assert.equal(ledgerRow.outstandingAmount, 0);
  assert.equal(ledgerRow.paymentStatus, "paid");
});

/* ------------------- 15) legacy and receipt on the same bank transaction */

check("15) legacy voucher and receipt on one bankTransactionId: no double count, error reported", () => {
  const receipt = createBankTransactionReceipt(
    "btx-shared",
    {
      operationId: "phase3-bank-shared",
      clientId: ACME.id,
      allocations: [{ saleId: 1013, amount: 400_000 }],
      source: "bank_manual",
    },
    "phase3-test",
  );
  assert.ok(receipt.receipt.id);

  // Force the legacy conflict the way stale production data would look.
  const state = getErpState();
  saveErpState(
    {
      ...state.data,
      paymentVouchers: [
        ...(state.data.paymentVouchers || []),
        {
          id: "pv-conflict-1013",
          salesId: 1013,
          client: ACME.name,
          site: "?�장1013",
          date: PAY_DAY,
          amount: 400_000,
          finalAmount: 400_000,
          bankTransactionId: "btx-shared",
        },
      ],
    },
    state.version,
    "phase3-bank-conflict",
    { allowPaymentVoucherMutation: true },
  );

  const row = saleRow(1013);
  assert.equal(row.receiptAllocatedAmount, 400_000);
  assert.equal(row.legacyAppliedAmount, 0, "the legacy voucher for the same deposit must be suppressed");
  assert.equal(row.totalAppliedAmount, 400_000, "the deposit must be counted exactly once");
  assert.equal(row.outstandingAmount, 0);

  const result = balances();
  assert.ok(
    result.suppressedLegacyByBankReceipt.voucherIds.includes("pv-conflict-1013"),
    "the suppressed voucher must be reported",
  );
  assert.equal(result.suppressedLegacyByBankReceipt.amount, 400_000);

  const refs = dedupeBankReferences(data());
  assert.equal(refs.ok, false, "a shared bankTransactionId is a reconciliation conflict");
  assert.equal(refs.reconciliationStatus, "error");
  assert.ok(
    refs.conflicts.some((row2) => String(row2.bankTransactionId) === "btx-shared"),
    "the conflicting bank transaction must be listed",
  );
});

/* --------------------------------------------------- 16) client renamed */

check("16) renaming a client keeps its ledger, which is keyed by clientId", () => {
  const before = buildClientArSummary(data(), { clientId: ACME.id, startDate: PERIOD_START, endDate: TODAY });
  const state = getErpState();
  const renamed = "ACME건설(??";
  saveErpState(
    {
      ...state.data,
      clients: (state.data.clients || []).map((row) =>
        String(row.id) === String(ACME.id) ? { ...row, name: renamed } : row,
      ),
      sales: (state.data.sales || []).map((row) =>
        String(row.clientId) === String(ACME.id) ? { ...row, client: renamed } : row,
      ),
    },
    state.version,
    "phase3-client-rename",
  );

  const after = buildClientArSummary(data(), { clientId: ACME.id, startDate: PERIOD_START, endDate: TODAY });
  assert.equal(after.clientName, renamed, "the ledger must follow the new name");
  assert.equal(after.closingAr, before.closingAr, "renaming must not move AR");
  assert.equal(after.periodSales, before.periodSales);
  assert.equal(after.periodAppliedAllocations, before.periodAppliedAllocations);
  assert.equal(saleRow(1015).receiptAllocatedAmount, 250_000, "sale-level applied must survive the rename");
});

/* ------------------------------------------------ 17) duplicate client names */

check("17) two clients sharing a name are never merged", () => {
  const a = buildClientArSummary(data(), { clientId: TWIN_A.id, startDate: PERIOD_START, endDate: TODAY });
  const b = buildClientArSummary(data(), { clientId: TWIN_B.id, startDate: PERIOD_START, endDate: TODAY });

  assert.equal(a.clientName, b.clientName, "fixture must actually share the name");
  assert.notEqual(a.clientId, b.clientId);
  assert.equal(a.saleCount, 1, "each client keeps only its own sale");
  assert.equal(b.saleCount, 1);
  assert.equal(b.closingAr, 170_000, "the untouched twin must keep its full AR");
  assert.equal(b.periodAppliedAllocations, 0, "the twin must not absorb the other's payment");

  const twinASale = saleRow(1020);
  const twinBSale = saleRow(1021);
  assert.equal(twinASale.clientId, String(TWIN_A.id));
  assert.equal(twinBSale.clientId, String(TWIN_B.id));
});

/* --------------------------------------------------- 18) zero-amount sale */

check("18) a zero-amount sale shows AR 0 and is never force-allocated", () => {
  const row = saleRow(1016);
  assert.equal(row.billedAmount, 0);
  assert.equal(row.outstandingAmount, 0);
  assert.equal(row.totalAppliedAmount, 0);
  assert.equal(row.paymentStatus, "paid", "nothing is owed, so it is settled");

  const zeroArchive = makeArchive({
    subjectName: (data().clients || []).find((row2) => String(row2.id) === String(ACME.id)).name,
    statementTotalAmount: 0,
    statementSalesIds: [1016],
    fileName: "acme-zero.pdf",
  });
  const status = statementStatus(zeroArchive);
  assert.equal(status.billedAmount, 0);
  assert.equal(status.manualReview, false, "a resolvable zero statement is still reviewable");

  // A zero-amount allocation must be refused outright.
  assert.throws(
    () =>
      createAndPostReceipt(
        {
          operationId: "phase3-zero-allocation",
          clientId: ACME.id,
          receiptDate: PAY_DAY,
          grossAmount: 0,
          channel: "bank",
          source: "receivables",
          allocations: [{ saleId: 1016, amount: 0 }],
        },
        "phase3-test",
      ),
    (error) => error.code === "GROSS_AMOUNT_REQUIRED" || error.code === "ALLOCATION_AMOUNT_INVALID",
  );
  assert.equal(saleRow(1016).totalAppliedAmount, 0);
});

/* -------------------------- 19) period boundary / reverse / retro-allocation */

check("19) period boundary, reverse and retro-allocation preserve Phase 1 as-of results", () => {
  const boundary = shiftSeoulDate(PAY_DAY, -1);
  const receipt = createAndPostReceipt(
    {
      operationId: "phase3-asof-boundary",
      clientId: BOUND.id,
      receiptDate: PAY_DAY,
      grossAmount: 100_000,
      channel: "bank",
      source: "receivables",
      allocations: [{ saleId: 1031, amount: 100_000, effectiveFrom: PAY_DAY }],
    },
    "phase3-test",
  );

  // The shared read model and the Phase 1 server rule must agree exactly.
  const allocation = (data().receiptAllocations || []).find(
    (row) => String(row.receiptId) === String(receipt.receipt.id),
  );
  const receiptById = new Map((data().receipts || []).map((row) => [String(row.id), row]));
  for (const asOf of [boundary, PAY_DAY, LATER_DAY, TODAY]) {
    assert.equal(
      isUnifiedAllocationEffectiveAsOf(allocation, receiptById, asOf),
      isAllocationEffectiveAsOf(allocation, receiptById, asOf),
      `as-of effectiveness must match receipts.mjs at ${asOf}`,
    );
  }
  assert.equal(isUnifiedAllocationEffectiveAsOf(allocation, receiptById, boundary), false, "not effective the day before");
  assert.equal(isUnifiedAllocationEffectiveAsOf(allocation, receiptById, PAY_DAY), true, "effective from the receipt date");

  const beforeSummary = buildClientArSummary(data(), { clientId: BOUND.id, startDate: PERIOD_START, endDate: boundary });
  const appliedBefore = beforeSummary.periodAppliedAllocations;

  reverseReceipt(receipt.receipt.id, { operationId: "phase3-asof-reverse", reversalEffectiveDate: TODAY }, "phase3-test");

  const afterSummary = buildClientArSummary(data(), { clientId: BOUND.id, startDate: PERIOD_START, endDate: boundary });
  assert.equal(
    afterSummary.periodAppliedAllocations,
    appliedBefore,
    "a later reverse must not rewrite a closed period",
  );

  const closedPeriod = buildClientArSummary(data(), { clientId: BOUND.id, startDate: PAY_DAY, endDate: LATER_DAY });
  assert.equal(closedPeriod.periodAppliedAllocations, 100_000, "the closed period keeps the original allocation");
  assert.ok(closedPeriod.identity.ok);

  const today = buildClientArSummary(data(), { clientId: BOUND.id, startDate: PERIOD_START, endDate: TODAY });
  assert.ok(today.identity.ok, "identity must hold after the reverse too");
});

/* --------------------- 20) bank reverse with a real (non-zero) allocation */

check("20) bank link reverse restores AR exactly once from a real 400,000 allocation", () => {
  const before = saleRow(1012);
  assert.equal(before.outstandingAmount, 400_000);

  const linked = createBankTransactionReceipt(
    "btx-1012",
    {
      operationId: "phase3-bank-real",
      clientId: ACME.id,
      allocations: [{ saleId: 1012, amount: 400_000 }],
      source: "bank_manual",
    },
    "phase3-test",
  );
  const allocations = (data().receiptAllocations || []).filter(
    (row) => String(row.receiptId) === String(linked.receipt.id),
  );
  assert.equal(allocations.length, 1);
  assert.equal(allocations[0].amount, 400_000, "a 0-amount allocation is forbidden for this gate");
  assert.equal(saleRow(1012).outstandingAmount, 0, "AR must drop by exactly 400,000");

  const reversed = reverseBankTransactionReceipt(
    "btx-1012",
    { operationId: "phase3-bank-real-reverse", receiptId: linked.receipt.id },
    "phase3-test",
  );
  assert.ok(reversed.receipt.id);

  const after = saleRow(1012);
  assert.equal(after.outstandingAmount, 400_000, "AR must be restored exactly once");
  assert.equal(after.receiptAllocatedAmount, 0);

  const tx = (data().bankTransactions || []).find((row) => String(row.id) === "btx-1012");
  assert.ok(!tx.linkedReceiptId, "linkedReceiptId must be cleared atomically with the reverse");
});

/* ------------- 24) new deposit flow adds no vouchers / paymentInputLogs */

check("24) the whole Phase 3 deposit flow added zero paymentVouchers and paymentInputLogs", () => {
  const current = data();
  const vouchers = current.paymentVouchers || [];
  const logs = current.paymentInputLogs || [];

  // Only the two rows seeded on purpose (legacy compatibility + forced conflict) may exist.
  assert.deepEqual(
    vouchers.map((row) => String(row.id)).sort(),
    ["pv-conflict-1013", "pv-legacy-1014"],
    "no new legacy voucher may be produced by any receipt path",
  );
  assert.equal(logs.length, 0, "no paymentInputLogs may be produced");

  // And the write freeze rejects a brand-new voucher arriving through a generic save.
  const state = getErpState();
  saveErpState(
    {
      ...state.data,
      paymentVouchers: [
        ...vouchers,
        { id: "pv-blocked-new", salesId: 1005, client: ACME.name, date: TODAY, amount: 100_000, finalAmount: 100_000 },
      ],
    },
    state.version,
    "phase3-freeze-check",
  );
  const afterIds = (data().paymentVouchers || []).map((row) => String(row.id));
  assert.ok(!afterIds.includes("pv-blocked-new"), "a generic save must not be able to add a voucher");
  assert.deepEqual(afterIds.sort(), ["pv-conflict-1013", "pv-legacy-1014"], "existing rows must be preserved");
});

/* --------------------------------------------------- closing invariants */

check("closing) every client summary satisfies the AR and cash identities", () => {
  for (const client of data().clients || []) {
    const summary = buildClientArSummary(data(), {
      clientId: client.id,
      startDate: PERIOD_START,
      endDate: TODAY,
    });
    assert.ok(summary.identity.ok, `AR identity failed for client ${client.id}: ${JSON.stringify(summary.identity)}`);
    assert.ok(
      summary.cashIdentity.ok,
      `cash identity failed for client ${client.id}: ${JSON.stringify(summary.cashIdentity)}`,
    );
    assert.ok(summary.closingAr >= 0, `closing AR must never be negative for client ${client.id}`);
  }
});

check("closing) the parity dry-run reports zero mutations", () => {
  const report = buildArParityReport(data(), { asOfDate: TODAY, archives: [] });
  assert.equal(report.mutations, 0);
  assert.equal(report.totals.saleCount, (data().sales || []).length);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log("unified AR phase3 tests passed");
