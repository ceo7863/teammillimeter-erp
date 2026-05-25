import { buildWorkerFeeMap, calculateWorkerLineMetrics, resolveWorkerFeeRate } from "./workerLineMetrics";
import { getSaleTotalBill, getSaleWorkerLines } from "./saleBilling";

export type DashboardMonthRow = {
  monthKey: string;
  label: string;
  bill: number;
  margin: number;
  paid: number;
  vat: number;
  voucherCount: number;
};

export type DashboardAnnualReport = {
  year: number;
  months: DashboardMonthRow[];
  totals: {
    bill: number;
    margin: number;
    paid: number;
    vat: number;
    voucherCount: number;
  };
};

type SaleRecord = {
  id?: number | string;
  date?: string;
  amount?: number;
  paid?: number;
  worker?: string;
  workers?: { worker?: string; feeRate?: string | number; [key: string]: unknown }[];
};

type PaymentVoucherRecord = {
  salesId?: number | string;
  date?: string;
  amount?: number;
  vatAmount?: number;
};

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(month: number) {
  return `${month}\uC6D4`;
}

function createEmptyMonth(year: number, month: number): DashboardMonthRow {
  const key = monthKey(year, month);
  return { monthKey: key, label: monthLabel(month), bill: 0, margin: 0, paid: 0, vat: 0, voucherCount: 0 };
}

function addSaleMetrics(row: DashboardMonthRow, sale: SaleRecord, feeMap: Map<string, number>) {
  row.voucherCount += 1;
  const lines = getSaleWorkerLines(sale);
  if (lines.length) {
    for (const line of lines) {
      const metrics = calculateWorkerLineMetrics(line, resolveWorkerFeeRate(line, feeMap));
      row.bill += metrics.bill;
      row.margin += metrics.margin;
    }
    return;
  }
  row.bill += getSaleTotalBill(sale);
}

export function listDashboardYears(sales: SaleRecord[], fallbackYear = new Date().getFullYear()) {
  const years = new Set<number>();
  sales.forEach((sale) => {
    const year = Number(String(sale.date || "").slice(0, 4));
    if (year >= 2000 && year <= 2100) years.add(year);
  });
  if (!years.size) years.add(fallbackYear);
  return Array.from(years).sort((a, b) => b - a);
}

export function buildAnnualMonthlyDashboard(
  sales: SaleRecord[],
  paymentVouchers: PaymentVoucherRecord[] = [],
  year: number,
  workers: { name?: string; feeRate?: number }[] = []
): DashboardAnnualReport {
  const feeMap = buildWorkerFeeMap(workers);
  const months = Array.from({ length: 12 }, (_, index) => createEmptyMonth(year, index + 1));
  const monthByKey = new Map(months.map((row) => [row.monthKey, row]));

  const saleDateById = sales.reduce<Record<string, string>>((acc, sale) => {
    if (sale.id != null && sale.date) acc[String(sale.id)] = sale.date;
    return acc;
  }, {});

  sales.forEach((sale) => {
    const key = String(sale.date || "").slice(0, 7);
    const row = monthByKey.get(key);
    if (!row) return;
    addSaleMetrics(row, sale, feeMap);
  });

  paymentVouchers.forEach((voucher) => {
    const saleDate =
      (voucher.salesId != null ? saleDateById[String(voucher.salesId)] : "") || voucher.date || "";
    const key = saleDate.slice(0, 7);
    const row = monthByKey.get(key);
    if (!row) return;
    row.paid += Math.round(Number(voucher.amount) || 0);
    row.vat += Math.round(Number(voucher.vatAmount) || 0);
  });

  const totals = months.reduce(
    (acc, row) => {
      acc.bill += row.bill;
      acc.margin += row.margin;
      acc.paid += row.paid;
      acc.vat += row.vat;
      acc.voucherCount += row.voucherCount;
      return acc;
    },
    { bill: 0, margin: 0, paid: 0, vat: 0, voucherCount: 0 }
  );

  return { year, months, totals };
}
