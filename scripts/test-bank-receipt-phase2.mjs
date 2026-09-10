/**
 * Unified AR Phase 2 — bank deposit ↔ Receipt integration tests (SQLite).
 * Run: npx tsx scripts/test-bank-receipt-phase2.mjs
 *
 * Covers required cases 1-23. Cases 24-25 are manual UI smoke checks and are
 * printed as notes at the end.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-bank-receipt-phase2-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.PDF_ARCHIVE_DIR = path.join(tmpDir, "pdf-archives");
process.env.JWT_SECRET = "test-bank-receipt-phase2";
process.env.AUTO_DEPOSIT_RECEIPT_CUTOVER_AT = "";

const { initDb, getErpState, saveErpState } = await import("../server/db.mjs");
const { initPdfArchiveStore, createPdfArchive, getPdfArchiveMetaById } = await import(
  "../server/pdfArchive.mjs"
);
const {
  createBankTransactionReceipt,
  reverseBankTransactionReceipt,
  getBankTransactionReceipt,
  ensureBankReceiptCutoverAt,
  isBankTxReceiptAutoLinkEligible,
  resolveBankTxSeoulYmd,
  buildBankReceiptPhase2Diagnostics,
} = await import("../server/bankReceipts.mjs");
const {
  applySentStatementAutoLinksToErpData,
  applyPendingPdfArchiveAutoLinkUpdates,
  collectAutoLinkTransactionIds,
} = await import("../server/bankSentStatementAutoLink.ts");
const { isBankDepositLinked, getBankDepositLinkKind, resolveBankDepositReceiptId } = await import(
  "../src/utils/bankDepositLink.ts"
);
const { normalizeBankTransaction } = await import("../src/utils/bankTransactions.ts");
const { buildClientArSubledger } = await import("../server/receiptArSubledger.mjs");
const {
  DEFAULT_SENT_STATEMENT_AUTO_LINK_MIN_SCORE,
  DEFAULT_SENT_STATEMENT_MAX_DATE_GAP_DAYS,
  DEFAULT_SENT_STATEMENT_AMBIGUITY_MIN_SCORE_GAP,
} = await import("../src/utils/bankSentStatementMatch.ts");

initDb();
initPdfArchiveStore();

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error);
  }
}

/* ------------------------------------------------------------------ fixtures */

const NOW = new Date();
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(NOW);
const MONTH = TODAY.slice(0, 7);
const PERIOD_START = `${MONTH}-01`;
const PERIOD_END = `${MONTH}-28`;
const SALE_DATE = `${MONTH}-05`;
const NOW_ISO = NOW.toISOString();
const OLD_ISO = "2020-01-02T00:00:00.000Z";

const CLIENT_A = { id: 201, name: "알파건설", vat: "N" };
const CLIENT_B = { id: 202, name: "베타인테리어", vat: "N" };
const CLIENT_DUP_1 = { id: 203, name: "중복상사", vat: "N" };
const CLIENT_DUP_2 = { id: 204, name: "중복상사", vat: "N" };
const CLIENT_STMT = { id: 205, name: "감마퍼니처", vat: "N" };

function bankTx(partial) {
  return normalizeBankTransaction({
    accountNumber: "969-046529-04-015",
    bankName: "IBK",
    balanceAfter: 0,
    withdrawal: 0,
    deposit: 0,
    description: "입금",
    transactionAt: `${TODAY}T10:00:00+09:00`,
    createdAt: NOW_ISO,
    ...partial,
  });
}

const seed = {
  clients: [CLIENT_A, CLIENT_B, CLIENT_DUP_1, CLIENT_DUP_2, CLIENT_STMT],
  sales: [
    { id: 3001, date: SALE_DATE, client: CLIENT_A.name, clientId: CLIENT_A.id, amount: 1_000_000, paid: 0, site: "A현장" },
    { id: 3002, date: SALE_DATE, client: CLIENT_A.name, clientId: CLIENT_A.id, amount: 400_000, paid: 0, site: "B현장" },
    { id: 3003, date: SALE_DATE, client: CLIENT_B.name, clientId: CLIENT_B.id, amount: 700_000, paid: 0, site: "C현장" },
    { id: 3004, date: SALE_DATE, client: CLIENT_STMT.name, clientId: CLIENT_STMT.id, amount: 550_000, paid: 0, site: "D현장" },
    { id: 3005, date: SALE_DATE, client: CLIENT_DUP_1.name, clientId: CLIENT_DUP_1.id, amount: 300_000, paid: 0, site: "E현장" },
  ],
  paymentVouchers: [
    {
      id: 9101,
      salesId: 3003,
      client: CLIENT_B.name,
      date: SALE_DATE,
      amount: 100_000,
      finalAmount: 100_000,
      bankTransactionId: "btx-legacy",
    },
  ],
  paymentInputLogs: [],
  receipts: [],
  receiptAllocations: [],
  bankTransactions: [
    bankTx({ id: "btx-manual-1", deposit: 1_000_000, counterpartyName: CLIENT_A.name }),
    bankTx({ id: "btx-manual-2", deposit: 400_000, counterpartyName: CLIENT_A.name }),
    bankTx({ id: "btx-manual-3", deposit: 1_400_000, counterpartyName: CLIENT_A.name }),
    bankTx({ id: "btx-partial", deposit: 900_000, counterpartyName: CLIENT_B.name }),
    bankTx({ id: "btx-reverse", deposit: 400_000, counterpartyName: CLIENT_A.name }),
    bankTx({ id: "btx-legacy", deposit: 100_000, counterpartyName: CLIENT_B.name, linkedPaymentVoucherId: 9101 }),
    bankTx({ id: "btx-card", deposit: 500_000, counterpartyName: "신한카드", description: "신한카드 입금" }),
    bankTx({ id: "btx-withdrawal", deposit: 0, withdrawal: 300_000, counterpartyName: CLIENT_A.name }),
    bankTx({ id: "btx-auto-stmt", deposit: 550_000, counterpartyName: CLIENT_STMT.name, transactionAt: `${TODAY}T11:00:00+09:00` }),
    bankTx({ id: "btx-auto-dup", deposit: 300_000, counterpartyName: CLIENT_DUP_1.name, transactionAt: `${TODAY}T11:30:00+09:00` }),
    bankTx({
      id: "btx-precutover",
      deposit: 550_000,
      counterpartyName: CLIENT_STMT.name,
      createdAt: OLD_ISO,
      transactionAt: `${TODAY}T12:00:00+09:00`,
    }),
  ],
  bankSyncMeta: {},
};

{
  const state = getErpState();
  saveErpState({ ...state.data, ...seed }, state.version, "phase2-seed", {
    allowReceiptMutation: true,
  });
}

function reload() {
  return getErpState().data || {};
}
function findTx(data, id) {
  return (data.bankTransactions || []).find((row) => String(row.id) === id);
}
function receiptsFor(data, txId) {
  return (data.receipts || []).filter((row) => String(row.bankTransactionId || "") === txId);
}

/* ------------------------------------------------------------------- 1 - 23 */

check("1) manual link creates Receipt + Allocation and no legacy voucher rows", () => {
  const before = reload();
  const result = createBankTransactionReceipt(
    "btx-manual-1",
    {
      operationId: "bank-receipt:manual:btx-manual-1:t1",
      clientId: CLIENT_A.id,
      allocations: [{ saleId: 3001, amount: 1_000_000 }],
      source: "bank_manual",
    },
    "tester",
  );
  assert.equal(result.ok, true);
  assert.equal(result.receipt.channel, "bank");
  assert.equal(result.receipt.source, "bank_manual");
  assert.equal(result.allocations.length, 1);

  const after = reload();
  assert.equal(receiptsFor(after, "btx-manual-1").length, 1);
  assert.equal((after.paymentVouchers || []).length, (before.paymentVouchers || []).length);
  assert.equal((after.paymentInputLogs || []).length, (before.paymentInputLogs || []).length);
  assert.equal(
    (after.paymentVouchers || []).some((row) => String(row.bankTransactionId || "") === "btx-manual-1"),
    false,
  );
});

check("2) grossAmount always equals tx.deposit (client-supplied gross ignored)", () => {
  const result = createBankTransactionReceipt(
    "btx-manual-2",
    {
      operationId: "bank-receipt:manual:btx-manual-2:t1",
      clientId: CLIENT_A.id,
      grossAmount: 99_999_999,
      allocations: [{ saleId: 3002, amount: 400_000 }],
    },
    "tester",
  );
  assert.equal(result.receipt.grossAmount, 400_000);
  assert.equal(result.summary.unallocatedAmount, 0);
});

check("3) receiptDate is the Seoul calendar day of the transaction", () => {
  const receipt = receiptsFor(reload(), "btx-manual-1")[0];
  assert.equal(receipt.receiptDate, TODAY);
  assert.equal(resolveBankTxSeoulYmd("2026-07-19T20:00:00Z"), "2026-07-20");
  assert.equal(resolveBankTxSeoulYmd("2026-07-20"), "2026-07-20");
});

check("4) bank row carries receipt link fields and never a voucher id", () => {
  const data = reload();
  const tx = findTx(data, "btx-manual-1");
  const receipt = receiptsFor(data, "btx-manual-1")[0];
  assert.equal(tx.linkedReceiptId, receipt.id);
  assert.equal(tx.receiptLinkSource, "bank_manual");
  assert.ok(tx.receiptLinkedAt);
  assert.equal(tx.receiptLinkedBy, "tester");
  assert.equal(tx.matchAutoLinked, false);
  assert.equal(tx.matchConfirmedBy, "tester");
  assert.equal(tx.linkedSubject, CLIENT_A.name);
  assert.equal(tx.folderId, "bank-folder-client-default");
  assert.equal(tx.linkedPaymentVoucherId, undefined);
});

check("5) single allocation sets linkedSalesId, no allocation leaves it empty", () => {
  assert.equal(String(findTx(reload(), "btx-manual-1").linkedSalesId), "3001");

  const result = createBankTransactionReceipt(
    "btx-manual-3",
    {
      operationId: "bank-receipt:manual:btx-manual-3:t1",
      clientId: CLIENT_A.id,
      allocations: [],
    },
    "tester",
  );
  assert.equal(result.allocations.length, 0);
  assert.equal(result.summary.unallocatedAmount, 1_400_000);
  assert.equal(findTx(reload(), "btx-manual-3").linkedSalesId, undefined);
});

check("6) replaying the same operationId + payload is idempotent", () => {
  const first = receiptsFor(reload(), "btx-manual-1")[0];
  const replay = createBankTransactionReceipt(
    "btx-manual-1",
    {
      operationId: "bank-receipt:manual:btx-manual-1:t1",
      clientId: CLIENT_A.id,
      allocations: [{ saleId: 3001, amount: 1_000_000 }],
    },
    "tester",
  );
  assert.equal(replay.idempotent, true);
  assert.equal(replay.receipt.id, first.id);
  assert.equal(receiptsFor(reload(), "btx-manual-1").length, 1);
});

check("7) same operationId with a different payload is an IDEMPOTENCY_CONFLICT", () => {
  assert.throws(
    () =>
      createBankTransactionReceipt(
        "btx-manual-1",
        {
          operationId: "bank-receipt:manual:btx-manual-1:t1",
          clientId: CLIENT_A.id,
          allocations: [{ saleId: 3002, amount: 100_000 }],
        },
        "tester",
      ),
    (error) => error.code === "IDEMPOTENCY_CONFLICT" && error.status === 409,
  );
  assert.equal(receiptsFor(reload(), "btx-manual-1").length, 1);
});

check("8) a second receipt on an already-linked deposit is rejected", () => {
  assert.throws(
    () =>
      createBankTransactionReceipt(
        "btx-manual-1",
        {
          operationId: "bank-receipt:manual:btx-manual-1:t2",
          clientId: CLIENT_A.id,
          allocations: [],
        },
        "tester",
      ),
    (error) => error.code === "BANK_TX_ALREADY_POSTED" && error.status === 409,
  );
  assert.equal(receiptsFor(reload(), "btx-manual-1").length, 1);
});

check("9) legacy voucher-linked deposits are refused (keep legacy unlink path)", () => {
  assert.throws(
    () =>
      createBankTransactionReceipt(
        "btx-legacy",
        {
          operationId: "bank-receipt:manual:btx-legacy:t1",
          clientId: CLIENT_B.id,
          allocations: [],
        },
        "tester",
      ),
    (error) => error.code === "BANK_TX_LEGACY_LINKED" && error.status === 409,
  );
  assert.equal(receiptsFor(reload(), "btx-legacy").length, 0);
});

check("10) mixed-client allocations are rejected with zero mutation", () => {
  const before = reload();
  assert.throws(
    () =>
      createBankTransactionReceipt(
        "btx-partial",
        {
          operationId: "bank-receipt:manual:btx-partial:mixed",
          clientId: CLIENT_B.id,
          allocations: [
            { saleId: 3003, amount: 100_000 },
            { saleId: 3001, amount: 100_000 },
          ],
        },
        "tester",
      ),
    (error) => error.code === "CLIENT_SALE_MISMATCH",
  );
  const after = reload();
  assert.equal((after.receipts || []).length, (before.receipts || []).length);
  assert.equal(findTx(after, "btx-partial").linkedReceiptId, undefined);
});

check("11) card-company deposits are refused", () => {
  assert.throws(
    () =>
      createBankTransactionReceipt(
        "btx-card",
        { operationId: "bank-receipt:manual:btx-card:t1", clientId: CLIENT_A.id },
        "tester",
      ),
    (error) => error.code === "BANK_TX_CARD_COMPANY",
  );
});

check("12) withdrawals and unknown bank rows are refused", () => {
  assert.throws(
    () =>
      createBankTransactionReceipt("btx-withdrawal", { operationId: "op-w", clientId: CLIENT_A.id }, "tester"),
    (error) => error.code === "BANK_TX_NOT_DEPOSIT",
  );
  assert.throws(
    () => createBankTransactionReceipt("btx-missing", { operationId: "op-m", clientId: CLIENT_A.id }, "tester"),
    (error) => error.code === "BANK_TX_NOT_FOUND" && error.status === 404,
  );
});

check("13) clientId is required and must exist", () => {
  assert.throws(
    () => createBankTransactionReceipt("btx-partial", { operationId: "op-c1" }, "tester"),
    (error) => error.code === "CLIENT_REQUIRED",
  );
  assert.throws(
    () => createBankTransactionReceipt("btx-partial", { operationId: "op-c2", clientId: 999999 }, "tester"),
    (error) => error.code === "CLIENT_NOT_FOUND" && error.status === 404,
  );
});

check("14) over-allocating a sale is rejected atomically", () => {
  const before = reload();
  assert.throws(
    () =>
      createBankTransactionReceipt(
        "btx-partial",
        {
          operationId: "bank-receipt:manual:btx-partial:over",
          clientId: CLIENT_B.id,
          allocations: [{ saleId: 3003, amount: 900_000 }],
        },
        "tester",
      ),
    (error) => error.code === "ALLOCATION_EXCEEDS_SALE",
  );
  const after = reload();
  assert.equal((after.receipts || []).length, (before.receipts || []).length);
  assert.equal((after.receiptAllocations || []).length, (before.receiptAllocations || []).length);
  assert.equal(findTx(after, "btx-partial").linkedReceiptId, undefined);
});

check("15) partial allocation keeps the cash identity (gross = allocated + unallocated)", () => {
  const result = createBankTransactionReceipt(
    "btx-partial",
    {
      operationId: "bank-receipt:manual:btx-partial:ok",
      clientId: CLIENT_B.id,
      allocations: [{ saleId: 3003, amount: 600_000 }],
    },
    "tester",
  );
  assert.equal(result.receipt.grossAmount, 900_000);
  assert.equal(result.summary.allocatedAmount, 600_000);
  assert.equal(result.summary.unallocatedAmount, 300_000);
  assert.equal(
    result.summary.allocatedAmount + result.summary.unallocatedAmount,
    result.receipt.grossAmount,
  );
});

check("16) reverse cancels the receipt, restores AR once and frees the deposit", () => {
  const created = createBankTransactionReceipt(
    "btx-reverse",
    {
      operationId: "bank-receipt:manual:btx-reverse:t1",
      clientId: CLIENT_A.id,
      allocations: [{ saleId: 3002, amount: 0 }],
    },
    "tester",
  );
  assert.equal(created.receipt.grossAmount, 400_000);

  const subledgerBefore = buildClientArSubledger(reload(), {
    clientId: CLIENT_A.id,
    startDate: PERIOD_START,
    endDate: TODAY,
  });

  const reversed = reverseBankTransactionReceipt("btx-reverse", {}, "tester");
  assert.equal(reversed.ok, true);
  assert.equal(reversed.original.status, "reversed");

  const after = reload();
  const tx = findTx(after, "btx-reverse");
  assert.equal(tx.linkedReceiptId, undefined);
  assert.equal(tx.receiptLinkSource, undefined);
  assert.equal(tx.receiptLinkedAt, undefined);
  assert.equal(tx.receiptLinkedBy, undefined);
  assert.equal(tx.matchAutoLinked, undefined);
  assert.equal(getBankDepositLinkKind(tx, { receipts: after.receipts }), "none");

  const subledgerAfter = buildClientArSubledger(after, {
    clientId: CLIENT_A.id,
    startDate: PERIOD_START,
    endDate: TODAY,
  });
  assert.equal(subledgerAfter.periodReceipts, subledgerBefore.periodReceipts - 400_000);
});

check("17) reverse is idempotent for the same operation id", () => {
  const receiptId = receiptsFor(reload(), "btx-manual-2")[0].id;
  const opId = `bank-receipt:reverse:btx-manual-2:${receiptId}`;
  const first = reverseBankTransactionReceipt("btx-manual-2", { operationId: opId }, "tester");
  const second = reverseBankTransactionReceipt("btx-manual-2", { operationId: opId }, "tester");
  assert.equal(second.idempotent, true);
  assert.equal(second.receipt.id, first.receipt.id);
  const reversalRows = (reload().receipts || []).filter(
    (row) => String(row.reversalOfReceiptId || "") === String(receiptId),
  );
  assert.equal(reversalRows.length, 1);
});

check("18) reverse frees the deposit for a fresh receipt", () => {
  const relinked = createBankTransactionReceipt(
    "btx-reverse",
    {
      operationId: "bank-receipt:manual:btx-reverse:t2",
      clientId: CLIENT_A.id,
      allocations: [{ saleId: 3002, amount: 400_000 }],
    },
    "tester",
  );
  assert.equal(relinked.receipt.grossAmount, 400_000);
  assert.equal(relinked.summary.allocatedAmount, 400_000);
  const open = receiptsFor(reload(), "btx-reverse").filter(
    (row) => row.status === "posted" && !row.reversedEffectiveDate,
  );
  assert.equal(open.length, 1);
});

check("19) shared helper recognizes receipt, legacy and reversed states", () => {
  const data = reload();
  assert.equal(isBankDepositLinked({ id: "x", linkedReceiptId: "rcp_1" }), true);
  assert.equal(isBankDepositLinked({ id: "x", linkedPaymentVoucherId: 7 }), true);
  assert.equal(getBankDepositLinkKind({ id: "x", linkedPaymentVoucherId: 7 }), "legacy");
  assert.equal(
    getBankDepositLinkKind({ id: "btx-1" }, { paymentVouchers: [{ id: 1, bankTransactionId: "btx-1" }] }),
    "legacy",
  );
  assert.equal(
    getBankDepositLinkKind({ id: "btx-2" }, { receipts: [{ id: "r1", bankTransactionId: "btx-2", status: "posted" }] }),
    "receipt",
  );
  assert.equal(
    getBankDepositLinkKind(
      { id: "btx-3", linkedReceiptId: "r2" },
      { receipts: [{ id: "r2", bankTransactionId: "btx-3", status: "reversed", reversedEffectiveDate: TODAY }] },
    ),
    "none",
  );
  const linkedTx = findTx(data, "btx-manual-1");
  assert.equal(getBankDepositLinkKind(linkedTx, { receipts: data.receipts }), "receipt");
  assert.equal(resolveBankDepositReceiptId(linkedTx, { receipts: data.receipts }), linkedTx.linkedReceiptId);
});

const statementArchive = createPdfArchive(
  Buffer.from("%PDF-1.4 statement"),
  {
    fileName: `${CLIENT_STMT.name}.pdf`,
    category: "statement-client",
    subjectName: CLIENT_STMT.name,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    sentViaLink: true,
    statementTotalAmount: 550_000,
    statementSalesIds: [3004],
    paymentStatus: "pending",
  },
  "phase2-seed",
);

const dupArchive = createPdfArchive(
  Buffer.from("%PDF-1.4 statement dup"),
  {
    fileName: `${CLIENT_DUP_1.name}.pdf`,
    category: "statement-client",
    subjectName: CLIENT_DUP_1.name,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    sentViaLink: true,
    statementTotalAmount: 300_000,
    statementSalesIds: [3005],
    paymentStatus: "pending",
  },
  "phase2-seed",
);

await checkAsync("20) auto-link posts a Receipt and writes no vouchers/logs", async () => {
  const before = reload();
  const linked = await applySentStatementAutoLinksToErpData(before, {
    onlyTransactionIds: ["btx-auto-stmt"],
    addedIds: ["btx-auto-stmt"],
    updatedBy: "auto-test",
    deferPdfMeta: true,
  });
  assert.equal(linked.autoLinkedCount, 1);
  assert.equal(linked.receiptIds.length, 1);
  assert.equal(linked.diagnostics.linked, 1);

  const nextData = linked.data;
  assert.equal((nextData.paymentVouchers || []).length, (before.paymentVouchers || []).length);
  assert.equal((nextData.paymentInputLogs || []).length, (before.paymentInputLogs || []).length);
  assert.equal((nextData.receipts || []).length, (before.receipts || []).length + 1);

  const tx = (nextData.bankTransactions || []).find((row) => row.id === "btx-auto-stmt");
  assert.equal(tx.linkedReceiptId, linked.receiptIds[0]);
  assert.equal(tx.receiptLinkSource, "bank_auto");
  assert.equal(tx.matchAutoLinked, true);
  assert.equal(tx.linkedPaymentVoucherId, undefined);
  assert.equal(tx.linkedPdfArchiveId, statementArchive.id);

  const receipt = (nextData.receipts || []).find((row) => row.id === linked.receiptIds[0]);
  assert.equal(receipt.source, "bank_auto");
  assert.equal(receipt.channel, "bank");
  assert.equal(receipt.grossAmount, 550_000);
  assert.equal(receipt.sentStatementId, statementArchive.id);
  assert.equal(receipt.operationId, "bank-receipt:auto:btx-auto-stmt");

  assert.equal(linked.pendingPdfUpdates.length, 1);
  assert.equal(linked.pendingPdfUpdates[0].receiptId, linked.receiptIds[0]);
  assert.equal("primaryVoucherId" in linked.pendingPdfUpdates[0], false);

  const state = getErpState();
  saveErpState(nextData, state.version, "auto-test", { allowReceiptMutation: true });
  applyPendingPdfArchiveAutoLinkUpdates(linked.pendingPdfUpdates);

  const meta = getPdfArchiveMetaById(statementArchive.id);
  assert.equal(meta.linkedReceiptId, linked.receiptIds[0]);
  assert.equal(meta.linkedPaymentVoucherId, undefined);
  assert.equal(meta.linkedBankTransactionId, "btx-auto-stmt");
});

await checkAsync("21) auto-link is idempotent across runs (no second receipt)", async () => {
  const data = reload();
  const linked = await applySentStatementAutoLinksToErpData(data, {
    onlyTransactionIds: ["btx-auto-stmt"],
    addedIds: ["btx-auto-stmt"],
    updatedBy: "auto-test",
    deferPdfMeta: true,
  });
  assert.equal(linked.autoLinkedCount, 0);
  assert.equal(linked.diagnostics.alreadyLinked, 1);
  assert.equal(receiptsFor(reload(), "btx-auto-stmt").length, 1);
});

await checkAsync("22) ambiguous client name is skipped for manual review", async () => {
  const data = reload();
  const linked = await applySentStatementAutoLinksToErpData(data, {
    onlyTransactionIds: ["btx-auto-dup"],
    addedIds: ["btx-auto-dup"],
    updatedBy: "auto-test",
    deferPdfMeta: true,
  });
  assert.equal(linked.autoLinkedCount, 0);
  assert.equal(linked.receiptIds.length, 0);
  assert.equal(linked.diagnostics.linked, 0);
  assert.ok(linked.diagnostics.ambiguous >= 1);
  assert.equal(receiptsFor(linked.data, "btx-auto-dup").length, 0);
  assert.equal(
    (linked.data.bankTransactions || []).find((row) => row.id === "btx-auto-dup").linkedReceiptId,
    undefined,
  );
  assert.ok(dupArchive.id);
});

await checkAsync("23) cutover gating: pre-cutover deposits are diagnostics-only", async () => {
  const data = reload();
  const cutoverAt = data.bankSyncMeta?.bankReceiptCutoverAt;
  assert.ok(cutoverAt, "cutover must be stamped by the first Phase 2 auto-link run");
  assert.ok(cutoverAt > OLD_ISO);

  const linked = await applySentStatementAutoLinksToErpData(data, {
    onlyTransactionIds: ["btx-precutover"],
    updatedBy: "auto-test",
    deferPdfMeta: true,
  });
  assert.equal(linked.autoLinkedCount, 0);
  assert.equal(linked.skippedPreCutover, 1);
  assert.equal(linked.diagnostics.evaluated, 0);
  assert.equal((linked.data.receipts || []).length, (data.receipts || []).length);

  assert.equal(
    isBankTxReceiptAutoLinkEligible({ id: "btx-precutover", createdAt: OLD_ISO }, { cutoverAt }),
    false,
  );
  // ...but the same row is eligible when this very sync just imported it.
  assert.equal(
    isBankTxReceiptAutoLinkEligible(
      { id: "btx-precutover", createdAt: OLD_ISO },
      { cutoverAt, addedIds: ["btx-precutover"] },
    ),
    true,
  );

  // The retry lookback window must never reach before the cutover day.
  const wideIds = collectAutoLinkTransactionIds(data.bankTransactions || [], {
    addedIds: [],
    lookbackDays: 3650,
    asOfDate: TODAY,
    cutoverAt: "2999-01-01T00:00:00.000Z",
    receipts: data.receipts || [],
    paymentVouchers: data.paymentVouchers || [],
  });
  assert.equal(wideIds.length, 0);
});

/* ------------------------------------------------------- supporting asserts */

check("cutover helper is stable once stamped", () => {
  const data = reload();
  const first = ensureBankReceiptCutoverAt(data, NOW_ISO);
  assert.equal(first.created, false);
  assert.equal(first.cutoverAt, data.bankSyncMeta.bankReceiptCutoverAt);

  const fresh = ensureBankReceiptCutoverAt({ bankSyncMeta: {} }, NOW_ISO);
  assert.equal(fresh.created, true);
  assert.equal(fresh.cutoverAt, NOW_ISO);
  assert.equal(fresh.bankSyncMeta.bankReceiptCutoverAt, NOW_ISO);
});

check("auto-match safety constants are unchanged", () => {
  assert.equal(DEFAULT_SENT_STATEMENT_AUTO_LINK_MIN_SCORE, 75);
  assert.equal(DEFAULT_SENT_STATEMENT_MAX_DATE_GAP_DAYS, 45);
  assert.equal(DEFAULT_SENT_STATEMENT_AMBIGUITY_MIN_SCORE_GAP, 5);
});

check("read-only receipt lookup reports link kind and summary", () => {
  const view = getBankTransactionReceipt("btx-manual-1");
  assert.equal(view.linkKind, "receipt");
  assert.equal(view.receipt.grossAmount, 1_000_000);
  assert.equal(view.summary.allocatedAmount, 1_000_000);

  const legacyView = getBankTransactionReceipt("btx-legacy");
  assert.equal(legacyView.linkKind, "legacy");
  assert.equal(legacyView.receipt, null);
});

check("dry-run diagnostics never report fake voucher ids on receipt links", () => {
  const report = buildBankReceiptPhase2Diagnostics(reload());
  assert.equal(report.bankTransactions.fakeVoucherIdOnReceiptLink, 0);
  assert.equal(report.receipts.orphanBankTransactionIds.length, 0);
  assert.equal(report.receipts.grossMismatchReceiptIds.length, 0);
  assert.ok(report.bankTransactions.receiptLinked >= 4);
  assert.equal(report.bankTransactions.legacyLinked, 1);
  assert.ok(report.cutoverAt);
});

console.log("\nManual UI smoke notes (cases 24-25):");
console.log("  24) 통장거래 수동 입금연결 → 저장 완료 후 목록에 입금전표번호·배분·미배분 배지가 표시되는지 확인");
console.log("  25) 연결 해제 → 취소전표 생성 + 매출 미수금 1회만 복원, 목록 휠 스크롤 동작 유지 확인");

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nbank receipt phase 2 tests passed");
