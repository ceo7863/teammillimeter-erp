/**
 * Client collection journal tests.
 * Run: node --import tsx scripts/test-client-collection-journal.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-collection-journal-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.JWT_SECRET = "test-collection-journal";

const { initDb, getErpState, saveErpState } = await import("../server/db.mjs");
const { createAndPostReceipt, replaceReceiptAllocations, reverseReceipt, listReceipts } = await import("../server/receipts.mjs");
const { createArAdjustment, reverseArAdjustment } = await import("../server/arAdjustments.mjs");
const { buildClientCollectionJournal } = await import("../server/clientCollectionJournal.mjs");

initDb();
function reload() { return getErpState().data; }
function moneyish(v) { return Math.round(Number(v) || 0); }

const state0 = getErpState();
saveErpState({
  ...state0.data,
  clients: [{ id: 201, name: "CJ" }, { id: 202, name: "OTHER" }],
  sales: [
    { id: 1, date: "2026-08-01", client: "CJ", clientId: 201, amount: 1000000, paid: 0, basePaid: 0, site: "A", voucherNo: "S-1", createdAt: "2026-08-01T01:00:00.000Z" },
    { id: 2, date: "2026-08-10", client: "CJ", clientId: 201, amount: 500000, paid: 0, basePaid: 0, site: "B", voucherNo: "S-2", createdAt: "2026-08-10T01:00:00.000Z" },
    { id: 3, date: "2026-08-05", client: "OTHER", clientId: 202, amount: 900000, paid: 0, basePaid: 0, site: "X", voucherNo: "S-X" },
  ],
  receipts: [], receiptAllocations: [], arAdjustments: [], arAdjustmentEvents: [], paymentVouchers: [],
}, state0.version, "test-seed", { allowReceiptMutation: true, allowArAdjustmentMutation: true });

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log("PASS:", name); }
  catch (error) { console.error("FAIL:", name); console.error(error); process.exitCode = 1; }
}

check("sales + receipt cash identity", () => {
  const created = createAndPostReceipt({ operationId: "cj-receipt-1", clientId: 201, receiptDate: "2026-09-01", grossAmount: 800000, channel: "bank", source: "receivables", allocations: [{ saleId: 1, amount: 800000 }] }, "tester");
  assert.equal(created.idempotent, false);
  const journal = buildClientCollectionJournal(reload(), 201, { start: "2026-08-01", end: "2026-09-30" });
  assert.equal(journal.entries.filter((e) => e.type === "SALE").length, 2);
  assert.equal(journal.entries.filter((e) => e.type === "RECEIPT_BANK").length, 1);
  assert.equal(journal.summary.cumulativeReceiptsGross, 800000);
  assert.equal(journal.summary.cumulativeReceiptsGross, journal.summary.allocatedFromReceipts + journal.summary.unappliedPrepaid);
});

check("prepaid separation", () => {
  createAndPostReceipt({ operationId: "cj-receipt-prepaid", clientId: 201, receiptDate: "2026-09-05", grossAmount: 300000, channel: "cash", source: "receivables", allocations: [], autoAllocate: false }, "tester");
  const journal = buildClientCollectionJournal(reload(), 201, { start: "2026-08-01", end: "2026-09-30" });
  assert.ok(journal.summary.unappliedPrepaid >= 300000);
  assert.ok(journal.entries.some((e) => e.type === "RECEIPT_CASH" && e.actualReceipt === 300000));
});

check("adjustment is not cash", () => {
  const before = buildClientCollectionJournal(reload(), 201, { start: "2026-08-01", end: "2026-09-30" });
  createArAdjustment({ operationId: "cj-adj-credit-1", clientId: 201, effectiveDate: "2026-09-08", adjustmentType: "CREDIT_AR_ADJUSTMENT", amount: 100000, memo: "adj", targets: [{ saleId: 2, amount: 100000 }] }, "tester");
  const journal = buildClientCollectionJournal(reload(), 201, { start: "2026-08-01", end: "2026-09-30" });
  assert.equal(journal.summary.cumulativeReceiptsGross, before.summary.cumulativeReceiptsGross);
  assert.ok(journal.summary.creditAdjustments >= 100000);
  assert.ok(journal.entries.some((e) => e.type === "AR_CREDIT_ADJUSTMENT" && !e.actualReceipt));
});

check("reallocation no duplicate cash row", () => {
  const data = reload();
  const receipt = listReceipts(data).find((r) => moneyish(r.grossAmount) === 800000);
  assert.ok(receipt);
  const before = buildClientCollectionJournal(data, 201, { start: "2026-08-01", end: "2026-09-30" });
  const cashBefore = before.entries.filter((e) => String(e.type).startsWith("RECEIPT_")).length;
  replaceReceiptAllocations(receipt.id, { operationId: "cj-realloc-1", effectiveDate: "2026-09-01", allocations: [{ saleId: 1, amount: 500000 }, { saleId: 2, amount: 300000 }] }, "tester");
  const after = buildClientCollectionJournal(reload(), 201, { start: "2026-08-01", end: "2026-09-30" });
  assert.equal(after.entries.filter((e) => String(e.type).startsWith("RECEIPT_")).length, cashBefore);
  assert.equal(after.summary.cumulativeReceiptsGross, before.summary.cumulativeReceiptsGross);
});

check("reversals", () => {
  const prepaidReceipt = listReceipts(reload()).find((r) => moneyish(r.grossAmount) === 300000);
  assert.ok(prepaidReceipt);
  reverseReceipt(prepaidReceipt.id, { operationId: "cj-rev-receipt", reversalEffectiveDate: "2026-09-10" }, "tester");
  const adj = (reload().arAdjustments || []).find((row) => row.operationId === "cj-adj-credit-1");
  assert.ok(adj);
  reverseArAdjustment(adj.id, { operationId: "cj-rev-adj", reversalEffectiveDate: "2026-09-11" }, "tester");
  const journal = buildClientCollectionJournal(reload(), 201, { start: "2026-08-01", end: "2026-09-30" });
  assert.ok(journal.entries.some((e) => e.type === "RECEIPT_REVERSAL"));
  assert.ok(journal.entries.some((e) => e.type === "ADJUSTMENT_REVERSAL"));
});

check("filters + stable sort + monthly", () => {
  const receiptsOnly = buildClientCollectionJournal(reload(), 201, { start: "2026-08-01", end: "2026-09-30", filter: "receipts" });
  assert.ok(receiptsOnly.entries.every((e) => String(e.type).startsWith("RECEIPT_")));
  const a = buildClientCollectionJournal(reload(), 201, { start: "2026-08-01", end: "2026-09-30" });
  const b = buildClientCollectionJournal(reload(), 201, { start: "2026-08-01", end: "2026-09-30" });
  assert.deepEqual(a.entries.map((e) => e.id), b.entries.map((e) => e.id));
  assert.ok(a.monthlySummaries.length >= 1);
});

console.log("\n" + passed + " checks passed");
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
