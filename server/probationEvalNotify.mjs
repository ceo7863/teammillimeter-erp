import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";
import { sendProbationEvalAlimtalk } from "./alimtalkNotify.mjs";
import {
  normalizeNotificationSettings,
  notificationSettingsWithLegacy,
} from "./notificationSettings.mjs";
import { normalizeWorkerAiRules } from "./workerAiRules.mjs";
import { filterSchedulesForDate } from "./scScheduleNotify.mjs";
import { findEvalSubjectsOnSchedule, selectScheduleEvaluator } from "./probationEvalAssign.mjs";
import { resolveScScheduleSiteName } from "./scScheduleSiteName.mjs";
import {
  buildProbationEvalRequestsForSchedules,
  formatProbationEvalTemplateVars,
  normalizeProbationEvalRequests,
  probationEvalRequestKey,
  updateProbationEvalRequests,
} from "./probationEval.mjs";

function nowKstParts(now = new Date()) {
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return {
    hour: kst.getHours(),
    minute: kst.getMinutes(),
    dateKey: `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`,
  };
}

export function todayKstDateKey(now = new Date()) {
  return nowKstParts(now).dateKey;
}

function yesterdayKstDateKey(now = new Date()) {
  const kst = nowKstParts(now);
  const base = new Date(`${kst.dateKey}T12:00:00+09:00`);
  base.setDate(base.getDate() - 1);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

function listScSchedules(data) {
  return Array.isArray(data?.scSchedules) ? data.scSchedules : [];
}

function saveMeta(meta, updatedBy) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  saveErpState({ ...data, probationEvalNotifyMeta: meta }, state.version, updatedBy);
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function previewProbationEvalNotify(targetDateInput) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const targetDate = String(targetDateInput || todayKstDateKey()).slice(0, 10);
  const schedules = filterSchedulesForDate(listScSchedules(data), targetDate);
  const rules = normalizeWorkerAiRules(data.workerAiRules);
  const workers = Array.isArray(data.workers) ? data.workers : [];
  const existing = normalizeProbationEvalRequests(data.probationEvalRequests).filter(
    (row) => row.workDate === targetDate,
  );
  const existingKeys = new Set(
    existing.map((row) => probationEvalRequestKey(row.workDate, row.scheduleId, row.probationWorkerId)),
  );

  const planned = [];
  for (const schedule of schedules) {
    const evalSubjects = findEvalSubjectsOnSchedule(schedule, workers, rules);
    for (const { worker } of evalSubjects) {
      const key = probationEvalRequestKey(targetDate, schedule.id, worker.id);
      if (existingKeys.has(key)) continue;

      const evaluator = selectScheduleEvaluator(schedule, worker, workers, rules.probationEvalGrades);
      if (!evaluator) continue;

      planned.push({
        id: null,
        workDate: targetDate,
        scheduleId: String(schedule.id ?? ""),
        siteName:
          resolveScScheduleSiteName(schedule) ||
          String(schedule.projectName || schedule.clientName || "").trim(),
        probationWorkerName: String(worker.name || "").trim(),
        evaluatorName: String(evaluator.worker.name || evaluator.participantName || "").trim(),
        evaluatorPhone: normalizePhone(evaluator.worker.phone),
        status: "planned",
        selectionReason: evaluator.selectionReason,
      });
      existingKeys.add(key);
    }
  }

  const rows = [
    ...existing.map((row) => ({
      id: row.id,
      workDate: row.workDate,
      scheduleId: row.scheduleId,
      siteName: row.siteName,
      probationWorkerName: row.probationWorkerName,
      evaluatorName: row.evaluatorName,
      evaluatorPhone: normalizePhone(row.evaluatorPhone),
      status: row.status,
      sentAt: row.sentAt || null,
      reminderSentAt: row.reminderSentAt || null,
      submittedAt: row.submittedAt || null,
      selectionReason: row.selectionReason,
    })),
    ...planned,
  ].sort((a, b) => {
    const site = a.siteName.localeCompare(b.siteName, "ko");
    if (site !== 0) return site;
    return a.probationWorkerName.localeCompare(b.probationWorkerName, "ko");
  });

  const statusInfo = getProbationEvalNotifyStatus();

  return {
    targetDate,
    scheduleCount: schedules.length,
    requestCount: rows.length,
    pendingCount: rows.filter((row) => row.status === "pending" || row.status === "planned").length,
    sentCount: rows.filter((row) => row.status === "sent").length,
    submittedCount: rows.filter((row) => row.status === "submitted").length,
    notifyCount: rows.filter(
      (row) => row.evaluatorPhone && (row.status === "pending" || row.status === "planned" || row.status === "sent"),
    ).length,
    missingPhoneCount: rows.filter((row) => !row.evaluatorPhone).length,
    templateConfigured: statusInfo.templateConfigured,
    enabled: statusInfo.enabled,
    reminderEnabled: statusInfo.reminderEnabled,
    meta: statusInfo.meta,
    rows,
  };
}

export function getProbationEvalNotifyStatus() {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const settings = notificationSettingsWithLegacy(data, normalizeWorkerAiRules);
  return {
    enabled: settings.probationEvalNotifyEnabled,
    notifyHour: settings.probationEvalNotifyHour,
    notifyMinute: settings.probationEvalNotifyMinute,
    reminderEnabled: settings.probationEvalReminderEnabled,
    templateConfigured: Boolean(config.alimtalk.probationEvalTemplate),
    meta: data.probationEvalNotifyMeta || null,
  };
}

async function sendPendingRequests(requests, data, updatedBy) {
  const all = normalizeProbationEvalRequests(data.probationEvalRequests);
  const byId = new Map(all.map((row) => [row.id, row]));
  let sentCount = 0;
  const results = [];

  for (const request of requests) {
    const current = byId.get(request.id) || request;
    if (current.status === "submitted" || current.status === "expired") continue;
    const phone = String(current.evaluatorPhone || "").replace(/\D/g, "");
    if (!phone) {
      results.push({ id: current.id, ok: false, reason: "no-phone" });
      continue;
    }

    const variables = formatProbationEvalTemplateVars(current);
    const result = await sendProbationEvalAlimtalk({ phones: [phone], variables });
    const sentAt = new Date().toISOString();
    byId.set(current.id, {
      ...current,
      status: result.ok !== false && !result.skipped ? "sent" : current.status,
      sentAt: result.ok !== false && !result.skipped ? sentAt : current.sentAt,
    });
    if (result.ok !== false && !result.skipped) sentCount += 1;
    results.push({ id: current.id, ok: result.ok !== false && !result.skipped, result });
  }

  updateProbationEvalRequests([...byId.values()], updatedBy);
  return { sentCount, results };
}

export async function runProbationEvalNotifyJob(options = {}) {
  const force = options.force === true;
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const notifySettings = options.settingsOverride
    ? normalizeNotificationSettings(options.settingsOverride)
    : notificationSettingsWithLegacy(data, normalizeWorkerAiRules);

  if (!force && (!notifySettings.enabled || !notifySettings.probationEvalNotifyEnabled)) {
    return { ok: false, skipped: true, reason: "disabled" };
  }
  if (!config.alimtalk.probationEvalTemplate) {
    return { ok: false, skipped: true, reason: "no-template" };
  }

  const targetDate = String(options.targetDate || todayKstDateKey()).slice(0, 10);
  const meta = data.probationEvalNotifyMeta && typeof data.probationEvalNotifyMeta === "object"
    ? data.probationEvalNotifyMeta
    : {};

  if (!force && meta.lastRunDateKey === targetDate && meta.lastTargetDate === targetDate) {
    return { ok: true, skipped: true, reason: "already-ran" };
  }

  const schedules = filterSchedulesForDate(listScSchedules(data), targetDate);
  const buildResult = buildProbationEvalRequestsForSchedules(data, schedules, targetDate, options.updatedBy || "probation-eval-notify");

  const freshState = getErpState();
  const freshData = freshState.data && typeof freshState.data === "object" ? freshState.data : {};
  const pending = normalizeProbationEvalRequests(freshData.probationEvalRequests).filter(
    (row) => row.workDate === targetDate && (row.status === "pending" || row.status === "sent"),
  );

  const toSend = pending.filter((row) => row.status === "pending" || (force && row.status === "sent"));
  const sendResult = await sendPendingRequests(toSend, freshData, options.updatedBy || "probation-eval-notify");

  const nextMeta = {
    lastRunAt: new Date().toISOString(),
    lastRunDateKey: targetDate,
    lastTargetDate: targetDate,
    lastScheduleCount: schedules.length,
    lastCreatedCount: buildResult.created?.length || 0,
    lastSentCount: sendResult.sentCount,
  };
  saveMeta(nextMeta, options.updatedBy || "probation-eval-notify");

  return {
    ok: true,
    targetDate,
    schedules: schedules.length,
    created: buildResult.created?.length || 0,
    sent: sendResult.sentCount,
    meta: nextMeta,
  };
}

export async function runProbationEvalReminderJob(options = {}) {
  const force = options.force === true;
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const notifySettings = options.settingsOverride
    ? normalizeNotificationSettings(options.settingsOverride)
    : notificationSettingsWithLegacy(data, normalizeWorkerAiRules);

  if (
    !force &&
    (!notifySettings.enabled ||
      !notifySettings.probationEvalNotifyEnabled ||
      !notifySettings.probationEvalReminderEnabled)
  ) {
    return { ok: false, skipped: true, reason: "disabled" };
  }
  if (!config.alimtalk.probationEvalTemplate) {
    return { ok: false, skipped: true, reason: "no-template" };
  }

  const targetDate = String(options.targetDate || yesterdayKstDateKey()).slice(0, 10);
  const requests = normalizeProbationEvalRequests(data.probationEvalRequests).filter(
    (row) => row.workDate === targetDate && row.status === "sent" && !row.reminderSentAt,
  );

  if (!requests.length) {
    return { ok: true, skipped: true, reason: "none-pending" };
  }

  const byId = new Map(normalizeProbationEvalRequests(data.probationEvalRequests).map((row) => [row.id, row]));
  let sentCount = 0;

  for (const request of requests) {
    const phone = String(request.evaluatorPhone || "").replace(/\D/g, "");
    if (!phone) continue;
    const variables = formatProbationEvalTemplateVars(request);
    const result = await sendProbationEvalAlimtalk({ phones: [phone], variables });
    if (result.ok !== false && !result.skipped) {
      sentCount += 1;
      byId.set(request.id, {
        ...request,
        reminderSentAt: new Date().toISOString(),
      });
    }
  }

  updateProbationEvalRequests([...byId.values()], options.updatedBy || "probation-eval-reminder");
  return { ok: true, targetDate, sent: sentCount };
}
