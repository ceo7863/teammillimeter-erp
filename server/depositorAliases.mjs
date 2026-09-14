/**
 * Canonical depositor-name → client alias registry.
 * Exact normalized match only. Never mutate past receipts.
 */

import crypto from "crypto";
import { getErpState, saveErpState } from "./db.mjs";

const SAVE_RETRY_ATTEMPTS = 8;

const GENERIC_BLOCKED = new Set(["현금", "이체", "입금", "cash", "transfer", "deposit"]);

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function makeError(code, message, status = 400, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function hashPayload(canonical) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Safe normalize: trim, collapse spaces, lower-case Latin only.
 * Does NOT fuzzy-match Korean spelling variants.
 */
export function normalizeDepositorName(raw) {
  let text = String(raw ?? "").trim();
  if (!text) return "";
  text = text.replace(/\s+/g, " ");
  // Lower-case Latin letters only; leave Hangul / other scripts untouched.
  text = text.replace(/[A-Za-z]+/g, (chunk) => chunk.toLowerCase());
  return text;
}

export function isGenericBlockedName(name) {
  const normalized = normalizeDepositorName(name);
  if (!normalized) return true;
  const compact = normalized.replace(/\s+/g, "").toLowerCase();
  if (!compact) return true;
  if (GENERIC_BLOCKED.has(normalized) || GENERIC_BLOCKED.has(compact)) return true;
  // Exact generic tokens only (no fuzzy).
  for (const blocked of GENERIC_BLOCKED) {
    if (compact === blocked.replace(/\s+/g, "").toLowerCase()) return true;
  }
  return false;
}

function scopeKey(bankAccountId) {
  if (bankAccountId == null || bankAccountId === "") return "GLOBAL";
  return String(bankAccountId);
}

function isActiveAlias(row) {
  if (!row) return false;
  if (row.status === "disabled") return false;
  if (row.disabledAt) return false;
  return row.status === "active" || !row.status;
}

function isClientActive(client) {
  if (!client) return false;
  if (client.isActive === false || client.active === false) return false;
  if (client.status === "inactive" || client.status === "disabled") return false;
  return true;
}

/**
 * Find active aliases that collide on normalizedName within scope (same bank or GLOBAL overlap).
 */
export function findAliasConflicts(aliases, normalizedName, scope = {}) {
  const needle = normalizeDepositorName(normalizedName);
  if (!needle) return [];
  const wantScope = scopeKey(scope.bankAccountId);
  const excludeId = scope.excludeAliasId != null ? String(scope.excludeAliasId) : null;
  const excludeClientId = scope.excludeClientId != null ? String(scope.excludeClientId) : null;

  const hits = [];
  for (const row of aliases || []) {
    if (!isActiveAlias(row)) continue;
    if (excludeId && String(row.id) === excludeId) continue;
    if (normalizeDepositorName(row.normalizedName || row.rawName) !== needle) continue;
    const rowScope = scopeKey(row.bankAccountId);
    // Conflict when same scope, or either side is GLOBAL
    const overlaps =
      rowScope === wantScope || rowScope === "GLOBAL" || wantScope === "GLOBAL";
    if (!overlaps) continue;
    if (excludeClientId && String(row.clientId) === excludeClientId) continue;
    hits.push(row);
  }
  return hits;
}

function listAliases(data = {}) {
  return Array.isArray(data.depositorAliases) ? data.depositorAliases : [];
}

function saveAliasesAtomic(mutator, actor) {
  for (let attempt = 0; attempt < SAVE_RETRY_ATTEMPTS; attempt += 1) {
    const state = getErpState();
    const data = state.data || {};
    const aliases = [...listAliases(data)];
    const result = mutator({
      data,
      aliases,
      clients: data.clients || [],
      actor,
      version: state.version,
    });
    if (result.shortCircuit) return result.value;
    try {
      const saved = saveErpState(
        {
          ...data,
          depositorAliases: result.aliases,
        },
        state.version,
        actor,
        { allowDepositorAliasMutation: true },
      );
      return {
        ...result.value,
        version: saved.version,
        updatedAt: saved.updatedAt,
      };
    } catch (error) {
      if (error?.status !== 409 || attempt === SAVE_RETRY_ATTEMPTS - 1) throw error;
    }
  }
  throw makeError("DEPOSITOR_ALIAS_SAVE_FAILED", "입금자명 매핑 저장에 실패했습니다.", 500);
}

/**
 * Explicit opt-in only. Conflicts throw CLIENT_ALIAS_CONFLICT.
 */
export function createDepositorAlias(input, actor = "system") {
  return saveAliasesAtomic(({ aliases, clients, actor: act }) => {
    const raw = input || {};
    if (raw.optIn !== true && raw.explicitOptIn !== true && raw.createAlias !== true) {
      throw makeError(
        "ALIAS_OPT_IN_REQUIRED",
        "입금자명 자동 인식은 명시적 동의(optIn) 후에만 저장됩니다.",
      );
    }

    const operationId = String(raw.operationId || raw.idempotencyKey || "").trim();
    if (!operationId) throw makeError("OPERATION_ID_REQUIRED", "operationId가 필요합니다.");

    const clientId = String(raw.clientId || "").trim();
    if (!clientId) throw makeError("CLIENT_REQUIRED", "거래처 ID가 필요합니다.");
    const client = (clients || []).find((row) => String(row.id) === clientId);
    if (!client) throw makeError("CLIENT_NOT_FOUND", "거래처 ID를 찾을 수 없습니다.", 404);
    if (!isClientActive(client)) {
      throw makeError("CLIENT_INACTIVE", "비활성 거래처에는 입금자명을 연결할 수 없습니다.");
    }

    const rawName = String(raw.rawName || raw.name || "").trim();
    const normalizedName = normalizeDepositorName(rawName);
    if (!normalizedName || isGenericBlockedName(rawName)) {
      throw makeError(
        "GENERIC_DEPOSITOR_NAME",
        "일반 입금자명(현금/이체/입금 등) 또는 빈 이름은 등록할 수 없습니다.",
      );
    }

    const bankAccountId =
      raw.bankAccountId == null || raw.bankAccountId === "" ? null : String(raw.bankAccountId);

    const canonical = {
      action: "create_alias",
      clientId,
      rawName,
      normalizedName,
      bankAccountId,
    };
    const payloadHash = hashPayload(canonical);

    const prior = aliases.find((row) => String(row.operationId || "") === operationId);
    if (prior) {
      if (String(prior.payloadHash || "") !== payloadHash) {
        throw makeError(
          "IDEMPOTENCY_CONFLICT",
          "동일 operationId에 다른 입금자명 payload가 요청되었습니다.",
          409,
          { operationId, existingAliasId: prior.id },
        );
      }
      return { shortCircuit: true, value: { ok: true, idempotent: true, alias: prior } };
    }

    const conflicts = findAliasConflicts(aliases, normalizedName, {
      bankAccountId,
      excludeClientId: clientId,
    });
    // Same client + same scope active alias → idempotent reuse
    const sameClient = (aliases || []).find(
      (row) =>
        isActiveAlias(row) &&
        normalizeDepositorName(row.normalizedName || row.rawName) === normalizedName &&
        scopeKey(row.bankAccountId) === scopeKey(bankAccountId) &&
        String(row.clientId) === clientId,
    );
    if (sameClient) {
      return { shortCircuit: true, value: { ok: true, idempotent: true, alias: sameClient } };
    }
    if (conflicts.length) {
      throw makeError(
        "CLIENT_ALIAS_CONFLICT",
        "동일 입금자명이 다른 거래처에 이미 연결되어 있습니다.",
        409,
        {
          normalizedName,
          conflicts: conflicts.map((row) => ({
            id: row.id,
            clientId: row.clientId,
            clientNameSnapshot: row.clientNameSnapshot,
            bankAccountId: row.bankAccountId,
          })),
        },
      );
    }

    const createdAt = nowIso();
    const alias = {
      id: makeId("depalias"),
      clientId,
      clientNameSnapshot: String(client.name || ""),
      rawName,
      normalizedName,
      bankAccountId,
      status: "active",
      createdBy: String(act || "system"),
      createdAt,
      sourceBankTransactionId:
        raw.sourceBankTransactionId == null || raw.sourceBankTransactionId === ""
          ? null
          : String(raw.sourceBankTransactionId),
      lastMatchedAt: null,
      matchCount: 0,
      disabledAt: null,
      disabledBy: null,
      operationId,
      payloadHash,
    };

    return {
      aliases: [alias, ...aliases],
      value: { ok: true, idempotent: false, alias },
    };
  }, actor);
}

export function disableDepositorAlias(id, actor = "system") {
  return saveAliasesAtomic(({ aliases, actor: act }) => {
    const aliasId = String(id || "").trim();
    if (!aliasId) throw makeError("ALIAS_ID_REQUIRED", "alias id가 필요합니다.");
    const target = aliases.find((row) => String(row.id) === aliasId);
    if (!target) throw makeError("ALIAS_NOT_FOUND", "입금자명 매핑을 찾을 수 없습니다.", 404);
    if (!isActiveAlias(target)) {
      return { shortCircuit: true, value: { ok: true, idempotent: true, alias: target } };
    }
    const disabledAt = nowIso();
    const next = {
      ...target,
      status: "disabled",
      disabledAt,
      disabledBy: String(act || "system"),
    };
    return {
      aliases: aliases.map((row) => (String(row.id) === aliasId ? next : row)),
      value: { ok: true, idempotent: false, alias: next },
    };
  }, actor);
}

/**
 * Exact normalized match only. Inactive client skipped.
 * Conflict → { client: null, conflict: true, candidates }.
 */
export function resolveClientByAlias(aliases, clients, { rawName, bankAccountId } = {}) {
  const normalizedName = normalizeDepositorName(rawName);
  if (!normalizedName || isGenericBlockedName(rawName)) {
    return { client: null, conflict: false, reason: "generic_or_empty", normalizedName };
  }

  const wantScope = scopeKey(bankAccountId);
  const matches = [];
  for (const row of aliases || []) {
    if (!isActiveAlias(row)) continue;
    if (normalizeDepositorName(row.normalizedName || row.rawName) !== normalizedName) continue;
    const rowScope = scopeKey(row.bankAccountId);
    if (rowScope !== wantScope && rowScope !== "GLOBAL" && wantScope !== "GLOBAL") continue;
    // Prefer exact bank scope over GLOBAL when both exist — collect all then decide
    matches.push(row);
  }

  if (!matches.length) {
    return { client: null, conflict: false, reason: "no_match", normalizedName };
  }

  // Prefer account-scoped over GLOBAL
  const scoped = matches.filter((row) => scopeKey(row.bankAccountId) === wantScope);
  const pool = scoped.length ? scoped : matches;

  const clientIds = [...new Set(pool.map((row) => String(row.clientId)))];
  if (clientIds.length > 1) {
    return {
      client: null,
      conflict: true,
      reason: "CLIENT_ALIAS_CONFLICT",
      normalizedName,
      candidates: pool.map((row) => ({
        aliasId: row.id,
        clientId: row.clientId,
        clientNameSnapshot: row.clientNameSnapshot,
        bankAccountId: row.bankAccountId,
      })),
    };
  }

  const client = (clients || []).find((row) => String(row.id) === clientIds[0]);
  if (!client || !isClientActive(client)) {
    return { client: null, conflict: false, reason: "inactive_client", normalizedName, clientId: clientIds[0] };
  }

  return {
    client,
    conflict: false,
    reason: "exact_match",
    normalizedName,
    alias: pool[0],
  };
}

export function listDepositorAliases(data = {}) {
  return listAliases(data);
}

export { makeError as depositorAliasError, hashPayload as depositorAliasHashPayload };
