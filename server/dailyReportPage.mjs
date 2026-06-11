import { buildDailyReport, formatDailyReportMessage, yesterdayDateKey } from "./dailyReport.mjs";
import { filterSchedulesForDate, tomorrowKstDateKey } from "./scScheduleNotify.mjs";
import { buildScVacationSummariesForDates } from "./scScheduleVacation.mjs";
import { resolveScScheduleSiteName } from "./scScheduleSiteName.mjs";
import { isScScheduleSourceConfigured, runScScheduleSync } from "./scScheduleSync.mjs";
import { config } from "./config.mjs";
import { getErpState, listAttendanceTargetUsers } from "./db.mjs";

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

function memberFromAttendanceRow(row) {
  const checkInAt = String(row?.checkInAt || "").trim();
  const checkOutAt = String(row?.checkOutAt || "").trim();
  let status = "absent";
  if (checkInAt && !checkOutAt) status = "working";
  else if (checkInAt && checkOutAt) status = "done";
  else if (checkInAt) status = "working";
  return {
    userId: Number(row?.userId) || 0,
    userName: String(row?.userName || "").trim(),
    checkInAt,
    checkOutAt,
    status,
  };
}

export function buildAttendanceSummary(attendanceRecords, dateKey, targetUsers = []) {
  const target = String(dateKey || "").slice(0, 10);
  const recordByUserId = new Map();
  for (const row of attendanceRecords) {
    if (String(row?.date || "").slice(0, 10) !== target) continue;
    const userId = Number(row?.userId) || 0;
    if (userId > 0) recordByUserId.set(userId, row);
  }

  const roster = Array.isArray(targetUsers) && targetUsers.length
    ? targetUsers
    : [...recordByUserId.values()].map((row) => ({
        id: Number(row.userId) || 0,
        name: String(row.userName || "").trim(),
      }));

  const members = roster
    .map((user) => {
      const userId = Number(user.id ?? user.userId) || 0;
      const userName = String(user.name ?? user.userName ?? "").trim();
      const record = recordByUserId.get(userId);
      const member = record
        ? memberFromAttendanceRow(record)
        : { userId, userName, checkInAt: "", checkOutAt: "", status: "absent" };
      return { ...member, userId, userName: userName || member.userName };
    })
    .filter((row) => row.userId > 0 && row.userName)
    .sort((a, b) => a.userName.localeCompare(b.userName, "ko"));

  return {
    dateKey: target,
    label: formatReportDateLabel(target),
    total: members.length,
    checkedInCount: members.filter((row) => row.status !== "absent").length,
    workingCount: members.filter((row) => row.status === "working").length,
    doneCount: members.filter((row) => row.status === "done").length,
    absentCount: members.filter((row) => row.status === "absent").length,
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
  const attendanceTargets = options.attendanceTargetUsers ?? listAttendanceTargetUsers();
  const todayAttendance = buildAttendanceSummary(listAttendanceRecords(erpData), today, attendanceTargets);
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
