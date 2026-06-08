import { monthRangeISO, quarterRangeISO, todayISO } from "@/utils/companyLedger";
import { addDaysISO } from "@/utils/receivables";

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

function dayOfWeekFromISO(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!match) return 0;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDay();
}

export function weekRangeISO(anchorISO = todayISO()) {
  const day = dayOfWeekFromISO(anchorISO);
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const startDate = addDaysISO(anchorISO, mondayOffset);
  const endDate = addDaysISO(startDate, 6);
  return { startDate, endDate };
}

export function yearRangeISO(year = Number(todayISO().slice(0, 4))) {
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
    const today = todayISO();
    const month = Number(today.slice(5, 7));
    const quarter = (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
    return quarterRangeISO(quarter, Number(today.slice(0, 4)));
  }
  if (periodKey === "thisYear") return yearRangeISO();
  if (periodKey === "all") return { startDate: "", endDate: "" };
  return dateFilter;
}

export function formatBankPeriodRangeLabel(range: BankTransactionDateFilter) {
  const start = String(range.startDate || "").trim();
  const end = String(range.endDate || "").trim();
  if (!start && !end) return "\uC804\uCCB4 \uAE30\uAC04";
  if (start && end && start === end) return start;
  if (start && end) return `${start} - ${end}`;
  return start || end;
}
