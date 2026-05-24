import {
  calculateWorkerLineMetrics,
  resolveWorkerFeeRate,
  type WorkerLineLike,
} from "./workerLineMetrics";
import { getSaleTotalBill } from "./saleBilling";

export type PivotRow = {
  key: string;
  label: string;
  staffCount: number;
  bill: number;
  spend: number;
  margin: number;
  paid: number;
  voucherCount: number;
  avgPaid: number;
  paidVat: number;
  totalPaid: number;
};

export type PivotTotals = {
  staffCount: number;
  bill: number;
  spend: number;
  margin: number;
  paid: number;
  voucherCount: number;
  avgPaid: number;
  paidVat: number;
  totalPaid: number;
};

export type PivotReport = {
  rows: PivotRow[];
  totals: PivotTotals;
};

export type PeriodPivotRow = {
  key: string;
  label: string;
  staffCount: number;
  bill: number;
  spend: number;
  margin: number;
  paid: number;
  voucherCount: number;
};

export type PeriodPivotReport = {
  rows: PeriodPivotRow[];
  totals: PivotTotals;
};

export type AnalysisStaffRow = {
  key: string;
  label: string;
  staffCount: number;
};

export type AnalysisReport = {
  clients: PivotRow[];
  workers: PivotRow[];
  workerStaff: AnalysisStaffRow[];
  totals: {
    client: PivotTotals;
    worker: PivotTotals;
    staffCount: number;
  };
};

export type DateRangeFilter = {
  startDate?: string;
  endDate?: string;
};

export type PaymentVoucherRecord = {
  client?: string;
  date?: string;
  amount?: number;
  vatAmount?: number;
  salesId?: number;
};

export type PivotContext = {
  workerFeeRates?: Map<string, number>;
  paymentVouchers?: PaymentVoucherRecord[];
};

type SaleWorkerLine = WorkerLineLike & {
  feeRate?: string | number;
};

type SaleRecord = {
  id?: number;
  client?: string;
  amount?: number;
  paid?: number;
  date?: string;
  worker?: string;
  workers?: SaleWorkerLine[];
};

function lineMetrics(line: SaleWorkerLine, feeMap?: Map<string, number>) {
  return calculateWorkerLineMetrics(line, resolveWorkerFeeRate(line, feeMap));
}

function getSaleWorkerLines(sale: SaleRecord) {
  if (sale.workers?.length) {
    return sale.workers.filter((line) => String(line.worker || "").trim());
  }

  const names = String(sale.worker || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  if (!names.length) return [];

  const perWorkerBill = (sale.amount || 0) / names.length;
  return names.map((worker) => ({
    worker,
    quantity: "1",
    chargeAmount: String(Math.round(perWorkerBill)),
  }));
}

export function filterSalesByDate<T extends { date?: string }>(sales: T[], filter: DateRangeFilter = {}) {
  return sales.filter((sale) => {
    const startMatch = filter.startDate ? String(sale.date || "") >= filter.startDate : true;
    const endMatch = filter.endDate ? String(sale.date || "") <= filter.endDate : true;
    return startMatch && endMatch;
  });
}

type ClientPaymentSums = { paid: number; vat: number };

/** 피벗 기간에 포함된 매출 전표에 연결된 입금·부가세만 거래처별 합산 */
function sumPaymentVouchersByClientForSales(vouchers: PaymentVoucherRecord[] = [], filteredSales: SaleRecord[] = []) {
  const saleIds = new Set(filteredSales.map((sale) => sale.id));
  const clientsInScope = new Set(
    filteredSales.map((sale) => String(sale.client || "").trim() || "(미지정)")
  );
  const grouped = new Map<string, ClientPaymentSums>();

  vouchers.forEach((voucher) => {
    const client = String(voucher.client || "").trim() || "(미지정)";
    if (!clientsInScope.has(client)) return;
    if (voucher.salesId != null && !saleIds.has(voucher.salesId)) return;

    const current = grouped.get(client) || { paid: 0, vat: 0 };
    current.paid += Number(voucher.amount) || 0;
    current.vat += Number(voucher.vatAmount) || 0;
    grouped.set(client, current);
  });

  return grouped;
}

function createBucket(label: string) {
  return {
    key: label,
    label,
    staffCount: 0,
    bill: 0,
    spend: 0,
    margin: 0,
    paid: 0,
    voucherCount: 0,
    avgPaid: 0,
    paidVat: 0,
    totalPaid: 0,
  };
}

function finalizeRows(rows: PivotRow[]) {
  return rows
    .map((row) => ({
      ...row,
      avgPaid: row.voucherCount ? row.paid / row.voucherCount : 0,
    }))
    .sort((a, b) => b.bill - a.bill || a.label.localeCompare(b.label, "ko-KR"));
}

function sumTotals(rows: PivotRow[]): PivotTotals {
  const totals = rows.reduce(
    (acc, row) => {
      acc.staffCount += row.staffCount;
      acc.bill += row.bill;
      acc.spend += row.spend;
      acc.margin += row.margin;
      acc.paid += row.paid;
      acc.voucherCount += row.voucherCount;
      acc.paidVat += row.paidVat || 0;
      acc.totalPaid += row.totalPaid || 0;
      return acc;
    },
    { staffCount: 0, bill: 0, spend: 0, margin: 0, paid: 0, voucherCount: 0, avgPaid: 0, paidVat: 0, totalPaid: 0 }
  );

  totals.avgPaid = totals.voucherCount ? totals.paid / totals.voucherCount : 0;
  return totals;
}

function sumPeriodTotals(rows: PeriodPivotRow[]): PivotTotals {
  const totals = rows.reduce(
    (acc, row) => {
      acc.staffCount += row.staffCount;
      acc.bill += row.bill;
      acc.spend += row.spend;
      acc.margin += row.margin;
      acc.paid += row.paid;
      acc.voucherCount += row.voucherCount;
      acc.paidVat += row.paidVat || 0;
      acc.totalPaid += row.totalPaid || 0;
      return acc;
    },
    { staffCount: 0, bill: 0, spend: 0, margin: 0, paid: 0, voucherCount: 0, avgPaid: 0, paidVat: 0, totalPaid: 0 }
  );

  totals.avgPaid = totals.voucherCount ? totals.paid / totals.voucherCount : 0;
  return totals;
}

function addLineMetricsToBucket(
  bucket: { staffCount: number; bill: number; spend: number; margin: number },
  line: SaleWorkerLine,
  feeMap?: Map<string, number>
) {
  const metrics = lineMetrics(line, feeMap);
  bucket.staffCount += metrics.staffCount;
  bucket.bill += metrics.bill;
  bucket.spend += metrics.spend;
  bucket.margin += metrics.margin;
}

function aggregateSaleIntoBucket(bucket: PivotRow, sale: SaleRecord, feeMap?: Map<string, number>) {
  bucket.voucherCount += 1;
  bucket.paid += sale.paid || 0;

  const lines = getSaleWorkerLines(sale);
  if (lines.length) {
    lines.forEach((line) => addLineMetricsToBucket(bucket, line, feeMap));
    return;
  }

  bucket.bill += getSaleTotalBill(sale);
}

function formatMonthLabel(monthKey: string) {
  const [yearText, monthText] = monthKey.split("-");
  return `${yearText}년 ${Number(monthText)}월`;
}

function formatQuarterLabel(quarterKey: string) {
  const [yearText, quarterText] = quarterKey.split("-Q");
  return `${yearText}년 ${quarterText}분기`;
}

function getMonthKey(date?: string) {
  return String(date || "").slice(0, 7);
}

function getQuarterKey(date?: string) {
  const monthKey = getMonthKey(date);
  if (monthKey.length !== 7) return "";
  const [yearText, monthText] = monthKey.split("-");
  const quarter = Math.ceil(Number(monthText) / 3);
  return `${yearText}-Q${quarter}`;
}

function buildPeriodPivotReport(
  sales: SaleRecord[],
  filter: DateRangeFilter,
  groupKey: (date?: string) => string,
  formatLabel: (key: string) => string,
  context: PivotContext = {}
): PeriodPivotReport {
  const feeMap = context.workerFeeRates;
  const filtered = filterSalesByDate(sales, filter);
  const grouped = new Map<string, PeriodPivotRow>();

  filtered.forEach((sale) => {
    const key = groupKey(sale.date);
    if (!key) return;

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label: formatLabel(key),
        staffCount: 0,
        bill: 0,
        spend: 0,
        margin: 0,
        paid: 0,
        voucherCount: 0,
      });
    }

    const bucket = grouped.get(key)!;
    bucket.paid += sale.paid || 0;
    bucket.voucherCount += 1;

    const lines = getSaleWorkerLines(sale);
    if (lines.length) {
      lines.forEach((line) => addLineMetricsToBucket(bucket, line, feeMap));
    } else {
      bucket.bill += getSaleTotalBill(sale);
    }
  });

  const rows = Array.from(grouped.values()).sort((a, b) => a.key.localeCompare(b.key));

  return { rows, totals: sumPeriodTotals(rows) };
}

export function buildClientPivotReport(sales: SaleRecord[], filter: DateRangeFilter = {}, context: PivotContext = {}): PivotReport {
  const feeMap = context.workerFeeRates;
  const filtered = filterSalesByDate(sales, filter);
  const grouped = new Map<string, PivotRow>();
  const paymentSumsByClient = sumPaymentVouchersByClientForSales(context.paymentVouchers, filtered);

  filtered.forEach((sale) => {
    const client = String(sale.client || "").trim() || "(미지정)";
    if (!grouped.has(client)) grouped.set(client, createBucket(client));

    aggregateSaleIntoBucket(grouped.get(client)!, sale, feeMap);
  });

  const rows = finalizeRows(Array.from(grouped.values())).map((row) => {
    const paymentSums = paymentSumsByClient.get(row.key) || { paid: 0, vat: 0 };
    return {
      ...row,
      avgPaid: paymentSums.paid,
      paidVat: paymentSums.vat,
      totalPaid: paymentSums.paid + paymentSums.vat,
    };
  });

  const totals = sumTotals(rows);
  totals.avgPaid = Array.from(paymentSumsByClient.values()).reduce((sum, item) => sum + item.paid, 0);
  totals.paidVat = Array.from(paymentSumsByClient.values()).reduce((sum, item) => sum + item.vat, 0);
  totals.totalPaid = totals.avgPaid + totals.paidVat;

  return { rows, totals };
}

export function buildWorkerPivotReport(sales: SaleRecord[], filter: DateRangeFilter = {}, context: PivotContext = {}): PivotReport {
  const feeMap = context.workerFeeRates;
  const filtered = filterSalesByDate(sales, filter);
  const grouped = new Map<string, PivotRow>();

  filtered.forEach((sale) => {
    getSaleWorkerLines(sale).forEach((line) => {
      const worker = String(line.worker || "").trim();
      if (!worker) return;

      if (!grouped.has(worker)) grouped.set(worker, createBucket(worker));
      addLineMetricsToBucket(grouped.get(worker)!, line, feeMap);
      grouped.get(worker)!.voucherCount += 1;
    });
  });

  const rows = finalizeRows(Array.from(grouped.values()));
  return { rows, totals: sumTotals(rows) };
}

export function buildMonthlyPivotReport(sales: SaleRecord[], filter: DateRangeFilter = {}, context: PivotContext = {}): PeriodPivotReport {
  return buildPeriodPivotReport(sales, filter, getMonthKey, formatMonthLabel, context);
}

export function buildQuarterlyPivotReport(sales: SaleRecord[], filter: DateRangeFilter = {}, context: PivotContext = {}): PeriodPivotReport {
  return buildPeriodPivotReport(sales, filter, getQuarterKey, formatQuarterLabel, context);
}

export function buildAnalysisReport(sales: SaleRecord[], filter: DateRangeFilter = {}, context: PivotContext = {}): AnalysisReport {
  const clientReport = buildClientPivotReport(sales, filter, context);
  const workerReport = buildWorkerPivotReport(sales, filter, context);

  const workerStaff = workerReport.rows
    .map((row) => ({
      key: row.key,
      label: row.label,
      staffCount: row.staffCount,
    }))
    .sort((a, b) => b.staffCount - a.staffCount || a.label.localeCompare(b.label, "ko-KR"));

  return {
    clients: clientReport.rows,
    workers: workerReport.rows,
    workerStaff,
    totals: {
      client: clientReport.totals,
      worker: workerReport.totals,
      staffCount: workerReport.totals.staffCount,
    },
  };
}
