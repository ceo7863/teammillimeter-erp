/**
 * B&B August reallocation fixture tests (throwaway DB only).
 * Run: node --import tsx scripts/test-bnb-august-reallocation.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-bnb-realloc-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.JWT_SECRET = "test-bnb-realloc";

const { initDb, getErpState, saveErpState } = await import("../server/db.mjs");
const { createAndPostReceipt, listReceipts, listReceiptAllocations, proposeFifoAllocations } = await import("../server/receipts.mjs");
const { proposeFifoAllocationsScoped } = await import("../server/canonicalCollection.mjs");
const { planAllocationsForTarget } = await import("../server/allocationTarget.mjs");
const { BNB_TARGET, diagnoseBnbAugustReallocation, runBnbAugustReallocation } = await import("./bnb-august-reallocation-apply.mjs");

initDb();
function money(v) { return Math.round(Number(v) || 0); }
function ymd(v) { return String(v || "").slice(0, 10); }
function isOpen(row) { return row && !row.auditOnly && row.status !== "reversed" && !row.reversedEffectiveDate; }
function reload() { return getErpState().data; }

function buildFixtureSales() {
  const sales = [];
  for (let i = 0; i < 20; i += 1) {
    const month = i < 10 ? "06" : "07";
    const day = String((i % 10) + 1).padStart(2, "0");
    sales.push({ id: 1000 + i, date: "2026-" + month + "-" + day, client: "BnB", clientId: 97, amount: 750000, paid: 0, basePaid: 0, site: "JJ", voucherNo: "JJ-" + i });
  }
  for (let i = 0; i < 10; i += 1) {
    sales.push({ id: 2000 + i, date: "2026-08-" + String(i + 1).padStart(2, "0"), client: "BnB", clientId: 97, amount: 2000000, paid: 0, basePaid: 0, site: "AUG", voucherNo: "AUG-" + i });
  }
  sales.push({ id: 2999, date: "2026-08-15", client: "BnB", clientId: 97, amount: 9999000, paid: 0, basePaid: 0, cancelled: true, status: "cancelled" });
  sales.push({ id: 3001, date: "2026-08-01", client: "Other", clientId: 98, amount: 5000000, paid: 0, basePaid: 0 });
  return sales;
}

{
  const state = getErpState();
  saveErpState({
    ...state.data,
    clients: [{ id: 97, name: "BnB" }, { id: 98, name: "Other" }],
    sales: buildFixtureSales(),
    receipts: [], receiptAllocations: [], arAdjustments: [], paymentVouchers: [],
  }, state.version, "bnb-fixture-seed", { allowReceiptMutation: true });

  const junJulIds = Array.from({ length: 20 }, (_, i) => 1000 + i);
  const created = createAndPostReceipt({
    operationId: "bnb-fixture-create",
    clientId: 97,
    receiptDate: BNB_TARGET.receiptDate,
    grossAmount: BNB_TARGET.grossAmount,
    channel: "cash",
    source: "receivables",
    allocations: junJulIds.map((saleId) => ({ saleId, amount: 750000 })),
  }, "tester");

  const data = reload();
  const receipt = listReceipts(data).find((r) => String(r.id) === String(created.receipt.id));
  assert.ok(receipt);
  const nextReceipt = { ...receipt, id: BNB_TARGET.receiptId, receiptNo: BNB_TARGET.receiptNo };
  const nextReceipts = listReceipts(data).map((row) => String(row.id) === String(receipt.id) ? nextReceipt : row);
  const nextAllocs = listReceiptAllocations(data).map((row) => String(row.receiptId) === String(receipt.id) ? { ...row, receiptId: BNB_TARGET.receiptId } : row);
  const st = getErpState();
  saveErpState({ ...st.data, receipts: nextReceipts, receiptAllocations: nextAllocs }, st.version, "bnb-fixture-id-rewrite", { allowReceiptMutation: true });
}

let passed = 0;

{
  const data = reload();
  const receipt = listReceipts(data).find((r) => r.id === BNB_TARGET.receiptId);
  assert.ok(receipt);
  assert.equal(receipt.receiptNo, BNB_TARGET.receiptNo);
  const open = listReceiptAllocations(data).filter((row) => String(row.receiptId) === BNB_TARGET.receiptId && isOpen(row));
  assert.equal(open.length, 20);
  assert.equal(open.reduce((s, r) => s + money(r.amount), 0), 15000000);
  passed += 1; console.log("PASS: fixture 20 jun-jul allocs");
}

{
  const diagnosis = diagnoseBnbAugustReallocation(reload(), { planAllocationsForTarget, proposeFifoAllocations, proposeFifoAllocationsScoped, listReceipts, listReceiptAllocations });
  assert.equal(diagnosis.ok, true, diagnosis.failures.join("; "));
  assert.equal(diagnosis.afterPreview.outsideAugustCount, 0);
  assert.equal(diagnosis.afterPreview.newAllocationAmount + diagnosis.afterPreview.unappliedAmount, 15000000);
  for (const row of diagnosis.afterPreview.allocations) {
    assert.ok(row.saleDate >= "2026-08-01" && row.saleDate <= "2026-08-31");
  }
  passed += 1; console.log("PASS: PERIOD plan August-only spill 0");
}

{
  const result = await runBnbAugustReallocation({ mode: "apply", confirm: "" });
  assert.equal(result.mutations, 0);
  assert.equal(result.code, "CONFIRM_REQUIRED");
  passed += 1; console.log("PASS: apply abort without confirm");
}

{
  const data = reload();
  const receipts = listReceipts(data).map((row) => String(row.id) === BNB_TARGET.receiptId ? { ...row, grossAmount: 14000000 } : row);
  const diagnosis = diagnoseBnbAugustReallocation({ ...data, receipts }, { planAllocationsForTarget, proposeFifoAllocations, proposeFifoAllocationsScoped, listReceipts, listReceiptAllocations });
  assert.equal(diagnosis.ok, false);
  assert.ok(diagnosis.failures.some((f) => /grossAmount/.test(f)));
  passed += 1; console.log("PASS: abort on bad precondition");
}

{
  const beforeIds = listReceiptAllocations(reload()).filter((row) => String(row.receiptId) === BNB_TARGET.receiptId).map((row) => row.id);
  const result = await runBnbAugustReallocation({ mode: "apply", confirm: BNB_TARGET.confirmToken });
  assert.ok(result.apply?.ok, result.message + " " + JSON.stringify(result.apply));
  assert.equal(result.apply.physicalDeletedAllocationCount, 0);
  assert.equal(result.apply.outsideAugustAllocationCount, 0);
  assert.equal(result.apply.receiptIdentityChanged, false);
  assert.equal(result.apply.newAllocationAmount + result.apply.unappliedAmountAfter, 15000000);
  const data = reload();
  const open = listReceiptAllocations(data).filter((row) => String(row.receiptId) === BNB_TARGET.receiptId && isOpen(row));
  for (const row of open) {
    const sale = data.sales.find((s) => String(s.id) === String(row.saleId));
    const d = ymd(sale?.date);
    assert.ok(d >= "2026-08-01" && d <= "2026-08-31");
  }
  for (const id of beforeIds) {
    assert.ok(listReceiptAllocations(data).some((row) => String(row.id) === String(id)));
  }
  passed += 1; console.log("PASS: apply closes old, August-only, physical delete 0");
}

{
  const again = await runBnbAugustReallocation({ mode: "apply", confirm: BNB_TARGET.confirmToken });
  assert.equal(again.apply?.idempotent, true);
  assert.equal(again.mutations, 0);
  const receipt = listReceipts(reload()).find((r) => r.id === BNB_TARGET.receiptId);
  const events = (receipt.reallocationEvents || []).filter((e) => e.operationId === BNB_TARGET.operationId);
  assert.equal(events.length, 1);
  passed += 1; console.log("PASS: idempotent replay");
}

console.log("\n" + passed + " checks passed");
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
