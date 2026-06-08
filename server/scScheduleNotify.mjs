import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";
import { sendScheduleAlimtalk } from "./alimtalkNotify.mjs";
import { normalizeNotificationSettings } from "./notificationSettings.mjs";
import { isScScheduleSourceConfigured, runScScheduleSync } from "./scScheduleSync.mjs";
import { resolveWorkerPhone } from "./workerPhoneMatch.mjs";

function nowKstParts(now = new Date()) {
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return {
    year: kst.getFullYear(),
    month: kst.getMonth() + 1,
    day: kst.getDate(),
    hour: kst.getHours(),
    minute: kst.getMinutes(),
    dateKey: `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`,
  };
}

export function tomorrowKstDateKey(now = new Date()) {
  const kst = nowKstParts(now);
  const base = new Date(`${kst.dateKey}T12:00:00+09:00`);
  base.setDate(base.getDate() + 1);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

function listWorkers(data) {
  return Array.isArray(data?.workers) ? data.workers : [];
}

function listScSchedules(data) {
  return Array.isArray(data?.scSchedules) ? data.scSchedules : [];
}

export function filterSchedulesForDate(schedules, dateKey) {
  const target = String(dateKey || "").slice(0, 10);
  return schedules.filter((row) => String(row?.workDate || "").slice(0, 10) === target);
}

export function formatScheduleDateTime(workDate, startTime, endTime) {
  const date = String(workDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(new Date(`${date}T12:00:00+09:00`));
  const [, month, day] = date.split("-").map(Number);
  const start = String(startTime || "").trim();
  const end = String(endTime || "").trim();
  const timePart = start && end ? `${start}~${end}` : start || end || "";
  return `${month}? ${day}? ${weekday}${timePart ? ` · ${timePart}` : ""}`;
}

export function formatScheduleTemplateVars(schedule, shareToken = "") {
  const participantNames = Array.isArray(schedule?.participantNames)
    ? schedule.participantNames.filter(Boolean)
    : [];
  return {
    client: String(schedule?.clientName || schedule?.projectName || "").trim(),
    site: String(schedule?.projectName || "").trim(),
    workers: participantNames.join(", "),
    dateTime: formatScheduleDateTime(schedule?.workDate, schedule?.startTime, schedule?.endTime),
    shareToken: String(shareToken || "").trim(),
  };
}

function extractShareTokenFromUrl(url) {
  const match = String(url || "").match(/\/share\/schedules\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function ensureScScheduleShareLink(scheduleId) {
  const base = String(config.sc.apiBaseUrl || "").trim().replace(/\/$/, "");
  const secret = String(config.sc.syncSecret || "").trim();
  if (!base || !secret) {
    return { ok: false, skipped: true, reason: "sc-share-not-configured" };
  }

  const response = await fetch(`${base}/api/erp/schedule-share`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scheduleId: String(scheduleId) }),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message =
      (body && typeof body === "object" && body.error) ||
      (typeof body === "string" ? body.slice(0, 200) : "") ||
      `SC share API ${response.status}`;
    return { ok: false, error: message };
  }

  const shareToken = String(body?.shareToken || extractShareTokenFromUrl(body?.url) || "").trim();
  return {
    ok: true,
    url: String(body?.url || "").trim(),
    shareToken,
    expiresAt: body?.expiresAt || null,
  };
}

export function buildScScheduleNotifyPreview(data, dateKey = tomorrowKstDateKey()) {
  const workers = listWorkers(data);
  const schedules = filterSchedulesForDate(listScSchedules(data), dateKey);
  const rows = [];

  for (const schedule of schedules) {
    const participantNames = Array.isArray(schedule.participantNames)
      ? schedule.participantNames.filter(Boolean)
      : [];
    if (!participantNames.length) continue;

    for (const participantName of participantNames) {
      const phone = resolveWorkerPhone(workers, participantName);
      rows.push({
        scheduleId: schedule.id,
        workDate: schedule.workDate,
        clientName: schedule.clientName,
        projectName: schedule.projectName,
        participantName,
        phone,
        variables: formatScheduleTemplateVars(schedule),
      });
    }
  }

  return {
    targetDate: dateKey,
    scheduleCount: schedules.length,
    notifyCount: rows.filter((row) => row.phone).length,
    missingPhoneCount: rows.filter((row) => !row.phone).length,
    rows,
  };
}

function isScScheduleNotifyConfigured() {
  return Boolean(config.alimtalk.enabled && config.alimtalk.scheduleTemplate);
}

export function getScScheduleNotifyStatus() {
  const state = getErpState();
  const meta = state.data?.scScheduleNotifyMeta || {};
  const notify = config.sc.scheduleNotify;
  return {
    configured: isScScheduleNotifyConfigured(),
    scShareConfigured: isScScheduleSourceConfigured(),
    enabled: notify.enabled,
    hour: notify.hour,
    minute: notify.minute,
    template: config.alimtalk.scheduleTemplate || null,
    ...meta,
  };
}

export async function runScScheduleNotifyJob(options = {}) {
  const notify = config.sc.scheduleNotify;
  if (!notify.enabled) {
    return { ok: false, skipped: true, reason: "disabled" };
  }
  if (!isScScheduleNotifyConfigured()) {
    return { ok: false, skipped: true, reason: "not-configured" };
  }

  const state = getErpState();
  const settings = normalizeNotificationSettings(state.data?.notificationSettings);
  if (!settings.enabled || settings.scScheduleNotifyEnabled === false) {
    return { ok: false, skipped: true, reason: "settings-disabled" };
  }

  const targetDate = options.targetDate || tomorrowKstDateKey();
  const runDateKey = nowKstParts().dateKey;
  const existingMeta = state.data?.scScheduleNotifyMeta || {};
  if (!options.force && existingMeta.lastRunDateKey === runDateKey && existingMeta.lastTargetDate === targetDate) {
    return { ok: true, skipped: true, reason: "already-ran-today", targetDate, ...existingMeta };
  }

  if (!options.skipSync && config.sc.syncEnabled && isScScheduleSourceConfigured()) {
    try {
      await runScScheduleSync({ updatedBy: "sc-schedule-notify" });
    } catch (error) {
      console.warn("[sc-schedule-notify] sync before notify failed:", error?.message || error);
    }
  }

  const freshState = getErpState();
  const data = freshState.data || {};
  const workers = listWorkers(data);
  const schedules = filterSchedulesForDate(listScSchedules(data), targetDate);
  const results = [];
  let sentCount = 0;
  let skippedNoPhone = 0;
  let skippedNoParticipants = 0;
  let shareFailures = 0;

  for (const schedule of schedules) {
    const participantNames = Array.isArray(schedule.participantNames)
      ? schedule.participantNames.filter(Boolean)
      : [];
    if (!participantNames.length) {
      skippedNoParticipants += 1;
      continue;
    }

    let shareToken = "";
    if (isScScheduleSourceConfigured()) {
      const share = await ensureScScheduleShareLink(schedule.id);
      if (share.ok && share.shareToken) {
        shareToken = share.shareToken;
      } else if (!share.skipped) {
        shareFailures += 1;
        console.warn("[sc-schedule-notify] share link failed:", schedule.id, share.error || share.reason);
      }
    }

    const variables = formatScheduleTemplateVars(schedule, shareToken);

    for (const participantName of participantNames) {
      const phone = resolveWorkerPhone(workers, participantName);
      if (!phone) {
        skippedNoPhone += 1;
        results.push({
          scheduleId: schedule.id,
          participantName,
          ok: false,
          skipped: true,
          reason: "no-phone",
        });
        continue;
      }

      const result = await sendScheduleAlimtalk({ phones: [phone], variables });
      if (result.ok !== false && !result.skipped) sentCount += 1;
      results.push({
        scheduleId: schedule.id,
        participantName,
        phone,
        ok: result.ok !== false,
        result,
      });
    }
  }

  const nextMeta = {
    lastRunAt: new Date().toISOString(),
    lastRunDateKey: runDateKey,
    lastTargetDate: targetDate,
    lastScheduleCount: schedules.length,
    lastSentCount: sentCount,
    lastSkippedNoPhone: skippedNoPhone,
    lastSkippedNoParticipants: skippedNoParticipants,
    lastShareFailures: shareFailures,
    lastError: null,
  };

  saveErpState(
    {
      ...data,
      scScheduleNotifyMeta: {
        ...(data.scScheduleNotifyMeta || {}),
        ...nextMeta,
      },
    },
    freshState.version,
    options.updatedBy || "sc-schedule-notify",
  );

  console.log(
    "[sc-schedule-notify] target",
    targetDate,
    "schedules",
    schedules.length,
    "sent",
    sentCount,
    "no-phone",
    skippedNoPhone,
  );

  return {
    ok: true,
    targetDate,
    scheduleCount: schedules.length,
    sentCount,
    skippedNoPhone,
    skippedNoParticipants,
    shareFailures,
    results,
    ...nextMeta,
  };
}
