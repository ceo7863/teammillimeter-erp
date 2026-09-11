/**
 * Read-only AP parity dry-run: legacy payouts vs canonical payables projection.
 * NEVER mutates production data. NEVER creates opening balances or disbursements.
 *
 * Usage (throwaway or prod read-only):
 *   node --import tsx scripts/ap-parity-dry-run.mjs
 */
import { initDb, getErpState } from "../server/db.mjs";
import {
  buildWorkItemId,
  listContractorPayablesFromSales,
  listDisbursements,
} from "../server/disbursements.mjs";

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function workerKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

initDb();
const state = getErpState();
const data = state.data || {};
const sales = data.sales || [];
const monthly = data.workerMonthlyActualVouchers || [];
const payouts = data.workerPayoutVouchers || [];
const bankTx = data.bankTransactions || [];
const disbursements = listDisbursements(data);
const payables = listContractorPayablesFromSales(sales);

const CLASS = {
  EXACT_PARITY: 0,
  DETERMINISTIC_LEGACY_FIFO: 0,
  UNATTRIBUTED_PAYMENT: 0,
  DUPLICATE_SUSPECTED: 0,
  WORK_ITEM_MISSING: 0,
  WORKER_AMBIGUOUS: 0,
  EXPENSE_SOURCE_MISMATCH: 0,
  DEDUCTION_MISMATCH: 0,
  MANUAL_REVIEW: 0,
};

let legacyPayoutTotal = 0;
let legacyAttributedGuess = 0;
const unattributed = [];
const duplicateSuspects = [];
const workerAmbiguous = [];

for (const voucher of monthly) {
  if (!voucher || voucher.cancelled || voucher.status === "cancelled") continue;
  const entries = Array.isArray(voucher.entries) ? voucher.entries : [];
  for (const entry of entries) {
    const paid = money(entry.paidAmount ?? entry.amount ?? entry.transferAmount);
    if (paid <= 0) continue;
    legacyPayoutTotal += paid;
    const wName = String(entry.workerName || voucher.workerName || "").trim();
    if (!wName) {
      CLASS.UNATTRIBUTED_PAYMENT += 1;
      unattributed.push({ kind: "monthlyEntry", voucherId: voucher.id, paid });
      continue;
    }
    // Legacy monthly entries usually lack stable workItemId — count as unattributable for exact parity.
    if (!entry.workItemId && !entry.saleId) {
      CLASS.WORK_ITEM_MISSING += 1;
      CLASS.DETERMINISTIC_LEGACY_FIFO += 1;
      legacyAttributedGuess += paid;
    } else {
      CLASS.DETERMINISTIC_LEGACY_FIFO += 1;
      legacyAttributedGuess += paid;
    }
  }
}

for (const payout of payouts) {
  if (!payout || payout.cancelled) continue;
  const paid = money(payout.amount ?? payout.finalAmount ?? payout.paidAmount);
  if (paid <= 0) continue;
  legacyPayoutTotal += paid;
  if (!payout.workItemId && !payout.saleId) {
    CLASS.UNATTRIBUTED_PAYMENT += 1;
    unattributed.push({ kind: "payoutHistory", id: payout.id, paid, worker: payout.workerName });
  } else {
    CLASS.DETERMINISTIC_LEGACY_FIFO += 1;
    legacyAttributedGuess += paid;
  }
}

const bankWorkerLinks = bankTx.filter((tx) => tx?.linkedWorkerMonthlyPaymentVoucherId);
const bankLinkTotal = bankWorkerLinks.reduce((sum, tx) => sum + money(tx.withdrawal || tx.amount), 0);

// Duplicate suspicion: same bank tx also has disbursement (should be 0 today)
for (const tx of bankWorkerLinks) {
  const hit = disbursements.find((d) => String(d.bankTransactionId) === String(tx.id) && d.status !== "reversed");
  if (hit) {
    CLASS.DUPLICATE_SUSPECTED += 1;
    duplicateSuspects.push({ bankTransactionId: tx.id, disbursementId: hit.id });
  }
}

const payableTotal = payables.reduce((sum, row) => sum + money(row.dueAmount), 0);
const byWorkerPayable = new Map();
for (const row of payables) {
  const key = workerKey(row.workerName);
  byWorkerPayable.set(key, (byWorkerPayable.get(key) || 0) + money(row.dueAmount));
}

const byWorkerLegacyPaid = new Map();
for (const voucher of monthly) {
  if (!voucher || voucher.cancelled) continue;
  for (const entry of voucher.entries || []) {
    const key = workerKey(entry.workerName || voucher.workerName);
    byWorkerLegacyPaid.set(key, (byWorkerLegacyPaid.get(key) || 0) + money(entry.paidAmount ?? entry.amount));
  }
}
for (const payout of payouts) {
  if (!payout || payout.cancelled) continue;
  const key = workerKey(payout.workerName);
  byWorkerLegacyPaid.set(key, (byWorkerLegacyPaid.get(key) || 0) + money(payout.amount ?? payout.finalAmount));
}

let exactParityWorkers = 0;
let manualReviewWorkers = 0;
let apBalanceDifferenceAmount = 0;
const workerDiffs = [];

const allWorkerKeys = new Set([...byWorkerPayable.keys(), ...byWorkerLegacyPaid.keys()]);
for (const key of allWorkerKeys) {
  if (!key) {
    CLASS.WORKER_AMBIGUOUS += 1;
    workerAmbiguous.push(key);
    continue;
  }
  const due = byWorkerPayable.get(key) || 0;
  const paid = byWorkerLegacyPaid.get(key) || 0;
  const legacyOutstanding = Math.max(0, due - paid);
  // Canonical without legacy attribution would show full due as outstanding.
  const canonicalBlindOutstanding = due;
  const overstatedIfIgnoreLegacy = canonicalBlindOutstanding - legacyOutstanding;
  apBalanceDifferenceAmount += overstatedIfIgnoreLegacy;
  if (overstatedIfIgnoreLegacy === 0 && due === paid) {
    exactParityWorkers += 1;
    CLASS.EXACT_PARITY += 1;
  } else if (Math.abs(overstatedIfIgnoreLegacy) > 0) {
    manualReviewWorkers += 1;
    CLASS.MANUAL_REVIEW += 1;
    workerDiffs.push({
      workerKey: key,
      payableDue: due,
      legacyPaid: paid,
      legacyOutstanding,
      canonicalBlindOutstanding,
      overstatedIfIgnoreLegacy,
    });
  }
}

// Expense source spot-check: meal/expense without scScheduleId
let expenseSourceMismatchCount = 0;
for (const sale of sales) {
  if (!sale?.workers) continue;
  for (const worker of sale.workers) {
    const meal = money(worker.meal);
    const expense = money(worker.expense);
    if ((meal > 0 || expense > 0) && !sale.scScheduleId && !worker.scExpenseSourceId) {
      expenseSourceMismatchCount += 1;
      CLASS.EXPENSE_SOURCE_MISMATCH += 1;
    }
  }
}

const report = {
  version: state.version,
  payablesDerivedCount: payables.length,
  payableDueTotal: payableTotal,
  legacyMonthlyVoucherCount: monthly.length,
  legacyPayoutHistoryCount: payouts.length,
  legacyPayoutAmountTotal: legacyPayoutTotal,
  legacyBankWorkerLinkCount: bankWorkerLinks.length,
  legacyBankWorkerLinkAmount: bankLinkTotal,
  disbursementCount: disbursements.length,
  exactParityWorkerCount: exactParityWorkers,
  deterministicLegacyFifoCount: CLASS.DETERMINISTIC_LEGACY_FIFO,
  manualReviewWorkerCount: manualReviewWorkers,
  unattributedPaymentCount: CLASS.UNATTRIBUTED_PAYMENT,
  duplicateSuspectedCount: CLASS.DUPLICATE_SUSPECTED,
  workItemMissingCount: CLASS.WORK_ITEM_MISSING,
  workerAmbiguousCount: CLASS.WORKER_AMBIGUOUS,
  expenseSourceMismatchCount,
  apBalanceDifferenceAmount,
  classification: CLASS,
  sampleWorkerDiffs: workerDiffs.slice(0, 20),
  sampleUnattributed: unattributed.slice(0, 20),
  historicalMutationCount: 0,
  legacyMutationCount: 0,
  apCutoverReadiness:
    CLASS.EXACT_PARITY > 0 &&
    CLASS.MANUAL_REVIEW === 0 &&
    CLASS.UNATTRIBUTED_PAYMENT === 0 &&
    CLASS.DUPLICATE_SUSPECTED === 0
      ? "READY_FOR_AP_CUTOVER_APPROVAL"
      : "NOT_READY",
  note: "Read-only. balanceMismatch is measured as overstated payable if legacy payouts are ignored. No apply/backfill.",
};

console.log(JSON.stringify(report, null, 2));
