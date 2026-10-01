/**
 * Worker individual billing rate (worker.customChargeCost).
 *
 *   number >= 0  explicit rate (0 is a real 0원 rate, never a fallback trigger)
 *   null/absent  no individual rate — callers fall back to the client rate with `??`
 *
 * Writes go through the dedicated endpoint, which stamps customChargeCostUpdatedAt. Once a worker
 * carries that stamp, generic full-list saves can no longer change the rate (a stale tab would
 * otherwise write its old value back); the only exception is the one-time probation-end adjustment.
 */

export const WORKER_RATE_FIELD = "customChargeCost";

const hasOwn = (row, key) => row != null && Object.prototype.hasOwnProperty.call(row, key);

export function makeWorkerRateError(code, message, status = 400, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  Object.assign(error, extra);
  return error;
}

/** User input → number | null. "" and null mean "no individual rate"; never coerced to 0. */
export function normalizeWorkerChargeCostInput(value) {
  if (value === null || value === undefined) return null;
  let next = value;
  if (typeof next === "string") {
    const text = next.trim().replace(/,/g, "");
    if (!text) return null;
    if (!/^-?\d+(\.\d+)?$/.test(text)) {
      throw makeWorkerRateError("WORKER_RATE_INVALID", "개별청구단가는 숫자로 입력해 주세요.");
    }
    next = Number(text);
  }
  if (typeof next !== "number" || !Number.isFinite(next)) {
    throw makeWorkerRateError("WORKER_RATE_INVALID", "개별청구단가는 숫자로 입력해 주세요.");
  }
  if (next < 0) throw makeWorkerRateError("WORKER_RATE_NEGATIVE", "개별청구단가는 0원 이상이어야 합니다.");
  if (!Number.isInteger(next)) throw makeWorkerRateError("WORKER_RATE_INVALID", "개별청구단가는 원 단위 정수로 입력해 주세요.");
  return next;
}

/** Stored value → number | null (legacy numeric strings tolerated; garbage reads as null). */
export function readStoredWorkerChargeCost(worker) {
  if (!hasOwn(worker, WORKER_RATE_FIELD)) return null;
  try {
    return normalizeWorkerChargeCostInput(worker[WORKER_RATE_FIELD]);
  } catch {
    return null;
  }
}

/**
 * Rate for a generic workers save. Property presence decides, not truthiness: an incoming row
 * without the property keeps the stored value.
 * Returns { value, ignored } — ignored=true when a stale overwrite of an endpoint-managed rate was dropped.
 */
export function resolveWorkerChargeCostForSave(prev, incoming) {
  if (!prev) {
    return { value: hasOwn(incoming, WORKER_RATE_FIELD) ? normalizeWorkerChargeCostInput(incoming[WORKER_RATE_FIELD]) : undefined, ignored: false };
  }
  const stored = hasOwn(prev, WORKER_RATE_FIELD) ? readStoredWorkerChargeCost(prev) : undefined;
  if (!hasOwn(incoming, WORKER_RATE_FIELD)) return { value: stored, ignored: false };
  const next = normalizeWorkerChargeCostInput(incoming[WORKER_RATE_FIELD]);
  if (next === (stored ?? null)) return { value: stored, ignored: false };
  const managed = Boolean(String(prev.customChargeCostUpdatedAt || "").trim());
  const probationEndTransition =
    !String(prev.probationAdjustedAt || "").trim() && Boolean(String(incoming.probationAdjustedAt || "").trim());
  if (managed && !probationEndTransition) return { value: stored, ignored: true };
  return { value: next, ignored: false };
}

/**
 * Dedicated update. expectedCustomChargeCost (when present) is the value the editor started from;
 * a mismatch with the stored value is a concurrent edit → 409 with the current value.
 */
export function planWorkerChargeCostUpdate({ workers = [], workerId, input = {}, actor = "", now = new Date().toISOString() }) {
  const id = String(workerId ?? "").trim();
  if (!id) throw makeWorkerRateError("WORKER_RATE_INVALID", "시공자 ID가 필요합니다.");
  if (!hasOwn(input, WORKER_RATE_FIELD)) {
    throw makeWorkerRateError("WORKER_RATE_INVALID", "customChargeCost 값(숫자 또는 null)이 필요합니다.");
  }
  const index = workers.findIndex((worker) => String(worker?.id ?? "").trim() === id);
  if (index < 0) throw makeWorkerRateError("WORKER_NOT_FOUND", "시공자를 찾을 수 없습니다.", 404);
  const worker = workers[index];
  const next = normalizeWorkerChargeCostInput(input[WORKER_RATE_FIELD]);
  const current = readStoredWorkerChargeCost(worker);
  if (hasOwn(input, "expectedCustomChargeCost")) {
    const expected = normalizeWorkerChargeCostInput(input.expectedCustomChargeCost);
    if (expected !== current) {
      throw makeWorkerRateError(
        "WORKER_RATE_CONFLICT",
        `다른 사용자가 먼저 개별청구단가를 변경했습니다. 현재 값: ${current === null ? "기본단가" : `${current.toLocaleString("ko-KR")}원`}`,
        409,
        { currentValue: current },
      );
    }
  }
  if (next === current) return { changed: false, workers, worker, before: current, after: next };
  const updated = {
    ...worker,
    [WORKER_RATE_FIELD]: next,
    customChargeCostUpdatedAt: now,
    customChargeCostUpdatedBy: actor,
  };
  const nextWorkers = workers.slice();
  nextWorkers[index] = updated;
  return { changed: true, workers: nextWorkers, worker: updated, before: current, after: next };
}

export function formatWorkerChargeCostForAudit(value) {
  if (value === null || value === undefined) return "기본단가";
  return Number(value).toLocaleString("ko-KR");
}

export function buildWorkerChargeCostAuditEntry({ worker, before, after, user = {}, now = new Date().toISOString() }) {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    entityType: "worker",
    entityId: worker.id,
    entityLabel: String(worker.name || ""),
    field: WORKER_RATE_FIELD,
    fieldLabel: "개별청구단가",
    before: formatWorkerChargeCostForAudit(before),
    after: formatWorkerChargeCostForAudit(after),
    action: "update",
    screen: "시공자",
    userName: String(user.name || user.loginId || "시스템"),
    userEmail: String(user.email || ""),
    at: now,
  };
}

/** Audit log is append-only: union by id so a client sending an older list cannot drop entries. */
export function mergeAuditLogsForSave(existing = [], incoming = [], max = 5000) {
  const byId = new Map();
  for (const entry of [...(existing || []), ...(incoming || [])]) {
    const id = entry?.id;
    if (id == null || id === "") continue;
    byId.set(String(id), entry);
  }
  return [...byId.values()].sort((a, b) => String(b?.at || "").localeCompare(String(a?.at || ""))).slice(0, max);
}
