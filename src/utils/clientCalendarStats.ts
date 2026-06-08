import { getUnpaid } from "@/utils/receivables";
import { aggregateSaleBilling, getSaleTotalBill, getSaleWorkerLines } from "@/utils/saleBilling";
import { formatWorkerNameSummary } from "@/utils/statementSheets";

export type ClientCalendarSaleLike = {
  id?: string | number;
  client?: string;
  date?: string;
  amount?: number;
  paid?: number;
  salesAmount?: number;
  paidAmount?: number;
  site?: string;
  memo?: string;
  worker?: string;
  workers?: Array<Record<string, unknown>>;
};

export type ClientCalendarDayVoucher = {
  site: string;
  amount: number;
  unpaid: number;
  hasUnpaid: boolean;
};

export type ClientCalendarDayTooltipVoucher = {
  site: string;
  totalAmount: number;
  workerSummary: string;
  mealCost: number;
  lodgingCost: number;
  expenseCost: number;
  overtimeCost: number;
};

export type ClientCalendarDayStats = {
  count: number;
  totalAmount: number;
  totalUnpaid: number;
  saleIds: Array<string | number>;
  vouchers: ClientCalendarDayVoucher[];
  tooltipVouchers: ClientCalendarDayTooltipVoucher[];
  hasUnpaid: boolean;
};

export type ClientCalendarDayHoverPreview = {
  date: string;
  stats: ClientCalendarDayStats;
  anchorX: number;
  anchorY: number;
};

export function normalizeClientCalendarName(value: unknown) {
  return String(value || "").trim() || "(미지정)";
}

export function getClientCalendarSaleAmount(row: ClientCalendarSaleLike) {
  return Number(row.salesAmount ?? row.amount ?? 0) || 0;
}

export function getClientCalendarSiteName(row: ClientCalendarSaleLike) {
  return String(row.site || row.memo || "").trim();
}

export function matchesClientCalendarName(row: ClientCalendarSaleLike, clientName: string) {
  return normalizeClientCalendarName(row.client) === clientName;
}

export function formatClientCalendarSelectedDateLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const weekday = ["?", "?", "?", "?", "?", "?", "?"][parsed.getDay()];
  const [, monthText, dayText] = date.split("-");
  return `${Number(monthText)}/${Number(dayText)} (${weekday})`;
}

export function buildClientCalendarMonthCells(monthKey: string, statsByDate: Record<string, ClientCalendarDayStats>) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startOffset = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const emptyStats = (): ClientCalendarDayStats => ({
    count: 0,
    totalAmount: 0,
    totalUnpaid: 0,
    saleIds: [],
    vouchers: [],
    tooltipVouchers: [],
    hasUnpaid: false,
  });

  const cells: Array<{ date: string; day: number; stats: ClientCalendarDayStats } | null> = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    cells.push({
      date,
      day,
      stats: statsByDate[date] || emptyStats(),
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return { cells, monthLabel: `${year}? ${month}?` };
}

export function buildClientCalendarStatsByDate(
  clientSales: ClientCalendarSaleLike[],
  monthKey: string,
): Record<string, ClientCalendarDayStats> {
  const acc: Record<string, ClientCalendarDayStats> = {};
  clientSales.forEach((sale) => {
    const date = String(sale.date || "").trim();
    if (!date.startsWith(monthKey)) return;
    if (!acc[date]) {
      acc[date] = {
        count: 0,
        totalAmount: 0,
        totalUnpaid: 0,
        saleIds: [],
        vouchers: [],
        tooltipVouchers: [],
        hasUnpaid: false,
      };
    }
    const amount = getClientCalendarSaleAmount(sale);
    const unpaid = getUnpaid(sale);
    const billing = aggregateSaleBilling(sale);
    const totalAmount = billing.totalConstructionCost || getSaleTotalBill(sale) || amount;
    const workerLines = getSaleWorkerLines(sale);
    acc[date].count += 1;
    if (sale.id != null && sale.id !== "") {
      acc[date].saleIds.push(sale.id);
    }
    acc[date].totalAmount += totalAmount;
    acc[date].totalUnpaid += unpaid;
    acc[date].vouchers.push({
      site: getClientCalendarSiteName(sale) || "현장명 없음",
      amount,
      unpaid,
      hasUnpaid: unpaid > 0,
    });
    acc[date].tooltipVouchers.push({
      site: getClientCalendarSiteName(sale) || "현장명 없음",
      totalAmount,
      workerSummary: formatWorkerNameSummary(workerLines),
      mealCost: billing.mealCost,
      lodgingCost: billing.lodgingCost,
      expenseCost: billing.expenseCost,
      overtimeCost: billing.overtimeCost,
    });
    if (unpaid > 0) acc[date].hasUnpaid = true;
  });
  return acc;
}

export function filterClientCalendarSales(sales: ClientCalendarSaleLike[], clientName: string) {
  if (!clientName) return [];
  return sales.filter((sale) => matchesClientCalendarName(sale, clientName));
}

export function buildClientMonthlySalesTotals(sales: ClientCalendarSaleLike[], monthKey: string) {
  const totals = new Map<string, number>();
  sales.forEach((sale) => {
    const date = String(sale.date || "").trim();
    if (!date.startsWith(monthKey)) return;
    const client = normalizeClientCalendarName(sale.client);
    const bill = getSaleTotalBill(sale) || getClientCalendarSaleAmount(sale);
    totals.set(client, (totals.get(client) || 0) + bill);
  });
  return totals;
}
