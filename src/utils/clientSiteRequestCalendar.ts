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

export function shiftCalendarDate(date: string, deltaDays: number) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setDate(parsed.getDate() + deltaDays);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

export function formatClientSiteRequestDayLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const weekday = ["\uC77C", "\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08", "\uD1A0"][parsed.getDay()];
  return `${parsed.getMonth() + 1}\uC6D4 ${parsed.getDate()}\uC77C (${weekday})`;
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

/** SC 일정이 있는 날짜의 ERP 접수는 캘린더에서 숨김 (SC 확정 일정만 표시). */
export function shouldHideClientSiteRequestOnCalendarDate(
  request: Pick<ClientSiteRequest, "workDate" | "workDateEnd">,
  date: string,
  scSchedulesOnDate: ScSchedule[],
) {
  if (!scSchedulesOnDate.length) return false;
  return requestCoversWorkDate(request, date);
}

export function filterClientSiteRequestsForCalendarDay(
  requests: ClientSiteRequest[],
  date: string,
  scSchedulesOnDate: ScSchedule[],
) {
  if (!scSchedulesOnDate.length) return requests;
  return requests.filter((request) => !shouldHideClientSiteRequestOnCalendarDate(request, date, scSchedulesOnDate));
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
    const scOnDate = scByDate.get(date) || [];
    const dayRequests = filterClientSiteRequestsForCalendarDay(
      byDate.get(date) ||
        requests
          .filter((request) => requestCoversWorkDate(request, date))
          .sort((a, b) => String(a.submittedAt || "").localeCompare(String(b.submittedAt || ""))),
      date,
      scOnDate,
    );
    cells.push({
      date,
      day,
      requests: dayRequests,
      scSchedules: scOnDate,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function countClientSiteRequestsInMonth(
  monthKey: string,
  requests: ClientSiteRequest[],
  scSchedules: ScSchedule[] = [],
) {
  const seen = new Set<string>();
  for (const cell of buildClientSiteRequestCalendarCells(monthKey, requests, scSchedules)) {
    if (!cell) continue;
    for (const request of cell.requests) {
      seen.add(request.id);
    }
  }
  return seen.size;
}

export function countScSchedulesInMonth(monthKey: string, schedules: ScSchedule[]) {
  return schedules.filter((row) => String(row.workDate || "").slice(0, 7) === monthKey).length;
}
