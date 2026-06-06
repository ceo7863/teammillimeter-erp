import { monthStartISO } from "./receivables";
import {
  findWorkerMasterByListName,
  normalizeWorkerName,
  resolveWorkerListName,
  type WorkerMasterLike,
  type WorkerPaymentDetailRow,
} from "./workerPayments";

/** 시공내역서 기본 표시 월(이번 달) */
export function currentStatementMonthKey() {
  return monthStartISO().slice(0, 7);
}

export type WorkerMonthlyPaymentRecord = {
  key: string;
  worker: string;
  monthKey: string;
  paid: boolean;
  paidAt?: string;
  paidBy?: string;
  memo?: string;
  /** 실지급(netPay)에 부가세 10%를 더해 지급할지 여부 */
  payWithVat?: boolean;
};

export const WORKER_PAYMENT_VAT_RATE = 0.1;

export function calculateWorkerPaymentVat(netPay: number, payWithVat?: boolean) {
  if (!payWithVat || netPay <= 0) {
    return { vatAmount: 0, finalPayAmount: netPay };
  }
  const vatAmount = Math.round(netPay * WORKER_PAYMENT_VAT_RATE);
  return { vatAmount, finalPayAmount: netPay + vatAmount };
}

export type WorkerMonthSummary = {
  monthKey: string;
  label: string;
  workerCount: number;
  lineCount: number;
  grossPay: number;
  netPay: number;
  totalBill: number;
  totalMargin: number;
  paidWorkerCount: number;
};

export type WorkerMonthlyWorkerRow = {
  worker: string;
  monthKey: string;
  lineCount: number;
  headcount: number;
  grossPay: number;
  fee: number;
  netPay: number;
  bank?: string;
  account?: string;
  phone?: string;
  feeRate: number;
};

export function makeWorkerMonthKey(worker: string, monthKey: string) {
  return `${monthKey}::${String(worker || "").trim()}`;
}

export function formatMonthLabel(monthKey: string, periodLabel?: string) {
  if (periodLabel) return periodLabel;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(monthKey || ""))) {
    return `실지급 ${String(monthKey).replace(/-/g, ".")}`;
  }
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) return monthKey || "-";
  return `${match[1]}\uB144 ${Number(match[2])}\uC6D4`;
}

export function normalizePaidDate(value?: string) {
  if (!value) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value).trim());
  return match ? match[1] : "";
}

export function shiftMonthKey(monthKey: string, offset = 0) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) return monthKey;
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function collectMonthKeys(rows: WorkerPaymentDetailRow[] = []) {
  const keys = new Set<string>();
  for (const row of rows) {
    const monthKey = String(row.date || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(monthKey)) keys.add(monthKey);
  }
  return [...keys].sort((a, b) => b.localeCompare(a));
}

function aggregateWorkerMonthTotals(rows: WorkerPaymentDetailRow[] = []) {
  const grouped = new Map<
    string,
    { lineCount: number; headcount: number; grossPay: number; fee: number; totalBill: number; totalMargin: number }
  >();

  for (const row of rows) {
    if (!row.worker) continue;
    const monthKey = String(row.date || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
    const key = makeWorkerMonthKey(row.worker, monthKey);
    const current = grouped.get(key) || { lineCount: 0, headcount: 0, grossPay: 0, fee: 0, totalBill: 0, totalMargin: 0 };
    current.lineCount += 1;
    current.headcount += row.quantity || 0;
    current.grossPay += row.totalPay || 0;
    current.fee += row.fee || 0;
    current.totalBill += row.bill || 0;
    current.totalMargin += row.margin || 0;
    grouped.set(key, current);
  }

  return grouped;
}

export function buildWorkerMonthlyWorkerRows(
  rows: WorkerPaymentDetailRow[] = [],
  monthKey: string,
  workersMaster: WorkerMasterLike[] = [],
): WorkerMonthlyWorkerRow[] {
  return buildWorkerMonthlyWorkerRowsForRange(rows, monthKey, workersMaster);
}

export function buildWorkerMonthlyWorkerRowsForRange(
  rows: WorkerPaymentDetailRow[] = [],
  monthKey: string,
  workersMaster: WorkerMasterLike[] = [],
  range?: { start: string; end: string },
): WorkerMonthlyWorkerRow[] {
  const canonicalRows = rows.map((row) => ({
    ...row,
    worker: resolveWorkerListName(workersMaster, row.worker) || normalizeWorkerName(row.worker),
  }));
  const filteredRows = range
    ? canonicalRows.filter((row) => {
        const date = String(row.date || "").slice(0, 10);
        if (!date) return false;
        if (range.start && date < range.start) return false;
        if (range.end && date > range.end) return false;
        return true;
      })
    : canonicalRows.filter((row) => String(row.date || "").slice(0, 7) === monthKey);

  const grouped = aggregateWorkerMonthTotals(filteredRows);

  return [...grouped.entries()]
    .map(([key, totals]) => {
      const worker = key.split("::")[1] || "";
      const master = findWorkerMasterByListName(workersMaster, worker) || {};
      const feeRate = master.feeRate ?? 0;
      const grossPay = totals.grossPay;
      const fee = grossPay > 0 ? Math.round(grossPay * feeRate) : totals.fee;
      const netPay = grossPay - fee;
      return {
        worker,
        monthKey,
        lineCount: totals.lineCount,
        headcount: totals.headcount,
        grossPay,
        fee,
        netPay,
        bank: master.bank,
        account: master.account,
        phone: master.phone,
        feeRate,
      };
    })
    .filter((row) => row.netPay > 0 || row.grossPay > 0)
    .sort((a, b) => b.netPay - a.netPay || a.worker.localeCompare(b.worker, "ko"));
}

export function buildWorkerMonthSummaries(
  rows: WorkerPaymentDetailRow[] = [],
  records: WorkerMonthlyPaymentRecord[] = [],
): WorkerMonthSummary[] {
  const grouped = aggregateWorkerMonthTotals(rows);
  const recordMap = new Map(records.filter((record) => record.paid).map((record) => [record.key, record]));
  const byMonth = new Map<
    string,
    {
      workers: Set<string>;
      lineCount: number;
      grossPay: number;
      netPay: number;
      totalBill: number;
      totalMargin: number;
      paidWorkers: Set<string>;
    }
  >();

  for (const [key, totals] of grouped.entries()) {
    const monthKey = key.split("::")[0] || "";
    const worker = key.split("::")[1] || "";
    if (!monthKey) continue;
    const current = byMonth.get(monthKey) || {
      workers: new Set<string>(),
      lineCount: 0,
      grossPay: 0,
      netPay: 0,
      totalBill: 0,
      totalMargin: 0,
      paidWorkers: new Set<string>(),
    };
    current.workers.add(worker);
    current.lineCount += totals.lineCount;
    current.grossPay += totals.grossPay;
    current.netPay += totals.grossPay - totals.fee;
    current.totalBill += totals.totalBill;
    current.totalMargin += totals.totalMargin;
    if (recordMap.has(key)) current.paidWorkers.add(worker);
    byMonth.set(monthKey, current);
  }

  return [...byMonth.entries()]
    .map(([monthKey, totals]) => ({
      monthKey,
      label: formatMonthLabel(monthKey),
      workerCount: totals.workers.size,
      lineCount: totals.lineCount,
      grossPay: totals.grossPay,
      netPay: totals.netPay,
      totalBill: totals.totalBill,
      totalMargin: totals.totalMargin,
      paidWorkerCount: totals.paidWorkers.size,
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export function upsertWorkerPaymentRecord(
  records: WorkerMonthlyPaymentRecord[],
  patch: {
    worker: string;
    monthKey: string;
    paid: boolean;
    paidAt?: string;
    memo?: string;
    paidBy?: string;
    payWithVat?: boolean;
  },
): WorkerMonthlyPaymentRecord[] {
  const key = makeWorkerMonthKey(patch.worker, patch.monthKey);
  const existing = records.find((record) => record.key === key);
  const paidDate = patch.paid ? normalizePaidDate(patch.paidAt || existing?.paidAt) : "";
  const payWithVat = patch.paid ? Boolean(patch.payWithVat) : false;

  if (existing) {
    return records.map((record) =>
      record.key === key
        ? {
            ...record,
            paid: patch.paid,
            paidAt: patch.paid ? paidDate || normalizePaidDate(existing.paidAt) : undefined,
            paidBy: patch.paid ? record.paidBy || patch.paidBy : undefined,
            memo: patch.memo !== undefined ? patch.memo : record.memo,
            payWithVat,
          }
        : record,
    );
  }

  return [
    ...records,
    {
      key,
      worker: patch.worker,
      monthKey: patch.monthKey,
      paid: patch.paid,
      paidAt: patch.paid ? paidDate : undefined,
      paidBy: patch.paid ? patch.paidBy : undefined,
      memo: patch.memo || "",
      payWithVat,
    },
  ];
}

export function updateWorkerPaymentPaidDate(
  records: WorkerMonthlyPaymentRecord[],
  worker: string,
  monthKey: string,
  paidAt: string,
  paidBy?: string,
): WorkerMonthlyPaymentRecord[] {
  const normalized = normalizePaidDate(paidAt);
  if (!normalized) return records;
  return upsertWorkerPaymentRecord(records, {
    worker,
    monthKey,
    paid: true,
    paidAt: normalized,
    paidBy,
  });
}

export function updateWorkerPaymentMemo(
  records: WorkerMonthlyPaymentRecord[],
  worker: string,
  monthKey: string,
  memo: string,
): WorkerMonthlyPaymentRecord[] {
  const key = makeWorkerMonthKey(worker, monthKey);
  const existing = records.find((record) => record.key === key);
  if (existing) {
    return records.map((record) => (record.key === key ? { ...record, memo } : record));
  }
  return [
    ...records,
    {
      key,
      worker,
      monthKey,
      paid: false,
      memo,
    },
  ];
}

export function buildWorkerPaymentRecordMap(records: WorkerMonthlyPaymentRecord[] = []) {
  return new Map(records.map((record) => [record.key, record]));
}

export function formatPaidAt(value?: string) {
  if (!value) return "-";
  return value.slice(0, 10);
}
