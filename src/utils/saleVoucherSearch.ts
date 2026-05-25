import { getSaleWorkerLines } from "./saleBilling";

export type SalesVoucherSearchFilters = {
  client: string;
  site: string;
  worker: string;
};

export type SalesVoucherDateFilter = {
  startDate: string;
  endDate: string;
};

type SaleVoucherSearchRow = {
  date?: string;
  client?: string;
  site?: string;
  worker?: string;
  workers?: { worker?: string }[];
};

function splitSearchTerms(query: string) {
  return String(query || "")
    .trim()
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);
}

function matchesTextQuery(haystack: string, query: string) {
  const terms = splitSearchTerms(query);
  if (!terms.length) return true;
  const text = String(haystack || "").toLowerCase();
  return terms.every((term) => text.includes(term));
}

function matchesWorkerQuery(row: SaleVoucherSearchRow, query: string) {
  const terms = splitSearchTerms(query);
  if (!terms.length) return true;

  const workerNames = getSaleWorkerLines(row)
    .map((line) => String(line.worker || "").trim().toLowerCase())
    .filter(Boolean);

  return terms.every((term) => workerNames.some((name) => name.includes(term)));
}

export function matchesSalesVoucherSearch(
  row: SaleVoucherSearchRow,
  filters: SalesVoucherSearchFilters,
  dateFilter: SalesVoucherDateFilter = { startDate: "", endDate: "" }
) {
  const rowDate = String(row.date || "");

  if (dateFilter.startDate && rowDate < dateFilter.startDate) return false;
  if (dateFilter.endDate && rowDate > dateFilter.endDate) return false;
  if (!matchesTextQuery(String(row.client || ""), filters.client)) return false;
  if (!matchesTextQuery(String(row.site || ""), filters.site)) return false;
  if (!matchesWorkerQuery(row, filters.worker)) return false;

  return true;
}

export function filterSalesVoucherRows<T extends SaleVoucherSearchRow>(
  sales: T[] = [],
  filters: SalesVoucherSearchFilters,
  dateFilter: SalesVoucherDateFilter = { startDate: "", endDate: "" }
) {
  return sales.filter((row) => matchesSalesVoucherSearch(row, filters, dateFilter));
}
