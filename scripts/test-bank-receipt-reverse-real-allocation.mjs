/**
 * GATE A — bank deposit reverse with a REAL allocation (SQLite integration).
 * Run: npx tsx scripts/test-bank-receipt-reverse-real-allocation.mjs
 *
 * A 0-amount allocation is explicitly FORBIDDEN as a substitute for this gate: the receipt
 * planner drops `amount <= 0` rows, so such a "link" never moves AR and cannot prove that a
 * reverse restores the receivable. This script therefore:
 *   1. links a 400,000 deposit to a sale WITH a 400,000 allocation,
 *   2. asserts AR drops by exactly 400,000,
 *   3. reverses through reverseBankTransactionReceipt on a LATER accounting date,
 *   4. asserts AR is restored exactly once,
 *   5. asserts the as-of ledger before the reverse date still shows the allocation,
 *   6. asserts the bank row's linkedReceiptId was cleared atomically with the reverse.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-reverse-real-alloc-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.PDF_ARCHIVE_DIR = path.join(tmpDir, "pdf-archives");
process.env.JWT_SECRET = "test-reverse-real-allocation";
process.env.AUTO_DEPOSIT_RECEIPT_CUTOVER_AT = "";

const { initDb, getErpState, saveErpState } = await import("../server/db.mjs");
const { createBankTransactionReceipt, reverseBankTransactionReceipt } = await import(
  "../server/bankReceipts.mjs"
);
const { buildClientArSubledger } = await import("../server/receiptArSubledger.mjs");
const { buildSaleArBalances } = await import("../server/unifiedArReadModel.mjs");
const { shiftSeoulDate, todaySeoul } = await import("../server/receipts.mjs");
const { normalizeBankTransaction } = await import("../src/utils/bankTransactions.ts");
const { getBankDepositLinkKind } = await import("../src/utils/bankDepositLink.ts");

initDb();

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

/* ------------------------------------------------------------------ fixture */

const TODAY = todaySeoul();
const YESTERDAY = shiftSeoulDate(TODAY, -1);
const DEPOSIT_DAY = shiftSeoulDate(TODAY, -5);
const SALE_DAY = shiftSeoulDate(TODAY, -10);
const PERIOD_START = shiftSeoulDate(TODAY, -40);

const CLIENT = { id: 501, name: "감마건설", vat: "N" };
const SALE_ID = 6001;
const OTHER_SALE_ID = 6002;
const TX_ID = "btx-real-reverse";
const ZERO_TX_ID = "btx-zero-allocation";
const AMOUNT = 400_000;

function bankTx(partial) {
  return normalizeBankTransaction({
    accountNumber: "969-046529-04-015",
    bankName: "IBK",
    balanceAfter: 0,
    withdrawal: 0,
    deposit: 0,
    description: "입금",
    transactionAt: `${DEPOSIT_DAY}T10:00:00+09:00`,
    createdAt: new Date().toISOString(),
    ...partial,
  });
}

{
  const state = getErpState();
  saveErpState(
    {
      ...state.data,
      clients: [CLIENT],
      sales: [
        { id: SALE_ID, date: SALE_DAY, client: CLIENT.name, clientId: CLIENT.id, amount: AMOUNT, paid: 0, site: "A현장" },
        { id: OTHER_SALE_ID, date: SALE_DAY, client: CLIENT.name, clientId: CLIENT.id, amount: AMOUNT, paid: 0, site: "B현장" },
      ],
      paymentVouchers: [],
      paymentInputLogs: [],
      receipts: [],
      receiptAllocations: [],
      bankTransactions: [
        bankTx({ id: TX_ID, deposit: AMOUNT, counterpartyName: CLIENT.name }),
        bankTx({ id: ZERO_TX_ID, deposit: AMOUNT, counterpartyName: CLIENT.name }),
      ],
      bankSyncMeta: {},
    },
    state.version,
    "reverse-gate-seed",
    { allowReceiptMutation: true, allowPaymentVoucherMutation: true },
  );
}

function reload() {
  return getErpState().data || {};
}
function findTx(data, id) {
  return (data.bankTransactions || []).find((row) => String(row.id) === String(id));
}
function ledger(data, asOf) {
  return buildClientArSubledger(data, { clientId: CLIENT.id, startDate: PERIOD_START, endDate: asOf });
}
function saleRow(data, asOf, saleId = SALE_ID) {
  const row = ledger(data, asOf).sales.find((item) => String(item.saleId) === String(saleId));
  assert.ok(row, `sale ${saleId} missing from AR subledger as-of ${asOf}`);
  return row;
}
function unifiedSaleRow(data, asOf, saleId = SALE_ID) {
  const row = buildSaleArBalances(data, { asOfDate: asOf }).sales.find(
    (item) => String(item.saleId) === String(saleId),
  );
  assert.ok(row, `sale ${saleId} missing from unified AR balances as-of ${asOf}`);
  return row;
}

/* --------------------------------------------------------------------- gate */

check("0) a 0-amount allocation is NOT a valid substitute for this gate", () => {
  const zero = createBankTransactionReceipt(
    ZERO_TX_ID,
    {
      operationId: `bank-receipt:manual:${ZERO_TX_ID}:zero`,
      clientId: CLIENT.id,
      allocations: [{ saleId: OTHER_SALE_ID, amount: 0 }],
    },
    "tester",
  );
  // The planner drops non-positive rows, so nothing was allocated and AR did not move.
  assert.equal(zero.allocations.length, 0);
  assert.equal(zero.summary.allocatedAmount, 0);
  assert.equal(zero.summary.unallocatedAmount, AMOUNT);
  assert.equal(saleRow(reload(), TODAY, OTHER_SALE_ID).balance, AMOUNT);
});

const opening = ledger(reload(), TODAY);
let created;

check("1) linking the deposit WITH a 400,000 allocation reduces AR by exactly 400,000", () => {
  const before = saleRow(reload(), TODAY);
  assert.equal(before.allocatedAmount, 0);
  assert.equal(before.balance, AMOUNT);

  created = createBankTransactionReceipt(
    TX_ID,
    {
      operationId: `bank-receipt:manual:${TX_ID}:t1`,
      clientId: CLIENT.id,
      allocations: [{ saleId: SALE_ID, amount: AMOUNT }],
    },
    "tester",
  );

  assert.equal(created.receipt.grossAmount, AMOUNT);
  assert.equal(created.receipt.receiptDate, DEPOSIT_DAY);
  assert.equal(created.allocations.length, 1, "gate requires exactly one real allocation");
  assert.equal(created.allocations[0].amount, AMOUNT, "gate forbids a 0-amount allocation");
  assert.equal(created.summary.allocatedAmount, AMOUNT);
  assert.equal(created.summary.unallocatedAmount, 0);

  const data = reload();
  const after = saleRow(data, TODAY);
  assert.equal(after.allocatedAmount, AMOUNT);
  assert.equal(after.balance, 0);
  assert.equal(ledger(data, TODAY).closingAr, opening.closingAr - AMOUNT);
  assert.equal(unifiedSaleRow(data, TODAY).receiptAllocatedAmount, AMOUNT);
  assert.equal(unifiedSaleRow(data, TODAY).outstandingAmount, 0);
  assert.equal(findTx(data, TX_ID).linkedReceiptId, created.receipt.id);
});

check("2) allocation is already effective on the deposit day, not before it", () => {
  const data = reload();
  assert.equal(saleRow(data, DEPOSIT_DAY).allocatedAmount, AMOUNT);
  assert.equal(saleRow(data, shiftSeoulDate(DEPOSIT_DAY, -1)).allocatedAmount, 0);
});

let reversed;

check("3) reverse restores AR by exactly 400,000, exactly once", () => {
  const before = ledger(reload(), TODAY);
  reversed = reverseBankTransactionReceipt(TX_ID, { receiptDate: TODAY }, "tester");
  assert.equal(reversed.ok, true);
  assert.equal(reversed.original.status, "reversed");
  assert.equal(reversed.original.reversedEffectiveDate, TODAY);

  const data = reload();
  const after = ledger(data, TODAY);
  assert.equal(after.closingAr, before.closingAr + AMOUNT);
  assert.equal(saleRow(data, TODAY).allocatedAmount, 0);
  assert.equal(saleRow(data, TODAY).balance, AMOUNT);
  assert.equal(unifiedSaleRow(data, TODAY).receiptAllocatedAmount, 0);
  assert.equal(unifiedSaleRow(data, TODAY).outstandingAmount, AMOUNT);

  const reversalDocs = (data.receipts || []).filter(
    (row) => String(row.reversalOfReceiptId || "") === String(created.receipt.id),
  );
  assert.equal(reversalDocs.length, 1, "exactly one reversal document");
  assert.equal(reversalDocs[0].grossAmount, -AMOUNT);

  const openRows = (data.receiptAllocations || []).filter(
    (row) => String(row.receiptId) === String(created.receipt.id) && !row.reversedEffectiveDate,
  );
  assert.equal(openRows.length, 0, "original allocation row is closed");
});

check("4) reverse is applied once even when replayed with the same operationId", () => {
  const opId = `bank-receipt:reverse:${TX_ID}:${created.receipt.id}`;
  const first = reverseBankTransactionReceipt(TX_ID, { operationId: opId, receiptDate: TODAY }, "tester");
  const replay = reverseBankTransactionReceipt(TX_ID, { operationId: opId, receiptDate: TODAY }, "tester");
  assert.equal(replay.idempotent, true);
  assert.equal(replay.receipt.id, first.receipt.id);

  const data = reload();
  assert.equal(
    (data.receipts || []).filter((row) => String(row.reversalOfReceiptId || "") === String(created.receipt.id))
      .length,
    1,
  );
  assert.equal(saleRow(data, TODAY).balance, AMOUNT, "AR restored once, not twice");
});

check("5) as-of ledger BEFORE the reverse date still shows the allocation", () => {
  const data = reload();
  const historical = saleRow(data, YESTERDAY);
  assert.equal(historical.allocatedAmount, AMOUNT, "history must stay reproducible");
  assert.equal(historical.balance, 0);
  assert.equal(ledger(data, YESTERDAY).closingAr, opening.closingAr - AMOUNT);

  const unifiedHistorical = unifiedSaleRow(data, YESTERDAY);
  assert.equal(unifiedHistorical.receiptAllocatedAmount, AMOUNT);
  assert.equal(unifiedHistorical.outstandingAmount, 0);
  assert.equal(unifiedHistorical.paymentStatus, "paid");

  // Deposit day is also before the reversal date, so it keeps the allocation too.
  assert.equal(saleRow(data, DEPOSIT_DAY).allocatedAmount, AMOUNT);
});

check("6) linkedReceiptId is cleared atomically with the reverse", () => {
  const data = reload();
  const tx = findTx(data, TX_ID);
  assert.equal(tx.linkedReceiptId, undefined);
  assert.equal(tx.receiptLinkSource, undefined);
  assert.equal(tx.receiptLinkedAt, undefined);
  assert.equal(tx.receiptLinkedBy, undefined);
  assert.equal(tx.matchAutoLinked, undefined);
  assert.equal(tx.linkedSalesId, undefined);
  assert.equal(tx.linkedPaymentVoucherId, undefined, "reverse must never create a legacy link");
  assert.equal(getBankDepositLinkKind(tx, { receipts: data.receipts }), "none");
  // No orphan: the deposit is free again for a fresh receipt. It is re-allocated to the
  // OTHER sale on purpose — as-of the deposit day the reversed allocation is still
  // effective on sale 6001, so re-using it would (correctly) exceed the remaining balance.
  const relinked = createBankTransactionReceipt(
    TX_ID,
    {
      operationId: `bank-receipt:manual:${TX_ID}:t2`,
      clientId: CLIENT.id,
      allocations: [{ saleId: OTHER_SALE_ID, amount: AMOUNT }],
    },
    "tester",
  );
  assert.equal(relinked.summary.allocatedAmount, AMOUNT);
  assert.equal(saleRow(reload(), TODAY, OTHER_SALE_ID).balance, 0);
  assert.equal(saleRow(reload(), TODAY, SALE_ID).balance, AMOUNT, "reversed sale stays open");
});

check("7) no legacy paymentVoucher or paymentInputLog was ever written", () => {
  const data = reload();
  assert.equal((data.paymentVouchers || []).length, 0);
  assert.equal((data.paymentInputLogs || []).length, 0);
});

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nGATE A: bank receipt reverse real-allocation tests passed");
