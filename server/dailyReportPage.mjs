import { buildDailyReport, formatDailyReportMessage, yesterdayDateKey } from "./dailyReport.mjs";
import { filterSchedulesForDate, tomorrowKstDateKey } from "./scScheduleNotify.mjs";
import { buildScVacationSummariesForDates } from "./scScheduleVacation.mjs";
import { resolveScScheduleSiteName } from "./scScheduleSiteName.mjs";
import { isScScheduleSourceConfigured, runScScheduleSync } from "./scScheduleSync.mjs";
import { config } from "./config.mjs";
import { getErpState } from "./db.mjs";

export function todayKstDateKey(now = new Date()) {
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}

export function formatReportDateLabel(dateKey) {
  const date = String(dateKey || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(new Date(`${date}T12:00:00+09:00`));
  return `${date.replace(/-/g, ".")} (${weekday})`;
}

function listScSchedules(data) {
  return Array.isArray(data?.scSchedules) ? data.scSchedules : [];
}

function listAttendanceRecords(data) {
  return Array.isArray(data?.attendanceRecords) ? data.attendanceRecords : [];
}

function summarizeSiteSchedules(schedules) {
  return schedules
    .map((schedule) => ({
      id: String(schedule.id || ""),
      workDate: String(schedule.workDate || "").slice(0, 10),
      projectName: String(schedule.projectName || "").trim(),
      siteName: resolveScScheduleSiteName(schedule),
      workType: String(schedule.workType || "").trim(),
      startTime: String(schedule.startTime || "").trim(),
      endTime: String(schedule.endTime || "").trim(),
      participantNames: Array.isArray(schedule.participantNames) ? schedule.participantNames : [],
      participantCount: Array.isArray(schedule.participantNames) ? schedule.participantNames.length : 0,
    }))
    .sort((a, b) => {
      const timeCmp = a.startTime.localeCompare(b.startTime);
      if (timeCmp !== 0) return timeCmp;
      return a.siteName.localeCompare(b.siteName, "ko");
    });
}

export function buildAttendanceSummary(attendanceRecords, dateKey) {
  const target = String(dateKey || "").slice(0, 10);
  const rows = attendanceRecords.filter((row) => String(row?.date || "").slice(0, 10) === target);
  const members = rows
    .map((row) => {
      const checkInAt = String(row.checkInAt || "").trim();
      const checkOutAt = String(row.checkOutAt || "").trim();
      let status = "absent";
      if (checkInAt && !checkOutAt) status = "working";
      else if (checkInAt && checkOutAt) status = "done";
      else if (checkInAt) status = "working";
      return {
        userId: row.userId,
        userName: String(row.userName || "").trim(),
        checkInAt,
        checkOutAt,
        status,
      };
    })
    .filter((row) => row.userName)
    .sort((a, b) => a.userName.localeCompare(b.userName, "ko"));

  return {
    dateKey: target,
    label: formatReportDateLabel(target),
    total: members.length,
    checkedInCount: members.filter((row) => row.status !== "absent").length,
    workingCount: members.filter((row) => row.status === "working").length,
    doneCount: members.filter((row) => row.status === "done").length,
    members,
  };
}

export function buildDailyReportPage(erpData, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const today = todayKstDateKey(now);
  const tomorrow = tomorrowKstDateKey(now);
  const yesterday = yesterdayDateKey(now);

  const schedules = listScSchedules(erpData);
  const vacationByDate = buildScVacationSummariesForDates(schedules, [today, tomorrow]);

  const yesterdayStats = buildDailyReport(erpData, { dateKey: yesterday, now });
  const todayAttendance = buildAttendanceSummary(listAttendanceRecords(erpData), today);
  const todaySites = summarizeSiteSchedules(filterSchedulesForDate(schedules, today));
  const tomorrowSites = summarizeSiteSchedules(filterSchedulesForDate(schedules, tomorrow));

  return {
    generatedAt: now.toISOString(),
    todayDateKey: today,
    yesterday: yesterdayStats,
    today: {
      dateKey: today,
      label: formatReportDateLabel(today),
      vacation: vacationByDate[today] || { dateKey: today, count: 0, members: [] },
      attendance: todayAttendance,
      siteSchedules: todaySites,
      siteScheduleCount: todaySites.length,
    },
    tomorrow: {
      dateKey: tomorrow,
      label: formatReportDateLabel(tomorrow),
      vacation: vacationByDate[tomorrow] || { dateKey: tomorrow, count: 0, members: [] },
      siteSchedules: tomorrowSites,
      siteScheduleCount: tomorrowSites.length,
    },
    scSyncMeta: erpData?.scScheduleSyncMeta || null,
    scConfigured: isScScheduleSourceConfigured(),
    alimtalkMessage: formatDailyReportMessage(yesterdayStats, config.alimtalk.erpBaseUrl),
  };
}

export async function buildDailyReportPageAsync(options = {}) {
  if (!options.skipSync && isScScheduleSourceConfigured()) {
    try {
      await runScScheduleSync({ updatedBy: "daily-report-page" });
    } catch (error) {
      console.warn("[daily-report-page] sc sync failed:", error?.message || error);
    }
  }

  const state = getErpState();
  return buildDailyReportPage(state.data || {}, options);
}
