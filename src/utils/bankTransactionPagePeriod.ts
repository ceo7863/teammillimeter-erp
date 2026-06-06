import { monthRangeISO, quarterRangeISO, todayISO } from "@/utils/companyLedger";

export type BankTransactionPeriodKey =
  | "today"
  | "thisWeek"
  | "thisMonth"
  | "thisQuarter"
  | "thisYear"
  | "all"
  | "custom";

export type BankTransactionDateFilter = {
  startDate: string;
  endDate: string;
};

export function weekRangeISO(date = new Date()) {
  const cursor = new Date(date);
  const day = cursor.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  cursor.setDate(cursor.getDate() + mondayOffset);
  const startDate = cursor.toISOString().slice(0, 10);
  const end = new Date(cursor);
  end.setDate(end.getDate() + 6);
  return { startDate, endDate: end.toISOString().slice(0, 10) };
}

export function yearRangeISO(year = new Date().getFullYear()) {
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

export function resolveBankTransactionPeriod(
  periodKey: BankTransactionPeriodKey,
  dateFilter: BankTransactionDateFilter,
): BankTransactionDateFilter {
  if (periodKey === "today") {
    const today = todayISO();
    return { startDate: today, endDate: today };
  }
  if (periodKey === "thisWeek") return weekRangeISO();
  if (periodKey === "thisMonth") return monthRangeISO(0);
  if (periodKey === "thisQuarter") {
    const now = new Date();
    const quarter = (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
    return quarterRangeISO(quarter, now.getFullYear());
  }
  if (periodKey === "thisYear") return yearRangeISO();
  if (periodKey === "all") return { startDate: "", endDate: "" };
  return dateFilter;
}

export function formatBankPeriodRangeLabel(range: BankTransactionDateFilter) {
  const start = String(range.startDate || "").trim();
  const end = String(range.endDate || "").trim();
  if (!start && !end) return "?? ??";
  if (start && end && start === end) return start;
  if (start && end) return `${start} - ${end}`;
  return start || end;
}
