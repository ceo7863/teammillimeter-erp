import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";
import { sendScheduleAlimtalk } from "./alimtalkNotify.mjs";
import {
  normalizeNotificationSettings,
  scScheduleNotifyModeAllowsRecipientType,
} from "./notificationSettings.mjs";
import { isScScheduleSourceConfigured, runScScheduleSync } from "./scScheduleSync.mjs";
import { resolveWorkerPhone, resolveScScheduleParticipants } from "./workerPhoneMatch.mjs";
import {
  findClientForSchedule,
  normalizeNotifyPhone,
  resolveClientContact,
  resolveClientContacts,
} from "./clientContacts.mjs";

export { resolveClientContact };

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

function pushClientNotifyPreviewRows(rows, schedule, clients, shareToken, participantNames, workers, clientScheduleIds, shareUrl = "") {
  const clientContacts = resolveClientContacts(clients, schedule);
  const fallbackManager = resolveClientManager(clients, schedule);
  const defaultVariables = formatScheduleTemplateVars(
    schedule,
    shareToken,
    fallbackManager,
    participantNames,
    workers,
  );

  if (!clientScheduleIds.has(schedule.id)) {
    clientScheduleIds.add(schedule.id);
    if (!clientContacts.length) {
      rows.push({
        recipientType: "client",
        scheduleId: schedule.id,
        workDate: schedule.workDate,
        clientName: schedule.clientName,
        projectName: schedule.projectName,
        clientManager: defaultVariables.clientManager,
        participantName: fallbackManager || defaultVariables.clientManager,
        workerNames: defaultVariables.workers,
        phone: null,
        variables: defaultVariables,
        shareUrl,
      });
      return;
    }

    for (const contact of clientContacts) {
      const clientManager = contact.name || fallbackManager;
      const variables = formatScheduleTemplateVars(
        schedule,
        shareToken,
        clientManager,
        participantNames,
        workers,
      );
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
        shareUrl,
      });
    }
  }
}

function formatScheduleWorkerLabel(row) {
  const name = String(row?.name || row?.participantName || "").trim();
  if (!name) return "";
  const phone = String(row?.phone || "").trim();
  const vehicleNo = String(row?.vehicleNo || "").trim();
  return [name, phone && phone !== "-" ? phone : "", vehicleNo && vehicleNo !== "-" ? vehicleNo : ""]
    .filter(Boolean)
    .join("\n");
}

export function formatScheduleWorkersLabel(workers, participantNames, scheduleParticipants = null) {
  const names = Array.isArray(participantNames) ? participantNames.filter(Boolean) : [];
  const participants =
    Array.isArray(scheduleParticipants) && scheduleParticipants.length
      ? scheduleParticipants
      : resolveScScheduleParticipants(Array.isArray(workers) ? workers : [], names);

  return participants.map(formatScheduleWorkerLabel).filter(Boolean).join("\n\n");
}

export function formatScheduleTemplateVars(
  schedule,
  shareToken = "",
  clientManager = "",
  participantNames = null,
  workers = null,
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
    workers: formatScheduleWorkersLabel(workers, names, schedule?.participants),
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

    const fallbackManager = resolveClientManager(clients, schedule);
    const variables = formatScheduleTemplateVars(schedule, "", fallbackManager, participantNames, workers);

    pushClientNotifyPreviewRows(rows, schedule, clients, "", participantNames, workers, clientScheduleIds);

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

  const settings = normalizeNotificationSettings(data?.notificationSettings);
  const filteredRows = rows.filter((row) =>
    scScheduleNotifyModeAllowsRecipientType(settings.scScheduleNotifyMode, row.recipientType),
  );
  const withPhone = filteredRows.filter((row) => row.phone);
  return {
    targetDate: dateKey,
    scheduleCount: schedules.length,
    notifyCount: withPhone.length,
    workerNotifyCount: withPhone.filter((row) => row.recipientType === "worker").length,
    clientNotifyCount: withPhone.filter((row) => row.recipientType === "client").length,
    missingPhoneCount: filteredRows.filter((row) => !row.phone).length,
    missingClientPhoneCount: filteredRows.filter((row) => row.recipientType === "client" && !row.phone).length,
    scScheduleNotifyMode: settings.scScheduleNotifyMode,
    rows: filteredRows,
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

    const fallbackManager = resolveClientManager(clients, schedule);
    const variables = formatScheduleTemplateVars(schedule, shareToken, fallbackManager, participantNames, workers);

    pushClientNotifyPreviewRows(rows, schedule, clients, shareToken, participantNames, workers, clientScheduleIds, shareUrl);

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

  const settings = normalizeNotificationSettings(data?.notificationSettings);
  const filteredRows = rows.filter((row) =>
    scScheduleNotifyModeAllowsRecipientType(settings.scScheduleNotifyMode, row.recipientType),
  );
  const withPhone = filteredRows.filter((row) => row.phone);
  return {
    targetDate: dateKey,
    scheduleCount: schedules.length,
    notifyCount: withPhone.length,
    workerNotifyCount: withPhone.filter((row) => row.recipientType === "worker").length,
    clientNotifyCount: withPhone.filter((row) => row.recipientType === "client").length,
    missingPhoneCount: filteredRows.filter((row) => !row.phone).length,
    missingClientPhoneCount: filteredRows.filter((row) => row.recipientType === "client" && !row.phone).length,
    scScheduleNotifyMode: settings.scScheduleNotifyMode,
    scheduleLinks,
    rows: filteredRows,
  };
}

function isScScheduleNotifyConfigured() {
  return Boolean(config.alimtalk.enabled && config.alimtalk.scheduleTemplate);
}

export function getScScheduleNotifyStatus() {
  const state = getErpState();
  const meta = state.data?.scScheduleNotifyMeta || {};
  const notify = config.sc.scheduleNotify;
  const settings = normalizeNotificationSettings(state.data?.notificationSettings);
  return {
    configured: isScScheduleNotifyConfigured(),
    scShareConfigured: isScScheduleSourceConfigured(),
    enabled: notify.enabled,
    hour: settings.scScheduleNotifyHour,
    minute: settings.scScheduleNotifyMinute,
    scScheduleNotifyMode: settings.scScheduleNotifyMode,
    template: config.alimtalk.scheduleTemplate || null,
    ...meta,
  };
}

export async function runScScheduleNotifyJob(options = {}) {
  const notify = config.sc.scheduleNotify;
  const forTest = options.force === true;
  if (!forTest && !notify.enabled) {
    return { ok: false, skipped: true, reason: "disabled" };
  }
  if (!isScScheduleNotifyConfigured()) {
    return { ok: false, skipped: true, reason: "not-configured" };
  }

  const state = getErpState();
  const settings = normalizeNotificationSettings(options.settingsOverride ?? state.data?.notificationSettings);
  if (!forTest && (!settings.enabled || settings.scScheduleNotifyEnabled === false)) {
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
  const notifyMode = settings.scScheduleNotifyMode;
  const sendClients = scScheduleNotifyModeAllowsRecipientType(notifyMode, "client");
  const sendWorkers = scScheduleNotifyModeAllowsRecipientType(notifyMode, "worker");
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

    const fallbackManager = resolveClientManager(clients, schedule);
    const variables = formatScheduleTemplateVars(schedule, shareToken, fallbackManager, participantNames, workers);
    const sentPhones = new Set();

    async function sendToPhone(phone, recipientType, recipientName, messageVariables = variables) {
      const normalized = normalizeNotifyPhone(phone);
      if (!normalized) return false;
      if (sentPhones.has(normalized)) return false;
      sentPhones.add(normalized);
      const result = await sendScheduleAlimtalk({ phones: [normalized], variables: messageVariables });
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

    if (sendClients) {
      const clientContacts = resolveClientContacts(clients, schedule);
      let clientPhoneSent = false;
      for (const contact of clientContacts) {
        if (!contact.phone) {
          results.push({
            scheduleId: schedule.id,
            recipientType: "client",
            participantName: contact.name || contact.clientName,
            ok: false,
            skipped: true,
            reason: "no-client-phone",
          });
          continue;
        }
        clientPhoneSent = true;
        const contactVariables = formatScheduleTemplateVars(
          schedule,
          shareToken,
          contact.name || fallbackManager,
          participantNames,
          workers,
        );
        await sendToPhone(contact.phone, "client", contact.name || contact.clientName, contactVariables);
      }
      if (!clientPhoneSent) {
        skippedNoClientPhone += 1;
      }
    }

    if (sendWorkers) {
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

export async function sendScScheduleNotifyOne(scheduleId, options = {}) {
  if (!isScScheduleNotifyConfigured()) {
    return { ok: false, skipped: true, reason: "not-configured" };
  }

  const id = String(scheduleId || "").trim();
  if (!id) {
    return { ok: false, error: "scheduleId\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  if (!options.skipSync && config.sc.syncEnabled && isScScheduleSourceConfigured()) {
    try {
      await runScScheduleSync({ updatedBy: options.updatedBy || "sc-schedule-send-one" });
    } catch (error) {
      console.warn("[sc-schedule-send-one] sync failed:", error?.message || error);
    }
  }

  const freshState = getErpState();
  const data = freshState.data || {};
  const workers = listWorkers(data);
  const clients = listClients(data);
  const schedule = listScSchedules(data).find((row) => String(row?.id ?? "") === id);

  if (!schedule) {
    return { ok: false, notFound: true, error: "\uC77C\uC815\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const participantNames = Array.isArray(schedule.participantNames)
    ? schedule.participantNames.filter(Boolean)
    : [];
  if (!participantNames.length) {
    return {
      ok: false,
      scheduleId: id,
      workDate: schedule.workDate,
      clientName: String(schedule.clientName || "").trim(),
      projectName: String(schedule.projectName || "").trim(),
      error: "\uCC38\uC5EC \uC2DC\uACF5\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
      skippedNoParticipants: true,
    };
  }

  let shareToken = "";
  let shareUrl = "";
  let shareError = null;
  if (isScScheduleSourceConfigured()) {
    const share = await ensureScScheduleShareLink(schedule.id);
    if (share.ok && share.shareToken) {
      shareToken = share.shareToken;
      shareUrl = String(share.url || buildScShareUrl(shareToken)).trim();
    } else if (!share.skipped) {
      shareError = String(share.error || share.reason || "share-link-failed");
    }
  }

  const fallbackManager = resolveClientManager(clients, schedule);
  const variables = formatScheduleTemplateVars(schedule, shareToken, fallbackManager, participantNames, workers);
  const results = [];
  const sentPhones = new Set();
  let sentCount = 0;

  const settings = normalizeNotificationSettings(data?.notificationSettings);
  const phoneFilter = Array.isArray(options.phones)
    ? new Set(options.phones.map((phone) => normalizeNotifyPhone(phone)).filter(Boolean))
    : null;
  const explicitRecipientTypes =
    Array.isArray(options.recipientTypes) && options.recipientTypes.length
      ? options.recipientTypes.map((value) => String(value || "").trim()).filter(Boolean)
      : null;
  const modeRecipientTypes =
    settings.scScheduleNotifyMode === "client"
      ? ["client"]
      : settings.scScheduleNotifyMode === "worker"
        ? ["worker"]
        : ["client", "worker"];
  const recipientTypes = new Set(explicitRecipientTypes || modeRecipientTypes);
  const sendClient = recipientTypes.has("client");
  const sendWorkers = recipientTypes.has("worker");

  async function sendToPhone(phone, recipientType, recipientName, messageVariables = variables) {
    const normalized = normalizeNotifyPhone(phone);
    if (!normalized) return false;
    if (phoneFilter && !phoneFilter.has(normalized)) {
      results.push({
        recipientType,
        participantName: recipientName,
        phone: normalized,
        ok: false,
        skipped: true,
        reason: "not-selected",
        shareUrl,
        variables: messageVariables,
      });
      return false;
    }
    if (sentPhones.has(normalized)) return false;
    sentPhones.add(normalized);
    const result = await sendScheduleAlimtalk({ phones: [normalized], variables: messageVariables });
    const delivered = result.ok !== false && !result.skipped;
    if (delivered) sentCount += 1;
    results.push({
      recipientType,
      participantName: recipientName,
      phone: normalized,
      ok: delivered,
      skipped: Boolean(result.skipped),
      reason: result.skipped ? result.reason : result.ok === false ? result.error : undefined,
      result,
      shareUrl,
      variables: messageVariables,
    });
    return true;
  }

  if (sendClient) {
    const clientContacts = resolveClientContacts(clients, schedule);
    if (!clientContacts.length) {
      if (!phoneFilter) {
        results.push({
          recipientType: "client",
          participantName: fallbackManager,
          phone: null,
          ok: false,
          skipped: true,
          reason: "no-client-phone",
          shareUrl,
          variables,
        });
      }
    } else {
      for (const contact of clientContacts) {
        const contactVariables = formatScheduleTemplateVars(
          schedule,
          shareToken,
          contact.name || fallbackManager,
          participantNames,
          workers,
        );
        if (!contact.phone) {
          if (!phoneFilter) {
            results.push({
              recipientType: "client",
              participantName: contact.name || contact.clientName,
              phone: null,
              ok: false,
              skipped: true,
              reason: "no-client-phone",
              shareUrl,
              variables: contactVariables,
            });
          }
          continue;
        }
        if (phoneFilter && !phoneFilter.has(normalizeNotifyPhone(contact.phone))) {
          results.push({
            recipientType: "client",
            participantName: contact.name || contact.clientName,
            phone: normalizeNotifyPhone(contact.phone),
            ok: false,
            skipped: true,
            reason: "not-selected",
            shareUrl,
            variables: contactVariables,
          });
          continue;
        }
        await sendToPhone(contact.phone, "client", contact.name || contact.clientName, contactVariables);
      }
    }
  }

  if (sendWorkers) {
    for (const participantName of participantNames) {
    const phone = resolveWorkerPhone(workers, participantName);
    if (!phone) {
      if (!phoneFilter) {
        results.push({
          recipientType: "worker",
          participantName,
          phone: null,
          ok: false,
          skipped: true,
          reason: "no-phone",
          shareUrl,
          variables,
        });
      }
      continue;
    }
    const normalized = normalizeNotifyPhone(phone);
    if (phoneFilter && !phoneFilter.has(normalized)) {
      results.push({
        recipientType: "worker",
        participantName,
        phone: normalized,
        ok: false,
        skipped: true,
        reason: "not-selected",
        shareUrl,
        variables,
      });
      continue;
    }
    await sendToPhone(phone, "worker", participantName);
    }
  }

  const failedCount = results.filter((row) => !row.ok).length;

  console.log(
    "[sc-schedule-send-one]",
    id,
    schedule.workDate,
    "sent",
    sentCount,
    "failed",
    failedCount,
  );

  return {
    ok: true,
    scheduleId: id,
    workDate: schedule.workDate,
    clientName: String(schedule.clientName || "").trim(),
    projectName: String(schedule.projectName || "").trim(),
    shareUrl,
    shareToken,
    shareError,
    sentCount,
    failedCount,
    notifyCount: results.filter((row) => row.phone).length,
    missingPhoneCount: results.filter((row) => !row.phone).length,
    results,
    variables,
  };
}
