export const SALES_SHEET_ACTION_COLUMN_KEY = "__action__";
export const SALES_SHEET_COLUMN_WIDTH_STORAGE_KEY = "erp-sales-sheet-column-widths-v1";
export const SALES_SHEET_MIN_COLUMN_WIDTH = 36;
export const SALES_SHEET_MAX_COLUMN_WIDTH = 360;

export const DEFAULT_SALES_SHEET_COLUMN_WIDTHS: Record<string, number> = {
  voucherNo: 54,
  date: 76,
  client: 92,
  site: 108,
  quantity: 44,
  worker: 80,
  chargeAmount: 68,
  lineBill: 68,
  lineSpend: 68,
  lineMargin: 68,
  meal: 52,
  expense: 52,
  overtimeHours: 44,
  lodging: 52,
  memo: 112,
  sharedMemo: 112,
  officeMemo: 112,
  paymentDate: 76,
  paymentAmount: 68,
  saleAmount: 68,
  paid: 68,
  unpaid: 68,
  [SALES_SHEET_ACTION_COLUMN_KEY]: 44,
};

export function loadSalesSheetColumnWidths(): Record<string, number> {
  if (typeof window === "undefined") {
    return { ...DEFAULT_SALES_SHEET_COLUMN_WIDTHS };
  }
  try {
    const raw = window.localStorage.getItem(SALES_SHEET_COLUMN_WIDTH_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SALES_SHEET_COLUMN_WIDTHS };
    const parsed = JSON.parse(raw) as Record<string, number>;
    return { ...DEFAULT_SALES_SHEET_COLUMN_WIDTHS, ...parsed };
  } catch {
    return { ...DEFAULT_SALES_SHEET_COLUMN_WIDTHS };
  }
}

export function saveSalesSheetColumnWidths(widths: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SALES_SHEET_COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // ignore quota / private mode
  }
}

export function clampSalesSheetColumnWidth(value: number) {
  return Math.max(SALES_SHEET_MIN_COLUMN_WIDTH, Math.min(SALES_SHEET_MAX_COLUMN_WIDTH, Math.round(value)));
}

export function resolveSalesSheetColumnWidth(
  widths: Record<string, number>,
  key: string,
) {
  return clampSalesSheetColumnWidth(widths[key] ?? DEFAULT_SALES_SHEET_COLUMN_WIDTHS[key] ?? 80);
}
