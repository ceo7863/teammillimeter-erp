import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";

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
      p.name AS project_name
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

export function sanitizePublicScSchedule(row) {
  return {
    id: row.id,
    workDate: row.workDate,
    startTime: row.startTime,
    endTime: row.endTime,
    workType: row.workType,
    expectedHeadcount: row.expectedHeadcount,
    participantNames: Array.isArray(row.participantNames) ? row.participantNames : [],
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
  const rows = filterScSchedulesForClient(listScSchedules(data), client.id, month).map(sanitizePublicScSchedule);
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
  const rows = filterScSchedulesForClient(listScSchedules(data), client.id, month);
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
    configured: Boolean(String(config.sc.databaseUrl || "").trim()),
    enabled: config.sc.syncEnabled,
    intervalMs: config.sc.syncIntervalMs,
    ...meta,
  };
}

export async function runScScheduleSync(options = {}) {
  if (!config.sc.syncEnabled) {
    return { ok: false, skipped: true, reason: "sc_sync_disabled" };
  }
  if (!String(config.sc.databaseUrl || "").trim()) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }
  if (syncRunning) {
    return { ok: false, skipped: true, reason: "sync_in_progress" };
  }

  syncRunning = true;
  const runAt = new Date().toISOString();
  try {
    const { start, end } = syncWindowMonths();
    const result = await withScPool(async (pool) => {
      const projects = await fetchScProjects(pool);
      const schedules = await fetchScSchedules(pool, start, end);
      return { projects, schedules };
    });

    const state = getErpState();
    const data = state.data || {};
    const mapped = autoMapScProjectsToClients(listClients(data), result.projects);
    const enriched = attachClientToSchedules(result.schedules, mapped.clients);
    const mergedSchedules = mergeSchedulesInWindow(listScSchedules(data), enriched, start, end);

    const nextMeta = {
      lastRunAt: runAt,
      lastSuccessAt: runAt,
      lastError: null,
      lastProjectCount: result.projects.length,
      lastScheduleCount: enriched.length,
      lastMappedClientCount: mapped.mappedCount,
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
  if (!String(config.sc.databaseUrl || "").trim()) return;

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
