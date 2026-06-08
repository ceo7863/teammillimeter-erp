import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";
import { resolveScScheduleParticipants } from "./workerPhoneMatch.mjs";

const COMPANY_SUFFIX_RE = /(\u3231|\(\uC8FC\)|\uC8FC\uC2DD\uD68C\uC0AC|\(\uC720\)|\uC720\uD55C|\uC720\uD55C\uD68C\uC0AC|co\.?ltd|corp|inc)/gi;

let syncRunning = false;
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

function clearClientScProjectFields(client) {
  const next = { ...client };
  delete next.scProjectId;
  delete next.scProjectName;
  delete next.scProjectMappingManual;
  delete next.scProjectMappingUpdatedAt;
  delete next.scProjectMappingUpdatedBy;
  return next;
}

function listScSchedules(data) {
  return Array.isArray(data.scSchedules) ? data.scSchedules : [];
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

export function isScScheduleSourceConfigured() {
  if (String(config.sc.databaseUrl || "").trim()) return true;
  return (
    Boolean(String(config.sc.apiBaseUrl || "").trim()) &&
    Boolean(String(config.sc.syncSecret || "").trim())
  );
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
  if (String(config.sc.databaseUrl || "").trim()) {
    return withScPool(async (pool) => ({
      projects: await fetchScProjects(pool),
      schedules: await fetchScSchedules(pool, start, end),
    }));
  }
  const payload = await fetchScDataFromApi(start, end);
  return {
    projects: Array.isArray(payload?.projects) ? payload.projects : [],
    schedules: Array.isArray(payload?.schedules) ? payload.schedules : [],
  };
}

async function withScPool(callback) {
  const url = String(config.sc.databaseUrl || "").trim();
  if (!url) {
    throw new Error("SC_DATABASE_URL is not configured");
  }
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes("sslmode=require") || url.includes("ssl=true") ? { rejectUnauthorized: false } : undefined,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
  try {
    return await callback(pool);
  } finally {
    await pool.end().catch(() => {});
  }
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

  return rows.map((row) => {
    const id = String(row.id);
    const participantNames = participantsBySchedule.get(id) || [];
    const workDate = row.workDate instanceof Date ? formatUtcDate(row.workDate) : String(row.workDate || "").slice(0, 10);
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
    };
  });
}

export function autoMapScProjectsToClients(clients, projects) {
  const projectByKey = new Map();
  for (const project of projects) {
    const key = normalizeScClientName(project.name);
    if (!key || projectByKey.has(key)) continue;
    projectByKey.set(key, project);
  }

  let mappedCount = 0;
  const nextClients = clients.map((client) => {
    const clientName = String(client.name || "").trim();
    if (!clientName) return client;

    const existingProjectId = String(client.scProjectId || "").trim();
    if (existingProjectId && projects.some((row) => row.id === existingProjectId)) {
      const linked = projects.find((row) => row.id === existingProjectId);
      mappedCount += 1;
      return {
        ...client,
        scProjectId: existingProjectId,
        scProjectName: linked?.name || client.scProjectName || clientName,
      };
    }

    if (client.scProjectMappingManual) {
      return client;
    }

    const matched = projectByKey.get(normalizeScClientName(clientName));
    if (!matched) return client;
    mappedCount += 1;
    return {
      ...client,
      scProjectId: matched.id,
      scProjectName: matched.name,
    };
  });

  return { clients: nextClients, mappedCount };
}

function buildScProjectMappingStatus(clients, projects) {
  const mappedProjectIds = new Set();
  const mappings = [];

  for (const client of clients) {
    const projectId = String(client.scProjectId || "").trim();
    if (!projectId) continue;
    mappedProjectIds.add(projectId);
    const project = projects.find((row) => row.id === projectId);
    mappings.push({
      scProjectId: projectId,
      scProjectName: String(client.scProjectName || project?.name || "").trim(),
      clientId: client.id,
      clientName: String(client.name || "").trim(),
      manual: Boolean(client.scProjectMappingManual),
      updatedAt: client.scProjectMappingUpdatedAt || null,
    });
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
    if (String(client.scProjectId || "").trim() === normalizedProjectId && !clientIdsEqual(client.id, clientId)) {
      return clearClientScProjectFields(client);
    }
    return client;
  });

  const targetIndex = nextClients.findIndex((client) => clientIdsEqual(client.id, clientId));
  if (targetIndex < 0) {
    return { ok: false, status: 404, error: "\uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const now = new Date().toISOString();
  nextClients[targetIndex] = {
    ...nextClients[targetIndex],
    scProjectId: normalizedProjectId,
    scProjectName: String(projectName || nextClients[targetIndex].scProjectName || "").trim(),
    scProjectMappingManual: true,
    scProjectMappingUpdatedAt: now,
    scProjectMappingUpdatedBy: String(actor || "").trim() || nextClients[targetIndex].scProjectMappingUpdatedBy,
  };

  return { ok: true, clients: nextClients };
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
    if (String(client.scProjectId || "").trim() !== normalizedProjectId) return client;
    found = true;
    return clearClientScProjectFields(client);
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
    const projectId = String(client.scProjectId || "").trim();
    if (!projectId) continue;
    map.set(projectId, client);
  }
  return map;
}

function attachClientToSchedules(schedules, clients) {
  const projectToClient = buildProjectToClientMap(clients);
  const syncedAt = new Date().toISOString();
  return schedules
    .map((row) => {
      const client = projectToClient.get(row.scProjectId);
      if (!client) return null;
      return {
        id: row.id,
        scProjectId: row.scProjectId,
        clientId: client.id,
        clientName: String(client.name || row.projectName || "").trim(),
        siteManagerName: String(row.siteManagerName || "").trim(),
        projectName: row.projectName,
        workDate: row.workDate,
        startTime: row.startTime,
        endTime: row.endTime || null,
        workType: row.workType,
        expectedHeadcount: row.expectedHeadcount,
        participantNames: row.participantNames,
        participantCount: row.participantCount,
        syncedAt,
      };
    })
    .filter(Boolean);
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
  return {
    id: row.id,
    workDate: row.workDate,
    startTime: row.startTime,
    endTime: row.endTime,
    workType: row.workType,
    expectedHeadcount: row.expectedHeadcount,
    participantNames,
    participants: resolveScScheduleParticipants(workers, participantNames),
    participantCount: Number(row.participantCount || 0),
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
  const rows = filterScSchedulesForClient(listScSchedules(data), client.id, month).map((row) => {
    const participantNames = Array.isArray(row.participantNames) ? row.participantNames : [];
    return {
      ...row,
      participants: resolveScScheduleParticipants(workers, participantNames),
    };
  });
  return {
    ok: true,
    schedules: rows,
    scProjectId: client.scProjectId || null,
    scProjectName: client.scProjectName || null,
  };
}

export function getScScheduleSyncStatus() {
  const state = getErpState();
  const meta = state.data?.scScheduleSyncMeta || {};
  return {
    configured: isScScheduleSourceConfigured(),
    enabled: config.sc.syncEnabled,
    intervalMs: config.sc.syncIntervalMs,
    ...meta,
  };
}

export async function runScScheduleSync(options = {}) {
  if (!config.sc.syncEnabled) {
    return { ok: false, skipped: true, reason: "sc_sync_disabled" };
  }
  if (!isScScheduleSourceConfigured()) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }
  if (syncRunning) {
    return { ok: false, skipped: true, reason: "sync_in_progress" };
  }

  syncRunning = true;
  const runAt = new Date().toISOString();
  try {
    const { start, end } = syncWindowMonths();
    const result = await loadScProjectsAndSchedules(start, end);

    const state = getErpState();
    const data = state.data || {};
    const mapped = autoMapScProjectsToClients(listClients(data), result.projects);
    const enriched = attachClientToSchedules(result.schedules, mapped.clients);
    const mergedSchedules = mergeSchedulesInWindow(listScSchedules(data), enriched, start, end);
    const mappingStatus = buildScProjectMappingStatus(mapped.clients, result.projects);

    const nextMeta = {
      lastRunAt: runAt,
      lastSuccessAt: runAt,
      lastError: null,
      lastProjectCount: result.projects.length,
      lastScheduleCount: enriched.length,
      lastMappedClientCount: mapped.mappedCount,
      lastUnmappedProjectCount: mappingStatus.unmappedCount,
      lastDroppedScheduleCount: Math.max(0, result.schedules.length - enriched.length),
      lastScProjects: result.projects,
      windowStart: formatUtcDate(start),
      windowEnd: formatUtcDate(new Date(end.getTime() - 86400000)),
    };

    saveErpState(
      {
        ...data,
        clients: mapped.clients,
        scSchedules: mergedSchedules,
        scScheduleSyncMeta: {
          ...(data.scScheduleSyncMeta || {}),
          ...nextMeta,
        },
      },
      state.version,
      options.updatedBy || "sc-schedule-sync",
    );

    return {
      ok: true,
      ...nextMeta,
      version: getErpState().version,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const state = getErpState();
    const data = state.data || {};
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
    return { ok: false, error: message };
  } finally {
    syncRunning = false;
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
