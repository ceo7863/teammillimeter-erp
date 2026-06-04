export type PaymentInputLog = {
  id: number | string;
  createdAt: string;
  paymentDate: string;
  client: string;
  site?: string;
  salesId?: number | string;
  supplyAmount: number;
  vatAmount: number;
  finalAmount: number;
  vatIncluded: boolean;
  savedBy?: string;
  paymentVoucherId?: number | string;
  depositChannel?: "cash" | "personal";
};

export type PaymentInputLogSummary = {
  id: string;
  createdAt: string;
  paymentDate: string;
  clientLabel: string;
  count: number;
  totalAmount: number;
  supplyAmount: number;
  vatAmount: number;
  vatIncluded: boolean;
  savedBy?: string;
  paymentVoucherIds: Array<number | string>;
};

type SavedVoucherLike = {
  id: number | string;
  salesId?: number | string;
  date?: string;
  client?: string;
  site?: string;
  amount?: number;
  vatType?: string;
  vatAmount?: number;
  finalAmount?: number;
  depositChannel?: "cash" | "personal";
};

export function createPaymentInputLogsFromVouchers(
  vouchers: SavedVoucherLike[],
  savedBy = "",
  batchId = Date.now()
): PaymentInputLog[] {
  const createdAt = new Date().toISOString();

  return vouchers.map((voucher, index) => {
    const vatIncluded = voucher.vatType !== "excluded";
    return {
      id: `${batchId}-${index}`,
      createdAt,
      paymentDate: voucher.date || "",
      client: voucher.client || "",
      site: voucher.site || "",
      salesId: voucher.salesId,
      supplyAmount: voucher.amount || 0,
      vatAmount: voucher.vatAmount || 0,
      finalAmount: voucher.finalAmount ?? voucher.amount ?? 0,
      vatIncluded,
      savedBy,
      paymentVoucherId: voucher.id,
      depositChannel: voucher.depositChannel === "cash" ? "cash" : "personal",
    };
  });
}

export function formatPaymentInputLogVatLabel(vatIncluded: boolean) {
  return vatIncluded ? "\uBD80\uAC00\uC138\uD3EC\uD568\uAE08\uC561" : "\uBCC4\uB3C4\uAE08\uC561";
}

export function formatPaymentInputLogRecord(summary: Pick<PaymentInputLogSummary, "count" | "vatIncluded" | "savedBy">) {
  const parts = [`${summary.count}\uAC74 \uC120\uD0DD \uC785\uAE08`, formatPaymentInputLogVatLabel(summary.vatIncluded)];
  if (summary.savedBy) parts.push(summary.savedBy);
  return parts.join(" \u00B7 ");
}

function formatPaymentDateLabel(dates: string[]) {
  const unique = [...new Set(dates.filter(Boolean))].sort();
  if (unique.length === 0) return "-";
  if (unique.length === 1) return unique[0];
  return `${unique[0]} ~ ${unique[unique.length - 1]}`;
}

function formatClientLabel(clients: string[]) {
  const unique = [...new Set(clients.filter(Boolean))];
  if (unique.length === 0) return "-";
  if (unique.length === 1) return unique[0];
  return `${unique.length}\uAC1C \uAC70\uB798\uCC98`;
}

export function summarizePaymentInputLogs(logs: PaymentInputLog[]): PaymentInputLogSummary[] {
  const groups = new Map<
    string,
    {
      createdAt: string;
      savedBy?: string;
      vatIncluded: boolean;
      dates: string[];
      clients: string[];
      totalAmount: number;
      supplyAmount: number;
      vatAmount: number;
      count: number;
      paymentVoucherIds: Array<number | string>;
    }
  >();

  logs.forEach((log) => {
    const key = `${log.createdAt}|${log.savedBy || ""}|${log.vatIncluded}`;
    const current = groups.get(key) || {
      createdAt: log.createdAt,
      savedBy: log.savedBy,
      vatIncluded: log.vatIncluded,
      dates: [],
      clients: [],
      totalAmount: 0,
      supplyAmount: 0,
      vatAmount: 0,
      count: 0,
      paymentVoucherIds: [],
    };

    current.dates.push(log.paymentDate || "");
    current.clients.push(log.client || "");
    current.supplyAmount += log.supplyAmount || 0;
    current.vatAmount += log.vatAmount || 0;
    current.totalAmount += log.finalAmount ?? log.supplyAmount ?? 0;
    current.count += 1;
    if (log.paymentVoucherId != null) current.paymentVoucherIds.push(log.paymentVoucherId);
    groups.set(key, current);
  });

  return [...groups.values()]
    .map((group) => ({
      id: `${group.createdAt}|${group.savedBy || ""}|${group.vatIncluded}`,
      createdAt: group.createdAt,
      paymentDate: formatPaymentDateLabel(group.dates),
      clientLabel: formatClientLabel(group.clients),
      count: group.count,
      totalAmount: Math.round(group.totalAmount),
      supplyAmount: Math.round(group.supplyAmount),
      vatAmount: Math.round(group.vatAmount),
      vatIncluded: group.vatIncluded,
      savedBy: group.savedBy,
      paymentVoucherIds: group.paymentVoucherIds,
    }))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}
