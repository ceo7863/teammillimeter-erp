import { addDaysISO, todayISO } from "@/utils/receivables";

/** Korean public holidays (substitute, temporary, election). Extend per year. */
const KR_PUBLIC_HOLIDAYS = new Set<string>([
  // 2024
  "2024-01-01",
  "2024-02-09", "2024-02-10", "2024-02-11", "2024-02-12",
  "2024-03-01",
  "2024-04-10",
  "2024-05-05", "2024-05-06", "2024-05-15",
  "2024-06-06",
  "2024-08-15",
  "2024-09-16", "2024-09-17", "2024-09-18",
  "2024-10-03",
  "2024-10-09",
  "2024-12-25",
  // 2025
  "2025-01-01",
  "2025-01-27", "2025-01-28", "2025-01-29", "2025-01-30",
  "2025-03-01", "2025-03-03",
  "2025-05-05", "2025-05-06",
  "2025-06-06",
  "2025-08-15",
  "2025-10-03", "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-08",
  "2025-10-09",
  "2025-12-25",
  // 2026
  "2026-01-01",
  "2026-02-16", "2026-02-17", "2026-02-18",
  "2026-03-01", "2026-03-02",
  "2026-05-01",
  "2026-05-05",
  "2026-05-24", "2026-05-25",
  "2026-06-03",
  "2026-06-06",
  "2026-08-15", "2026-08-17",
  "2026-09-24", "2026-09-25", "2026-09-26",
  "2026-10-03", "2026-10-05",
  "2026-10-09",
  "2026-12-25",
  // 2027
  "2027-01-01",
  "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09",
  "2027-03-01",
  "2027-05-05", "2027-05-13", "2027-05-14",
  "2027-06-06",
  "2027-08-15", "2027-08-16",
  "2027-09-14", "2027-09-15", "2027-09-16", "2027-09-17",
  "2027-10-03", "2027-10-04",
  "2027-10-09", "2027-10-11",
  "2027-12-25",
  "2027-12-27",
]);

function dayOfWeekISO(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!match) return -1;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getDay();
}

export function isWeekendISO(dateStr: string) {
  const day = dayOfWeekISO(dateStr);
  return day === 0 || day === 6;
}

export function isKoreanPublicHolidayISO(dateStr: string) {
  return KR_PUBLIC_HOLIDAYS.has(String(dateStr || "").trim());
}

export function isBusinessDayISO(dateStr: string) {
  const normalized = String(dateStr || "").trim();
  if (!normalized) return false;
  return !isWeekendISO(normalized) && !isKoreanPublicHolidayISO(normalized);
}

/** Previous business day before fromDate (default today). Skips weekends and public holidays. */
export function previousBusinessDayISO(fromDate = todayISO()) {
  let cursor = addDaysISO(fromDate, -1);
  let guard = 0;
  while (cursor && !isBusinessDayISO(cursor) && guard < 366) {
    cursor = addDaysISO(cursor, -1);
    guard += 1;
  }
  return cursor || addDaysISO(fromDate, -1);
}

/** Default sales registration date: previous business day. */
export function defaultSalesRegistrationDate(fromDate = todayISO()) {
  return previousBusinessDayISO(fromDate);
}
