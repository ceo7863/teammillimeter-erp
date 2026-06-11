import {
  clearBankTransactionClientLabel,
  mergeRemoteBankTransactionRow,
  type BankTransaction,
} from "./bankTransactions";
import {
  compareWorkerFolderRows,
  compareWorkerMastersDefault,
  filterActiveWorkers,
  findWorkerMasterByListName,
  isWorkerActive,
  normalizeWorkerCategory,
  resolveWorkerCategoryFromList,
  resolveWorkerListName,
  WORKER_CATEGORY_OUTSOURCE,
  WORKER_CATEGORY_TEAM,
  normalizeWorkerName,
  type WorkerCategory,
  type WorkerMasterLike,
  type WorkerPaymentDetailRow,
} from "./workerPayments";
import {
  buildWorkerMonthlyWorkerRows,
  buildWorkerMonthlyWorkerRowsForRange,
  calculateWorkerPaymentVat,
  formatMonthLabel,
  makeWorkerMonthKey,
  upsertWorkerPaymentRecord,
  WORKER_PAYMENT_VAT_RATE,
  type WorkerMonthlyPaymentRecord,
} from "./workerMonthlyPayments";
import {
  buildEGradePayPeriods,
  dateInInclusiveRange,
  isEGradePayPeriodKey,
  isWorkerEGrade,
  resolveLatestDateFromRows,
  resolveWorkerEGradePayProfiles,
  type WorkerEGradePayProfile,
} from "./workerEGradePayPeriods";
import { DEFAULT_WORKER_AI_RULES, resolveEffectiveProbationPay, resolveEffectiveProbationPayWithVat, resolveWorkerProbationExpectedAmount, type WorkerAiRules } from "./workerAiRules";

const WORKER_PAYMENT_AMOUNT_TOLERANCE = 10;
import {
  makeWorkerPayoutVoucherId,
  normalizeWorkerPayoutMethod,
  resolveWorkerNameFromBankTransaction,
  type WorkerPayoutMethod,
  type WorkerPayoutVoucher,
} from "./workerPayoutLedger";

export type WorkerMonthlyVoucherSettlement = {
  paidTotal: number;
  netPaid: number;
  vatPaid: number;
  manualNetPaid: number;
  effectiveExpectedFinal: number;
  effectiveVatAmount: number;
  balance: number;
};
import type { BankTransactionFolder } from "./bankTransactionFolders";

export type WorkerMonthlyPaymentEntry =
  | {
      kind: "bank";
      id: string;
      bankTransactionId: string;
      amount: number;
      date: string;
    }
  | {
      kind: "manual";
      id: string;
      method: WorkerPayoutMethod;
      amount: number;
      date: string;
      memo?: string;
      workerPayoutVoucherId?: string;
    };

export type WorkerMonthlyAllocation = {
  monthKey: string;
  amount: number;
};

export type WorkerMonthlyActualVoucher = {
  id: string;
  worker: string;
  monthKey: string;
  expectedAmount: number;
  payWithVat?: boolean;
  expectedFinalAmount: number;
  entries: WorkerMonthlyPaymentEntry[];
  allocations: WorkerMonthlyAllocation[];
  paidAmount: number;
  memo?: string;
  createdAt: string;
  createdBy?: string;
};

export type WorkerMonthlyObligation = {
  worker: string;
  monthKey: string;
  key: string;
  expectedAmount: number;
  payWithVat: boolean;
  expectedFinalAmount: number;
  paid: number;
  balance: number;
  voucher: WorkerMonthlyActualVoucher | null;
  periodStart?: string;
  periodEnd?: string;
  paymentDate?: string;
  isProbation?: boolean;
  periodLabel?: string;
  isHistorical?: boolean;
  periodBill?: number;
  periodMargin?: number;
};

export type WorkerMonthlyVoucherStatus = "unpaid" | "partial" | "paid" | "overpaid";

export type WorkerPayWithVatLearnRule = {
  worker: string;
  payWithVat: boolean;
  learnedAt?: string;
};

export type WorkerPaymentBreakdown = {
  includesVat: boolean;
  netAmount: number;
  vatAmount: number;
  total: number;
};

export type WorkerMonthlyWorkerSummary = {
  worker: string;
  category: WorkerCategory;
  isActive: boolean;
  expectedTotal: number;
  paidTotal: number;
  balanceTotal: number;
  unpaidMonthCount: number;
  obligations: WorkerMonthlyObligation[];
};

function amountsClose(left: number, right: number, tolerance = WORKER_PAYMENT_AMOUNT_TOLERANCE) {
  return Math.abs(Math.round(left) - Math.round(right)) <= tolerance;
}

/** 부분 지급액도 실지급+부가세(10%) 구조면 분리 (예: 440만 → 400만+40만) */
export function detectPartialVatInclusiveBreakdown(amount: number): WorkerPaymentBreakdown | null {
  const total = Math.round(Number(amount) || 0);
  if (total <= 0) return null;

  const impliedNet = Math.round(total / (1 + WORKER_PAYMENT_VAT_RATE));
  if (impliedNet <= 0) return null;

  const withVat = calculateWorkerPaymentVat(impliedNet, true);
  if (!amountsClose(withVat.finalPayAmount, total)) return null;

  return {
    includesVat: true,
    netAmount: impliedNet,
    vatAmount: total - impliedNet,
    total,
  };
}

export function detectWorkerPaymentBreakdown(amount: number, expectedNetPay: number): WorkerPaymentBreakdown {
  const total = Math.round(Number(amount) || 0);
  const netAmount = Math.round(Number(expectedNetPay) || 0);
  const withVat = calculateWorkerPaymentVat(netAmount, true);
  const withoutVat = calculateWorkerPaymentVat(netAmount, false);

  if (netAmount > 0 && amountsClose(total, withVat.finalPayAmount)) {
    return { includesVat: true, netAmount, vatAmount: withVat.vatAmount, total: withVat.finalPayAmount };
  }
  if (amountsClose(total, withoutVat.finalPayAmount)) {
    return { includesVat: false, netAmount, vatAmount: 0, total: withoutVat.finalPayAmount };
  }

  return { includesVat: false, netAmount, vatAmount: 0, total };
}

export function inferPayWithVatFromAmount(amount: number, expectedNetPay: number) {
  return detectWorkerPaymentBreakdown(amount, expectedNetPay).includesVat;
}

/** 개인 입금·현금 지급은 실지급(순액)만 차감하고 부가세 의무에는 포함하지 않음 */
export function isManualNetOnlyPayoutMethod(method: WorkerPayoutMethod) {
  return method === "personal" || method === "cash";
}

export function normalizeWorkerPayWithVatLearnRule(raw: unknown): WorkerPayWithVatLearnRule | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<WorkerPayWithVatLearnRule>;
  const worker = String(row.worker || "").trim();
  if (!worker) return null;
  return {
    worker,
    payWithVat: Boolean(row.payWithVat),
    learnedAt: row.learnedAt ? String(row.learnedAt) : undefined,
  };
}

export function normalizeWorkerPayWithVatLearnRules(rows: unknown): WorkerPayWithVatLearnRule[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeWorkerPayWithVatLearnRule).filter((row): row is WorkerPayWithVatLearnRule => Boolean(row));
}

export function upsertWorkerPayWithVatLearnRule(
  rules: WorkerPayWithVatLearnRule[],
  worker: string,
  payWithVat: boolean,
): WorkerPayWithVatLearnRule[] {
  const name = String(worker || "").trim();
  if (!name) return rules;
  const entry: WorkerPayWithVatLearnRule = {
    worker: name,
    payWithVat,
    learnedAt: new Date().toISOString(),
  };
  const existing = rules.find((row) => row.worker === name);
  if (existing) {
    return rules.map((row) => (row.worker === name ? { ...row, ...entry } : row));
  }
  return [...rules, entry];
}

function voucherHasNetOnlyManualEntries(
  voucher: Pick<WorkerMonthlyActualVoucher, "entries"> | null | undefined,
) {
  return Boolean(
    voucher?.entries.some(
      (entry) => entry.kind === "manual" && isManualNetOnlyPayoutMethod(entry.method),
    ),
  );
}

function voucherHasBankEntries(voucher: Pick<WorkerMonthlyActualVoucher, "entries"> | null | undefined) {
  return Boolean(voucher?.entries.some((entry) => entry.kind === "bank"));
}

function voucherIsNetOnlyManualPayments(
  voucher: Pick<WorkerMonthlyActualVoucher, "entries"> | null | undefined,
) {
  if (!voucher?.entries.length) return false;
  return voucher.entries.every(
    (entry) => entry.kind === "manual" && isManualNetOnlyPayoutMethod(entry.method),
  );
}

export function breakdownWorkerPaymentEntry(
  entry: WorkerMonthlyPaymentEntry,
  expectedNet: number,
): WorkerPaymentBreakdown {
  const amount = Math.round(entry.amount || 0);
  if (entry.kind === "manual" && isManualNetOnlyPayoutMethod(entry.method)) {
    return { includesVat: false, netAmount: amount, vatAmount: 0, total: amount };
  }
  if (entry.kind === "bank") {
    return detectPartialVatInclusiveBreakdown(amount) || detectWorkerPaymentBreakdown(amount, expectedNet);
  }
  return detectPartialVatInclusiveBreakdown(amount) || detectWorkerPaymentBreakdown(amount, expectedNet);
}

function inferPayWithVatFromVoucherEntries(
  voucher: Pick<WorkerMonthlyActualVoucher, "entries" | "expectedAmount"> | null | undefined,
) {
  if (!voucher?.entries.length) return false;
  if (voucherHasNetOnlyManualEntries(voucher) && voucherHasBankEntries(voucher)) return true;

  const expectedNet = Math.round(voucher.expectedAmount || 0);
  return voucher.entries.some((entry) => {
    if (entry.kind === "manual" && isManualNetOnlyPayoutMethod(entry.method)) return false;
    return breakdownWorkerPaymentEntry(entry, expectedNet).includesVat;
  });
}

export function resolveWorkerPayWithVat(
  worker: string,
  monthKey: string,
  records: WorkerMonthlyPaymentRecord[] = [],
  learnRules: WorkerPayWithVatLearnRule[] = [],
  voucher?: WorkerMonthlyActualVoucher | null,
  options?: { defaultPayWithVat?: boolean },
) {
  if (voucherIsNetOnlyManualPayments(voucher)) return false;
  if (voucher?.payWithVat) return true;
  if (inferPayWithVatFromVoucherEntries(voucher)) return true;
  const record = records.find((row) => row.key === makeWorkerMonthKey(worker, monthKey));
  if (record?.payWithVat) return true;
  const learnRule = learnRules.find((row) => row.worker === String(worker || "").trim());
  if (learnRule?.payWithVat) return true;
  return Boolean(options?.defaultPayWithVat);
}

export function buildWorkerMonthlyWorkerSummaries(
  obligations: WorkerMonthlyObligation[] = [],
  workers: WorkerMasterLike[] = [],
) {
  const byWorker = new Map<string, WorkerMonthlyObligation[]>();
  for (const obligation of obligations) {
    const workerName = resolveWorkerListName(workers, obligation.worker);
    if (!workerName) continue;
    const list = byWorker.get(workerName) || [];
    list.push({ ...obligation, worker: workerName });
    byWorker.set(workerName, list);
  }

  const summaries: WorkerMonthlyWorkerSummary[] = [];

  for (const worker of workers) {
    if (!isWorkerActive(worker)) continue;
    const workerName = normalizeWorkerName(worker.name);
    if (!workerName) continue;
    summaries.push(buildWorkerMonthlyWorkerSummary(workers, workerName, worker, byWorker.get(workerName) || []));
  }

  return summaries.sort(compareWorkerFolderRows);
}

function buildWorkerMonthlyWorkerSummary(
  workers: WorkerMasterLike[],
  workerName: string,
  master: WorkerMasterLike | undefined,
  rows: WorkerMonthlyObligation[],
): WorkerMonthlyWorkerSummary {
  const sorted = [...rows].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  return {
    worker: workerName,
    category: resolveWorkerCategoryFromList(workers, workerName, master),
    isActive: master?.isActive !== false,
    expectedTotal: sorted.reduce((sum, row) => sum + row.expectedFinalAmount, 0),
    paidTotal: sorted.reduce((sum, row) => sum + row.paid, 0),
    balanceTotal: sorted.reduce((sum, row) => sum + row.balance, 0),
    unpaidMonthCount: sorted.filter((row) => row.balance > 0).length,
    obligations: sorted,
  };
}

function makeEntryId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `wm-entry-${crypto.randomUUID()}`;
  return `wm-entry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function makeWorkerMonthlyActualVoucherId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `worker-monthly-${crypto.randomUUID()}`;
  return `worker-monthly-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeEntry(raw: unknown): WorkerMonthlyPaymentEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const kind = row.kind === "manual" ? "manual" : row.kind === "bank" ? "bank" : null;
  const amount = Math.round(Number(row.amount) || 0);
  const date = String(row.date || "").slice(0, 10);
  if (!date || amount <= 0) return null;

  if (kind === "bank") {
    const bankTransactionId = String(row.bankTransactionId || "").trim();
    if (!bankTransactionId) return null;
    return {
      kind: "bank",
      id: String(row.id || makeEntryId()),
      bankTransactionId,
      amount,
      date,
    };
  }

  if (kind === "manual") {
    const workerPayoutVoucherId = String(row.workerPayoutVoucherId || "").trim();
    return {
      kind: "manual",
      id: String(row.id || makeEntryId()),
      method: normalizeWorkerPayoutMethod(row.method),
      amount,
      date,
      memo: row.memo ? String(row.memo) : undefined,
      ...(workerPayoutVoucherId ? { workerPayoutVoucherId } : {}),
    };
  }

  return null;
}

function normalizeAllocation(raw: unknown): WorkerMonthlyAllocation | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<WorkerMonthlyAllocation>;
  const monthKey = String(row.monthKey || "").trim();
  const amount = Math.round(Number(row.amount) || 0);
  if (!/^\d{4}-\d{2}$/.test(monthKey) || amount <= 0) return null;
  return { monthKey, amount };
}

export function normalizeWorkerMonthlyActualVoucher(raw: unknown): WorkerMonthlyActualVoucher | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<WorkerMonthlyActualVoucher>;
  const worker = String(row.worker || "").trim();
  const monthKey = String(row.monthKey || "").trim();
  if (!worker || !/^\d{4}-\d{2}$/.test(monthKey)) return null;

  const expectedAmount = Math.round(Number(row.expectedAmount) || 0);
  const payWithVat = Boolean(row.payWithVat);
  const expectedFinalAmount =
    Math.round(Number(row.expectedFinalAmount) || 0) ||
    calculateWorkerPaymentVat(expectedAmount, payWithVat).finalPayAmount;
  const entries = (Array.isArray(row.entries) ? row.entries : [])
    .map(normalizeEntry)
    .filter((entry): entry is WorkerMonthlyPaymentEntry => Boolean(entry));
  const allocations = (Array.isArray(row.allocations) ? row.allocations : [])
    .map(normalizeAllocation)
    .filter((item): item is WorkerMonthlyAllocation => Boolean(item));
  const paidAmount = Math.round(Number(row.paidAmount) || 0) || sumVoucherPaidAmount({ entries, allocations, monthKey });

  return {
    id: String(row.id || makeWorkerMonthlyActualVoucherId()),
    worker,
    monthKey,
    expectedAmount,
    payWithVat: payWithVat || undefined,
    expectedFinalAmount,
    entries,
    allocations,
    paidAmount,
    memo: row.memo ? String(row.memo) : undefined,
    createdAt: String(row.createdAt || new Date().toISOString()),
    createdBy: row.createdBy ? String(row.createdBy) : undefined,
  };
}

export function normalizeWorkerMonthlyActualVouchers(rows: unknown): WorkerMonthlyActualVoucher[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeWorkerMonthlyActualVoucher).filter((row): row is WorkerMonthlyActualVoucher => Boolean(row));
}

export function sumEntryAmount(entries: WorkerMonthlyPaymentEntry[] = []) {
  return entries.reduce((sum, entry) => sum + Math.round(entry.amount || 0), 0);
}

export function sumAllocationToMonth(allocations: WorkerMonthlyAllocation[] = [], monthKey: string) {
  return allocations
    .filter((row) => row.monthKey === monthKey)
    .reduce((sum, row) => sum + Math.round(row.amount || 0), 0);
}

export function sumVoucherPaidAmount(
  voucher: Pick<WorkerMonthlyActualVoucher, "entries" | "allocations" | "monthKey">,
) {
  const entryTotal = sumEntryAmount(voucher.entries);
  const allocTotal = sumAllocationToMonth(voucher.allocations, voucher.monthKey);
  if (voucher.allocations.length > 0) return allocTotal;
  return entryTotal;
}

export function computeWorkerMonthlyVoucherSettlement(
  voucher: Pick<
    WorkerMonthlyActualVoucher,
    "entries" | "allocations" | "monthKey" | "expectedAmount" | "expectedFinalAmount" | "payWithVat"
  >,
): WorkerMonthlyVoucherSettlement {
  const paidTotal = sumVoucherPaidAmount(voucher);
  const expectedNet = Math.round(voucher.expectedAmount || 0);
  const payWithVat = voucherIsNetOnlyManualPayments(voucher)
    ? false
    : Boolean(voucher.payWithVat) || inferPayWithVatFromVoucherEntries(voucher);
  const expectedFinalAmount =
    Math.round(voucher.expectedFinalAmount || 0) ||
    calculateWorkerPaymentVat(expectedNet, payWithVat).finalPayAmount;
  const hasMixedNetOnlyAndBank =
    voucherHasNetOnlyManualEntries(voucher) && voucherHasBankEntries(voucher);

  if (!payWithVat) {
    return {
      paidTotal,
      netPaid: paidTotal,
      vatPaid: 0,
      manualNetPaid: 0,
      effectiveExpectedFinal: expectedFinalAmount,
      effectiveVatAmount: 0,
      balance: Math.max(expectedFinalAmount - paidTotal, 0),
    };
  }

  if (!hasMixedNetOnlyAndBank && !voucher.entries.some((entry) => entry.kind === "manual")) {
    let bankNetPaid = 0;
    let vatPaid = 0;
    for (const entry of voucher.entries) {
      const breakdown = breakdownWorkerPaymentEntry(entry, expectedNet);
      if (breakdown.includesVat) {
        bankNetPaid += breakdown.netAmount;
        vatPaid += breakdown.vatAmount;
      } else {
        bankNetPaid += breakdown.total;
      }
    }
    const { vatAmount: effectiveVatAmount } = calculateWorkerPaymentVat(expectedNet, true);
    return {
      paidTotal,
      netPaid: bankNetPaid || paidTotal,
      vatPaid,
      manualNetPaid: 0,
      effectiveExpectedFinal: expectedFinalAmount,
      effectiveVatAmount,
      balance: Math.max(expectedFinalAmount - paidTotal, 0),
    };
  }

  let manualNetPaid = 0;
  let bankNetPaid = 0;
  let vatPaid = 0;

  for (const entry of voucher.entries) {
    if (entry.kind === "manual" && isManualNetOnlyPayoutMethod(entry.method)) {
      manualNetPaid += Math.round(entry.amount || 0);
      continue;
    }

    const breakdown = breakdownWorkerPaymentEntry(entry, expectedNet);
    if (breakdown.includesVat) {
      bankNetPaid += breakdown.netAmount;
      vatPaid += breakdown.vatAmount;
    } else {
      bankNetPaid += breakdown.total;
    }
  }

  const remainingNetForBank = Math.max(expectedNet - manualNetPaid, 0);
  const { vatAmount: effectiveVatAmount } = calculateWorkerPaymentVat(remainingNetForBank, true);
  const effectiveExpectedFinal = expectedNet + effectiveVatAmount;

  return {
    paidTotal,
    netPaid: manualNetPaid + bankNetPaid,
    vatPaid,
    manualNetPaid,
    effectiveExpectedFinal,
    effectiveVatAmount,
    balance: Math.max(effectiveExpectedFinal - paidTotal, 0),
  };
}

export function resolveWorkerMonthlyObligationBalance(input: {
  expectedAmount: number;
  expectedFinalAmount: number;
  payWithVat: boolean;
  paid: number;
  voucher: WorkerMonthlyActualVoucher | null;
}) {
  const payWithVat = voucherIsNetOnlyManualPayments(input.voucher)
    ? false
    : input.payWithVat || inferPayWithVatFromVoucherEntries(input.voucher);
  const hasMixedNetOnlyAndBank =
    voucherHasNetOnlyManualEntries(input.voucher) && voucherHasBankEntries(input.voucher);

  if (
    !payWithVat ||
    (!hasMixedNetOnlyAndBank && !input.voucher?.entries.some((entry) => entry.kind === "manual"))
  ) {
    const expectedFinal =
      payWithVat && input.voucher
        ? computeWorkerMonthlyVoucherSettlement({
            ...input.voucher,
            expectedAmount: input.expectedAmount,
            expectedFinalAmount: input.expectedFinalAmount,
            payWithVat: true,
          }).effectiveExpectedFinal
        : input.expectedFinalAmount;
    return Math.max(expectedFinal - input.paid, 0);
  }

  return computeWorkerMonthlyVoucherSettlement({
    ...input.voucher!,
    expectedAmount: input.expectedAmount,
    expectedFinalAmount: input.expectedFinalAmount,
    payWithVat: true,
  }).balance;
}

export function computeVoucherStatus(
  voucher: Pick<
    WorkerMonthlyActualVoucher,
    "paidAmount" | "expectedFinalAmount" | "expectedAmount" | "payWithVat" | "entries" | "allocations" | "monthKey"
  >,
): WorkerMonthlyVoucherStatus {
  const settlement = computeWorkerMonthlyVoucherSettlement(voucher);
  const paid = settlement.paidTotal;
  const expected = settlement.effectiveExpectedFinal;
  if (paid <= 0) return "unpaid";
  if (expected <= 0) return paid > 0 ? "paid" : "unpaid";
  if (paid < expected) return "partial";
  if (paid > expected) return "overpaid";
  return "paid";
}

export function resolveObligationOverviewMonthKey(row: WorkerMonthlyObligation): string {
  if (/^\d{4}-\d{2}$/.test(row.monthKey)) return row.monthKey;
  if (/^\d{4}-\d{2}-\d{2}$/.test(row.monthKey)) return row.monthKey.slice(0, 7);
  const paymentMonth = String(row.paymentDate || "").slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(paymentMonth)) return paymentMonth;
  return String(row.monthKey || "").slice(0, 7);
}

export function obligationBelongsToMonth(row: WorkerMonthlyObligation, monthKey: string) {
  return resolveObligationOverviewMonthKey(row) === monthKey;
}

export function summarizeWorkerMonthlyObligationAmounts(
  obligation: WorkerMonthlyObligation,
  voucher?: WorkerMonthlyActualVoucher | null,
) {
  const netPay = Math.round(obligation.expectedAmount || 0);
  if (obligation.payWithVat && voucher) {
    const settlement = computeWorkerMonthlyVoucherSettlement({
      ...voucher,
      expectedAmount: netPay,
      expectedFinalAmount: obligation.expectedFinalAmount,
      payWithVat: obligation.payWithVat,
    });
    return {
      netPay,
      vatAmount: settlement.effectiveVatAmount,
      totalAmount: settlement.effectiveExpectedFinal,
    };
  }
  const { vatAmount, finalPayAmount } = calculateWorkerPaymentVat(netPay, obligation.payWithVat);
  return {
    netPay,
    vatAmount: obligation.payWithVat ? vatAmount : 0,
    totalAmount: Math.round(obligation.expectedFinalAmount || finalPayAmount),
  };
}

export type WorkerMonthlyActualMonthSummary = {
  monthKey: string;
  label: string;
  workerCount: number;
  expectedTotal: number;
  paidTotal: number;
  balanceTotal: number;
  paidWorkerCount: number;
  partialWorkerCount: number;
};

export function hasWorkerMonthlyObligationActivity(row: WorkerMonthlyObligation) {
  return (
    Math.round(row.expectedAmount || 0) > 0 ||
    Math.round(row.paid || 0) > 0 ||
    Math.round(row.balance || 0) > 0 ||
    Boolean(row.voucher)
  );
}

export type WorkerMonthlyMonthHubTotals = {
  expectedTotal: number;
  netPayTotal: number;
  paidTotal: number;
  balanceTotal: number;
  workerCount: number;
};

export function listWorkerMonthlyObligationsForMonth(
  obligations: WorkerMonthlyObligation[] = [],
  workers: WorkerMasterLike[] = [],
  monthKey: string,
) {
  return obligations
    .filter((row) => obligationBelongsToMonth(row, monthKey))
    .map((row) => {
      const workerName = resolveWorkerListName(workers, row.worker) || normalizeWorkerName(row.worker);
      return { ...row, worker: workerName };
    });
}

export function summarizeWorkerMonthlyMonthHubTotals(
  obligations: WorkerMonthlyObligation[] = [],
  workers: WorkerMasterLike[] = [],
  monthKey: string,
): WorkerMonthlyMonthHubTotals {
  const monthRows = listWorkerMonthlyObligationsForMonth(obligations, workers, monthKey).filter(
    (row) => !String(row.key || "").endsWith("::placeholder"),
  );

  const totals = monthRows.reduce(
    (acc, row) => {
      const amounts = summarizeWorkerMonthlyObligationAmounts(row, row.voucher);
      acc.expectedTotal += amounts.totalAmount;
      acc.netPayTotal += amounts.netPay;
      acc.paidTotal += row.paid;
      acc.balanceTotal += row.balance;
      return acc;
    },
    { expectedTotal: 0, netPayTotal: 0, paidTotal: 0, balanceTotal: 0, workerCount: 0 },
  );

  totals.workerCount = new Set(monthRows.map((row) => row.worker)).size;
  return totals;
}

export function buildWorkerMonthlyObligationNetPayChartRows(
  obligations: WorkerMonthlyObligation[] = [],
  workers: WorkerMasterLike[] = [],
  monthKey: string,
) {
  const byWorker = new Map<string, { netPay: number; lineCount: number }>();

  for (const row of listWorkerMonthlyObligationsForMonth(obligations, workers, monthKey)) {
    if (!hasWorkerMonthlyObligationActivity(row)) continue;
    const amounts = summarizeWorkerMonthlyObligationAmounts(row, row.voucher);
    const netPay = Math.round(amounts.netPay || 0);
    if (netPay <= 0) continue;
    const current = byWorker.get(row.worker) || { netPay: 0, lineCount: 0 };
    current.netPay += netPay;
    current.lineCount += 1;
    byWorker.set(row.worker, current);
  }

  return [...byWorker.entries()]
    .map(([name, totals]) => ({
      name,
      netPay: totals.netPay,
      lineCount: totals.lineCount,
      grossPay: 0,
      fee: 0,
      headcount: 0,
      feeRate: 0,
    }))
    .sort((a, b) => b.netPay - a.netPay || a.name.localeCompare(b.name, "ko"));
}

export type WorkerMonthlyDisplayedMonthTotals = {
  netPay: number;
  vatAmount: number;
  totalAmount: number;
  paid: number;
  balance: number;
  periodBill: number;
  periodMargin: number;
  paidWorkerCount: number;
  unpaidWorkerCount: number;
};

export type WorkerMonthlyObligationWithCategory = WorkerMonthlyObligation & {
  category: WorkerCategory;
};

export type WorkerMonthlyCategoryTab = "team" | "outsource";

export function listActiveWorkerMastersForCategory(
  workers: WorkerMasterLike[] = [],
  categoryFilter: WorkerMonthlyCategoryTab,
) {
  const targetCategory =
    categoryFilter === "team" ? WORKER_CATEGORY_TEAM : WORKER_CATEGORY_OUTSOURCE;
  return filterActiveWorkers(workers)
    .filter((worker) => normalizeWorkerCategory(worker.category) === targetCategory)
    .sort(compareWorkerMastersDefault);
}

export function buildWorkerMonthlyMonthRowsForMasters(
  obligations: WorkerMonthlyObligation[] = [],
  workers: WorkerMasterLike[] = [],
  monthKey: string,
  masters: WorkerMasterLike[] = [],
): WorkerMonthlyObligationWithCategory[] {
  const monthRows = listWorkerMonthlyObligationsForMonth(obligations, workers, monthKey);
  const byWorker = new Map<string, WorkerMonthlyObligation[]>();
  for (const row of monthRows) {
    const list = byWorker.get(row.worker) || [];
    list.push(row);
    byWorker.set(row.worker, list);
  }

  return masters.map((master) => {
    const workerName = normalizeWorkerName(master.name);
    const category = normalizeWorkerCategory(master.category);
    const workerRows = byWorker.get(workerName);

    if (workerRows?.length) {
      const primary = workerRows.find((row) => !row.isHistorical) ?? workerRows[0];
      return { ...primary, worker: workerName, category };
    }

    return {
      worker: workerName,
      monthKey,
      key: `${workerName}::${monthKey}::placeholder`,
      expectedAmount: 0,
      payWithVat: false,
      expectedFinalAmount: 0,
      paid: 0,
      balance: 0,
      voucher: null,
      category,
    };
  });
}

export function summarizeWorkerMonthlyDisplayedMonthTotals(
  rows: WorkerMonthlyObligation[] = [],
): WorkerMonthlyDisplayedMonthTotals {
  return rows
    .filter((row) => !String(row.key || "").endsWith("::placeholder"))
    .reduce(
      (acc, row) => {
        const amounts = summarizeWorkerMonthlyObligationAmounts(row, row.voucher);
        acc.netPay += amounts.netPay;
        acc.vatAmount += amounts.vatAmount;
        acc.totalAmount += amounts.totalAmount;
        acc.paid += row.paid;
        acc.balance += row.balance;
        if (row.isProbation) {
          acc.periodBill += row.periodBill || 0;
          acc.periodMargin += row.periodMargin || 0;
        }
        const status = computeVoucherStatus(
          row.voucher
            ? {
                ...row.voucher,
                expectedAmount: row.expectedAmount,
                expectedFinalAmount: row.expectedFinalAmount,
                payWithVat: row.payWithVat,
              }
            : {
                paidAmount: row.paid,
                expectedAmount: row.expectedAmount,
                expectedFinalAmount: row.expectedFinalAmount,
                payWithVat: row.payWithVat,
                entries: [],
                allocations: [],
                monthKey: row.monthKey,
              },
        );
        if (status === "paid" || status === "overpaid") acc.paidWorkerCount += 1;
        else if (row.balance > 0 || status === "partial") acc.unpaidWorkerCount += 1;
        return acc;
      },
      {
        netPay: 0,
        vatAmount: 0,
        totalAmount: 0,
        paid: 0,
        balance: 0,
        periodBill: 0,
        periodMargin: 0,
        paidWorkerCount: 0,
        unpaidWorkerCount: 0,
      },
    );
}

export function buildWorkerMonthlyActualMonthSummaries(
  obligations: WorkerMonthlyObligation[] = [],
  workers: WorkerMasterLike[] = [],
  categoryFilter?: WorkerMonthlyCategoryTab,
): WorkerMonthlyActualMonthSummary[] {
  if (!workers.length || !categoryFilter) {
    return buildWorkerMonthlyActualMonthSummariesLegacy(obligations, workers);
  }

  const masters = listActiveWorkerMastersForCategory(workers, categoryFilter);
  const monthKeys = new Set<string>();
  for (const row of obligations) {
    const monthKey = resolveObligationOverviewMonthKey(row);
    if (/^\d{4}-\d{2}$/.test(monthKey)) monthKeys.add(monthKey);
  }

  return [...monthKeys]
    .map((monthKey) => {
      const rows = buildWorkerMonthlyMonthRowsForMasters(obligations, workers, monthKey, masters);
      const totals = summarizeWorkerMonthlyDisplayedMonthTotals(rows);
      const activeRows = rows.filter((row) => !String(row.key || "").endsWith("::placeholder"));
      const paidWorkers = new Set<string>();
      const partialWorkers = new Set<string>();

      for (const row of activeRows) {
        const status = computeVoucherStatus(
          row.voucher
            ? {
                ...row.voucher,
                expectedAmount: row.expectedAmount,
                expectedFinalAmount: row.expectedFinalAmount,
                payWithVat: row.payWithVat,
              }
            : {
                paidAmount: row.paid,
                expectedAmount: row.expectedAmount,
                expectedFinalAmount: row.expectedFinalAmount,
                payWithVat: row.payWithVat,
                entries: [],
                allocations: [],
                monthKey: row.monthKey,
              },
        );
        if (status === "paid" || status === "overpaid") paidWorkers.add(row.worker);
        else if (status === "partial") partialWorkers.add(row.worker);
      }

      return {
        monthKey,
        label: formatMonthLabel(monthKey),
        workerCount: new Set(activeRows.map((row) => row.worker)).size,
        expectedTotal: totals.totalAmount,
        paidTotal: totals.paid,
        balanceTotal: totals.balance,
        paidWorkerCount: paidWorkers.size,
        partialWorkerCount: partialWorkers.size,
      };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

function buildWorkerMonthlyActualMonthSummariesLegacy(
  obligations: WorkerMonthlyObligation[] = [],
  workers: WorkerMasterLike[] = [],
): WorkerMonthlyActualMonthSummary[] {
  const byMonth = new Map<
    string,
    {
      workers: Set<string>;
      expectedTotal: number;
      paidTotal: number;
      balanceTotal: number;
      paidWorkers: Set<string>;
      partialWorkers: Set<string>;
    }
  >();

  for (const row of obligations) {
    const monthKey = resolveObligationOverviewMonthKey(row);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;

    const workerName = workers.length
      ? resolveWorkerListName(workers, row.worker) || normalizeWorkerName(row.worker)
      : normalizeWorkerName(row.worker);

    const amounts = summarizeWorkerMonthlyObligationAmounts(row, row.voucher);
    const current = byMonth.get(monthKey) || {
      workers: new Set<string>(),
      expectedTotal: 0,
      paidTotal: 0,
      balanceTotal: 0,
      paidWorkers: new Set<string>(),
      partialWorkers: new Set<string>(),
    };
    if (hasWorkerMonthlyObligationActivity(row)) {
      current.workers.add(workerName);
    }
    current.expectedTotal += amounts.totalAmount;
    current.paidTotal += row.paid;
    current.balanceTotal += row.balance;

    const status = computeVoucherStatus(
      row.voucher
        ? {
            ...row.voucher,
            expectedAmount: row.expectedAmount,
            expectedFinalAmount: row.expectedFinalAmount,
            payWithVat: row.payWithVat,
          }
        : {
            paidAmount: row.paid,
            expectedAmount: row.expectedAmount,
            expectedFinalAmount: row.expectedFinalAmount,
            payWithVat: row.payWithVat,
            entries: [],
            allocations: [],
            monthKey: row.monthKey,
          },
    );
    if (status === "paid" || status === "overpaid") current.paidWorkers.add(workerName);
    else if (status === "partial") current.partialWorkers.add(workerName);

    byMonth.set(monthKey, current);
  }

  return [...byMonth.entries()]
    .map(([monthKey, totals]) => ({
      monthKey,
      label: formatMonthLabel(monthKey),
      workerCount: totals.workers.size,
      expectedTotal: totals.expectedTotal,
      paidTotal: totals.paidTotal,
      balanceTotal: totals.balanceTotal,
      paidWorkerCount: totals.paidWorkers.size,
      partialWorkerCount: totals.partialWorkers.size,
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export function allocateWorkerPaymentFifo(
  worker: string,
  paymentAmount: number,
  obligations: WorkerMonthlyObligation[],
) {
  const amount = Math.round(Number(paymentAmount) || 0);
  if (amount <= 0) return [];

  const sorted = [...obligations]
    .filter((row) => row.worker === worker && row.balance > 0)
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  const allocations: WorkerMonthlyAllocation[] = [];
  let remaining = amount;

  for (const obligation of sorted) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, obligation.balance);
    if (applied <= 0) continue;
    allocations.push({ monthKey: obligation.monthKey, amount: applied });
    remaining -= applied;
  }

  if (remaining > 0 && sorted.length) {
    const last = sorted[sorted.length - 1];
    const existing = allocations.find((row) => row.monthKey === last.monthKey);
    if (existing) existing.amount += remaining;
    else allocations.push({ monthKey: last.monthKey, amount: remaining });
  } else if (remaining > 0) {
    const fallbackMonth = obligations.find((row) => row.worker === worker)?.monthKey;
    if (fallbackMonth) allocations.push({ monthKey: fallbackMonth, amount: remaining });
  }

  return allocations;
}

function sumWorkerPeriodBillMargin(
  detailRows: WorkerPaymentDetailRow[],
  workerName: string,
  periodStart: string,
  periodEnd: string,
) {
  return detailRows
    .filter(
      (row) =>
        row.worker === workerName &&
        dateInInclusiveRange(String(row.date || "").slice(0, 10), periodStart, periodEnd),
    )
    .reduce(
      (acc, row) => {
        acc.bill += Math.round(Number(row.bill) || 0);
        acc.margin += Math.round(Number(row.margin) || 0);
        return acc;
      },
      { bill: 0, margin: 0 },
    );
}

function appendWorkerMonthlyObligation(
  obligations: WorkerMonthlyObligation[],
  input: {
    worker: string;
    monthKey: string;
    expectedAmount: number;
    payWithVat: boolean;
    expectedFinalAmount: number;
    paid: number;
    voucher: WorkerMonthlyActualVoucher | null;
    periodStart?: string;
    periodEnd?: string;
    paymentDate?: string;
    isProbation?: boolean;
    periodLabel?: string;
    isHistorical?: boolean;
    periodBill?: number;
    periodMargin?: number;
  },
) {
  obligations.push({
    worker: input.worker,
    monthKey: input.monthKey,
    key: makeWorkerMonthKey(input.worker, input.monthKey),
    expectedAmount: input.expectedAmount,
    payWithVat: input.payWithVat,
    expectedFinalAmount: input.expectedFinalAmount,
    paid: input.paid,
    balance: resolveWorkerMonthlyObligationBalance({
      expectedAmount: input.expectedAmount,
      expectedFinalAmount: input.expectedFinalAmount,
      payWithVat: input.payWithVat,
      paid: input.paid,
      voucher: input.voucher,
    }),
    voucher: input.voucher,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    paymentDate: input.paymentDate,
    isProbation: input.isProbation,
    periodLabel: input.periodLabel,
    isHistorical: input.isHistorical,
    periodBill: input.periodBill,
    periodMargin: input.periodMargin,
  });
}

function buildEGradeWorkerObligations(
  detailRows: WorkerPaymentDetailRow[],
  profile: WorkerEGradePayProfile,
  workers: WorkerMasterLike[],
  voucherByKey: Map<string, WorkerMonthlyActualVoucher>,
  paidByKey: Map<string, number>,
  records: WorkerMonthlyPaymentRecord[],
  learnRules: WorkerPayWithVatLearnRule[],
  workerAiRules: WorkerAiRules = DEFAULT_WORKER_AI_RULES,
) {
  const { workerName, hireDate, untilDate, historicalOnly } = profile;
  const obligations: WorkerMonthlyObligation[] = [];
  const periods = buildEGradePayPeriods(hireDate, untilDate).filter((period) => period.periodStart <= untilDate);
  const workerMaster = findWorkerMasterByListName(workers, workerName);

  for (const period of periods) {
    if (historicalOnly && period.periodEnd > untilDate) continue;
    const workerRows = buildWorkerMonthlyWorkerRowsForRange(
      detailRows,
      period.monthKey,
      workers,
      { start: period.periodStart, end: period.periodEnd },
    ).filter((row) => row.worker === workerName);
    const workerRow = workerRows[0];
    const hasSales = detailRows.some(
      (row) =>
        row.worker === workerName &&
        dateInInclusiveRange(String(row.date || "").slice(0, 10), period.periodStart, period.periodEnd),
    );
    const voucher = voucherByKey.get(`${workerName}::${period.monthKey}`) || null;
    const hasAmount = Boolean(workerRow && (workerRow.netPay > 0 || workerRow.grossPay > 0));
    if (historicalOnly) {
      if (!period.isProbation && !hasSales && !voucher && !hasAmount) continue;
    } else if (!period.isProbation && !hasSales && !voucher && !hasAmount) {
      continue;
    }

    const expectedAmount = period.isProbation
      ? resolveWorkerProbationExpectedAmount(voucher?.expectedAmount, {
          probationNetPay: resolveEffectiveProbationPay(workerMaster, workerAiRules),
        })
      : Math.round(workerRow?.netPay || 0);
    const payWithVat = resolveWorkerPayWithVat(
      workerName,
      period.monthKey,
      records,
      learnRules,
      voucher,
      {
        defaultPayWithVat: period.isProbation
          ? resolveEffectiveProbationPayWithVat(workerMaster, workerAiRules)
          : undefined,
      },
    );
    const expectedFinalAmount = calculateWorkerPaymentVat(expectedAmount, payWithVat).finalPayAmount;
    const paid = paidByKey.get(`${workerName}::${period.monthKey}`) || 0;
    const salesTotals = period.isProbation
      ? sumWorkerPeriodBillMargin(detailRows, workerName, period.periodStart, period.periodEnd)
      : { bill: 0, margin: 0 };

    appendWorkerMonthlyObligation(obligations, {
      worker: workerName,
      monthKey: period.monthKey,
      expectedAmount,
      payWithVat,
      expectedFinalAmount,
      paid,
      voucher,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      paymentDate: period.paymentDate,
      isProbation: period.isProbation,
      periodLabel: historicalOnly ? `${period.label} · E\uB4F1\uAE09 \uC774\uB825` : period.label,
      isHistorical: historicalOnly,
      periodBill: salesTotals.bill,
      periodMargin: salesTotals.margin,
    });
  }

  return obligations;
}

export function buildWorkerMonthlyObligations(
  detailRows: WorkerPaymentDetailRow[] = [],
  workers: WorkerMasterLike[] = [],
  vouchers: WorkerMonthlyActualVoucher[] = [],
  records: WorkerMonthlyPaymentRecord[] = [],
  learnRules: WorkerPayWithVatLearnRule[] = [],
  workerAiRules: WorkerAiRules = DEFAULT_WORKER_AI_RULES,
): WorkerMonthlyObligation[] {
  const monthKeys = new Set<string>();
  for (const row of detailRows) {
    const monthKey = String(row.date || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(monthKey)) monthKeys.add(monthKey);
  }
  for (const voucher of vouchers) {
    if (/^\d{4}-\d{2}$/.test(voucher.monthKey)) monthKeys.add(voucher.monthKey);
    if (/^\d{4}-\d{2}-\d{2}$/.test(voucher.monthKey)) monthKeys.add(voucher.monthKey);
  }

  const eGradeProfiles = resolveWorkerEGradePayProfiles(
    workers,
    vouchers,
    resolveLatestDateFromRows(detailRows.map((row) => String(row.date || "").slice(0, 10))),
    (name) => resolveWorkerListName(workers, name) || normalizeWorkerName(name),
  );
  const eGradeWorkerNames = new Set(
    eGradeProfiles.filter((row) => !row.historicalOnly).map((row) => row.workerName),
  );

  for (const profile of eGradeProfiles) {
    for (const period of buildEGradePayPeriods(profile.hireDate, profile.untilDate)) {
      monthKeys.add(period.monthKey);
    }
    for (const voucher of vouchers) {
      const worker = resolveWorkerListName(workers, voucher.worker) || normalizeWorkerName(voucher.worker);
      if (worker === profile.workerName && isEGradePayPeriodKey(voucher.monthKey)) {
        monthKeys.add(voucher.monthKey);
      }
    }
  }

  const voucherByKey = new Map<string, WorkerMonthlyActualVoucher>();
  for (const voucher of vouchers) {
    const worker = resolveWorkerListName(workers, voucher.worker) || normalizeWorkerName(voucher.worker);
    const key = `${worker}::${voucher.monthKey}`;
    const existing = voucherByKey.get(key);
    if (!existing || voucher.entries.length > existing.entries.length) {
      voucherByKey.set(key, { ...voucher, worker });
    }
  }
  const paidByKey = new Map<string, number>();

  for (const voucher of voucherByKey.values()) {
    const key = `${voucher.worker}::${voucher.monthKey}`;
    const paid = sumVoucherPaidAmount(voucher);
    paidByKey.set(key, (paidByKey.get(key) || 0) + paid);
    for (const alloc of voucher.allocations) {
      if (alloc.monthKey === voucher.monthKey) continue;
      const targetKey = `${voucher.worker}::${alloc.monthKey}`;
      paidByKey.set(targetKey, (paidByKey.get(targetKey) || 0) + Math.round(alloc.amount || 0));
    }
  }

  const obligations: WorkerMonthlyObligation[] = [];
  const untilDate = resolveLatestDateFromRows(detailRows.map((row) => String(row.date || "").slice(0, 10)));

  for (const monthKey of [...monthKeys].sort()) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(monthKey)) continue;

    const workerRows = buildWorkerMonthlyWorkerRows(detailRows, monthKey, workers);
    const workersInMonth = new Set(workerRows.map((row) => row.worker));
    for (const voucher of voucherByKey.values()) {
      if (voucher.monthKey !== monthKey) continue;
      workersInMonth.add(voucher.worker);
    }

    for (const worker of workersInMonth) {
      if (eGradeWorkerNames.has(worker)) continue;
      const workerRow = workerRows.find((row) => row.worker === worker);
      const expectedAmount = Math.round(workerRow?.netPay || 0);
      const voucher = voucherByKey.get(`${worker}::${monthKey}`) || null;
      const payWithVat = resolveWorkerPayWithVat(worker, monthKey, records, learnRules, voucher);
      const expectedFinalAmount = calculateWorkerPaymentVat(expectedAmount, payWithVat).finalPayAmount;
      const paid = paidByKey.get(`${worker}::${monthKey}`) || 0;

      appendWorkerMonthlyObligation(obligations, {
        worker,
        monthKey,
        expectedAmount,
        payWithVat,
        expectedFinalAmount,
        paid,
        voucher,
      });
    }
  }

  for (const profile of eGradeProfiles) {
    obligations.push(
      ...buildEGradeWorkerObligations(
        detailRows.map((row) => ({
          ...row,
          worker: resolveWorkerListName(workers, row.worker) || normalizeWorkerName(row.worker),
        })),
        profile,
        workers,
        voucherByKey,
        paidByKey,
        records,
        learnRules,
        workerAiRules,
      ),
    );
  }

  return obligations.sort(
    (a, b) =>
      (a.paymentDate || a.monthKey).localeCompare(b.paymentDate || b.monthKey) ||
      a.worker.localeCompare(b.worker, "ko"),
  );
}

export function refreshVoucherPaidAmount(voucher: WorkerMonthlyActualVoucher): WorkerMonthlyActualVoucher {
  return {
    ...voucher,
    paidAmount: sumVoucherPaidAmount(voucher),
  };
}

/** FIFO가 선택 월이 아닌 이전 달로만 배분된 전표 allocations 제거 */
export function repairMisallocatedWorkerMonthlyVouchers(vouchers: WorkerMonthlyActualVoucher[]) {
  let repaired = 0;
  const next = vouchers.map((voucher) => {
    if (!voucher.allocations.length || !voucher.entries.length) return voucher;
    const allocToSelf = sumAllocationToMonth(voucher.allocations, voucher.monthKey);
    const entryTotal = sumEntryAmount(voucher.entries);
    if (entryTotal > 0 && allocToSelf <= 0) {
      repaired += 1;
      return refreshVoucherPaidAmount({ ...voucher, allocations: [] });
    }
    return voucher;
  });
  return { vouchers: next, repaired };
}

export function upsertWorkerMonthlyActualVoucher(
  vouchers: WorkerMonthlyActualVoucher[],
  patch: {
    worker: string;
    monthKey: string;
    expectedAmount: number;
    payWithVat?: boolean;
    expectedFinalAmount?: number;
    memo?: string;
    createdBy?: string;
  },
): WorkerMonthlyActualVoucher[] {
  const worker = patch.worker.trim();
  const monthKey = patch.monthKey.trim();
  const payWithVat = Boolean(patch.payWithVat);
  const expectedAmount = Math.round(patch.expectedAmount || 0);
  const expectedFinalAmount =
    Math.round(patch.expectedFinalAmount || 0) ||
    calculateWorkerPaymentVat(expectedAmount, payWithVat).finalPayAmount;
  const existing = vouchers.find((row) => row.worker === worker && row.monthKey === monthKey);

  if (existing) {
    return vouchers.map((row) =>
      row.id === existing.id
        ? refreshVoucherPaidAmount({
            ...row,
            expectedAmount,
            payWithVat: payWithVat || undefined,
            expectedFinalAmount,
            memo: patch.memo !== undefined ? patch.memo : row.memo,
          })
        : row,
    );
  }

  const created: WorkerMonthlyActualVoucher = {
    id: makeWorkerMonthlyActualVoucherId(),
    worker,
    monthKey,
    expectedAmount,
    payWithVat: payWithVat || undefined,
    expectedFinalAmount,
    entries: [],
    allocations: [],
    paidAmount: 0,
    memo: patch.memo,
    createdAt: new Date().toISOString(),
    createdBy: patch.createdBy,
  };

  return [created, ...vouchers];
}

export function addEntryToWorkerMonthlyVoucher(
  vouchers: WorkerMonthlyActualVoucher[],
  voucherId: string,
  entry: WorkerMonthlyPaymentEntry,
  fifoAllocations?: WorkerMonthlyAllocation[],
): WorkerMonthlyActualVoucher[] {
  return vouchers.map((voucher) => {
    if (voucher.id !== voucherId) return voucher;
    const allocations = fifoAllocations?.length ? fifoAllocations : voucher.allocations;
    return refreshVoucherPaidAmount({
      ...voucher,
      entries: [...voucher.entries, entry],
      allocations,
    });
  });
}

export function removeEntryFromWorkerMonthlyVoucher(
  vouchers: WorkerMonthlyActualVoucher[],
  bankTransactions: BankTransaction[],
  input: { voucherId: string; entryId: string },
): {
  vouchers: WorkerMonthlyActualVoucher[];
  bankTransactions: BankTransaction[];
  removed: WorkerMonthlyPaymentEntry | null;
  voucher: WorkerMonthlyActualVoucher | null;
} {
  const voucher = vouchers.find((row) => row.id === input.voucherId) || null;
  if (!voucher) return { vouchers, bankTransactions, removed: null, voucher: null };

  const entry = voucher.entries.find((row) => row.id === input.entryId) || null;
  if (!entry) return { vouchers, bankTransactions, removed: null, voucher };

  const nextVouchers = vouchers.map((row) => {
    if (row.id !== input.voucherId) return row;
    return refreshVoucherPaidAmount({
      ...row,
      entries: row.entries.filter((item) => item.id !== input.entryId),
      allocations: [],
    });
  });

  let nextBankTransactions = bankTransactions;
  if (entry.kind === "bank") {
    const bankTxId = entry.bankTransactionId;
    const stillLinked = nextVouchers.some((row) =>
      row.entries.some((item) => item.kind === "bank" && item.bankTransactionId === bankTxId),
    );
    if (!stillLinked) {
      nextBankTransactions = bankTransactions.map((row) => {
        if (row.id !== bankTxId) return row;
        const { linkedWorkerMonthlyPaymentVoucherId: _removed, ...rest } = row;
        return rest;
      });
    }
  }

  const nextVoucher = nextVouchers.find((row) => row.id === input.voucherId) || null;
  return { vouchers: nextVouchers, bankTransactions: nextBankTransactions, removed: entry, voucher: nextVoucher };
}

export function matchesWorkerPayoutVoucherForManualEntry(
  payout: WorkerPayoutVoucher,
  worker: string,
  entry: Extract<WorkerMonthlyPaymentEntry, { kind: "manual" }>,
) {
  if (
    entry.workerPayoutVoucherId &&
    String(entry.workerPayoutVoucherId).trim() === String(payout.id || "").trim()
  ) {
    return true;
  }
  return (
    String(payout.workerName || "").trim() === String(worker || "").trim() &&
    String(payout.date || "").slice(0, 10) === String(entry.date || "").slice(0, 10) &&
    Math.round(Number(payout.amount) || 0) === Math.round(entry.amount || 0) &&
    payout.method === entry.method
  );
}

export function findWorkerMonthlyVoucherForPayoutVoucher(
  vouchers: WorkerMonthlyActualVoucher[],
  worker: string,
  payoutVoucher: WorkerPayoutVoucher,
) {
  for (const voucher of vouchers) {
    if (String(voucher.worker || "").trim() !== String(worker || "").trim()) continue;
    for (const entry of voucher.entries) {
      if (entry.kind !== "manual") continue;
      if (matchesWorkerPayoutVoucherForManualEntry(payoutVoucher, worker, entry)) {
        return voucher;
      }
    }
  }
  return null;
}

export function listWorkerCashPayoutVouchers(workerName: string, workerPayoutVouchers: WorkerPayoutVoucher[]) {
  const worker = workerName.trim();
  if (!worker) return [] as WorkerPayoutVoucher[];
  return workerPayoutVouchers
    .filter(
      (row) =>
        String(row.workerName || "").trim() === worker && normalizeWorkerPayoutMethod(row.method) === "cash",
    )
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

export function syncWorkerPaymentRecordsFromVouchers(
  records: WorkerMonthlyPaymentRecord[],
  vouchers: WorkerMonthlyActualVoucher[],
  paidBy?: string,
): WorkerMonthlyPaymentRecord[] {
  let next = records;
  for (const voucher of vouchers) {
    const settlement = computeWorkerMonthlyVoucherSettlement(voucher);
    if (settlement.balance > 0) continue;
    const paidAt =
      voucher.entries
        .map((entry) => entry.date)
        .filter(Boolean)
        .sort()
        .pop() || new Date().toISOString().slice(0, 10);
    next = upsertWorkerPaymentRecord(next, {
      worker: voucher.worker,
      monthKey: voucher.monthKey,
      paid: true,
      paidAt,
      paidBy: voucher.createdBy || paidBy,
      payWithVat: voucher.payWithVat,
    });
  }
  return next;
}

/** 서버 새로고침 시 로컬 월실지급 전표·통장 연결이 지워지지 않도록 병합 */
export function mergeWorkerMonthlyActualVouchersFromLocal(
  incoming: WorkerMonthlyActualVoucher[] = [],
  local: WorkerMonthlyActualVoucher[] = [],
): WorkerMonthlyActualVoucher[] {
  const localById = new Map(local.map((voucher) => [voucher.id, voucher]));
  const merged = incoming.map((voucher) => {
    const prev = localById.get(voucher.id);
    if (!prev) return refreshVoucherPaidAmount(voucher);

    const prevBankIds = new Set(
      prev.entries
        .filter((entry): entry is Extract<WorkerMonthlyPaymentEntry, { kind: "bank" }> => entry.kind === "bank")
        .map((entry) => entry.bankTransactionId),
    );
    const incomingBankIds = new Set(
      voucher.entries
        .filter((entry): entry is Extract<WorkerMonthlyPaymentEntry, { kind: "bank" }> => entry.kind === "bank")
        .map((entry) => entry.bankTransactionId),
    );

    let entries = voucher.entries;
    if (prev.entries.length > entries.length) {
      entries = prev.entries;
    } else if ([...prevBankIds].some((id) => !incomingBankIds.has(id))) {
      entries = [...entries];
      for (const entry of prev.entries) {
        if (entry.kind === "bank" && !incomingBankIds.has(entry.bankTransactionId)) {
          entries.push(entry);
        }
      }
    }

    const allocations = prev.allocations.length > voucher.allocations.length ? prev.allocations : voucher.allocations;
    return refreshVoucherPaidAmount({
      ...voucher,
      entries,
      allocations,
      payWithVat: voucher.payWithVat ?? prev.payWithVat,
      expectedAmount: voucher.expectedAmount || prev.expectedAmount,
      expectedFinalAmount: voucher.expectedFinalAmount || prev.expectedFinalAmount,
    });
  });

  const incomingIds = new Set(incoming.map((voucher) => voucher.id));
  for (const voucher of local) {
    if (!incomingIds.has(voucher.id) && voucher.entries.length > 0) {
      merged.unshift(refreshVoucherPaidAmount(voucher));
    }
  }

  return merged.map(refreshVoucherPaidAmount);
}

export function mergeBankTransactionsWorkerMonthlyLinksFromLocal(
  incoming: BankTransaction[] = [],
  local: BankTransaction[] = [],
): BankTransaction[] {
  const localById = new Map(local.map((row) => [row.id, row]));
  const incomingIds = new Set(incoming.map((row) => row.id));
  const merged = incoming.map((row) => {
    const prev = localById.get(row.id);
    if (!prev) return row;
    return mergeRemoteBankTransactionRow(prev, row);
  });
  for (const row of local) {
    if (!incomingIds.has(row.id) && String(row.linkedWorkerMonthlyPaymentVoucherId || "").trim()) {
      merged.push(row);
    }
  }
  return merged;
}

export function linkBankEntryToWorkerMonthlyVoucher(
  vouchers: WorkerMonthlyActualVoucher[],
  bankTransactions: BankTransaction[],
  input: {
    voucherId: string;
    bankTransactionId: string;
    worker: string;
    monthKey: string;
    obligations: WorkerMonthlyObligation[];
    useFifo?: boolean;
    entryAmount?: number;
  },
): {
  vouchers: WorkerMonthlyActualVoucher[];
  bankTransactions: BankTransaction[];
  learnedPayWithVat?: boolean;
} {
  const tx = bankTransactions.find((row) => row.id === input.bankTransactionId);
  if (!tx) return { vouchers, bankTransactions };

  const amount =
    Math.round(Number(input.entryAmount) || 0) ||
    Math.round(Number(tx.withdrawal) || 0) ||
    Math.round(Number(tx.deposit) || 0);
  const date = String(tx.transactionAt || "").slice(0, 10);
  const entry: WorkerMonthlyPaymentEntry = {
    kind: "bank",
    id: makeEntryId(),
    bankTransactionId: tx.id,
    amount,
    date,
  };

  let nextVouchers = vouchers;
  let target = nextVouchers.find((row) => row.id === input.voucherId);
  const obligation = input.obligations.find(
    (row) => row.worker === input.worker && row.monthKey === input.monthKey,
  );
  const expectedAmount = Math.round(target?.expectedAmount || obligation?.expectedAmount || 0);
  let payWithVat = Boolean(target?.payWithVat || obligation?.payWithVat);
  let learnedPayWithVat = false;

  const hasNetOnlyManual = voucherHasNetOnlyManualEntries(target);
  const bankBreakdown = detectPartialVatInclusiveBreakdown(amount) || detectWorkerPaymentBreakdown(amount, expectedAmount);

  if (!payWithVat && expectedAmount > 0 && (bankBreakdown.includesVat || hasNetOnlyManual)) {
    payWithVat = true;
    learnedPayWithVat = true;
    nextVouchers = upsertWorkerMonthlyActualVoucher(nextVouchers, {
      worker: input.worker,
      monthKey: input.monthKey,
      expectedAmount,
      payWithVat: true,
    });
    target = nextVouchers.find((row) => row.id === input.voucherId);
  }

  const expected =
    target?.expectedFinalAmount || calculateWorkerPaymentVat(expectedAmount, payWithVat).finalPayAmount;
  const fifoAllocations =
    input.useFifo === true && amount !== expected
      ? allocateWorkerPaymentFifo(input.worker, amount, input.obligations)
      : undefined;

  nextVouchers = addEntryToWorkerMonthlyVoucher(nextVouchers, input.voucherId, entry, fifoAllocations);

  if (fifoAllocations?.length) {
    for (const alloc of fifoAllocations) {
      if (alloc.monthKey === input.monthKey) continue;
      nextVouchers = upsertWorkerMonthlyActualVoucher(nextVouchers, {
        worker: input.worker,
        monthKey: alloc.monthKey,
        expectedAmount:
          input.obligations.find((row) => row.worker === input.worker && row.monthKey === alloc.monthKey)
            ?.expectedAmount || 0,
        payWithVat: payWithVat || target?.payWithVat,
      });
    }
  }

  const nextBankTransactions = bankTransactions.map((row) =>
    row.id === tx.id ? { ...row, linkedWorkerMonthlyPaymentVoucherId: input.voucherId } : row,
  );

  return { vouchers: nextVouchers, bankTransactions: nextBankTransactions, learnedPayWithVat: learnedPayWithVat || undefined };
}

export function linkPayoutVoucherToWorkerMonthlyVoucher(
  vouchers: WorkerMonthlyActualVoucher[],
  input: {
    voucherId: string;
    payoutVoucher: WorkerPayoutVoucher;
    worker: string;
    monthKey: string;
    obligations: WorkerMonthlyObligation[];
    useFifo?: boolean;
  },
): { vouchers: WorkerMonthlyActualVoucher[]; learnedPayWithVat?: boolean } {
  const payout = input.payoutVoucher;
  const amount = Math.round(Number(payout.amount) || 0);
  if (amount <= 0) return { vouchers };

  const entry: WorkerMonthlyPaymentEntry = {
    kind: "manual",
    id: makeEntryId(),
    method: normalizeWorkerPayoutMethod(payout.method),
    amount,
    date: String(payout.date || "").slice(0, 10),
    memo: payout.memo,
    workerPayoutVoucherId: payout.id,
  };

  let nextVouchers = vouchers;
  let target = nextVouchers.find((row) => row.id === input.voucherId);
  const obligation = input.obligations.find(
    (row) => row.worker === input.worker && row.monthKey === input.monthKey,
  );
  const expectedAmount = Math.round(target?.expectedAmount || obligation?.expectedAmount || 0);
  let payWithVat = Boolean(target?.payWithVat || obligation?.payWithVat);
  let learnedPayWithVat = false;

  const hasBankEntries = Boolean(target?.entries.some((row) => row.kind === "bank"));

  if (
    !payWithVat &&
    expectedAmount > 0 &&
    ((hasBankEntries && isManualNetOnlyPayoutMethod(entry.method)) ||
      (!isManualNetOnlyPayoutMethod(entry.method) &&
        inferPayWithVatFromAmount(entry.amount, expectedAmount)))
  ) {
    payWithVat = true;
    learnedPayWithVat = true;
    nextVouchers = upsertWorkerMonthlyActualVoucher(nextVouchers, {
      worker: input.worker,
      monthKey: input.monthKey,
      expectedAmount,
      payWithVat: true,
    });
    target = nextVouchers.find((row) => row.id === input.voucherId);
  }

  const expected =
    target?.expectedFinalAmount || calculateWorkerPaymentVat(expectedAmount, payWithVat).finalPayAmount;
  const fifoAllocations =
    input.useFifo === true && amount !== expected
      ? allocateWorkerPaymentFifo(input.worker, amount, input.obligations)
      : undefined;

  nextVouchers = addEntryToWorkerMonthlyVoucher(nextVouchers, input.voucherId, entry, fifoAllocations);

  if (fifoAllocations?.length) {
    for (const alloc of fifoAllocations) {
      if (alloc.monthKey === input.monthKey) continue;
      nextVouchers = upsertWorkerMonthlyActualVoucher(nextVouchers, {
        worker: input.worker,
        monthKey: alloc.monthKey,
        expectedAmount:
          input.obligations.find((row) => row.worker === input.worker && row.monthKey === alloc.monthKey)
            ?.expectedAmount || 0,
        payWithVat: payWithVat || target?.payWithVat,
      });
    }
  }

  return { vouchers: nextVouchers, learnedPayWithVat: learnedPayWithVat || undefined };
}

export function cancelWorkerMonthlyActualVoucher(
  vouchers: WorkerMonthlyActualVoucher[],
  bankTransactions: BankTransaction[],
  voucherId: string,
): {
  vouchers: WorkerMonthlyActualVoucher[];
  bankTransactions: BankTransaction[];
  cancelled: WorkerMonthlyActualVoucher | null;
} {
  const cancelled = vouchers.find((row) => row.id === voucherId) || null;
  if (!cancelled) return { vouchers, bankTransactions, cancelled: null };

  const linkedBankTxIds = new Set(
    cancelled.entries
      .filter((entry): entry is Extract<WorkerMonthlyPaymentEntry, { kind: "bank" }> => entry.kind === "bank")
      .map((entry) => entry.bankTransactionId),
  );

  const nextBankTransactions = bankTransactions.map((row) => {
    const linkedVoucherId = String(row.linkedWorkerMonthlyPaymentVoucherId || "").trim();
    if (!linkedBankTxIds.has(row.id) && linkedVoucherId !== voucherId) return row;
    const { linkedWorkerMonthlyPaymentVoucherId: _removed, ...rest } = clearBankTransactionClientLabel(row);
    return rest;
  });

  return {
    vouchers: vouchers.filter((row) => row.id !== voucherId),
    bankTransactions: nextBankTransactions,
    cancelled,
  };
}

export function createVoucherWithEntries(
  vouchers: WorkerMonthlyActualVoucher[],
  input: {
    worker: string;
    monthKey: string;
    expectedAmount: number;
    payWithVat?: boolean;
    entries: WorkerMonthlyPaymentEntry[];
    allocations?: WorkerMonthlyAllocation[];
    memo?: string;
    createdBy?: string;
  },
): WorkerMonthlyActualVoucher[] {
  let next = upsertWorkerMonthlyActualVoucher(vouchers, {
    worker: input.worker,
    monthKey: input.monthKey,
    expectedAmount: input.expectedAmount,
    payWithVat: input.payWithVat,
    memo: input.memo,
    createdBy: input.createdBy,
  });
  const voucher = next.find((row) => row.worker === input.worker.trim() && row.monthKey === input.monthKey.trim());
  if (!voucher) return next;

  for (const entry of input.entries) {
    next = addEntryToWorkerMonthlyVoucher(next, voucher.id, entry, input.allocations);
  }

  return next;
}

export function buildUnlinkedWorkerBankWithdrawals(
  bankTransactions: BankTransaction[],
  bankTransactionFolders: BankTransactionFolder[],
  workers: WorkerMasterLike[],
  workerMonthlyActualVouchers: WorkerMonthlyActualVoucher[] = [],
) {
  const linkedVoucherIds = new Set(workerMonthlyActualVouchers.map((row) => row.id));
  return bankTransactions.filter((tx) => {
    const amount = Math.round(Number(tx.withdrawal) || 0) || Math.round(Number(tx.deposit) || 0);
    if (amount <= 0) return false;
    const linkedVoucherId = String(tx.linkedWorkerMonthlyPaymentVoucherId || "").trim();
    if (linkedVoucherId && linkedVoucherIds.has(linkedVoucherId)) return false;
    return Boolean(resolveWorkerNameFromBankTransaction(tx, bankTransactionFolders, workers));
  });
}

export function resolveWorkerFromBankTx(
  tx: BankTransaction,
  bankTransactionFolders: BankTransactionFolder[],
  workers: WorkerMasterLike[],
) {
  return resolveWorkerNameFromBankTransaction(tx, bankTransactionFolders, workers);
}

export function createWorkerPayoutVoucherFromManualEntry(
  worker: string,
  entry: Extract<WorkerMonthlyPaymentEntry, { kind: "manual" }>,
  createdBy?: string,
): WorkerPayoutVoucher {
  return {
    id: makeWorkerPayoutVoucherId(),
    workerName: worker,
    date: entry.date,
    amount: entry.amount,
    method: entry.method,
    memo: entry.memo,
    createdAt: new Date().toISOString(),
    createdBy,
  };
}

export const WORKER_MONTHLY_VOUCHER_STATUS_LABELS: Record<WorkerMonthlyVoucherStatus, string> = {
  unpaid: "\uBBF8\uC9C0\uAE09",
  partial: "\uBD80\uBD84\uC9C0\uAE09",
  paid: "\uC9C0\uAE09\uC644\uB8CC",
  overpaid: "\uCD08\uACFC\uC9C0\uAE09",
};

export function sumLinkedWorkerAmountForBankTx(
  bankTransactionId: string,
  vouchers: WorkerMonthlyActualVoucher[],
) {
  let total = 0;
  for (const voucher of vouchers) {
    for (const entry of voucher.entries) {
      if (entry.kind !== "bank" || entry.bankTransactionId !== bankTransactionId) continue;
      total += Math.round(Number(entry.amount) || 0);
    }
  }
  return total;
}

export function resolveBankWorkerLinkRemaining(
  tx: Pick<BankTransaction, "id" | "withdrawal" | "deposit">,
  vouchers: WorkerMonthlyActualVoucher[],
) {
  const total =
    Math.round(Number(tx.withdrawal) || 0) || Math.round(Number(tx.deposit) || 0);
  return Math.max(0, total - sumLinkedWorkerAmountForBankTx(tx.id, vouchers));
}

export function resolveWorkerLinkSelectionAmount(
  remaining: number,
  obligation: Pick<WorkerMonthlyObligation, "balance" | "expectedFinalAmount">,
) {
  const pool = Math.round(Number(remaining) || 0);
  if (pool <= 0) return 0;
  const target = Math.round(
    Number(obligation.balance) > 0 ? obligation.balance : obligation.expectedFinalAmount || 0,
  );
  if (target <= 0) return 0;
  return Math.min(pool, target);
}

export function listWorkerBankLinksForTransaction(
  bankTransactionId: string,
  vouchers: WorkerMonthlyActualVoucher[],
) {
  const rows: Array<{
    voucherId: string;
    entryId: string;
    worker: string;
    monthKey: string;
    amount: number;
  }> = [];
  for (const voucher of vouchers) {
    for (const entry of voucher.entries) {
      if (entry.kind !== "bank" || entry.bankTransactionId !== bankTransactionId) continue;
      rows.push({
        voucherId: voucher.id,
        entryId: entry.id,
        worker: voucher.worker,
        monthKey: voucher.monthKey,
        amount: Math.round(Number(entry.amount) || 0),
      });
    }
  }
  return rows;
}

export function listWorkerBankTransactions(
  workerName: string,
  bankTransactions: BankTransaction[],
  bankTransactionFolders: BankTransactionFolder[],
  workers: WorkerMasterLike[],
) {
  const worker = workerName.trim();
  if (!worker) return [] as BankTransaction[];
  return bankTransactions
    .filter((tx) => resolveWorkerFromBankTx(tx, bankTransactionFolders, workers) === worker)
    .filter((tx) => {
      const amount = Math.round(Number(tx.withdrawal) || 0) || Math.round(Number(tx.deposit) || 0);
      return amount > 0;
    })
    .sort((a, b) => String(b.transactionAt || "").localeCompare(String(a.transactionAt || "")));
}

export function repairWorkerMonthlyVoucherBankEntriesFromLinks(
  vouchers: WorkerMonthlyActualVoucher[],
  bankTransactions: BankTransaction[],
): WorkerMonthlyActualVoucher[] {
  const voucherById = new Map(vouchers.map((voucher) => [voucher.id, { ...voucher, entries: [...voucher.entries] }]));
  let changed = false;

  for (const tx of bankTransactions) {
    const linkedId = String(tx.linkedWorkerMonthlyPaymentVoucherId || "").trim();
    if (!linkedId) continue;
    const voucher = voucherById.get(linkedId);
    if (!voucher) continue;

    const hasEntry = voucher.entries.some(
      (entry) => entry.kind === "bank" && entry.bankTransactionId === tx.id,
    );
    if (hasEntry) continue;

    const amount = Math.round(Number(tx.withdrawal) || 0) || Math.round(Number(tx.deposit) || 0);
    voucher.entries.push({
      kind: "bank",
      id: makeEntryId(),
      bankTransactionId: tx.id,
      amount,
      date: String(tx.transactionAt || "").slice(0, 10),
    });
    voucherById.set(linkedId, refreshVoucherPaidAmount(voucher));
    changed = true;
  }

  return changed ? vouchers.map((voucher) => voucherById.get(voucher.id) || voucher) : vouchers;
}

export function clearOrphanWorkerMonthlyBankLinks(
  bankTransactions: BankTransaction[],
  vouchers: WorkerMonthlyActualVoucher[],
) {
  const linkedBankCount = bankTransactions.filter((row) =>
    String(row.linkedWorkerMonthlyPaymentVoucherId || "").trim(),
  ).length;
  const vouchersWithEntries = vouchers.filter((row) => row.entries.length > 0).length;
  if (linkedBankCount > 0 && vouchersWithEntries === 0) {
    return { transactions: bankTransactions, cleared: 0, skipped: true as const };
  }

  const voucherIds = new Set(vouchers.map((row) => row.id));
  let cleared = 0;
  const next = bankTransactions.map((row) => {
    const linkedVoucherId = String(row.linkedWorkerMonthlyPaymentVoucherId || "").trim();
    if (!linkedVoucherId || voucherIds.has(linkedVoucherId)) return row;
    cleared += 1;
    const { linkedWorkerMonthlyPaymentVoucherId: _removed, ...rest } = row;
    return rest;
  });
  return { transactions: next, cleared };
}

/** @deprecated use clearOrphanWorkerMonthlyBankLinks — kept for one-off repairs */
export function clearWorkerMonthlyBankTransactionLinks(bankTransactions: BankTransaction[]) {
  let cleared = 0;
  const next = bankTransactions.map((row) => {
    if (!String(row.linkedWorkerMonthlyPaymentVoucherId || "").trim()) return row;
    cleared += 1;
    const { linkedWorkerMonthlyPaymentVoucherId: _removed, ...rest } = row;
    return rest;
  });
  return { transactions: next, cleared };
}

/** 월 실지급 전표에서 통장 연결 항목 제거 — 통장 내역은 시공자 폴더 목록에서만 표시 */
export function clearWorkerMonthlyVoucherBankEntries(vouchers: WorkerMonthlyActualVoucher[]) {
  let stripped = 0;
  const next = vouchers.map((voucher) => {
    const manualEntries = voucher.entries.filter((entry) => entry.kind !== "bank");
    if (manualEntries.length === voucher.entries.length) return voucher;
    stripped += voucher.entries.length - manualEntries.length;
    return refreshVoucherPaidAmount({ ...voucher, entries: manualEntries });
  });
  return { vouchers: next, stripped };
}
