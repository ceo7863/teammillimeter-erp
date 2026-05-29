import type { BankTransaction } from "./bankTransactions";
import {
  compareWorkerMastersDefault,
  findWorkerMasterByName,
  normalizeWorkerCategory,
  normalizeWorkerName,
  WORKER_CATEGORY_OUTSOURCE,
  WORKER_CATEGORY_TEAM,
  type WorkerCategory,
  type WorkerMasterLike,
  type WorkerPaymentDetailRow,
} from "./workerPayments";
import {
  buildWorkerMonthlyWorkerRows,
  calculateWorkerPaymentVat,
  makeWorkerMonthKey,
  upsertWorkerPaymentRecord,
  type WorkerMonthlyPaymentRecord,
} from "./workerMonthlyPayments";
import {
  makeWorkerPayoutVoucherId,
  normalizeWorkerPayoutMethod,
  resolveWorkerNameFromBankTransaction,
  type WorkerPayoutMethod,
  type WorkerPayoutVoucher,
} from "./workerPayoutLedger";
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
  expectedTotal: number;
  paidTotal: number;
  balanceTotal: number;
  unpaidMonthCount: number;
  obligations: WorkerMonthlyObligation[];
};

export function detectWorkerPaymentBreakdown(amount: number, expectedNetPay: number): WorkerPaymentBreakdown {
  const total = Math.round(Number(amount) || 0);
  const netAmount = Math.round(Number(expectedNetPay) || 0);
  const withVat = calculateWorkerPaymentVat(netAmount, true);
  const withoutVat = calculateWorkerPaymentVat(netAmount, false);

  if (netAmount > 0 && total === withVat.finalPayAmount) {
    return { includesVat: true, netAmount, vatAmount: withVat.vatAmount, total: withVat.finalPayAmount };
  }
  if (total === withoutVat.finalPayAmount) {
    return { includesVat: false, netAmount, vatAmount: 0, total: withoutVat.finalPayAmount };
  }
  return { includesVat: false, netAmount, vatAmount: 0, total };
}

export function inferPayWithVatFromAmount(amount: number, expectedNetPay: number) {
  return detectWorkerPaymentBreakdown(amount, expectedNetPay).includesVat;
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

export function resolveWorkerPayWithVat(
  worker: string,
  monthKey: string,
  records: WorkerMonthlyPaymentRecord[] = [],
  learnRules: WorkerPayWithVatLearnRule[] = [],
  voucher?: WorkerMonthlyActualVoucher | null,
) {
  if (voucher?.payWithVat) return true;
  const record = records.find((row) => row.key === makeWorkerMonthKey(worker, monthKey));
  if (record?.payWithVat) return true;
  const learnRule = learnRules.find((row) => row.worker === String(worker || "").trim());
  return Boolean(learnRule?.payWithVat);
}

export function buildWorkerMonthlyWorkerSummaries(
  obligations: WorkerMonthlyObligation[] = [],
  workers: WorkerMasterLike[] = [],
) {
  const byWorker = new Map<string, WorkerMonthlyObligation[]>();
  for (const obligation of obligations) {
    const workerName = normalizeWorkerName(obligation.worker);
    if (!workerName) continue;
    const list = byWorker.get(workerName) || [];
    list.push(obligation);
    byWorker.set(workerName, list);
  }

  const summaries: WorkerMonthlyWorkerSummary[] = [];
  const seen = new Set<string>();

  for (const worker of [...workers].sort(compareWorkerMastersDefault)) {
    const workerName = normalizeWorkerName(worker.name);
    if (!workerName || seen.has(workerName)) continue;
    seen.add(workerName);
    summaries.push(buildWorkerMonthlyWorkerSummary(workerName, worker, byWorker.get(workerName) || []));
  }

  for (const [workerName, rows] of byWorker) {
    if (seen.has(workerName)) continue;
    const master = findWorkerMasterByName(workers, workerName);
    summaries.push(buildWorkerMonthlyWorkerSummary(workerName, master, rows));
    seen.add(workerName);
  }

  return summaries.sort((a, b) => {
    const activeDiff = (a.isActive ? 0 : 1) - (b.isActive ? 0 : 1);
    if (activeDiff !== 0) return activeDiff;
    const categoryDiff =
      (a.category === WORKER_CATEGORY_OUTSOURCE ? 1 : 0) - (b.category === WORKER_CATEGORY_OUTSOURCE ? 1 : 0);
    if (categoryDiff !== 0) return categoryDiff;
    return a.worker.localeCompare(b.worker, "ko");
  });
}

function buildWorkerMonthlyWorkerSummary(
  workerName: string,
  master: WorkerMasterLike | undefined,
  rows: WorkerMonthlyObligation[],
): WorkerMonthlyWorkerSummary {
  const sorted = [...rows].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  return {
    worker: workerName,
    category: normalizeWorkerCategory(master?.category),
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
    return {
      kind: "manual",
      id: String(row.id || makeEntryId()),
      method: normalizeWorkerPayoutMethod(row.method),
      amount,
      date,
      memo: row.memo ? String(row.memo) : undefined,
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

export function computeVoucherStatus(
  voucher: Pick<WorkerMonthlyActualVoucher, "paidAmount" | "expectedFinalAmount">,
): WorkerMonthlyVoucherStatus {
  const paid = Math.round(voucher.paidAmount || 0);
  const expected = Math.round(voucher.expectedFinalAmount || 0);
  if (paid <= 0) return "unpaid";
  if (expected <= 0) return paid > 0 ? "paid" : "unpaid";
  if (paid < expected) return "partial";
  if (paid > expected) return "overpaid";
  return "paid";
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

export function buildWorkerMonthlyObligations(
  detailRows: WorkerPaymentDetailRow[] = [],
  workers: WorkerMasterLike[] = [],
  vouchers: WorkerMonthlyActualVoucher[] = [],
  records: WorkerMonthlyPaymentRecord[] = [],
  learnRules: WorkerPayWithVatLearnRule[] = [],
): WorkerMonthlyObligation[] {
  const monthKeys = new Set<string>();
  for (const row of detailRows) {
    const monthKey = String(row.date || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(monthKey)) monthKeys.add(monthKey);
  }
  for (const voucher of vouchers) {
    if (/^\d{4}-\d{2}$/.test(voucher.monthKey)) monthKeys.add(voucher.monthKey);
  }

  const voucherByKey = new Map(vouchers.map((voucher) => [`${voucher.worker}::${voucher.monthKey}`, voucher]));
  const paidByKey = new Map<string, number>();

  for (const voucher of vouchers) {
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

  for (const monthKey of [...monthKeys].sort()) {
    const workerRows = buildWorkerMonthlyWorkerRows(detailRows, monthKey, workers);
    const workersInMonth = new Set(workerRows.map((row) => row.worker));
    for (const voucher of vouchers.filter((row) => row.monthKey === monthKey)) {
      workersInMonth.add(voucher.worker);
    }

    for (const worker of workersInMonth) {
      const workerRow = workerRows.find((row) => row.worker === worker);
      const expectedAmount = Math.round(workerRow?.netPay || 0);
      const voucher = voucherByKey.get(`${worker}::${monthKey}`) || null;
      const payWithVat = resolveWorkerPayWithVat(worker, monthKey, records, learnRules, voucher);
      const expectedFinalAmount = calculateWorkerPaymentVat(expectedAmount, payWithVat).finalPayAmount;
      const key = makeWorkerMonthKey(worker, monthKey);
      const paid = paidByKey.get(`${worker}::${monthKey}`) || 0;

      obligations.push({
        worker,
        monthKey,
        key,
        expectedAmount,
        payWithVat,
        expectedFinalAmount,
        paid,
        balance: Math.max(expectedFinalAmount - paid, 0),
        voucher,
      });
    }
  }

  return obligations.sort((a, b) => a.monthKey.localeCompare(b.monthKey) || a.worker.localeCompare(b.worker, "ko"));
}

export function refreshVoucherPaidAmount(voucher: WorkerMonthlyActualVoucher): WorkerMonthlyActualVoucher {
  return {
    ...voucher,
    paidAmount: sumVoucherPaidAmount(voucher),
  };
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

export function syncWorkerPaymentRecordsFromVouchers(
  records: WorkerMonthlyPaymentRecord[],
  vouchers: WorkerMonthlyActualVoucher[],
  paidBy?: string,
): WorkerMonthlyPaymentRecord[] {
  let next = records;
  for (const voucher of vouchers) {
    const paidAmount = sumVoucherPaidAmount(voucher);
    if (paidAmount < voucher.expectedFinalAmount) continue;
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
  },
): {
  vouchers: WorkerMonthlyActualVoucher[];
  bankTransactions: BankTransaction[];
  learnedPayWithVat?: boolean;
} {
  const tx = bankTransactions.find((row) => row.id === input.bankTransactionId);
  if (!tx) return { vouchers, bankTransactions };

  const amount = Math.round(Number(tx.withdrawal) || 0);
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

  if (!payWithVat && expectedAmount > 0 && inferPayWithVatFromAmount(amount, expectedAmount)) {
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
    input.useFifo !== false && amount !== expected
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
) {
  return bankTransactions.filter((tx) => {
    if (tx.withdrawal <= 0) return false;
    if (tx.linkedWorkerMonthlyPaymentVoucherId) return false;
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
