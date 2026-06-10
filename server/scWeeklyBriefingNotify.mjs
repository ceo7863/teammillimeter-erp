import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";
import { sendWeeklyBriefingAlimtalk } from "./alimtalkNotify.mjs";
import { resolveScScheduleSiteName } from "./scScheduleSiteName.mjs";
import { isScScheduleSourceConfigured, runScScheduleSync } from "./scScheduleSync.mjs";
import { normalizeNotifyPhone, resolveClientContacts, resolveClientManagerName } from "./clientContacts.mjs";
import { normalizeNotificationSettings } from "./notificationSettings.mjs";

export { resolveScScheduleSiteName as resolveWeeklyBriefingSiteName };

function nowKstParts(now = new Date()) {
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return {
    dateKey: `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`,
  };
}

function addDaysISO(dateStr, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!match) return dateStr;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  if (Number.isNaN(date.getTime())) return dateStr;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayOfWeekFromISO(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!match) return 0;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDay();
}

export function weekRangeISO(anchorISO = nowKstParts().dateKey) {
  const day = dayOfWeekFromISO(anchorISO);
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const startDate = addDaysISO(anchorISO, mondayOffset);
  const endDate = addDaysISO(startDate, 6);
  return { startDate, endDate };
}

function listScSchedules(data) {
  return Array.isArray(data?.scSchedules) ? data.scSchedules : [];
}

function listClients(data) {
  return Array.isArray(data?.clients) ? data.clients : [];
}

export function scheduleHeadcount(schedule) {
  const expected = schedule?.expectedHeadcount;
  if (expected != null && Number.isFinite(Number(expected))) return Math.max(0, Number(expected));
  const count = Number(schedule?.participantCount || 0);
  if (count > 0) return count;
  const names = Array.isArray(schedule?.participantNames)
    ? schedule.participantNames.filter(Boolean)
    : [];
  return names.length;
}

export function normalizeWeeklySiteNameForMatch(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function levenshteinDistance(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const matrix = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[left.length][right.length];
}

export function weeklySiteMatchScore(nameA, nameB) {
  const a = normalizeWeeklySiteNameForMatch(nameA);
  const b = normalizeWeeklySiteNameForMatch(nameB);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    if (shorter >= 4 && shorter / longer >= 0.75) return 92;
  }
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 0;
  const ratio = 1 - distance / maxLen;
  return Math.round(ratio * 100);
}

export function weeklySiteNamesMatch(nameA, nameB, minScore = 85) {
  return weeklySiteMatchScore(nameA, nameB) >= minScore;
}

export function resolveWeeklySiteDisplayName(nameVariants) {
  const entries = [...(nameVariants instanceof Map ? nameVariants.entries() : Object.entries(nameVariants || {}))];
  if (!entries.length) return "";
  if (entries.length === 1) return entries[0][0];

  entries.sort((a, b) => {
    const countDiff = (b[1]?.count || 0) - (a[1]?.count || 0);
    if (countDiff !== 0) return countDiff;
    return String(a[1]?.earliestDate || "").localeCompare(String(b[1]?.earliestDate || ""));
  });
  return entries[0][0];
}

function trackWeeklySiteNameVariant(siteGroup, siteName, workDate) {
  const key = String(siteName || "").trim();
  if (!key) return;
  if (!siteGroup.nameVariants) siteGroup.nameVariants = new Map();
  const prev = siteGroup.nameVariants.get(key) || { count: 0, earliestDate: workDate };
  siteGroup.nameVariants.set(key, {
    count: prev.count + 1,
    earliestDate:
      !prev.earliestDate || (workDate && workDate < prev.earliestDate) ? workDate : prev.earliestDate,
  });
}

export function weeklySiteGroupKey(schedule) {
  const siteName = resolveScScheduleSiteName(schedule);
  const normalized = normalizeWeeklySiteNameForMatch(siteName);
  if (normalized) return `site:${normalized}`;
  const projectName = normalizeWeeklySiteNameForMatch(schedule?.projectName);
  if (projectName) return `site:${projectName}`;
  return `site:${String(schedule?.id || "unknown")}`;
}

export function weeklyClientGroupKey(schedule) {
  const clientId = String(schedule?.clientId || "").trim();
  if (clientId) return `client:${clientId}`;
  const clientName = String(schedule?.clientName || "").trim();
  return `client-name:${clientName || schedule?.id || "unknown"}`;
}

export function filterSchedulesForWeek(schedules, startDate, endDate) {
  const start = String(startDate || "").slice(0, 10);
  const end = String(endDate || "").slice(0, 10);
  return schedules.filter((row) => {
    const date = String(row?.workDate || "").slice(0, 10);
    return date >= start && date <= end;
  });
}

export function formatWeeklyKoDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").slice(0, 10));
  if (!match) return "";
  const month = Number(match[2]);
  const day = Number(match[3]);
  return `${month}\uC6D4${day}`;
}

function monthFromISO(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").slice(0, 10));
  return match ? Number(match[2]) : 0;
}

function dayFromISO(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").slice(0, 10));
  return match ? Number(match[3]) : 0;
}

function splitConsecutiveDateGroups(sortedDates) {
  const dates = sortedDates.filter(Boolean);
  if (!dates.length) return [];
  const groups = [[dates[0]]];
  for (let index = 1; index < dates.length; index += 1) {
    const prev = dates[index - 1];
    const current = dates[index];
    if (addDaysISO(prev, 1) === current) {
      groups[groups.length - 1].push(current);
    } else {
      groups.push([current]);
    }
  }
  return groups;
}

function formatWeeklyConsecutiveGroup(group) {
  if (!group.length) return "";
  if (group.length === 1) return `${formatWeeklyKoDate(group[0])}\uC77C`;
  const firstMonth = monthFromISO(group[0]);
  const lastMonth = monthFromISO(group[group.length - 1]);
  if (firstMonth === lastMonth) {
    return `${firstMonth}\uC6D4${dayFromISO(group[0])}~${dayFromISO(group[group.length - 1])}\uC77C`;
  }
  return `${formatWeeklyKoDate(group[0])}~${formatWeeklyKoDate(group[group.length - 1])}\uC77C`;
}

export function formatWeeklyDateRange(sortedDates) {
  if (!sortedDates.length) return "";
  const groups = splitConsecutiveDateGroups([...sortedDates].sort((a, b) => a.localeCompare(b)));
  if (!groups.length) return "";
  if (groups.length === 1) return formatWeeklyConsecutiveGroup(groups[0]);

  const anchorMonth = monthFromISO(groups[0][0]);
  return groups
    .map((group, index) => {
      if (group.length >= 2) return formatWeeklyConsecutiveGroup(group);
      const dayMonth = monthFromISO(group[0]);
      const day = dayFromISO(group[0]);
      if (index === 0 || dayMonth !== anchorMonth) return `${formatWeeklyKoDate(group[0])}\uC77C`;
      return `${day}\uC77C`;
    })
    .join(",");
}

export function formatWeeklyHeadcounts(dayEntries) {
  return dayEntries.map((entry) => String(entry.headcount)).join(" ");
}

export function formatWeeklyBriefingSiteNameForAlimtalk(siteName) {
  const name = String(siteName || "").trim();
  if (!name) return "";
  // 알림톡 변수 치환값에는 굵게 마크업이 없어 【】로 현장명을 구분합니다.
  return `【${name}】`;
}

export function formatWeeklyBriefingSiteDetail(sites) {
  const rows = Array.isArray(sites) ? sites : [];
  return rows
    .map((row) => {
      const siteLine = formatWeeklyBriefingSiteNameForAlimtalk(row.siteName);
      const dates = String(row.dateRange || "").trim();
      const counts = String(row.headcounts || "").trim();
      const info = [dates, counts].filter(Boolean).join(" · ");
      return info ? `${siteLine}\n${info}` : siteLine;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function formatWeeklyBriefingTemplateVars(group) {
  const siteDetail =
    String(group.siteDetail || "").trim() ||
    formatWeeklyBriefingSiteDetail(group.sites || []);
  return {
    client: String(group.clientName || "").trim(),
    site: String(group.siteName || "").trim(),
    siteDetail,
    clientManager: String(group.clientManager || "").trim() || "-",
    dateRange: String(group.dateRange || "").trim(),
    headcounts: String(group.headcounts || "").trim(),
    weekLabel: String(group.weekLabel || "").trim(),
  };
}

export function formatWeeklyBriefingSiteLines(sites) {
  const rows = Array.isArray(sites) ? sites : [];
  return {
    siteName: rows
      .map((row) => formatWeeklyBriefingSiteNameForAlimtalk(row.siteName))
      .filter(Boolean)
      .join("\n"),
    dateRange: rows.map((row) => String(row.dateRange || "").trim()).filter(Boolean).join("\n"),
    headcounts: rows.map((row) => String(row.headcounts || "").trim()).filter(Boolean).join("\n"),
    siteDetail: formatWeeklyBriefingSiteDetail(rows),
  };
}

function buildWeeklyBriefingRecipientRows(clients, group, variablesBase) {
  const rows = [];
  const seenKeys = new Set();

  function pushRow(name, phone, clientManagerLabel, contactId) {
    const participantName = String(name || "").trim();
    if (!participantName) return;
    const normalized = normalizeNotifyPhone(phone);
    const dedupeKey = String(contactId || "").trim() || normalized || `name:${participantName}`;
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);
    rows.push({
      recipientType: "client",
      participantName,
      phone: normalized || null,
      contactId: String(contactId || "").trim() || null,
      variables: formatWeeklyBriefingTemplateVars({
        ...variablesBase,
        clientManager: clientManagerLabel || participantName,
      }),
    });
  }

  for (const contact of resolveClientContacts(clients, group.sampleSchedule, { excludeSiteManager: true })) {
    pushRow(
      contact.name || contact.clientName,
      contact.phone,
      contact.name || variablesBase.clientManager,
      contact.contactId,
    );
  }

  if (!rows.length) {
    rows.push({
      recipientType: "client",
      participantName: variablesBase.clientManager || group.clientName,
      phone: null,
      variables: formatWeeklyBriefingTemplateVars(variablesBase),
    });
  }

  return rows;
}

function buildWeeklySiteEntry(siteGroup) {
  const sortedDates = [...siteGroup.dayMap.keys()].sort((a, b) => a.localeCompare(b));
  const dayEntries = sortedDates.map((date) => ({
    date,
    headcount: siteGroup.dayMap.get(date) || 0,
  }));
  const siteName = resolveWeeklySiteDisplayName(siteGroup.nameVariants) || siteGroup.siteName;
  return {
    siteKey: siteGroup.siteKey,
    siteName,
    siteManagerName: String(siteGroup.sampleSchedule?.siteManagerName || "").trim(),
    dateRange: formatWeeklyDateRange(sortedDates),
    headcounts: formatWeeklyHeadcounts(dayEntries),
    dayEntries,
    scheduleIds: siteGroup.scheduleIds.filter(Boolean),
    scheduleCount: siteGroup.scheduleIds.length,
  };
}

function buildWeeklyClientGroups(schedules, clients, weekStart, weekEnd) {
  const bucket = new Map();
  const weekLabel = `${formatWeeklyKoDate(weekStart)}~${formatWeeklyKoDate(weekEnd)}\uC77C`;

  for (const schedule of schedules) {
    const clientKey = weeklyClientGroupKey(schedule);
    const siteName = resolveScScheduleSiteName(schedule);
    const workDate = String(schedule.workDate || "").slice(0, 10);
    if (!workDate) continue;

    let clientGroup = bucket.get(clientKey);
    if (!clientGroup) {
      clientGroup = {
        groupKey: clientKey,
        clientId: String(schedule.clientId || "").trim(),
        clientName: String(schedule.clientName || "").trim(),
        siteMap: new Map(),
        scheduleIds: [],
        schedules: [],
        sampleSchedule: schedule,
      };
      bucket.set(clientKey, clientGroup);
    }

    clientGroup.scheduleIds.push(String(schedule.id || ""));
    clientGroup.schedules.push(schedule);

    const siteKey = weeklySiteGroupKey(schedule);
    let siteGroup = clientGroup.siteMap.get(siteKey);
    if (!siteGroup) {
      siteGroup = {
        siteKey,
        siteName,
        projectId: String(schedule?.scProjectId || "").trim(),
        scheduleIds: [],
        dayMap: new Map(),
        nameVariants: new Map(),
        sampleSchedule: schedule,
        earliestDate: workDate,
      };
      clientGroup.siteMap.set(siteKey, siteGroup);
    }

    trackWeeklySiteNameVariant(siteGroup, siteName, workDate);
    if (workDate < siteGroup.earliestDate) {
      siteGroup.earliestDate = workDate;
      siteGroup.sampleSchedule = schedule;
    }

    siteGroup.scheduleIds.push(String(schedule.id || ""));
    const prev = siteGroup.dayMap.get(workDate) || 0;
    siteGroup.dayMap.set(workDate, prev + scheduleHeadcount(schedule));
  }

  return [...bucket.values()]
    .map((group) => {
      const sites = [...group.siteMap.values()]
        .map((siteGroup) => buildWeeklySiteEntry(siteGroup))
        .sort((a, b) => a.siteName.localeCompare(b.siteName, "ko"));
      const siteLines = formatWeeklyBriefingSiteLines(sites);
      const sampleSchedule = group.sampleSchedule || group.schedules[0];
      const clientManager =
        resolveClientManagerName(clients, sampleSchedule) || group.clientName;
      const variablesBase = {
        clientName: group.clientName,
        siteName: siteLines.siteName,
        siteDetail: siteLines.siteDetail,
        clientManager,
        dateRange: siteLines.dateRange,
        headcounts: siteLines.headcounts,
        weekLabel,
        sites,
      };
      const recipientRows = buildWeeklyBriefingRecipientRows(clients, group, variablesBase);
      const variables = formatWeeklyBriefingTemplateVars(variablesBase);

      return {
        groupKey: group.groupKey,
        clientId: group.clientId,
        clientName: group.clientName,
        siteName: sites.length === 1 ? sites[0].siteName : siteLines.siteName,
        siteDetail: siteLines.siteDetail,
        clientManager,
        dateRange: siteLines.dateRange,
        headcounts: siteLines.headcounts,
        weekLabel,
        sites,
        siteCount: sites.length,
        dayEntries: sites.flatMap((site) => site.dayEntries),
        scheduleIds: group.scheduleIds.filter(Boolean),
        scheduleCount: group.scheduleIds.length,
        variables,
        recipientRows,
        notifyCount: recipientRows.filter((row) => row.phone).length,
        missingPhoneCount: recipientRows.filter((row) => !row.phone).length,
      };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName, "ko"));
}

export function buildScWeeklyBriefingPreview(data, options = {}) {
  const anchor = String(options.weekStart || options.anchorDate || nowKstParts().dateKey).slice(0, 10);
  const { startDate: weekStart, endDate: weekEnd } = weekRangeISO(anchor);

  const schedules = filterSchedulesForWeek(listScSchedules(data), weekStart, weekEnd);
  const clients = listClients(data);
  const groups = buildWeeklyClientGroups(schedules, clients, weekStart, weekEnd);

  return {
    weekStart,
    weekEnd,
    weekLabel: `${formatWeeklyKoDate(weekStart)}~${formatWeeklyKoDate(weekEnd)}\uC77C`,
    scheduleCount: schedules.length,
    clientCount: groups.length,
    siteCount: groups.reduce((sum, group) => sum + group.siteCount, 0),
    notifyCount: groups.reduce((sum, group) => sum + group.notifyCount, 0),
    missingPhoneCount: groups.reduce((sum, group) => sum + group.missingPhoneCount, 0),
    templateConfigured: Boolean(config.alimtalk.enabled && config.alimtalk.weeklyBriefingTemplate),
    groups,
  };
}

export async function buildScWeeklyBriefingPreviewAsync(options = {}) {
  if (options.skipSync !== true && isScScheduleSourceConfigured()) {
    await runScScheduleSync({
      updatedBy: String(options.updatedBy || "sc-weekly-briefing-preview"),
    });
  }
  const state = getErpState();
  return buildScWeeklyBriefingPreview(state.data || {}, options);
}

export function getScWeeklyBriefingNotifyStatus() {
  const state = getErpState();
  const settings = normalizeNotificationSettings(state.data?.notificationSettings);
  const meta = state.data?.scWeeklyBriefingNotifyMeta || {};
  return {
    enabled: Boolean(config.alimtalk.enabled && config.alimtalk.weeklyBriefingTemplate),
    template: config.alimtalk.weeklyBriefingTemplate || null,
    scheduleEnabled: settings.scWeeklyBriefingNotifyEnabled !== false,
    weekday: settings.scWeeklyBriefingWeekday,
    hour: settings.scWeeklyBriefingHour,
    minute: settings.scWeeklyBriefingMinute,
    lastWeekStart: meta.lastWeekStart || null,
    lastSentAt: meta.lastSentAt || null,
    lastSentCount: meta.sentCount ?? null,
  };
}

export async function runScWeeklyBriefingNotifyJob(options = {}) {
  if (!config.alimtalk.enabled) {
    return { ok: false, skipped: true, reason: "alimtalk-disabled" };
  }
  if (!config.alimtalk.weeklyBriefingTemplate) {
    return { ok: false, skipped: true, reason: "template-not-configured" };
  }

  const state = getErpState();
  const settings = normalizeNotificationSettings(options.settingsOverride ?? state.data?.notificationSettings);
  const forTest = options.force === true;
  if (!forTest && (!settings.enabled || settings.scWeeklyBriefingNotifyEnabled === false)) {
    return { ok: false, skipped: true, reason: "disabled" };
  }

  const anchor = String(options.weekStart || weekRangeISO(nowKstParts().dateKey).startDate).slice(0, 10);
  const { startDate: weekStart, endDate: weekEnd } = weekRangeISO(anchor);
  const existingMeta = state.data?.scWeeklyBriefingNotifyMeta || {};
  if (!forTest && existingMeta.lastWeekStart === weekStart && existingMeta.lastSentAt) {
    return { ok: true, skipped: true, reason: "already-ran-this-week", weekStart, weekEnd };
  }

  if (options.skipSync !== true && isScScheduleSourceConfigured()) {
    await runScScheduleSync({
      updatedBy: String(options.updatedBy || "sc-weekly-briefing-job"),
    });
  }

  const preview = buildScWeeklyBriefingPreview(getErpState().data || {}, { weekStart, weekEnd });
  const groupResults = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const group of preview.groups) {
    if (!group.notifyCount) continue;
    const result = await sendScWeeklyBriefingGroup(group.groupKey, {
      weekStart,
      skipSync: true,
      updatedBy: options.updatedBy,
    });
    groupResults.push(result);
    sentCount += result.sentCount ?? 0;
    failedCount += result.failedCount ?? 0;
  }

  const latest = getErpState();
  saveErpState(
    {
      ...(latest.data || {}),
      scWeeklyBriefingNotifyMeta: {
        lastWeekStart: weekStart,
        lastSentAt: new Date().toISOString(),
        sentCount,
        failedCount,
        clientCount: preview.clientCount,
        siteCount: preview.siteCount,
      },
    },
    latest.version,
    String(options.updatedBy || "sc-weekly-briefing-job"),
  );

  console.log("[notify] weekly briefing sent", weekStart, sentCount, "ok groups", groupResults.length);
  return {
    ok: sentCount > 0 || preview.groups.every((group) => !group.notifyCount),
    skipped: false,
    weekStart,
    weekEnd,
    weekLabel: preview.weekLabel,
    clientCount: preview.clientCount,
    siteCount: preview.siteCount,
    sentCount,
    failedCount,
    groupResults,
  };
}

export async function sendScWeeklyBriefingGroup(groupKey, options = {}) {
  if (!config.alimtalk.enabled) {
    return { ok: false, skipped: true, reason: "alimtalk-disabled" };
  }
  if (!config.alimtalk.weeklyBriefingTemplate) {
    return { ok: false, skipped: true, reason: "template-not-configured" };
  }

  const anchor = String(options.weekStart || "").slice(0, 10);
  if (!anchor) {
    return { ok: false, error: "weekStart\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  if (options.skipSync !== true && isScScheduleSourceConfigured()) {
    await runScScheduleSync({
      updatedBy: String(options.updatedBy || "sc-weekly-briefing-send"),
    });
  }

  const state = getErpState();
  const { startDate: weekStart, endDate: weekEnd } = weekRangeISO(anchor);
  const preview = buildScWeeklyBriefingPreview(state.data || {}, {
    weekStart,
    weekEnd,
  });
  const group = preview.groups.find((row) => row.groupKey === groupKey);
  if (!group) {
    return { ok: false, notFound: true, groupKey, weekStart: preview.weekStart };
  }

  const phoneFilter = Array.isArray(options.phones)
    ? new Set(options.phones.map((phone) => normalizeNotifyPhone(phone)).filter(Boolean))
    : null;

  const results = [];
  const sentPhones = new Set();
  let sentCount = 0;

  for (const row of group.recipientRows) {
    const normalized = normalizeNotifyPhone(row.phone);
    if (!normalized) {
      if (!phoneFilter) {
        results.push({
          recipientType: "client",
          participantName: row.participantName,
          phone: null,
          ok: false,
          skipped: true,
          reason: "no-client-phone",
          variables: row.variables,
        });
      }
      continue;
    }
    if (phoneFilter && !phoneFilter.has(normalized)) continue;
    if (sentPhones.has(normalized)) continue;
    sentPhones.add(normalized);

    const result = await sendWeeklyBriefingAlimtalk({
      phones: [normalized],
      variables: row.variables,
    });
    if (result.ok !== false && !result.skipped) sentCount += 1;
    results.push({
      recipientType: "client",
      participantName: row.participantName,
      phone: normalized,
      ok: result.ok !== false,
      result,
      variables: row.variables,
    });
  }

  const failedCount = results.filter((row) => !row.ok && !row.skipped).length;

  return {
    ok: sentCount > 0 || results.every((row) => row.skipped),
    groupKey,
    weekStart: preview.weekStart,
    weekEnd: preview.weekEnd,
    clientName: group.clientName,
    siteName: group.siteName,
    dateRange: group.dateRange,
    headcounts: group.headcounts,
    sentCount,
    failedCount,
    notifyCount: group.notifyCount,
    missingPhoneCount: group.missingPhoneCount,
    variables: group.variables,
    results,
  };
}
