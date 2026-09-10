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
  vatIncluded: boolean;
  totalUnpaid: number;
  totalVat: number;
  totalFinal: number;
  vouchers: CalendarPaymentVoucherDraft[];
};

export type CalendarPaymentCancelPreview = {
  client: string;
  selectedDays: number;
  voucherCount: number;
  totalAmount: number;
  totalVat: number;
  totalFinal: number;
  vouchers: CalendarPaymentVoucherRecord[];
};

export type CalendarPaymentVoucherRecord = {
  id: number | string;
  salesId?: number | string;
  receiptId?: number | string;
  date?: string;
  client?: string;
  site?: string;
  amount?: number;
  vatAmount?: number;
  finalAmount?: number;
  vatType?: string;
  memo?: string;
  workerCount?: number;
  totalSalesAmount?: number;
  supplyAmount?: number;
};

function normalizeClientName(value: unknown) {
  return String(value || "").trim() || "(\uBBF8\uC9C0\uC815)";
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
  _vatIncluded = true
): CalendarPaymentPreview | null {
  const payableSales = collectCalendarPayableSales(sales, client, selectedDates);
  if (!payableSales.length) return null;

  // Phase 1 ledger policy: do not invent VAT at payment time.
  // Allocations use unpaid billed remaining (sale.amount - paid) only.
  const batchBase = Date.now();
  const vouchers = payableSales.map((sale, index) => {
    const amount = getUnpaid(sale);
    return {
      id: batchBase + index + (Number(sale.id) || 0),
      salesId: sale.id,
      date: paymentDate,
      client: sale.client,
      site: String(sale.site || sale.memo || "").trim(),
      workerCount: countWorkers(sale),
      totalSalesAmount: Number(sale.amount) || 0,
      amount,
      vatType: "excluded",
      supplyAmount: amount,
      vatAmount: 0,
      finalAmount: amount,
      memo: "거래처캘린더 입금처리",
    };
  });

  const totalUnpaid = vouchers.reduce((sum, voucher) => sum + voucher.amount, 0);
  return {
    client,
    selectedDays: selectedDates.length,
    saleCount: vouchers.length,
    vatIncluded: false,
    totalUnpaid,
    totalVat: 0,
    totalFinal: totalUnpaid,
    vouchers,
  };
}

export function collectCalendarCancellableVouchers(
  sales: CalendarPayableSale[],
  paymentVouchers: CalendarPaymentVoucherRecord[],
  client: string,
  selectedDates: string[]
) {
  const dateSet = new Set(selectedDates);
  const saleIds = new Set(
    sales
      .filter((sale) => {
        const date = String(sale.date || "").slice(0, 10);
        if (!dateSet.has(date)) return false;
        return matchesClientName(sale, client);
      })
      .map((sale) => String(sale.id))
      .filter(Boolean)
  );

  if (!saleIds.size) return [];

  return paymentVouchers.filter((voucher) => {
    if (voucher.salesId == null) return false;
    if (!saleIds.has(String(voucher.salesId))) return false;
    return matchesClientName({ client: voucher.client }, client);
  });
}

export function buildCalendarPaymentCancelPreview(
  sales: CalendarPayableSale[],
  paymentVouchers: CalendarPaymentVoucherRecord[],
  client: string,
  selectedDates: string[]
): CalendarPaymentCancelPreview | null {
  const vouchers = collectCalendarCancellableVouchers(sales, paymentVouchers, client, selectedDates);
  if (!vouchers.length) return null;

  return {
    client,
    selectedDays: selectedDates.length,
    voucherCount: vouchers.length,
    totalAmount: vouchers.reduce((sum, voucher) => sum + (Number(voucher.amount) || 0), 0),
    totalVat: vouchers.reduce((sum, voucher) => sum + (Number(voucher.vatAmount) || 0), 0),
    totalFinal: vouchers.reduce(
      (sum, voucher) => sum + (Number(voucher.finalAmount) || Number(voucher.amount) || 0),
      0
    ),
    vouchers,
  };
}
