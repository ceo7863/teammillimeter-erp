import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";
import {
  resolveScScheduleParticipantDetails,
  resolveScScheduleParticipants,
} from "./workerPhoneMatch.mjs";
import { levenshtein, maxEditDistanceFor } from "./erpChatFuzzy.mjs";
import { applyWorkerPortalLoginIdsFromSc, fetchScPortalLoginUsers } from "./scWorkerPortalSync.mjs";
import { withScPool } from "./scPool.mjs";

const COMPANY_SUFFIX_RE = /(\u3231|\(\uC8FC\)|\uC8FC\uC2DD\uD68C\uC0AC|\(\uC720\)|\uC720\uD55C|\uC720\uD55C\uD68C\uC0AC|co\.?ltd|corp|inc)/gi;

let syncPromise = null;
let intervalHandle = null;

export function normalizeScClientName(value) {
  return String(value || "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, "")
    .replace(COMPANY_SUFFIX_RE, "")
    .replace(/[\uFF08\uFF09()]/g, "")
    .trim()
    .toLowerCase();
}

function listClients(data) {
  return Array.isArray(data.clients) ? data.clients : [];
}

function clientIdsEqual(a, b) {
  return String(a ?? "") === String(b ?? "");
}

function listStoredScProjects(data) {
  const meta = data?.scScheduleSyncMeta;
  return Array.isArray(meta?.lastScProjects) ? meta.lastScProjects : [];
}

function listExcludedProjectIds(client) {
  const raw = client?.scProjectMappingExcludedProjectIds;
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => String(row || "").trim()).filter(Boolean);
}

function addExcludedProjectId(client, projectId) {
  const id = String(projectId || "").trim();
  if (!id) return client;
  const next = new Set(listExcludedProjectIds(client));
  next.add(id);
  return { ...client, scProjectMappingExcludedProjectIds: [...next] };
}

function removeExcludedProjectId(client, projectId) {
  const id = String(projectId || "").trim();
  if (!id) return client;
  const filtered = listExcludedProjectIds(client).filter((row) => row !== id);
  if (!filtered.length) {
    const next = { ...client };
    delete next.scProjectMappingExcludedProjectIds;
    return next;
  }
  return { ...client, scProjectMappingExcludedProjectIds: filtered };
}

export function listClientScProjectIds(client) {
  const fromArray = Array.isArray(client?.scProjectIds)
    ? client.scProjectIds.map((row) => String(row || "").trim()).filter(Boolean)
    : [];
  if (fromArray.length) return [...new Set(fromArray)];
  const legacy = String(client?.scProjectId || "").trim();
  return legacy ? [legacy] : [];
}

function listClientScProjectMappings(client) {
  const mappings = Array.isArray(client?.scProjectMappings) ? client.scProjectMappings : [];
  const byId = new Map();
  for (const row of mappings) {
    const projectId = String(row?.scProjectId || "").trim();
    if (!projectId) continue;
    byId.set(projectId, row);
  }

  const ids = listClientScProjectIds(client);
  if (!ids.length) return [];

  return ids.map((projectId) => {
    const existing = byId.get(projectId);
    if (existing) return existing;
    if (ids.length === 1 && String(client?.scProjectId || "").trim() === projectId) {
      return {
        scProjectId: projectId,
        ...(client.scProjectName ? { scProjectName: client.scProjectName } : {}),
        ...(client.scProjectMappingManual ? { manual: true } : {}),
        ...(client.scProjectMappingUpdatedAt ? { updatedAt: client.scProjectMappingUpdatedAt } : {}),
        ...(client.scProjectMappingUpdatedBy ? { updatedBy: client.scProjectMappingUpdatedBy } : {}),
      };
    }
    return { scProjectId: projectId };
  });
}

function migrateClientScProjectFields(client) {
  const ids = listClientScProjectIds(client);
  if (!ids.length) {
    const next = { ...client };
    delete next.scProjectId;
    delete next.scProjectName;
    delete next.scProjectIds;
    delete next.scProjectMappings;
    return next;
  }

  const mappings = listClientScProjectMappings(client);
  const next = {
    ...client,
    scProjectIds: ids,
    scProjectMappings: mappings,
  };
  delete next.scProjectId;
  delete next.scProjectName;
  return next;
}

function stripLegacyScProjectFields(client) {
  const next = { ...client };
  delete next.scProjectId;
  delete next.scProjectName;
  return next;
}

function removeScProjectFromClient(client, projectId, options = {}) {
  const id = String(projectId || "").trim();
  if (!id) return client;
  const ids = listClientScProjectIds(client).filter((row) => row !== id);
  const mappings = listClientScProjectMappings(client).filter((row) => String(row.scProjectId || "").trim() !== id);
  let next = stripLegacyScProjectFields({ ...client });

  if (ids.length) {
    next.scProjectIds = ids;
    next.scProjectMappings = mappings;
  } else {
    delete next.scProjectIds;
    delete next.scProjectMappings;
    delete next.scProjectMappingManual;
    delete next.scProjectMappingUpdatedAt;
    delete next.scProjectMappingUpdatedBy;
  }

  if (options.blockAutoRemap) {
    next = addExcludedProjectId(next, id);
  }
  return next;
}

function addScProjectToClient(client, projectId, projectName, actor = "", manual = false) {
  const id = String(projectId || "").trim();
  if (!id) return client;
  const ids = [...new Set([...listClientScProjectIds(client), id])];
  const mappings = [...listClientScProjectMappings(client)];
  const index = mappings.findIndex((row) => String(row.scProjectId || "").trim() === id);
  const now = new Date().toISOString();
  const actorText = String(actor || "").trim();
  const entry = {
    scProjectId: id,
    scProjectName: String(projectName || mappings[index]?.scProjectName || "").trim(),
    ...(manual
      ? {
          manual: true,
          updatedAt: now,
          updatedBy: actorText || mappings[index]?.updatedBy || client.scProjectMappingUpdatedBy,
        }
      : {}),
  };
  if (index >= 0) mappings[index] = { ...mappings[index], ...entry };
  else mappings.push(entry);

  let next = stripLegacyScProjectFields({
    ...client,
    scProjectIds: ids,
    scProjectMappings: mappings,
    ...(manual
      ? {
          scProjectMappingManual: true,
          scProjectMappingUpdatedAt: now,
          scProjectMappingUpdatedBy: actorText || client.scProjectMappingUpdatedBy,
        }
      : {}),
  });
  next = removeExcludedProjectId(next, id);
  return next;
}

function mappingEntryPriority(client, projectId) {
  const mapping = listClientScProjectMappings(client).find(
    (row) => String(row.scProjectId || "").trim() === String(projectId || "").trim(),
  );
  let score = 0;
  if (mapping?.manual || client.scProjectMappingManual) score += 100;
  const updatedAt = Date.parse(String(mapping?.updatedAt || client.scProjectMappingUpdatedAt || ""));
  if (Number.isFinite(updatedAt)) score += updatedAt / 1_000_000_000_000;
  return score;
}

function dedupeScProjectClientMappings(clients) {
  const migrated = clients.map(migrateClientScProjectFields);
  const winners = new Map();

  for (const client of migrated) {
    for (const projectId of listClientScProjectIds(client)) {
      const priority = mappingEntryPriority(client, projectId);
      const prev = winners.get(projectId);
      if (!prev || priority >= prev.priority) {
        winners.set(projectId, { client, priority });
      }
    }
  }

  return migrated.map((client) => {
    let next = client;
    for (const projectId of listClientScProjectIds(client)) {
      const winner = winners.get(projectId);
      if (winner && !clientIdsEqual(winner.client.id, client.id)) {
        next = removeScProjectFromClient(next, projectId, { blockAutoRemap: true });
      }
    }
    return next;
  });
}

function listScSchedules(data) {
  return Array.isArray(data.scSchedules) ? data.scSchedules : [];
}

function normalizeScScheduleWorkLog(raw) {
  if (!raw || typeof raw !== "object") return null;
  const startTime = String(raw.startTime || "").trim();
  const endTime = String(raw.endTime || "").trim();
  if (!startTime || !endTime) return null;
  const durationRaw = raw.durationMinutes ?? raw.duration;
  const durationMinutes =
    durationRaw == null || durationRaw === "" ? null : Math.max(0, Number(durationRaw) || 0);
  return {
    startTime,
    endTime,
    ...(durationMinutes != null && durationMinutes > 0 ? { durationMinutes } : {}),
  };
}

function normalizeWorkLogFromScheduleRow(row) {
  return normalizeScScheduleWorkLog(row?.workLog);
}

function monthRangeUtc(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function formatUtcDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function syncWindowMonths() {
  const months = Number(config.sc.scheduleSyncMonths || 4);
  const now = new Date();
  const centerYear = now.getUTCFullYear();
  const centerMonth = now.getUTCMonth() + 1;
  const half = Math.max(0, Math.floor((months - 1) / 2));
  const ranges = [];
  for (let offset = -half; offset < months - half; offset += 1) {
    const date = new Date(Date.UTC(centerYear, centerMonth - 1 + offset, 1));
    ranges.push({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 });
  }
  const first = monthRangeUtc(ranges[0].year, ranges[0].month);
  const last = monthRangeUtc(ranges[ranges.length - 1].year, ranges[ranges.length - 1].month);
  return { ranges, start: first.start, end: last.end };
}

function isCalwalkScheduleSourceConfigured() {
  const base = String(config.calwalk?.apiBaseUrl || "").trim();
  const secret = String(config.calwalk?.exportSecret || "").trim();
  const workspace = String(config.calwalk?.workspaceSlug || "").trim();
  if (!base || !secret || !workspace) return false;
  if (config.calwalk?.scheduleSyncEnabled === false) return false;
  const hasDedicatedSecret = Boolean(
    process.env.CALWALK_ERP_EXPORT_SECRET?.trim() || process.env.ERP_SYNC_SECRET?.trim(),
  );
  if (!hasDedicatedSecret && process.env.CALWALK_SCHEDULE_SYNC_ENABLED !== "true") return false;
  return true;
}


export function resolveScheduleSyncSource() {
  const forced = String(process.env.SC_SCHEDULE_SYNC_SOURCE || "auto").trim().toLowerCase();
  if (forced === "sc") {
    if (String(config.sc.databaseUrl || "").trim()) return "sc-db";
    if (
      Boolean(String(config.sc.apiBaseUrl || "").trim()) &&
      Boolean(String(config.sc.syncSecret || "").trim())
    ) {
      return "sc-api";
    }
    return null;
  }
  if (forced === "calwalk") {
    return isCalwalkScheduleSourceConfigured() ? "calwalk" : null;
  }
  if (isCalwalkScheduleSourceConfigured()) return "calwalk";
  if (String(config.sc.databaseUrl || "").trim()) return "sc-db";
  if (
    Boolean(String(config.sc.apiBaseUrl || "").trim()) &&
    Boolean(String(config.sc.syncSecret || "").trim())
  ) {
    return "sc-api";
  }
  return null;
}

export function isScScheduleSourceConfigured() {
  return resolveScheduleSyncSource() != null;
}

function normalizeCalwalkProjects(projects) {
  if (!Array.isArray(projects)) return [];
  return projects
    .map((row) => ({
      id: String(row.id || "").trim(),
      name: String(row.name || "").trim(),
      address: row.address ? String(row.address).trim() : "",
      isActive: row.isActive !== false,
    }))
    .filter((row) => row.id && row.name);
}

function normalizeCalwalkParticipant(row) {
  const participantName = String(row?.participantName || row?.name || "").trim();
  if (!participantName) return null;
  const mealRaw = row?.meal;
  const expenseRaw = row?.expense;
  const meal =
    mealRaw == null || mealRaw === "" ? null : Math.max(0, Number(mealRaw) || 0);
  const expense =
    expenseRaw == null || expenseRaw === "" ? null : Math.max(0, Number(expenseRaw) || 0);
  const workLog = normalizeWorkLogFromScheduleRow({ workLog: row?.workLog });
  return {
    participantName,
    name: String(row?.name || participantName).trim(),
    ...(meal != null && meal > 0 ? { meal } : {}),
    ...(expense != null && expense > 0 ? { expense } : {}),
    ...(workLog ? { workLog } : {}),
  };
}

function normalizeCalwalkSchedules(schedules) {
  if (!Array.isArray(schedules)) return [];
  return schedules
    .map((row) => {
      const id = String(row.id || row.calwalkEventId || "").trim();
      const participants = Array.isArray(row.participants)
        ? row.participants.map((entry) => normalizeCalwalkParticipant(entry)).filter(Boolean)
        : [];
      const participantNames = Array.isArray(row.participantNames)
        ? row.participantNames.map((name) => String(name || "").trim()).filter(Boolean)
        : participants.map((entry) => entry.participantName);
      const workLog = normalizeWorkLogFromScheduleRow(row);
      return {
        id,
        scProjectId: String(row.calwalkClientId || "").trim(),
        projectName: String(row.projectName || row.clientName || row.workType || "").trim(),
        siteManagerName: String(row.siteManagerName || "").trim(),
        workDate: String(row.workDate || "").slice(0, 10),
        startTime: String(row.startTime || "").trim(),
        endTime: row.endTime ? String(row.endTime).trim() : "",
        workType: String(row.workType || "").trim(),
        expectedHeadcount:
          row.expectedHeadcount == null || row.expectedHeadcount === ""
            ? null
            : Number(row.expectedHeadcount),
        participantNames,
        ...(participants.length ? { participants } : {}),
        participantCount: Number.isFinite(Number(row.participantCount))
          ? Number(row.participantCount)
          : participantNames.length,
        ...(workLog ? { workLog } : {}),
      };
    })
    .filter((row) => row.id && row.workDate);
}

async function fetchCalwalkDataFromApi(start, end) {
  const base = String(config.calwalk.apiBaseUrl || "").trim().replace(/\/$/, "");
  const secret = String(config.calwalk.exportSecret || "").trim();
  const workspace = String(config.calwalk.workspaceSlug || "teammm").trim();
  if (!base || !secret || !workspace) {
    throw new Error("CalWalk export sync is not configured");
  }
  const startKey = formatUtcDate(start);
  const endKey = formatUtcDate(end);
  const url = `${base}/api/integrations/erp/schedule-export?workspace=${encodeURIComponent(workspace)}&start=${encodeURIComponent(startKey)}&end=${encodeURIComponent(endKey)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`CalWalk export ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return response.json();
}

async function fetchScDataFromApi(start, end) {
  const base = String(config.sc.apiBaseUrl || "").trim().replace(/\/$/, "");
  const secret = String(config.sc.syncSecret || "").trim();
  if (!base || !secret) {
    throw new Error("SC API sync is not configured");
  }
  const startKey = formatUtcDate(start);
  const endKey = formatUtcDate(end);
  const url = `${base}/api/erp/schedule-export?start=${encodeURIComponent(startKey)}&end=${encodeURIComponent(endKey)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`SC API ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return response.json();
}

async function loadScProjectsAndSchedules(start, end) {
  const source = resolveScheduleSyncSource();
  if (source === "calwalk") {
    const payload = await fetchCalwalkDataFromApi(start, end);
    return {
      projects: normalizeCalwalkProjects(payload?.projects),
      schedules: normalizeCalwalkSchedules(payload?.schedules),
      source: "calwalk",
    };
  }
  if (source === "sc-db") {
    return withScPool(async (pool) => ({
      projects: await fetchScProjects(pool),
      schedules: await fetchScSchedules(pool, start, end),
      source: "sc-db",
    }));
  }
  if (source === "sc-api") {
    const payload = await fetchScDataFromApi(start, end);
    return {
      projects: Array.isArray(payload?.projects) ? payload.projects : [],
      schedules: Array.isArray(payload?.schedules) ? payload.schedules : [],
      source: "sc-api",
    };
  }
  throw new Error("No schedule sync source configured");
}

async function fetchScProjects(pool) {
  const { rows } = await pool.query(`
    SELECT id, name, address, "isActive"
    FROM projects
    WHERE "isActive" = true
    ORDER BY name ASC
  `);
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name || "").trim(),
    address: row.address ? String(row.address).trim() : "",
    isActive: row.isActive !== false,
  }));
}

async function fetchScSchedules(pool, startDate, endDate) {
  const { rows } = await pool.query(
    `
    SELECT
      s.id,
      s."projectId",
      s."workDate",
      s."startTime",
      s."endTime",
      s."workType",
      s."expectedHeadcount",
      p.name AS project_name,
      p."siteManagerName" AS site_manager_name
    FROM schedules s
    JOIN projects p ON p.id = s."projectId"
    WHERE s."workDate" >= $1
      AND s."workDate" < $2
      AND p."isActive" = true
    ORDER BY s."workDate" ASC, s."startTime" ASC
  `,
    [startDate, endDate],
  );

  if (!rows.length) return [];

  const scheduleIds = rows.map((row) => String(row.id));
  const { rows: participantRows } = await pool.query(
    `
    SELECT sp."scheduleId", u.name
    FROM schedule_participants sp
    JOIN users u ON u.id = sp."userId"
    WHERE sp."scheduleId" = ANY($1::text[])
    ORDER BY u.name ASC
  `,
    [scheduleIds],
  );

  const participantsBySchedule = new Map();
  for (const row of participantRows) {
    const key = String(row.scheduleId);
    const bucket = participantsBySchedule.get(key) || [];
    const name = String(row.name || "").trim();
    if (name) bucket.push(name);
    participantsBySchedule.set(key, bucket);
  }

  const workLogsBySchedule = new Map();
  try {
    const { rows: workLogRows } = await pool.query(
      `
      SELECT wl."scheduleId", wl."startTime", wl."endTime", wl.duration
      FROM work_logs wl
      WHERE wl."scheduleId" = ANY($1::text[])
      `,
      [scheduleIds],
    );
    for (const row of workLogRows) {
      const workLog = normalizeScScheduleWorkLog({
        startTime: row.startTime,
        endTime: row.endTime,
        durationMinutes: row.duration,
      });
      if (workLog) workLogsBySchedule.set(String(row.scheduleId), workLog);
    }
  } catch (error) {
    const message = String(error?.message || error || "");
    if (!message.includes('relation "work_logs" does not exist')) {
      throw error;
    }
  }

  return rows.map((row) => {
    const id = String(row.id);
    const participantNames = participantsBySchedule.get(id) || [];
    const workDate = row.workDate instanceof Date ? formatUtcDate(row.workDate) : String(row.workDate || "").slice(0, 10);
    const workLog = workLogsBySchedule.get(id) || null;
    return {
      id,
      scProjectId: String(row.projectId),
      projectName: String(row.project_name || "").trim(),
      siteManagerName: String(row.site_manager_name || "").trim(),
      workDate,
      startTime: String(row.startTime || "").trim(),
      endTime: row.endTime ? String(row.endTime).trim() : "",
      workType: String(row.workType || "").trim(),
      expectedHeadcount:
        row.expectedHeadcount == null || row.expectedHeadcount === "" ? null : Number(row.expectedHeadcount),
      participantNames,
      participantCount: participantNames.length,
      ...(workLog ? { workLog } : {}),
    };
  });
}

function findScProjectForClientName(clientName, projects) {
  const clientKey = normalizeScClientName(clientName);
  if (!clientKey) return null;

  const exact = projects.find((project) => normalizeScClientName(project.name) === clientKey);
  if (exact) return exact;

  let best = null;
  let bestScore = Infinity;
  for (const project of projects) {
    const projectKey = normalizeScClientName(project.name);
    if (!projectKey) continue;
    if (clientKey.includes(projectKey) || projectKey.includes(clientKey)) {
      const score = Math.abs(clientKey.length - projectKey.length);
      if (score < bestScore) {
        bestScore = score;
        best = project;
      }
      continue;
    }
    const distance = levenshtein(clientKey, projectKey);
    if (distance <= maxEditDistanceFor(clientKey) && distance < bestScore) {
      bestScore = distance;
      best = project;
    }
  }
  return best;
}

export function autoMapScProjectsToClients(clients, projects) {
  const projectByKey = new Map();
  const projectById = new Map();
  for (const project of projects) {
    projectById.set(project.id, project);
    const key = normalizeScClientName(project.name);
    if (!key || projectByKey.has(key)) continue;
    projectByKey.set(key, project);
  }

  const assignedProjectIds = new Set();
  let mappedCount = 0;

  const withExisting = clients.map((client) => migrateClientScProjectFields(client)).map((client) => {
    const clientName = String(client.name || "").trim();
    if (!clientName) return client;

    let next = client;
    for (const existingProjectId of listClientScProjectIds(client)) {
      if (projectById.has(existingProjectId)) {
        if (assignedProjectIds.has(existingProjectId)) {
          next = removeScProjectFromClient(next, existingProjectId, { blockAutoRemap: true });
          continue;
        }
        assignedProjectIds.add(existingProjectId);
        mappedCount += 1;
        const linked = projectById.get(existingProjectId);
        next = addScProjectToClient(next, existingProjectId, linked?.name || clientName, "", false);
        continue;
      }
      next = removeScProjectFromClient(next, existingProjectId, { blockAutoRemap: true });
    }

    return next;
  });

  const nextClients = withExisting.map((client) => {
    const clientName = String(client.name || "").trim();
    if (!clientName) return client;
    if (listClientScProjectIds(client).length) return client;
    if (client.scProjectMappingManual) return client;

    const clientKey = normalizeScClientName(clientName);
    const matched = clientKey ? projectByKey.get(clientKey) : null;
    if (!matched) return client;
    if (assignedProjectIds.has(matched.id)) return client;
    if (listExcludedProjectIds(client).includes(matched.id)) return client;

    assignedProjectIds.add(matched.id);
    mappedCount += 1;
    return addScProjectToClient(client, matched.id, matched.name, "", false);
  });

  return { clients: dedupeScProjectClientMappings(nextClients), mappedCount };
}

function buildScProjectMappingStatus(clients, projects) {
  const mappedProjectIds = new Set();
  const mappings = [];

  for (const client of clients) {
    for (const mapping of listClientScProjectMappings(client)) {
      const projectId = String(mapping.scProjectId || "").trim();
      if (!projectId) continue;
      mappedProjectIds.add(projectId);
      const project = projects.find((row) => row.id === projectId);
      mappings.push({
        scProjectId: projectId,
        scProjectName: String(mapping.scProjectName || project?.name || "").trim(),
        clientId: client.id,
        clientName: String(client.name || "").trim(),
        manual: Boolean(mapping.manual || client.scProjectMappingManual),
        updatedAt: mapping.updatedAt || client.scProjectMappingUpdatedAt || null,
      });
    }
  }

  mappings.sort((a, b) => a.scProjectName.localeCompare(b.scProjectName, "ko"));

  const unmapped = projects
    .filter((project) => !mappedProjectIds.has(project.id))
    .map((project) => ({
      scProjectId: project.id,
      scProjectName: project.name,
      address: project.address || "",
    }))
    .sort((a, b) => a.scProjectName.localeCompare(b.scProjectName, "ko"));

  return {
    mappings,
    unmapped,
    projectCount: projects.length,
    mappedCount: mappings.length,
    unmappedCount: unmapped.length,
  };
}

async function resolveScProjectsForMapping(data) {
  const stored = listStoredScProjects(data);
  if (stored.length) return stored;
  if (!isScScheduleSourceConfigured()) return [];
  const { start, end } = syncWindowMonths();
  const result = await loadScProjectsAndSchedules(start, end);
  return result.projects;
}

export async function listScProjectMappingStatus() {
  const state = getErpState();
  const data = state.data || {};
  const clients = listClients(data);
  const projects = await resolveScProjectsForMapping(data);
  const status = buildScProjectMappingStatus(clients, projects);
  return {
    ok: true,
    configured: isScScheduleSourceConfigured(),
    ...status,
  };
}

function applyScProjectClientMapping(clients, scProjectId, clientId, projectName, actor = "") {
  const normalizedProjectId = String(scProjectId || "").trim();
  if (!normalizedProjectId) {
    return { ok: false, status: 400, error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 SC \uD504\uB85C\uC81D\uD2B8\uC785\uB2C8\uB2E4." };
  }

  const nextClients = clients.map((client) => {
    if (clientIdsEqual(client.id, clientId)) return client;
    if (!listClientScProjectIds(client).includes(normalizedProjectId)) return client;
    return removeScProjectFromClient(client, normalizedProjectId, { blockAutoRemap: true });
  });

  const targetIndex = nextClients.findIndex((client) => clientIdsEqual(client.id, clientId));
  if (targetIndex < 0) {
    return { ok: false, status: 404, error: "\uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  nextClients[targetIndex] = addScProjectToClient(
    nextClients[targetIndex],
    normalizedProjectId,
    projectName,
    actor,
    true,
  );

  return { ok: true, clients: nextClients.map(migrateClientScProjectFields) };
}

export async function setScProjectClientMapping(scProjectId, clientId, actor = "") {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};
  const projects = await resolveScProjectsForMapping(data);
  const normalizedProjectId = String(scProjectId || "").trim();
  const project = projects.find((row) => row.id === normalizedProjectId);
  if (!project) {
    return { ok: false, status: 404, error: "SC \uD504\uB85C\uC81D\uD2B8\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. SC \uB3D9\uAE30\uD654\uB97C \uBA3C\uC800 \uC2E4\uD589\uD574 \uC8FC\uC138\uC694." };
  }

  const applied = applyScProjectClientMapping(listClients(data), normalizedProjectId, clientId, project.name, actor);
  if (!applied.ok) return applied;

  saveErpState(
    {
      ...data,
      clients: applied.clients,
      scScheduleSyncMeta: {
        ...(data.scScheduleSyncMeta || {}),
        lastScProjects: projects.length ? projects : data.scScheduleSyncMeta?.lastScProjects || [],
      },
    },
    state.version,
    actor ? `sc-project-mapping:set:${actor}` : "sc-project-mapping:set",
  );

  const syncResult = await runScScheduleSync({
    updatedBy: actor ? `sc-project-mapping:${actor}` : "sc-project-mapping",
  });
  return {
    ok: true,
    scProjectId: normalizedProjectId,
    clientId,
    sync: syncResult,
  };
}

export async function clearScProjectClientMapping(scProjectId, actor = "") {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};
  const normalizedProjectId = String(scProjectId || "").trim();
  if (!normalizedProjectId) {
    return { ok: false, status: 400, error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 SC \uD504\uB85C\uC81D\uD2B8\uC785\uB2C8\uB2E4." };
  }

  let found = false;
  const nextClients = listClients(data).map((client) => {
    if (!listClientScProjectIds(client).includes(normalizedProjectId)) return client;
    found = true;
    return removeScProjectFromClient(client, normalizedProjectId, { blockAutoRemap: true });
  });
  if (!found) {
    return { ok: false, status: 404, error: "SC \uD504\uB85C\uC81D\uD2B8 \uB9E4\uCE6D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  saveErpState(
    { ...data, clients: nextClients },
    state.version,
    actor ? `sc-project-mapping:clear:${actor}` : "sc-project-mapping:clear",
  );

  const syncResult = await runScScheduleSync({
    updatedBy: actor ? `sc-project-mapping-clear:${actor}` : "sc-project-mapping-clear",
  });
  return {
    ok: true,
    scProjectId: normalizedProjectId,
    sync: syncResult,
  };
}

function buildProjectToClientMap(clients) {
  const map = new Map();
  for (const client of clients) {
    for (const projectId of listClientScProjectIds(client)) {
      map.set(projectId, client);
    }
  }
  return map;
}

function attachClientToSchedules(schedules, clients) {
  const projectToClient = buildProjectToClientMap(clients);
  const syncedAt = new Date().toISOString();
  return schedules.map((row) => {
    const client = projectToClient.get(row.scProjectId);
    const workLog = normalizeWorkLogFromScheduleRow(row);
    const base = {
      id: row.id,
      scProjectId: row.scProjectId,
      siteManagerName: String(row.siteManagerName || "").trim(),
      projectName: row.projectName,
      workDate: row.workDate,
      startTime: row.startTime,
      endTime: row.endTime || null,
      workType: row.workType,
      expectedHeadcount: row.expectedHeadcount,
      participantNames: row.participantNames,
      participantCount: row.participantCount,
      ...(Array.isArray(row.participants) && row.participants.length ? { participants: row.participants } : {}),
      ...(workLog ? { workLog } : {}),
      syncedAt,
    };
    if (!client) {
      return {
        ...base,
        clientId: null,
        clientName: "",
      };
    }
    return {
      ...base,
      clientId: client.id,
      clientName: String(client.name || row.projectName || "").trim(),
    };
  });
}

function mergeSchedulesInWindow(existing, incoming, windowStart, windowEnd) {
  const startKey = formatUtcDate(windowStart);
  const endKey = formatUtcDate(new Date(windowEnd.getTime() - 86400000));
  const kept = existing.filter((row) => {
    const date = String(row.workDate || "").slice(0, 10);
    return date < startKey || date > endKey;
  });
  const byId = new Map(kept.map((row) => [String(row.id), row]));
  for (const row of incoming) {
    byId.set(String(row.id), row);
  }
  return [...byId.values()].sort((a, b) => {
    const dateCmp = String(a.workDate).localeCompare(String(b.workDate));
    if (dateCmp !== 0) return dateCmp;
    return String(a.startTime || "").localeCompare(String(b.startTime || ""));
  });
}

function findClientByRequestToken(data, token) {
  const normalized = String(token || "").trim();
  if (!normalized) return null;
  return listClients(data).find((row) => String(row.siteRequestToken || "").trim() === normalized) || null;
}

export function filterScSchedulesForClient(schedules, clientId, monthKey) {
  const clientKey = String(clientId ?? "");
  const month = String(monthKey || "").trim();
  return schedules.filter((row) => {
    if (String(row.clientId ?? "") !== clientKey) return false;
    if (!month) return true;
    return String(row.workDate || "").slice(0, 7) === month;
  });
}

export function sanitizePublicScSchedule(row, workers = []) {
  const participantNames = Array.isArray(row.participantNames) ? row.participantNames : [];
  const workLog = normalizeWorkLogFromScheduleRow(row);
  return {
    id: row.id,
    workDate: row.workDate,
    startTime: row.startTime,
    endTime: row.endTime,
    workType: row.workType,
    expectedHeadcount: row.expectedHeadcount,
    participantNames,
    participants: resolveScScheduleParticipantDetails(workers, row),
    participantCount: Number(row.participantCount || 0),
    ...(workLog ? { workLog } : {}),
    source: "sc",
  };
}

export function listPublicScSchedulesForToken(token, monthKey) {
  const state = getErpState();
  const data = state.data || {};
  const client = findClientByRequestToken(data, token);
  if (!client) {
    return { ok: false, status: 404, error: "\uC720\uD9A8\uD558\uC9C0 \uC54A\uC740 \uC811\uC218 \uB9C1\uD06C\uC785\uB2C8\uB2E4." };
  }
  if (client.siteRequestLinkDisabled) {
    return { ok: false, status: 403, error: "\uD604\uC7AC \uC811\uC218\uAC00 \uC911\uB2E8\uB41C \uB9C1\uD06C\uC785\uB2C8\uB2E4." };
  }
  const month = String(monthKey || "").trim();
  const workers = Array.isArray(data.workers) ? data.workers : [];
  const rows = filterScSchedulesForClient(listScSchedules(data), client.id, month).map((row) =>
    sanitizePublicScSchedule(row, workers),
  );
  return { ok: true, schedules: rows };
}

export function listStaffScSchedulesForClient(clientId, monthKey) {
  const state = getErpState();
  const data = state.data || {};
  const client = listClients(data).find((row) => String(row.id ?? "") === String(clientId ?? ""));
  if (!client) {
    return { ok: false, status: 404, error: "\uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  const month = String(monthKey || "").trim();
  const workers = Array.isArray(data.workers) ? data.workers : [];
  const rows = filterScSchedulesForClient(listScSchedules(data), client.id, month).map((row) => ({
    ...row,
    participants: resolveScScheduleParticipantDetails(workers, row),
  }));
  const projectIds = listClientScProjectIds(client);
  const projectMappings = listClientScProjectMappings(client);
  return {
    ok: true,
    schedules: rows,
    scProjectIds: projectIds,
    scProjectMappings: projectMappings,
    scProjectId: projectIds[0] || null,
    scProjectName: projectMappings[0]?.scProjectName || null,
  };
}

export function listStaffScSchedulesForMonth(monthKey) {
  const state = getErpState();
  const data = state.data || {};
  const month = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { ok: false, status: 400, error: "month must be YYYY-MM" };
  }
  const workers = Array.isArray(data.workers) ? data.workers : [];
  const rows = listScSchedules(data)
    .filter((row) => String(row.workDate || "").slice(0, 7) === month)
    .map((row) => ({
      ...row,
      participants: resolveScScheduleParticipantDetails(workers, row),
    }));
  return { ok: true, schedules: rows };
}

export function getScScheduleSyncStatus() {
  const state = getErpState();
  const meta = state.data?.scScheduleSyncMeta || {};
  return {
    configured: isScScheduleSourceConfigured(),
    enabled: config.sc.syncEnabled,
    intervalMs: config.sc.syncIntervalMs,
    scheduleSyncSource: resolveScheduleSyncSource(),
    calwalkConfigured: isCalwalkScheduleSourceConfigured(),
    calwalkWorkspaceSlug: config.calwalk?.workspaceSlug || "",
    ...meta,
  };
}

export function persistScScheduleSyncResultWithRetry({
  result,
  portalLoginUsers = [],
  runAt,
  start,
  end,
  updatedBy = "sc-schedule-sync",
  maxAttempts = 3,
  readState = getErpState,
  writeState = saveErpState,
}) {
  const attempts = Math.max(1, Number(maxAttempts) || 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const state = readState();
    const data = state.data || {};
    const mapped = autoMapScProjectsToClients(listClients(data), result.projects);
    const enriched = attachClientToSchedules(result.schedules, mapped.clients);
    const mergedSchedules = mergeSchedulesInWindow(listScSchedules(data), enriched, start, end);
    const mappingStatus = buildScProjectMappingStatus(mapped.clients, result.projects);
    const portalLoginSync = portalLoginUsers.length
      ? applyWorkerPortalLoginIdsFromSc(Array.isArray(data.workers) ? data.workers : [], portalLoginUsers)
      : null;
    const workers = portalLoginSync?.workers || (Array.isArray(data.workers) ? data.workers : []);
    const nextMeta = {
      lastRunAt: runAt,
      lastSuccessAt: runAt,
      lastError: null,
      lastSyncSource: result.source || resolveScheduleSyncSource(),
      lastCalwalkWorkspace:
        result.source === "calwalk" ? String(config.calwalk?.workspaceSlug || "").trim() : null,
      lastProjectCount: result.projects.length,
      lastScheduleCount: enriched.length,
      lastMappedClientCount: mapped.mappedCount,
      lastUnmappedProjectCount: mappingStatus.unmappedCount,
      lastDroppedScheduleCount: Math.max(0, result.schedules.length - enriched.length),
      lastScProjects: result.projects,
      lastPortalLoginSyncCount: portalLoginSync?.updatedCount ?? 0,
      windowStart: formatUtcDate(start),
      windowEnd: formatUtcDate(new Date(end.getTime() - 86400000)),
    };

    try {
      const saved = writeState(
        {
          ...data,
          clients: mapped.clients,
          workers,
          scSchedules: mergedSchedules,
          scScheduleSyncMeta: {
            ...(data.scScheduleSyncMeta || {}),
            ...nextMeta,
          },
        },
        state.version,
        updatedBy,
      );
      return { nextMeta, version: saved?.version ?? readState().version, attemptCount: attempt };
    } catch (error) {
      lastError = error;
      if (error?.message !== "VERSION_CONFLICT" || attempt >= attempts) throw error;
    }
  }

  throw lastError || new Error("SC_SCHEDULE_SYNC_SAVE_FAILED");
}

function recordScScheduleSyncError(runAt, message, maxAttempts = 2) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const state = getErpState();
    const data = state.data || {};
    try {
      saveErpState(
        {
          ...data,
          scScheduleSyncMeta: {
            ...(data.scScheduleSyncMeta || {}),
            lastRunAt: runAt,
            lastError: message,
          },
        },
        state.version,
        "sc-schedule-sync:error",
      );
      return;
    } catch (error) {
      if (error?.message !== "VERSION_CONFLICT" || attempt >= maxAttempts) {
        console.warn("[sc-schedule-sync] failed to persist error metadata:", error);
        return;
      }
    }
  }
}

export async function runScScheduleSync(options = {}) {
  if (!config.sc.syncEnabled) {
    return { ok: false, skipped: true, reason: "sc_sync_disabled" };
  }
  if (!isScScheduleSourceConfigured()) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const runAt = new Date().toISOString();
    try {
      const { start, end } = syncWindowMonths();
      const result = await loadScProjectsAndSchedules(start, end);
      let portalLoginUsers = [];
      try {
        portalLoginUsers = await fetchScPortalLoginUsers();
      } catch (portalSyncError) {
        console.warn("[sc-portal-login-sync]", portalSyncError);
      }

      const persisted = persistScScheduleSyncResultWithRetry({
        result,
        portalLoginUsers,
        runAt,
        start,
        end,
        updatedBy: options.updatedBy || "sc-schedule-sync",
      });
      return {
        ok: true,
        ...persisted.nextMeta,
        version: persisted.version,
        saveAttemptCount: persisted.attemptCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordScScheduleSyncError(runAt, message);
      return { ok: false, error: message };
    }
  })();

  try {
    return await syncPromise;
  } finally {
    syncPromise = null;
  }
}

export function listStoredScSchedules({ clientId, monthKey } = {}) {
  const state = getErpState();
  const rows = listScSchedules(state.data || {});
  if (clientId == null && !monthKey) return rows;
  return filterScSchedulesForClient(rows, clientId, monthKey);
}

export function startScScheduleSyncScheduler() {
  if (intervalHandle) return;
  if (!config.sc.syncEnabled || config.sc.syncIntervalMs <= 0) return;
  if (!isScScheduleSourceConfigured()) return;

  intervalHandle = setInterval(() => {
    void runScScheduleSync({ updatedBy: "sc-schedule-sync:scheduler" }).catch((error) => {
      console.error("[sc-schedule-sync] scheduler failed:", error);
    });
  }, config.sc.syncIntervalMs);

  void runScScheduleSync({ updatedBy: "sc-schedule-sync:startup" }).catch((error) => {
    console.error("[sc-schedule-sync] startup sync failed:", error);
  });

  console.info(`[sc-schedule-sync] scheduler every ${Math.round(config.sc.syncIntervalMs / 1000)}s`);
}
