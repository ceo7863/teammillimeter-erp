const STASH_KEY = "erp-statement-pending-draft";

export type StatementDraft = {
  statementType: "client";
  client: string;
  startDate: string;
  endDate: string;
  unpaidOnly: boolean;
  autoGenerate: boolean;
  /** Pivot unpaid voucher ids */
  saleIds: Array<string | number>;
  createdAt?: number;
  source?: "reports-pivot" | "client-calendar";
};

export function stashStatementDraft(draft: StatementDraft) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STASH_KEY, JSON.stringify(draft));
}

export function peekStatementDraft(): StatementDraft | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STASH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StatementDraft;
    if (parsed?.statementType !== "client" || !parsed.client) return null;
    return {
      ...parsed,
      saleIds: Array.isArray(parsed.saleIds) ? parsed.saleIds : [],
    };
  } catch {
    return null;
  }
}

export function clearStatementDraftStash() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STASH_KEY);
}

export function resolveSaleDateRange(sales: Array<{ date?: string }> = {}) {
  const dates = sales
    .map((sale) => String(sale.date || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  if (!dates.length) return { startDate: "", endDate: "" };
  return { startDate: dates[0], endDate: dates[dates.length - 1] };
}

export function createUnpaidClientStatementDraft(
  client: string,
  unpaidSales: Array<{ date?: string; id?: string | number }> = [],
  periodFilter: { startDate?: string; endDate?: string } = {}
): StatementDraft {
  const saleIds = unpaidSales
    .map((sale) => sale.id)
    .filter((id) => id != null && id !== "") as Array<string | number>;
  const unpaidDates = resolveSaleDateRange(unpaidSales);

  return {
    statementType: "client",
    client,
    startDate: unpaidDates.startDate || periodFilter.startDate || "",
    endDate: unpaidDates.endDate || periodFilter.endDate || "",
    unpaidOnly: true,
    autoGenerate: true,
    saleIds: saleIds.length === unpaidSales.length ? saleIds : [],
    createdAt: Date.now(),
    source: "reports-pivot",
  };
}

export function createClientCalendarStatementDraft(
  client: string,
  sales: Array<{ date?: string; id?: string | number }> = [],
  selectedDates: string[] = [],
): StatementDraft | null {
  if (!client || !selectedDates.length) return null;
  const dateSet = new Set(selectedDates.map((date) => String(date || "").trim()).filter(Boolean));
  const matchedSales = sales.filter((sale) => dateSet.has(String(sale.date || "").trim()));
  if (!matchedSales.length) return null;

  const saleIds = matchedSales
    .map((sale) => sale.id)
    .filter((id) => id != null && id !== "") as Array<string | number>;
  const dates = resolveSaleDateRange(matchedSales);

  return {
    statementType: "client",
    client,
    startDate: dates.startDate,
    endDate: dates.endDate,
    unpaidOnly: false,
    autoGenerate: true,
    saleIds: saleIds.length === matchedSales.length ? saleIds : [],
    createdAt: Date.now(),
    source: "client-calendar",
  };
}

export function saleMatchesDraftIds(row: { id?: string | number }, saleIds: Array<string | number>) {
  if (!saleIds.length) return false;
  const rowId = String(row.id ?? "");
  if (!rowId) return false;
  return saleIds.some((id) => String(id) === rowId);
}
