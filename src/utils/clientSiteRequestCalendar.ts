import type { ClientSiteRequest } from "@/utils/clientSiteRequests";
import { getClientSiteRequestWorkDateEnd, requestCoversWorkDate } from "@/utils/clientSiteRequests";
import type { ScSchedule } from "@/utils/scSchedules";

export type ClientSiteRequestCalendarCell = {
  date: string;
  day: number;
  requests: ClientSiteRequest[];
  scSchedules: ScSchedule[];
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
    const start = String(request.workDate || "").trim();
    if (!start) continue;
    const end = getClientSiteRequestWorkDateEnd(request);
    let cursor = start;
    while (cursor <= end) {
      const current = map.get(cursor) || [];
      current.push(request);
      map.set(cursor, current);
      const next = new Date(`${cursor}T12:00:00`);
      next.setDate(next.getDate() + 1);
      cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    }
  }
  for (const [date, rows] of map.entries()) {
    rows.sort((a, b) => String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")));
    map.set(date, rows);
  }
  return map;
}

export function groupScSchedulesByDate(schedules: ScSchedule[]) {
  const map = new Map<string, ScSchedule[]>();
  for (const row of schedules) {
    const date = String(row.workDate || "").slice(0, 10);
    if (!date) continue;
    const current = map.get(date) || [];
    current.push(row);
    map.set(date, current);
  }
  for (const [date, rows] of map.entries()) {
    rows.sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));
    map.set(date, rows);
  }
  return map;
}

export function buildClientSiteRequestCalendarCells(
  monthKey: string,
  requests: ClientSiteRequest[],
  scSchedules: ScSchedule[] = [],
): Array<ClientSiteRequestCalendarCell | null> {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return [];

  const byDate = groupClientSiteRequestsByDate(requests);
  const scByDate = groupScSchedulesByDate(scSchedules);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startOffset = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const cells: Array<ClientSiteRequestCalendarCell | null> = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    const dayRequests =
      byDate.get(date) ||
      requests
        .filter((request) => requestCoversWorkDate(request, date))
        .sort((a, b) => String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")));
    cells.push({
      date,
      day,
      requests: dayRequests,
      scSchedules: scByDate.get(date) || [],
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function countClientSiteRequestsInMonth(monthKey: string, requests: ClientSiteRequest[]) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 0;
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  return requests.filter((row) => {
    const start = String(row.workDate || "").trim();
    if (!start) return false;
    const end = getClientSiteRequestWorkDateEnd(row);
    return start <= monthEnd && end >= monthStart;
  }).length;
}

export function countScSchedulesInMonth(monthKey: string, schedules: ScSchedule[]) {
  return schedules.filter((row) => String(row.workDate || "").slice(0, 7) === monthKey).length;
}
