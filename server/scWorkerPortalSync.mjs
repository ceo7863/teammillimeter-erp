import { getErpState, saveErpState } from "./db.mjs";
import { withScPool } from "./scPool.mjs";
import { config } from "./config.mjs";
import {
  findWorkerMasterByListName,
  normalizePortalLoginId,
  normalizeWorkerName,
  applyDefaultPortalPasswordToWorker,
} from "./workerPortal.mjs";

const SC_PORTAL_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "MEMBER"]);

async function fetchScPortalLoginUsersFromApi() {
  const secret = String(config.sc.syncSecret || "").trim();
  const base = String(config.sc.apiBaseUrl || "https://sc.teammillimeter.com").replace(/\/$/, "");
  if (!secret) return [];

  const response = await fetch(`${base}/api/erp/portal-users-export`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SC portal-users-export ${response.status}: ${text.slice(0, 200)}`);
  }
  const payload = JSON.parse(text);
  const users = Array.isArray(payload.users) ? payload.users : [];
  return users
    .map((row) => ({
      name: normalizeWorkerName(row.name),
      employeeNoStr: String(row.employeeNoStr || "").trim(),
      role: String(row.role || "").trim(),
      isActive: row.isActive !== false,
    }))
    .filter((row) => row.name && row.employeeNoStr && SC_PORTAL_ROLES.has(row.role));
}

export async function fetchScPortalLoginUsers() {
  if (String(config.sc.databaseUrl || "").trim()) {
    return withScPool(async (pool) => {
      const { rows } = await pool.query(`
      SELECT name, "employeeNoStr", role, "isActive"
      FROM users
      WHERE "isActive" = true
        AND role IN ('SUPER_ADMIN', 'ADMIN', 'MEMBER')
      ORDER BY "employeeNoStr" ASC
    `);

      return rows
        .map((row) => ({
          name: normalizeWorkerName(row.name),
          employeeNoStr: String(row.employeeNoStr || "").trim(),
          role: String(row.role || "").trim(),
          isActive: row.isActive !== false,
        }))
        .filter((row) => row.name && row.employeeNoStr && SC_PORTAL_ROLES.has(row.role));
    });
  }

  return fetchScPortalLoginUsersFromApi();
}

export function isScPortalLoginSyncConfigured() {
  return Boolean(String(config.sc.databaseUrl || "").trim() || String(config.sc.syncSecret || "").trim());
}

export function applyWorkerPortalLoginIdsFromSc(workers = [], scUsers = []) {
  const next = (Array.isArray(workers) ? workers : []).map((worker) => ({ ...worker }));
  const updates = [];
  const skipped = [];
  const reservedIds = new Set(
    next
      .map((worker) => normalizePortalLoginId(worker.portalLoginId))
      .filter(Boolean),
  );

  for (const scUser of scUsers) {
    const portalLoginId = normalizePortalLoginId(scUser.employeeNoStr);
    if (!portalLoginId) {
      skipped.push({
        scName: scUser.name,
        employeeNoStr: scUser.employeeNoStr,
        reason: "invalid_id",
      });
      continue;
    }

    const worker = findWorkerMasterByListName(next, scUser.name);
    if (!worker) {
      skipped.push({
        scName: scUser.name,
        employeeNoStr: scUser.employeeNoStr,
        reason: "no_erp_worker",
      });
      continue;
    }

    const currentId = normalizePortalLoginId(worker.portalLoginId);
    const owner = next.find(
      (row) => row !== worker && normalizePortalLoginId(row.portalLoginId) === portalLoginId,
    );
    if (owner) {
      skipped.push({
        scName: scUser.name,
        employeeNoStr: scUser.employeeNoStr,
        workerName: worker.name,
        reason: "id_taken",
        otherWorkerName: normalizeWorkerName(owner.name),
      });
      continue;
    }

    if (currentId === portalLoginId) {
      if (!worker.portalPasswordHash) {
        Object.assign(worker, applyDefaultPortalPasswordToWorker(worker));
        updates.push({
          workerId: worker.id ?? null,
          workerName: normalizeWorkerName(worker.name),
          portalLoginId,
          previousPortalLoginId: currentId || null,
          scName: scUser.name,
          employeeNoStr: scUser.employeeNoStr,
          kind: "default_password",
        });
      }
      reservedIds.add(portalLoginId);
      continue;
    }

    worker.portalLoginId = portalLoginId;
    if (!worker.portalPasswordHash) {
      Object.assign(worker, applyDefaultPortalPasswordToWorker(worker));
    }
    reservedIds.add(portalLoginId);
    updates.push({
      workerId: worker.id ?? null,
      workerName: normalizeWorkerName(worker.name),
      portalLoginId,
      previousPortalLoginId: currentId || null,
      scName: scUser.name,
      employeeNoStr: scUser.employeeNoStr,
    });
  }

  return {
    workers: next,
    updates,
    skipped,
    scUserCount: scUsers.length,
    updatedCount: updates.length,
  };
}

export async function previewWorkerPortalLoginIdSyncFromSc(workers = null) {
  const scUsers = await fetchScPortalLoginUsers();
  const sourceWorkers =
    workers ??
    (Array.isArray(getErpState().data?.workers) ? getErpState().data.workers : []);
  const applied = applyWorkerPortalLoginIdsFromSc(sourceWorkers, scUsers);
  return {
    ok: true,
    configured: scUsers.length > 0,
    scUserCount: scUsers.length,
    updatedCount: applied.updatedCount,
    updates: applied.updates,
    skippedItems: applied.skipped,
  };
}

export async function runWorkerPortalLoginIdSyncFromSc(options = {}) {
  const scUsers = await fetchScPortalLoginUsers();
  if (!scUsers.length) {
    return {
      ok: false,
      skipped: true,
      reason: isScPortalLoginSyncConfigured() ? "no_sc_users" : "sc_not_configured",
    };
  }

  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const workers = Array.isArray(data.workers) ? data.workers : [];
  const applied = applyWorkerPortalLoginIdsFromSc(workers, scUsers);

  if (!applied.updates.length) {
    return {
      ok: true,
      skipped: true,
      reason: "no_changes",
      scUserCount: scUsers.length,
      updatedCount: 0,
      updates: [],
      skippedItems: applied.skipped,
    };
  }

  saveErpState(
    { ...data, workers: applied.workers },
    state.version,
    options.updatedBy || "sc-portal-login-sync",
  );

  return {
    ok: true,
    scUserCount: scUsers.length,
    updatedCount: applied.updatedCount,
    updates: applied.updates,
    skippedItems: applied.skipped,
    version: getErpState().version,
  };
}
