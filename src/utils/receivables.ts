import { computeSaleGrossReceivable, resolveSaleTaxTreatment, type TaxTreatment } from "./saleTaxTreatment";

export function parseMoney(value: unknown) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

/** 입력 필드용 숫자 문자열 (콤마 제외) */
export function sanitizeMoneyInput(value: unknown) {
  return String(value ?? "").replace(/[^0-9.-]/g, "");
}

/** 매출 등록 등 입력란 표시용 천단위 콤마 */
export function formatMoneyInput(value: unknown) {
  const cleaned = sanitizeMoneyInput(value);
  if (!cleaned) return "";
  if (cleaned === "-") return "-";

  const negative = cleaned.startsWith("-");
  const unsigned = cleaned.replace(/^-/, "");
  const dotIndex = unsigned.indexOf(".");
  const wholeRaw = dotIndex >= 0 ? unsigned.slice(0, dotIndex) : unsigned;
  const decimal = dotIndex >= 0 ? unsigned.slice(dotIndex + 1) : "";
  const whole = wholeRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const prefix = negative ? "-" : "";

  if (dotIndex >= 0) {
    return `${prefix}${whole}${decimal ? `.${decimal}` : "."}`;
  }
  return `${prefix}${whole}`;
}

export function formatKRW(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

const KOREA_TZ = "Asia/Seoul";

export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KOREA_TZ }).format(new Date());
}

export function monthStartISO() {
  return `${todayISO().slice(0, 7)}-01`;
}

export function addDaysISO(dateStr: string, days: number) {
  if (!dateStr) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!match) return dateStr;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  if (Number.isNaN(date.getTime())) return dateStr;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type ReceivableAmountLike = {
  salesAmount?: number;
  amount?: number;
  taxTreatment?: string | null;
  arBilledAmount?: number;
  outstandingAmount?: number;
  paidAmount?: number;
  paid?: number;
};

function finiteAmount(value: unknown) {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

/** Gross receivable: canonical AR overlay first, otherwise derived from supply + the sale's tax treatment. */
export function getBilledAmount(row: ReceivableAmountLike) {
  const arBilled = finiteAmount(row.arBilledAmount);
  if (arBilled != null) return arBilled;
  if (row.salesAmount) return row.salesAmount;
  return computeSaleGrossReceivable(row);
}

export function getUnpaid(row: ReceivableAmountLike) {
  const outstanding = finiteAmount(row.outstandingAmount);
  if (outstanding != null) return Math.max(outstanding, 0);
  return Math.max(getBilledAmount(row) - (row.paidAmount ?? row.paid ?? 0), 0);
}

export function getStatus(row: ReceivableAmountLike) {
  const unpaid = getUnpaid(row);
  const paid = row.paidAmount ?? row.paid ?? 0;
  if (unpaid <= 0) return "완료";
  if (paid > 0) return "일부수금";
  return "미수";
}

export const VAT_TYPE_OPTIONS = [
  { label: "포함", value: "included" },
  { label: "별도", value: "excluded" },
];

export const RECEIVABLE_STATUS_OPTIONS = ["전체", "미수", "일부수금", "완료"];

export type ReceivableRow = {
  id: number | string;
  client: string;
  businessNo?: string;
  manager?: string;
  phone?: string;
  date: string;
  voucherNo?: string;
  salesAmount: number;
  paidAmount: number;
  taxTreatment?: TaxTreatment;
  dueDate?: string;
  memo?: string;
  site?: string;
};

export function buildReceivableRowsFromSales(
  appliedSales: Array<Record<string, unknown>>,
  clientMaster: Array<{ name?: string; businessNo?: string; manager?: string; phone?: string }> = []
): ReceivableRow[] {
  const clientMap = Object.fromEntries(clientMaster.map((client) => [client.name, client]));

  return appliedSales.map((row) => {
    const master = clientMap[String(row.client)] || {};
    return {
      id: row.id as number | string,
      client: String(row.client || ""),
      businessNo: String(master.businessNo || ""),
      manager: String(master.manager || ""),
      phone: String(master.phone || ""),
      date: String(row.date || ""),
      voucherNo: String(row.voucherNo || row.id || ""),
      salesAmount: getBilledAmount(row as ReceivableAmountLike),
      paidAmount: Number(row.paid) || 0,
      taxTreatment: resolveSaleTaxTreatment(row as { taxTreatment?: string | null }),
      dueDate: addDaysISO(String(row.date || ""), 22),
      memo: String(row.memo || row.site || ""),
      site: String(row.site || ""),
    };
  });
}
