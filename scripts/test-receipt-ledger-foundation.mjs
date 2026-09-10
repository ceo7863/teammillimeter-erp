/**
 * Unified AR receipt ledger — Phase 1 foundation tests.
 * Run: npx tsx scripts/test-receipt-ledger-foundation.mjs
 * or: node scripts/test-receipt-ledger-foundation.mjs (server-only assertions if tsx missing)
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-receipt-ledger-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = "test-receipt-ledger";

const { initDb, getErpState, saveErpState } = await import("../server/db.mjs");
const {
  createAndPostReceipt,
  reverseReceipt,
  deleteReceiptForbidden,
  proposeFifoAllocations,
} = await import("../server/receipts.mjs");
const { buildClientArSubledger } = await import("../server/receiptArSubledger.mjs");
const { buildEffectivePaymentVouchers } = await import("../server/receiptProjection.mjs");
const { diagnoseLegacyPaymentMigration } = await import("./receipt-migration-dry-run.mjs");
const { mergeReceiptsForSave, mergeReceiptAllocationsForSave } = await import("../server/erpSaveMerge.mjs");

function projectReceiptsToLegacyPaymentVouchers(receipts = [], allocations = [], clients = []) {
  const clientsById = new Map(clients.map((row) => [String(row.id), row]));
  const vouchers = [];
  for (const receipt of receipts) {
    if (!receipt || receipt.status !== "posted" || receipt.reversalOfReceiptId) continue;
    const clientName = String(receipt.clientName || clientsById.get(String(receipt.clientId))?.name || "");
    const rows = allocations.filter((row) => String(row.receiptId) === String(receipt.id) && row.status === "posted");
    for (const allocation of rows) {
      const amount = Number(allocation.amount) || 0;
      vouchers.push({
        id: `receipt-alloc:${allocation.id}`,
        salesId: allocation.saleId,
        client: clientName,
        amount,
        finalAmount: amount,
      });
    }
  }
  return vouchers;
}

function applyPaymentVouchers(sales, vouchers) {
  const copied = sales.map((row) => ({ ...row, basePaid: row.basePaid ?? row.paid ?? 0, voucherPaid: 0 }));
  for (const voucher of vouchers) {
    let remaining = Number(voucher.finalAmount ?? voucher.amount) || 0;
    if (voucher.salesId == null) continue;
    const target = copied.find((row) => String(row.id) === String(voucher.salesId));
    if (!target) continue;
    const unpaid = Math.max((target.amount || 0) - (target.basePaid || 0) - (target.voucherPaid || 0), 0);
    const applied = Math.min(unpaid, remaining);
    target.voucherPaid += applied;
  }
  return {
    sales: copied.map((row) => ({
      ...row,
      paid: Math.min((row.basePaid || 0) + (row.voucherPaid || 0), row.amount || 0),
    })),
  };
}

initDb();

const seed = {
  clients: [
    { id: 101, name: "알파건설" },
    { id: 102, name: "베타인테리어" },
    { id: 103, name: "알파건설" },
  ],
  sales: [
    { id: 1, date: "2026-08-01", client: "알파건설", clientId: 101, amount: 1_000_000, paid: 0, basePaid: 0, site: "A현장" },
    { id: 2, date: "2026-08-05", client: "알파건설", clientId: 101, amount: 500_000, paid: 0, basePaid: 0, site: "B현장" },
    { id: 3, date: "2026-08-10", client: "베타인테리어", clientId: 102, amount: 800_000, paid: 0, basePaid: 0, site: "C현장" },
  ],
  paymentVouchers: [],
  paymentInputLogs: [],
  receipts: [],
  receiptAllocations: [],
  bankTransactions: [],
};

const state = getErpState();
saveErpState({ ...state.data, ...seed }, state.version, "test-seed", { allowReceiptMutation: true });

function reload() {
  return getErpState(["receipts", "sales", "clients", "bankTransactions"]).data;
}

const op = "test-op-calendar-1";
const first = createAndPostReceipt(
  {
    operationId: op,
    clientId: 101,
    receiptDate: "2026-09-01",
    grossAmount: 1_200_000,
    channel: "other",
    source: "calendar",
    allocations: [
      { saleId: 1, amount: 1_000_000 },
      { saleId: 2, amount: 200_000 },
    ],
  },
  "tester",
);
assert.equal(first.idempotent, false);
assert.equal(first.summary.allocatedAmount, 1_200_000);

const second = createAndPostReceipt(
  {
    operationId: op,
    clientId: 101,
    receiptDate: "2026-09-01",
    grossAmount: 1_200_000,
    channel: "other",
    source: "calendar",
    allocations: [
      { saleId: 1, amount: 1_000_000 },
      { saleId: 2, amount: 200_000 },
    ],
  },
  "tester",
);
assert.equal(second.idempotent, true);
assert.equal(second.receipt.id, first.receipt.id);
assert.equal(reload().receipts.filter((r) => r.operationId === op).length, 1);

assert.throws(
  () =>
    createAndPostReceipt(
      {
        operationId: "over-alloc",
        clientId: 101,
        grossAmount: 100,
        channel: "cash",
        source: "receivables",
        allocations: [{ saleId: 2, amount: 500 }],
      },
      "tester",
    ),
  /배분 합계|미수잔액/,
);

const cash = createAndPostReceipt(
  {
    operationId: "cash-partial",
    clientId: 102,
    receiptDate: "2026-09-02",
    grossAmount: 1_000_000,
    channel: "cash",
    source: "receivables",
    allocations: [{ saleId: 3, amount: 800_000 }],
  },
  "tester",
);
assert.equal(cash.summary.unallocatedAmount, 200_000);

createAndPostReceipt(
  {
    operationId: "bank-1",
    clientId: 101,
    grossAmount: 50_000,
    channel: "bank",
    source: "bank_manual",
    bankTransactionId: "btx-1",
    allocations: [{ saleId: 2, amount: 50_000 }],
  },
  "tester",
);
assert.throws(
  () =>
    createAndPostReceipt(
      {
        operationId: "bank-2",
        clientId: 101,
        grossAmount: 10_000,
        channel: "bank",
        source: "bank_manual",
        bankTransactionId: "btx-1",
        allocations: [],
      },
      "tester",
    ),
  /통장거래/,
);

assert.throws(() => deleteReceiptForbidden(), /삭제/);

const reversed = reverseReceipt(cash.receipt.id, { operationId: "rev-cash" }, "tester");
assert.equal(reversed.original.status, "reversed");
const afterReverse = buildClientArSubledger(reload(), {
  clientId: 102,
  startDate: "2026-08-01",
  endDate: "2026-09-30",
});
assert.equal(afterReverse.periodReceipts, 0);

assert.throws(
  () =>
    createAndPostReceipt(
      {
        operationId: "ambiguous",
        clientName: "알파건설",
        grossAmount: 1,
        channel: "cash",
        source: "receivables",
        allocations: [],
      },
      "tester",
    ),
  /동명/,
);

const data = reload();
const projected = projectReceiptsToLegacyPaymentVouchers(data.receipts, data.receiptAllocations, data.clients);
const applied = applyPaymentVouchers(data.sales, projected);
assert.equal(applied.sales.find((s) => String(s.id) === "1").paid, 1_000_000);
assert.equal(applied.sales.find((s) => String(s.id) === "2").paid, 250_000);
assert.ok(buildEffectivePaymentVouchers(data).length >= projected.length);
assert.ok(mergeReceiptsForSave(data.receipts, []).some((r) => r.id === first.receipt.id));
assert.ok(
  mergeReceiptAllocationsForSave(data.receiptAllocations, [], data.receipts).some(
    (a) => String(a.receiptId) === String(first.receipt.id),
  ),
);
assert.ok(proposeFifoAllocations(data.sales, "101", 300_000, data.receiptAllocations).allocations.length >= 0);

const dry = diagnoseLegacyPaymentMigration({
  ...data,
  paymentVouchers: [{ id: 9001, salesId: 1, client: "알파건설", date: "2026-07-01", amount: 100_000, finalAmount: 100_000 }],
});
assert.equal(dry.apply, false);

const stmt = createAndPostReceipt(
  {
    operationId: "stmt-1",
    clientId: 101,
    grossAmount: 100_000,
    channel: "bank",
    source: "sent_statement",
    sentStatementId: "pdf-1",
    allocations: [{ saleId: 2, amount: 100_000 }],
  },
  "tester",
);
assert.equal(stmt.summary.allocatedAmount, stmt.receipt.grossAmount);

console.log("receipt ledger foundation tests passed");
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
