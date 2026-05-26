import { getUnpaid, parseMoney, todayISO } from "@/utils/receivables";

export type CalendarPayableSale = {
  id?: number | string;
  date?: string;
  client?: string;
  site?: string;
  memo?: string;
  amount?: number;
  paid?: number;
  workers?: unknown[];
  worker?: string;
};

export type CalendarPaymentVoucherDraft = {
  id: number | string;
  salesId?: number | string;
  date: string;
  client?: string;
  site?: string;
  workerCount: number;
  totalSalesAmount: number;
  amount: number;
  vatType: string;
  supplyAmount: number;
  vatAmount: number;
  finalAmount: number;
  memo: string;
};

export type CalendarPaymentPreview = {
  client: string;
  selectedDays: number;
  saleCount: number;
  totalUnpaid: number;
  vouchers: CalendarPaymentVoucherDraft[];
};

function normalizeClientName(value: unknown) {
  return String(value || "").trim() || "(???)";
}

function matchesClientName(row: CalendarPayableSale, clientName: string) {
  return normalizeClientName(row.client) === clientName;
}

function countWorkers(sale: CalendarPayableSale) {
  if (Array.isArray(sale.workers) && sale.workers.length) return sale.workers.length;
  return String(sale.worker || "").split(",").map((name) => name.trim()).filter(Boolean).length;
}

export function collectCalendarPayableSales(
  sales: CalendarPayableSale[],
  client: string,
  selectedDates: string[]
) {
  const dateSet = new Set(selectedDates);
  return sales.filter((sale) => {
    const date = String(sale.date || "").slice(0, 10);
    if (!dateSet.has(date)) return false;
    if (!matchesClientName(sale, client)) return false;
    return getUnpaid(sale) > 0;
  });
}

export function buildCalendarPaymentPreview(
  sales: CalendarPayableSale[],
  client: string,
  selectedDates: string[],
  paymentDate = todayISO(),
  vatIncluded = true
): CalendarPaymentPreview | null {
  const payableSales = collectCalendarPayableSales(sales, client, selectedDates);
  if (!payableSales.length) return null;

  const vatType = vatIncluded ? "included" : "excluded";
  const batchBase = Date.now();
  const vouchers = payableSales.map((sale, index) => {
    const amount = getUnpaid(sale);
    const vatAmount = vatType === "included" ? Math.round(amount * 0.1) : 0;
    return {
      id: batchBase + index + (Number(sale.id) || 0),
      salesId: sale.id,
      date: paymentDate,
      client: sale.client,
      site: String(sale.site || sale.memo || "").trim(),
      workerCount: countWorkers(sale),
      totalSalesAmount: Number(sale.amount) || 0,
      amount,
      vatType,
      supplyAmount: amount,
      vatAmount,
      finalAmount: amount + vatAmount,
      memo: "\uAC70\uB798\uCC98\uCE98\uB354 \uC785\uAE08\uCC98\uB9AC",
    };
  });

  return {
    client,
    selectedDays: selectedDates.length,
    saleCount: vouchers.length,
    totalUnpaid: vouchers.reduce((sum, voucher) => sum + voucher.amount, 0),
    vouchers,
  };
}
