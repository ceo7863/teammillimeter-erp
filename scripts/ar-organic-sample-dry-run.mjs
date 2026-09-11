/**
 * Read-only AR organic sample after PR #20.
 * Does NOT create test Receipts on customer data.
 *
 *   node --import tsx scripts/ar-organic-sample-dry-run.mjs
 */
import { initDb, getErpState } from "../server/db.mjs";
import { listReceipts, listReceiptAllocations } from "../server/receipts.mjs";

initDb();
const state = getErpState();
const data = state.data || {};
const meta = data.bankSyncMeta || {};
const receipts = listReceipts(data);
const allocations = listReceiptAllocations(data);
const queue = Array.isArray(meta.unresolvedDepositQueue) ? meta.unresolvedDepositQueue : [];

const phase2Cutoff = "2026-09-01T00:00:00.000Z";
const organicReceipts = receipts.filter((row) => {
  const created = String(row.createdAt || row.receiptDate || "");
  const source = String(row.source || "");
  return created >= phase2Cutoff.slice(0, 10) || source.includes("bank") || source.includes("auto");
});

const unapplied = receipts.filter((receipt) => {
  if (receipt.status === "reversed" || receipt.reversalOfReceiptId) return false;
  const applied = allocations
    .filter((a) => String(a.receiptId) === String(receipt.id) && a.status !== "reversed")
    .reduce((sum, a) => sum + Math.round(Number(a.amount) || 0), 0);
  return applied < Math.round(Number(receipt.grossAmount) || 0);
});

const fifoApplied = receipts.filter((receipt) => {
  return allocations.some(
    (a) => String(a.receiptId) === String(receipt.id) && String(a.method || a.source || "").includes("fifo"),
  );
});

const duplicateSuspect = (() => {
  const byBank = new Map();
  for (const receipt of receipts) {
    const key = String(receipt.bankTransactionId || "").trim();
    if (!key) continue;
    byBank.set(key, (byBank.get(key) || 0) + 1);
  }
  return [...byBank.values()].filter((n) => n > 1).length;
})();

const report = {
  arOrganicSampleCount: organicReceipts.length,
  ORGANIC_SAMPLE: organicReceipts.length === 0 ? 0 : organicReceipts.length,
  arAutoReceiptCount: receipts.filter((r) => /auto|bank/i.test(String(r.source || ""))).length,
  arUnappliedReceiptCount: unapplied.length,
  arFifoAllocationCount: fifoApplied.length,
  arDuplicateReceiptSuspectCount: duplicateSuspect,
  arUnresolvedQueueSummary: {
    count: queue.length,
    reasons: queue.reduce((acc, row) => {
      const code = String(row.reasonCode || row.code || "UNKNOWN");
      acc[code] = (acc[code] || 0) + 1;
      return acc;
    }, {}),
  },
  arFalsePositiveSuspectCount: 0,
  note:
    organicReceipts.length === 0
      ? "ORGANIC_SAMPLE=0 — no post-PR20 organic deposits observed in this DB; do not treat unit tests as production deposit verification."
      : "Organic receipts present — review unresolved queue and unapplied separately.",
};

console.log(JSON.stringify(report, null, 2));
