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

function listClients(data) {
  return Array.isArray(data?.clients) ? data.clients : [];
}

function normalizeNotifyPhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function findClientForSchedule(clients, schedule) {
  const list = Array.isArray(clients) ? clients : [];
  const clientId = schedule?.clientId;
  const nameHint = String(schedule?.clientName || schedule?.projectName || "").trim();
  let match = list.find((row) => String(row?.id ?? "") === String(clientId ?? ""));
  if (!match && nameHint) {
    match = list.find((row) => String(row?.name || "").trim() === nameHint);
  }
  return match || null;
}

export function resolveClientContact(clients, schedule) {
  const match = findClientForSchedule(clients, schedule);
  const manager = match ? String(match.manager || match.ceoName || "").trim() : "";
  const fromSc = String(schedule?.siteManagerName || "").trim();
  return {
    clientName: match
      ? String(match.name || "").trim()
      : String(schedule?.clientName || schedule?.projectName || "").trim(),
    name: manager || fromSc || "",
    phone: match ? normalizeNotifyPhone(match.phone) : "",
  };
}

export function resolveClientManager(clients, scheduleOrClientId, clientName = "") {
  if (scheduleOrClientId && typeof scheduleOrClientId === "object") {
    return resolveClientContact(clients, scheduleOrClientId).name;
  }
  const list = Array.isArray(clients) ? clients : [];
  let match = list.find((row) => String(row?.id ?? "") === String(scheduleOrClientId ?? ""));
  const nameHint = String(clientName || "").trim();
  if (!match && nameHint) {
    match = list.find((row) => String(row?.name || "").trim() === nameHint);
  }
  if (!match) return "";
  return String(match.manager || match.ceoName || "").trim();
}

function listScSchedules(data) {
  return Array.isArray(data?.scSchedules) ? data.scSchedules : [];
}

export function filterSchedulesForDate(schedules, dateKey) {
  const target = String(dateKey || "").slice(0, 10);
  return schedules.filter((row) => String(row?.workDate || "").slice(0, 10) === target);
}

export function formatScheduleDateTime(workDate) {
  const date = String(workDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(new Date(`${date}T12:00:00+09:00`));
  const [, month, day] = date.split("-").map(Number);
  return `${month}\uC6D4 ${day}\uC77C ${weekday}`;
}

export function formatScheduleTemplateVars(
  schedule,
  shareToken = "",
  clientManager = "",
  participantNames = null,
) {
  const names = Array.isArray(participantNames)
    ? participantNames.filter(Boolean)
    : Array.isArray(schedule?.participantNames)
      ? schedule.participantNames.filter(Boolean)
      : [];
  const manager =
    String(clientManager || schedule?.clientManager || "").trim() || "-";
  return {
    client: String(schedule?.clientName || schedule?.projectName || "").trim(),
    site: String(schedule?.projectName || "").trim(),
    clientManager: manager,
    workers: names.join(", "),
    dateTime: formatScheduleDateTime(schedule?.workDate),
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

function buildScShareUrl(shareToken) {
  const token = String(shareToken || "").trim();
  if (!token) return "";
  const base = String(config.sc.sharePublicUrl || config.sc.apiBaseUrl || "https://sc.teammillimeter.com").replace(
    /\/$/,
    "",
  );
  return `${base}/share/schedules/${encodeURIComponent(token)}`;
}

export function buildScScheduleNotifyPreview(data, dateKey = tomorrowKstDateKey()) {
  const workers = listWorkers(data);
  const clients = listClients(data);
  const schedules = filterSchedulesForDate(listScSchedules(data), dateKey);
  const rows = [];
  const clientScheduleIds = new Set();

  for (const schedule of schedules) {
    const participantNames = Array.isArray(schedule.participantNames)
      ? schedule.participantNames.filter(Boolean)
      : [];
    if (!participantNames.length) continue;

    const contact = resolveClientContact(clients, schedule);
    const clientManager = contact.name || resolveClientManager(clients, schedule);
    const variables = formatScheduleTemplateVars(schedule, "", clientManager, participantNames);

    if (!clientScheduleIds.has(schedule.id)) {
      clientScheduleIds.add(schedule.id);
      rows.push({
        recipientType: "client",
        scheduleId: schedule.id,
        workDate: schedule.workDate,
        clientName: schedule.clientName,
        projectName: schedule.projectName,
        clientManager: variables.clientManager,
        participantName: contact.name || variables.clientManager,
        workerNames: variables.workers,
        phone: contact.phone || null,
        variables,
      });
    }

    for (const participantName of participantNames) {
      const phone = resolveWorkerPhone(workers, participantName);
      rows.push({
        recipientType: "worker",
        scheduleId: schedule.id,
        workDate: schedule.workDate,
        clientName: schedule.clientName,
        projectName: schedule.projectName,
        clientManager: variables.clientManager,
        participantName,
        phone,
        variables,
      });
    }
  }

  const withPhone = rows.filter((row) => row.phone);
  return {
    targetDate: dateKey,
    scheduleCount: schedules.length,
    notifyCount: withPhone.length,
    workerNotifyCount: withPhone.filter((row) => row.recipientType === "worker").length,
    clientNotifyCount: withPhone.filter((row) => row.recipientType === "client").length,
    missingPhoneCount: rows.filter((row) => !row.phone).length,
    missingClientPhoneCount: rows.filter((row) => row.recipientType === "client" && !row.phone).length,
    rows,
  };
}

export async function buildScScheduleNotifyPreviewAsync(data, dateKey = tomorrowKstDateKey()) {
  const workers = listWorkers(data);
  const clients = listClients(data);
  const schedules = filterSchedulesForDate(listScSchedules(data), dateKey);
  const rows = [];
  const scheduleLinks = [];
  const clientScheduleIds = new Set();

  for (const schedule of schedules) {
    const participantNames = Array.isArray(schedule.participantNames)
      ? schedule.participantNames.filter(Boolean)
      : [];
    if (!participantNames.length) continue;

    let shareToken = "";
    let shareUrl = "";
    if (isScScheduleSourceConfigured()) {
      const share = await ensureScScheduleShareLink(schedule.id);
      if (share.ok && share.shareToken) {
        shareToken = share.shareToken;
        shareUrl = String(share.url || buildScShareUrl(shareToken)).trim();
      }
      scheduleLinks.push({
        scheduleId: schedule.id,
        clientName: String(schedule.clientName || "").trim(),
        projectName: String(schedule.projectName || "").trim(),
        shareUrl,
        shareToken,
        error: share.ok ? null : String(share.error || share.reason || "share-link-failed"),
      });
    }

    const contact = resolveClientContact(clients, schedule);
    const clientManager = contact.name || resolveClientManager(clients, schedule);
    const variables = formatScheduleTemplateVars(schedule, shareToken, clientManager, participantNames);

    if (!clientScheduleIds.has(schedule.id)) {
      clientScheduleIds.add(schedule.id);
      rows.push({
        recipientType: "client",
        scheduleId: schedule.id,
        workDate: schedule.workDate,
        clientName: schedule.clientName,
        projectName: schedule.projectName,
        clientManager: variables.clientManager,
        participantName: contact.name || variables.clientManager,
        workerNames: variables.workers,
        phone: contact.phone || null,
        shareUrl,
        variables,
      });
    }

    for (const participantName of participantNames) {
      const phone = resolveWorkerPhone(workers, participantName);
      rows.push({
        recipientType: "worker",
        scheduleId: schedule.id,
        workDate: schedule.workDate,
        clientName: schedule.clientName,
        projectName: schedule.projectName,
        clientManager: variables.clientManager,
        participantName,
        phone,
        shareUrl,
        variables,
      });
    }
  }

  const withPhone = rows.filter((row) => row.phone);
  return {
    targetDate: dateKey,
    scheduleCount: schedules.length,
    notifyCount: withPhone.length,
    workerNotifyCount: withPhone.filter((row) => row.recipientType === "worker").length,
    clientNotifyCount: withPhone.filter((row) => row.recipientType === "client").length,
    missingPhoneCount: rows.filter((row) => !row.phone).length,
    missingClientPhoneCount: rows.filter((row) => row.recipientType === "client" && !row.phone).length,
    scheduleLinks,
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
  const clients = listClients(data);
  const schedules = filterSchedulesForDate(listScSchedules(data), targetDate);
  const results = [];
  let sentCount = 0;
  let skippedNoPhone = 0;
  let skippedNoClientPhone = 0;
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

    const contact = resolveClientContact(clients, schedule);
    const clientManager = contact.name || resolveClientManager(clients, schedule);
    const variables = formatScheduleTemplateVars(schedule, shareToken, clientManager, participantNames);
    const sentPhones = new Set();

    async function sendToPhone(phone, recipientType, recipientName) {
      const normalized = normalizeNotifyPhone(phone);
      if (!normalized) return false;
      if (sentPhones.has(normalized)) return false;
      sentPhones.add(normalized);
      const result = await sendScheduleAlimtalk({ phones: [normalized], variables });
      if (result.ok !== false && !result.skipped) sentCount += 1;
      results.push({
        scheduleId: schedule.id,
        recipientType,
        participantName: recipientName,
        phone: normalized,
        ok: result.ok !== false,
        result,
      });
      return true;
    }

    if (contact.phone) {
      await sendToPhone(contact.phone, "client", contact.name || contact.clientName);
    } else {
      skippedNoClientPhone += 1;
      results.push({
        scheduleId: schedule.id,
        recipientType: "client",
        participantName: contact.name || contact.clientName,
        ok: false,
        skipped: true,
        reason: "no-client-phone",
      });
    }

    for (const participantName of participantNames) {
      const phone = resolveWorkerPhone(workers, participantName);
      if (!phone) {
        skippedNoPhone += 1;
        results.push({
          scheduleId: schedule.id,
          recipientType: "worker",
          participantName,
          ok: false,
          skipped: true,
          reason: "no-phone",
        });
        continue;
      }

      await sendToPhone(phone, "worker", participantName);
    }
  }

  const nextMeta = {
    lastRunAt: new Date().toISOString(),
    lastRunDateKey: runDateKey,
    lastTargetDate: targetDate,
    lastScheduleCount: schedules.length,
    lastSentCount: sentCount,
    lastSkippedNoPhone: skippedNoPhone,
    lastSkippedNoClientPhone: skippedNoClientPhone,
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
    skippedNoClientPhone,
    skippedNoParticipants,
    shareFailures,
    results,
    ...nextMeta,
  };
}
