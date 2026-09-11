/**
 * AP forward-only cutover tests (throwaway DB).
 * Run: node --import tsx scripts/test-ap-forward-cutover.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-ap-forward-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.JWT_SECRET = "test-ap-forward";
process.env.PDF_ARCHIVE_DIR = path.join(tmpDir, "pdf");

const { initDb, getErpState, saveErpState } = await import("../server/db.mjs");
const {
  isWorkDateEligibleForNewPayable,
  filterPayablesByCutover,
  applyApCutoverActivationToMeta,
  computeLegacyApDatasetHash,
  countLegacyApRows,
  previewOpeningBalances,
  previewApCutoverActivation,
  isLegacyApWriterFrozen,
  classifyBankToCashTransfer,
  OPENING_BALANCE_ZERO_START,
} = await import("../server/apLedgerCutover.mjs");
const {
  listContractorPayablesFromSales,
  listNewLedgerPayables,
  createAndPostDisbursement,
  reverseDisbursement,
  proposeDisbursementFifo,
} = await import("../server/disbursements.mjs");
const { handleWheelScrollCapture } = await import("../src/utils/wheelScrollCapture.ts");
const { isDisbursementWriteEnabled } = await import("../src/utils/featureFlags.ts");

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("PASS: " + name); }
  catch (e) { failed += 1; console.error("FAIL: " + name); console.error(e); }
}
async function checkAsync(name, fn) {
  try { await fn(); console.log("PASS: " + name); }
  catch (e) { failed += 1; console.error("FAIL: " + name); console.error(e); }
}

initDb();
{
  const state = getErpState();
  saveErpState({
    ...(state.data || {}),
    clients: [{ id: "c1", name: "ClientA" }],
    sales: [
      { id: "old1", date: "2026-06-01", client: "ClientA", amount: 1000000, workers: [{ name: "WorkerA", lineSpend: 1000000, meal: 50000 }] },
      { id: "new1", date: "2026-09-15", client: "ClientA", amount: 10000000, workers: [{ name: "WorkerA", lineSpend: 10000000 }] },
      { id: "new2", date: "2026-09-20", client: "ClientA", amount: 5000000, workers: [{ name: "WorkerA", payAmount: 5000000, meal: "", expense: null }] },
    ],
    workerMonthlyActualVouchers: [{ id: "m1", workerName: "WorkerA", entries: [{ paidAmount: 100000 }] }],
    workerPayoutVouchers: [{ id: "p1", workerName: "WorkerA", amount: 50000 }],
    bankTransactions: [{ id: "b1", withdrawal: 100000, linkedWorkerMonthlyPaymentVoucherId: "m1" }],
    disbursements: [],
    disbursementAllocations: [],
    bankSyncMeta: {},
  }, state.version, "test", { allowDisbursementMutation: true });
}

const hashBefore = computeLegacyApDatasetHash(getErpState().data);
const countsBefore = countLegacyApRows(getErpState().data);

check("cutover boundary inclusive Seoul date", () => {
  assert.equal(isWorkDateEligibleForNewPayable("2026-09-10", "2026-09-10"), true);
  assert.equal(isWorkDateEligibleForNewPayable("2026-09-09", "2026-09-10"), false);
  assert.equal(isWorkDateEligibleForNewPayable("2026-09-11", "2026-09-10"), true);
});

check("no cutover => new ledger payables empty (no historical leak)", () => {
  const rows = listNewLedgerPayables(getErpState().data);
  assert.equal(rows.length, 0);
});

check("late-entered historical workDate excluded after cutover filter", () => {
  const all = listContractorPayablesFromSales(getErpState().data.sales);
  const filtered = filterPayablesByCutover(all, {}, { cutoverWorkDate: "2026-09-10" });
  assert.ok(filtered.every((row) => row.workDate >= "2026-09-10"));
  assert.ok(!filtered.some((row) => row.workItemId.includes("old1") || row.saleId === "old1"));
});

check("explicit empty meal/expense => 0 (no invent)", () => {
  const rows = listContractorPayablesFromSales(getErpState().data.sales);
  const row = rows.find((r) => r.saleId === "new2");
  assert.equal(row.mealAmount, 0);
  assert.equal(row.expenseAmount, 0);
  assert.equal(row.dueAmount, 5000000);
});

check("write disabled without activation", () => {
  assert.equal(isDisbursementWriteEnabled(), false);
  let blocked = false;
  try {
    createAndPostDisbursement({ operationId: "x", workerName: "WorkerA", grossAmount: 1000, disbursementDate: "2026-09-16", channel: "cash" }, "test");
  } catch (e) {
    blocked = e.code === "AP_LEDGER_WRITE_DISABLED";
  }
  assert.equal(blocked, true);
});

check("bank to cash transfer classification", () => {
  const r = classifyBankToCashTransfer({ description: "현금 인출" });
  assert.equal(r.allowDisbursement, false);
  assert.equal(r.code, "BANK_TO_CASH_TRANSFER");
});

check("opening balance preview", () => {
  const preview = previewOpeningBalances([
    { workerName: "WorkerA", openingAmount: 2000000, effectiveDate: "2026-09-10", operationId: "ob1", approvedBy: "ceo" },
  ]);
  assert.equal(preview.ok, true);
  assert.equal(preview.openingBalances[0].openingAmount, 2000000);
});

check("cutover preview ZERO_START", () => {
  const preview = previewApCutoverActivation({
    apLedgerCutoverWorkDate: "2026-09-10",
    openingBalancePolicy: OPENING_BALANCE_ZERO_START,
    listPayables: () => listContractorPayablesFromSales(getErpState().data.sales),
  }, getErpState().data);
  assert.equal(preview.ok, true);
  assert.ok(preview.plan.eligiblePayableCount >= 1);
  assert.ok(preview.plan.excludedPreCutoverCount >= 1);
});

await checkAsync("activation simulation freezes legacy writers + enables new ledger", async () => {
  const state = getErpState();
  const meta = applyApCutoverActivationToMeta(state.data.bankSyncMeta || {}, {
    apLedgerCutoverWorkDate: "2026-09-10",
    openingBalancePolicy: OPENING_BALANCE_ZERO_START,
    disbursementWriteEnabled: true,
  }, "test-admin");
  saveErpState({ ...state.data, bankSyncMeta: meta }, state.version, "test", { allowDisbursementMutation: true });
  assert.equal(isLegacyApWriterFrozen(getErpState().data), true);

  // legacy write attempt blocked
  const before = getErpState();
  saveErpState({
    ...before.data,
    workerPayoutVouchers: [...(before.data.workerPayoutVouchers || []), { id: "p-new", workerName: "WorkerA", amount: 1 }],
  }, before.version, "attacker");
  const after = getErpState();
  assert.equal((after.data.workerPayoutVouchers || []).length, (before.data.workerPayoutVouchers || []).length);
  assert.equal(computeLegacyApDatasetHash(after.data), hashBefore);

  const payables = listNewLedgerPayables(after.data);
  assert.ok(payables.every((row) => row.workDate >= "2026-09-10"));
  assert.ok(!payables.some((row) => String(row.saleId) === "old1"));

  // partial disbursement ladder
  const d1 = createAndPostDisbursement({
    __testBypassCutover: true,
    operationId: "d1",
    workerName: "WorkerA",
    disbursementDate: "2026-09-16",
    grossAmount: 5000000,
    channel: "bank",
    autoAllocate: true,
  }, "test");
  assert.ok(d1.disbursement);
  createAndPostDisbursement({
    __testBypassCutover: true,
    operationId: "d2",
    workerName: "WorkerA",
    disbursementDate: "2026-09-17",
    grossAmount: 3000000,
    channel: "bank",
  }, "test");
  createAndPostDisbursement({
    __testBypassCutover: true,
    operationId: "d3",
    workerName: "WorkerA",
    disbursementDate: "2026-09-18",
    grossAmount: 2000000,
    channel: "bank",
  }, "test");
  reverseDisbursement(d1.disbursement.id, { operationId: "d1-rev", __testBypassCutover: true }, "test");

  // idempotency conflict
  createAndPostDisbursement({
    __testBypassCutover: true,
    operationId: "idem1",
    workerName: "WorkerA",
    disbursementDate: "2026-09-19",
    grossAmount: 1000,
    channel: "cash",
    allocations: [],
  }, "test");
  let conflict = false;
  try {
    createAndPostDisbursement({
      __testBypassCutover: true,
      operationId: "idem1",
      workerName: "WorkerA",
      disbursementDate: "2026-09-19",
      grossAmount: 2000,
      channel: "cash",
      allocations: [{ workItemId: "x", amount: 1 }],
    }, "test");
  } catch (e) {
    conflict = e.code === "IDEMPOTENCY_CONFLICT" || e.status === 409;
  }
  assert.equal(conflict, true);
});

check("legacy hash/count unchanged baseline fields still match original shape keys", () => {
  const countsAfter = countLegacyApRows(getErpState().data);
  assert.equal(countsAfter.workerMonthlyActualVouchers, countsBefore.workerMonthlyActualVouchers);
  assert.equal(countsAfter.workerPayoutVouchers, countsBefore.workerPayoutVouchers);
  assert.equal(countsAfter.bankWorkerLinks, countsBefore.bankWorkerLinks);
});

check("wheel helper", () => assert.equal(typeof handleWheelScrollCapture, "function"));
check("fifo helper", () => assert.ok(proposeDisbursementFifo));

console.log(failed === 0 ? "\nap forward cutover: ALL PASS" : ("\n" + failed + " failed"));
if (failed) process.exit(1);
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
