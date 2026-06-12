import { filterAttendanceRecords, type AttendanceRecord } from "@/utils/attendance";
import {
  recalculateOfficePayrollLine,
  roundPayAmount,
  type OfficePayrollLine,
  type OfficePayrollSettings,
} from "@/utils/officePayroll";
import type { OfficeStaffRecord } from "@/utils/officeStaff";

const KOREA_TZ = "Asia/Seoul";

export type OfficePayrollAttendanceSummary = {
  erpUserId: number;
  linkedBy: "erpUserId" | "name";
  periodStart: string;
  periodEnd: string;
  expectedWorkdays: number;
  presentDays: number;
  absentDays: number;
  lateCount: number;
  overtimeMinutes: number;
  totalWorkMinutes: number;
  partialMonth: boolean;
  appliedAt?: string;
};

export function parseTimeToMinutes(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || "").trim());
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

export function monthDateBounds(monthKey: string) {
  const [yearText, monthText] = String(monthKey || "").split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: KOREA_TZ }).format(new Date());
    return { start: `${today.slice(0, 7)}-01`, end: today };
  }
  const lastDay = new Date(year, month, 0).getDate();
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  return {
    start: `${monthPrefix}-01`,
    end: `${monthPrefix}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function listDatesBetween(start: string, end: string) {
  const dates: string[] = [];
  if (!start || !end || start > end) return dates;
  const cursor = new Date(`${start}T12:00:00+09:00`);
  const endDate = new Date(`${end}T12:00:00+09:00`);
  while (cursor <= endDate) {
    dates.push(new Intl.DateTimeFormat("en-CA", { timeZone: KOREA_TZ }).format(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function isWeekendDate(date: string) {
  const day = new Date(`${date}T12:00:00+09:00`).getDay();
  return day === 0 || day === 6;
}

export function countExpectedWorkdays(
  start: string,
  end: string,
  options?: { includeWeekends?: boolean },
) {
  return listDatesBetween(start, end).filter((date) => options?.includeWeekends || !isWeekendDate(date))
    .length;
}

export function resolveEmploymentPeriod(
  staff: Pick<OfficeStaffRecord, "hireDate" | "resignDate" | "status">,
  monthKey: string,
) {
  const { start: monthStart, end: monthEnd } = monthDateBounds(monthKey);
  let start = monthStart;
  let end = monthEnd;
  const hireDate = String(staff.hireDate || "").slice(0, 10);
  const resignDate = String(staff.resignDate || "").slice(0, 10);
  if (hireDate && hireDate > start) start = hireDate;
  if (staff.status === "resigned" && resignDate && resignDate < end) end = resignDate;
  if (start > end) return null;
  return { start, end, partialMonth: start > monthStart || end < monthEnd };
}

export function resolveOfficeStaffErpUserId(
  staff: Pick<OfficeStaffRecord, "name" | "erpUserId">,
  attendanceRecords: AttendanceRecord[],
  monthKey: string,
): { userId: number; linkedBy: "erpUserId" | "name" } | null {
  const configured = Number(staff.erpUserId) || 0;
  if (configured > 0) return { userId: configured, linkedBy: "erpUserId" };

  const name = String(staff.name || "").trim();
  if (!name) return null;
  const monthRecords = filterAttendanceRecords(attendanceRecords, { monthKey });
  const matched = monthRecords.find((row) => String(row.userName || "").trim() === name);
  if (matched?.userId) return { userId: matched.userId, linkedBy: "name" };
  return null;
}

function checkInMinutesOnDate(checkInAt: string, date: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: KOREA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(checkInAt));
  const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value || "0", 10);
  const minute = Number.parseInt(parts.find((part) => part.type === "minute")?.value || "0", 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (!checkInAt.startsWith(date)) {
    // ISO may differ; still use KST parts for the attendance date row
  }
  return hour * 60 + minute;
}

function workMinutesBetween(checkInAt?: string, checkOutAt?: string) {
  if (!checkInAt || !checkOutAt) return 0;
  const ms = new Date(checkOutAt).getTime() - new Date(checkInAt).getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / 60000);
}

export function summarizeOfficeStaffAttendance(input: {
  staff: OfficeStaffRecord;
  monthKey: string;
  attendanceRecords: AttendanceRecord[];
  settings: OfficePayrollSettings;
}): OfficePayrollAttendanceSummary | null {
  const link = resolveOfficeStaffErpUserId(input.staff, input.attendanceRecords, input.monthKey);
  if (!link) return null;

  const period = resolveEmploymentPeriod(input.staff, input.monthKey);
  if (!period) return null;

  const expectedDates = listDatesBetween(period.start, period.end).filter(
    (date) => input.settings.attendanceIncludeWeekends || !isWeekendDate(date),
  );
  const records = filterAttendanceRecords(input.attendanceRecords, {
    userId: link.userId,
    monthKey: input.monthKey,
  }).filter((row) => row.date >= period.start && row.date <= period.end);

  const recordByDate = new Map(records.map((row) => [row.date, row] as const));
  const workStartMinutes =
    parseTimeToMinutes(input.settings.attendanceWorkStartTime) ?? parseTimeToMinutes("09:00")!;
  const lateThreshold = workStartMinutes + Math.max(0, input.settings.attendanceLateGraceMinutes || 0);
  const standardMinutes = Math.max(0, input.settings.attendanceStandardMinutes || 480);

  let presentDays = 0;
  let lateCount = 0;
  let overtimeMinutes = 0;
  let totalWorkMinutes = 0;

  for (const date of expectedDates) {
    const record = recordByDate.get(date);
    if (!record?.checkInAt) continue;
    presentDays += 1;
    const checkInMinutes = checkInMinutesOnDate(record.checkInAt, date);
    if (checkInMinutes != null && checkInMinutes > lateThreshold) lateCount += 1;
    const minutes = workMinutesBetween(record.checkInAt, record.checkOutAt);
    totalWorkMinutes += minutes;
    if (minutes > standardMinutes) overtimeMinutes += minutes - standardMinutes;
  }

  const expectedWorkdays = expectedDates.length;
  const absentDays = Math.max(expectedWorkdays - presentDays, 0);

  return {
    erpUserId: link.userId,
    linkedBy: link.linkedBy,
    periodStart: period.start,
    periodEnd: period.end,
    expectedWorkdays,
    presentDays,
    absentDays,
    lateCount,
    overtimeMinutes,
    totalWorkMinutes,
    partialMonth: period.partialMonth,
  };
}

function upsertDeduction(line: OfficePayrollLine, label: string, amount: number) {
  const deductions = line.deductions.filter((row) => row.label !== label);
  if (amount > 0) deductions.push({ label, amount: roundPayAmount(amount) });
  return deductions;
}

function upsertAllowance(line: OfficePayrollLine, label: string, amount: number) {
  const allowances = line.allowances.filter((row) => row.label !== label);
  if (amount > 0) allowances.push({ label, amount: roundPayAmount(amount) });
  return allowances;
}

function appendAttendanceMemo(existing: string | undefined, note: string) {
  const base = String(existing || "")
    .replace(/\s*·?\s*근태:[^·]*/g, "")
    .trim();
  return base ? `${base} · ${note}` : note;
}

export function applyAttendanceToOfficePayrollLine(
  line: OfficePayrollLine,
  staff: OfficeStaffRecord,
  summary: OfficePayrollAttendanceSummary | null,
  settings: OfficePayrollSettings,
): OfficePayrollLine {
  if (!summary) {
    return recalculateOfficePayrollLine({ ...line, attendanceSummary: undefined }, settings);
  }

  const appliedAt = new Date().toISOString();
  let next: OfficePayrollLine = {
    ...line,
    attendanceSummary: { ...summary, appliedAt },
  };

  if (next.payType === "daily_33" && settings.attendanceAutoFillDailyDays) {
    next.dailyDays = summary.presentDays;
  }

  if (next.payType === "monthly") {
    const { start: monthStart, end: monthEnd } = monthDateBounds(
      summary.periodStart.slice(0, 7),
    );
    const fullMonthWorkdays = countExpectedWorkdays(monthStart, monthEnd, {
      includeWeekends: settings.attendanceIncludeWeekends,
    });

    if (settings.attendanceProRatePartialMonth && summary.partialMonth && fullMonthWorkdays > 0) {
      const ratio = summary.expectedWorkdays / fullMonthWorkdays;
      next.baseSalary = roundPayAmount(next.baseSalary * ratio);
    }

    if (settings.attendanceMonthlyAbsenceDeduction && summary.absentDays > 0 && summary.expectedWorkdays > 0) {
      const dailyRate = roundPayAmount(next.baseSalary / summary.expectedWorkdays);
      next.deductions = upsertDeduction(next, "결근공제", dailyRate * summary.absentDays);
    }

    if (settings.attendanceOvertimeHourlyRate > 0 && summary.overtimeMinutes > 0) {
      const overtimePay = roundPayAmount((summary.overtimeMinutes / 60) * settings.attendanceOvertimeHourlyRate);
      next.allowances = upsertAllowance(next, "연장수당(근태)", overtimePay);
    }
  }

  if (summary.lateCount > 0) {
    const memoNote = `근태: ${summary.presentDays}/${summary.expectedWorkdays}일, 지각 ${summary.lateCount}회`;
    next.memo = appendAttendanceMemo(next.memo, memoNote);
  } else {
    const memoNote = `근태: ${summary.presentDays}/${summary.expectedWorkdays}일`;
    next.memo = appendAttendanceMemo(next.memo, memoNote);
  }

  return recalculateOfficePayrollLine(next, settings);
}

export function applyAttendanceToOfficePayrollSheet(input: {
  sheet: { monthKey: string; lines: OfficePayrollLine[] };
  officeStaff: OfficeStaffRecord[];
  attendanceRecords: AttendanceRecord[];
  settings: OfficePayrollSettings;
}) {
  const staffById = new Map(
    input.officeStaff.map((row) => [String(row.id), row] as const),
  );
  return input.sheet.lines.map((line) => {
    if (line.excluded) return line;
    const staff = staffById.get(line.staffId);
    if (!staff) return line;
    const summary = summarizeOfficeStaffAttendance({
      staff,
      monthKey: input.sheet.monthKey,
      attendanceRecords: input.attendanceRecords,
      settings: input.settings,
    });
    return applyAttendanceToOfficePayrollLine(line, staff, summary, input.settings);
  });
}

export function formatAttendanceSummaryLabel(summary?: OfficePayrollAttendanceSummary | null) {
  if (!summary) return "미연결";
  const parts = [`${summary.presentDays}/${summary.expectedWorkdays}일`];
  if (summary.absentDays > 0) parts.push(`결근 ${summary.absentDays}`);
  if (summary.lateCount > 0) parts.push(`지각 ${summary.lateCount}`);
  if (summary.overtimeMinutes > 0) {
    const hours = Math.round((summary.overtimeMinutes / 60) * 10) / 10;
    parts.push(`연장 ${hours}h`);
  }
  return parts.join(" · ");
}
