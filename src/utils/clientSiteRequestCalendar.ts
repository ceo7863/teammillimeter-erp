import type { ClientSiteRequest } from "@/utils/clientSiteRequests";

export type ClientSiteRequestCalendarCell = {
  date: string;
  day: number;
  requests: ClientSiteRequest[];
};

const WEEKDAY_LABELS = ["\uC77C", "\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08", "\uD1A0"];

export function getClientSiteRequestWeekdayLabels() {
  return WEEKDAY_LABELS;
}

export function formatClientSiteRequestMonthLabel(monthKey: string) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  return `${year}\uB144 ${month}\uC6D4`;
}

export function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonthKey(monthKey: string, delta: number) {
  const [yearText, monthText] = monthKey.split("-");
  const date = new Date(Number(yearText), Number(monthText) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function groupClientSiteRequestsByDate(requests: ClientSiteRequest[]) {
  const map = new Map<string, ClientSiteRequest[]>();
  for (const request of requests) {
    const date = String(request.workDate || "").trim();
    if (!date) continue;
    const current = map.get(date) || [];
    current.push(request);
    map.set(date, current);
  }
  for (const [date, rows] of map.entries()) {
    rows.sort((a, b) => String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")));
    map.set(date, rows);
  }
  return map;
}

export function buildClientSiteRequestCalendarCells(
  monthKey: string,
  requests: ClientSiteRequest[],
): Array<ClientSiteRequestCalendarCell | null> {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return [];

  const byDate = groupClientSiteRequestsByDate(requests);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startOffset = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const cells: Array<ClientSiteRequestCalendarCell | null> = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    cells.push({ date, day, requests: byDate.get(date) || [] });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function countClientSiteRequestsInMonth(monthKey: string, requests: ClientSiteRequest[]) {
  return requests.filter((row) => String(row.workDate || "").startsWith(`${monthKey}-`)).length;
}
