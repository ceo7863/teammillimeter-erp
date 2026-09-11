/**
 * Atomic AP cutover: single save commits openings + cutover meta + legacy freeze + write enable.
 * Preview never mutates. Activate requires admin confirmation + preview token + version/hash match.
 */
import crypto from "crypto";
import { getErpState, saveErpState } from "./db.mjs";
import {
  AP_LEDGER_POLICY,
  OPENING_BALANCE_APPROVED,
  OPENING_BALANCE_ZERO_START,
  applyApCutoverActivationToMeta,
  computeLegacyApDatasetHash,
  countLegacyApRows,
  filterPayablesByCutover,
  previewOpeningBalances,
  readApLedgerMeta,
  sha256Hex,
  ymdSeoul,
  apMoney,
} from "./apLedgerCutover.mjs";

const PREVIEW_TTL_MS = 15 * 60 * 1000;
const CONFIRMATION_PHRASE = "AP_CUTOVER_ACTIVATE_CONFIRMED";
const ZERO_START_PHRASE = "ZERO_START_CONFIRMED_NO_LEGACY_UNPAID";

function makeError(code, message, status = 400, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  Object.assign(error, extra);
  return error;
}

function stableStringify(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token, secret) {
  const raw = String(token || "");
  const [body, sig] = raw.split(".");
  if (!body || !sig) return { ok: false, code: "PREVIEW_TOKEN_INVALID" };
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (sig !== expected) return { ok: false, code: "PREVIEW_TOKEN_INVALID" };
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return { ok: true, payload };
  } catch {
    return { ok: false, code: "PREVIEW_TOKEN_INVALID" };
  }
}

function tokenSecret() {
  return String(process.env.JWT_SECRET || process.env.AP_CUTOVER_TOKEN_SECRET || "ap-cutover-dev-secret");
}

function workerKey(worker) {
  return String(worker?.id ?? worker?.workerId ?? "").trim();
}

function resolveWorkersIndex(workers = []) {
  const byId = new Map();
  const byName = new Map();
  for (const row of workers || []) {
    const id = workerKey(row);
    const name = String(row?.name || row?.workerName || "").trim();
    if (id) {
      if (byId.has(id)) byId.get(id).ambiguous = true;
      else byId.set(id, { worker: row, ambiguous: false });
    }
    if (name) {
      const key = name.toLowerCase();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(row);
    }
  }
  return { byId, byName };
}

/**
 * Validate opening balance rows against worker master. Drops zero rows (not stored).
 */
export function validateOpeningBalancePayload(rows = [], workers = [], options = {}) {
  const errors = [];
  const reviewedWorkerIds = new Set(
    (options.reviewedWorkerIds || []).map((id) => String(id).trim()).filter(Boolean),
  );
  const { byId, byName } = resolveWorkersIndex(workers);
  const seen = new Set();
  const kept = [];
  let zeroReviewedCount = 0;

  for (const row of rows || []) {
    const workerId = row?.workerId != null ? String(row.workerId).trim() : "";
    const nameSnapshot = String(row?.workerNameSnapshot || row?.workerName || "").trim();
    const openingAmountRaw = row?.openingAmount;
    const openingAmount = apMoney(openingAmountRaw);
    const effectiveDate = ymdSeoul(row?.effectiveDate || options.effectiveDate || "");
    const operationId = String(row?.operationId || options.batchOperationId || "").trim();
    const reviewed = row?.reviewed === true || reviewedWorkerIds.has(workerId);

    if (!workerId) {
      errors.push({ code: "WORKER_ID_REQUIRED", message: "workerId is required", row });
      continue;
    }
    if (seen.has(workerId)) {
      errors.push({ code: "DUPLICATE_WORKER", message: `Duplicate workerId ${workerId}`, workerId });
      continue;
    }
    seen.add(workerId);

    const found = byId.get(workerId);
    if (!found) {
      errors.push({ code: "WORKER_NOT_FOUND", message: `Unknown workerId ${workerId}`, workerId });
      continue;
    }
    if (found.ambiguous) {
      errors.push({ code: "WORKER_AMBIGUOUS", message: `Ambiguous workerId ${workerId}`, workerId });
      continue;
    }

    const masterName = String(found.worker.name || found.worker.workerName || "").trim();
    if (nameSnapshot && masterName && nameSnapshot !== masterName) {
      // Snapshot may differ intentionally; warn only if empty master.
    }
    if (!nameSnapshot && !masterName) {
      errors.push({ code: "WORKER_NAME_REQUIRED", workerId });
      continue;
    }

    if (openingAmountRaw != null && openingAmountRaw !== "" && !Number.isFinite(Number(openingAmountRaw))) {
      errors.push({ code: "OPENING_AMOUNT_INVALID", workerId, message: "openingAmount is not a number" });
      continue;
    }
    if (Number(openingAmountRaw) < 0 || openingAmount < 0) {
      errors.push({ code: "OPENING_AMOUNT_NEGATIVE", workerId });
      continue;
    }
    if (Math.abs(Number(openingAmountRaw) || 0) > Number.MAX_SAFE_INTEGER) {
      errors.push({ code: "OPENING_AMOUNT_OVERFLOW", workerId });
      continue;
    }

    if (openingAmount === 0) {
      if (reviewed) zeroReviewedCount += 1;
      else errors.push({ code: "ZERO_OPENING_NOT_REVIEWED", workerId, message: "0원 행은 저장하지 않으며 검토 완료가 필요합니다." });
      continue;
    }

    if (!reviewed) {
      errors.push({ code: "REVIEW_REQUIRED", workerId, message: "기초 미지급 검토 완료가 필요합니다." });
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      errors.push({ code: "EFFECTIVE_DATE_REQUIRED", workerId });
      continue;
    }
    if (!operationId) {
      errors.push({ code: "OPERATION_ID_REQUIRED", workerId });
      continue;
    }

    const workerNameSnapshot = nameSnapshot || masterName;
    const payloadHash = sha256Hex(
      stableStringify({
        workerId,
        workerNameSnapshot,
        openingAmount,
        effectiveDate,
        memo: String(row?.memo || ""),
      }),
    );
    kept.push({
      workerId,
      workerNameSnapshot,
      openingAmount,
      effectiveDate,
      memo: String(row?.memo || ""),
      approvedBy: String(row?.approvedBy || options.approvedBy || ""),
      operationId,
      payloadHash,
      createdAt: new Date().toISOString(),
      status: "posted",
    });
  }

  // Name-only ambiguity when caller passed names without ids is already blocked by WORKER_ID_REQUIRED.
  for (const [name, list] of byName.entries()) {
    if (list.length > 1 && kept.some((row) => row.workerNameSnapshot.toLowerCase() === name)) {
      // informational only when ids are authoritative
    }
  }

  const total = kept.reduce((sum, row) => sum + row.openingAmount, 0);
  return {
    ok: errors.length === 0,
    errors,
    openingBalances: kept,
    totals: {
      workerCount: kept.length,
      openingAmountTotal: total,
      zeroReviewedCount,
      inputRowCount: (rows || []).length,
    },
  };
}

function buildActivationPayloadHash(input, openingBalances) {
  return sha256Hex(
    stableStringify({
      apLedgerCutoverWorkDate: String(input.apLedgerCutoverWorkDate || "").slice(0, 10),
      openingBalancePolicy: input.openingBalancePolicy,
      openingBalances: (openingBalances || []).map((row) => ({
        workerId: row.workerId,
        workerNameSnapshot: row.workerNameSnapshot,
        openingAmount: row.openingAmount,
        effectiveDate: row.effectiveDate,
        memo: row.memo,
        operationId: row.operationId,
      })),
      zeroStartExplicitConfirmation: Boolean(input.zeroStartExplicitConfirmation),
    }),
  );
}

export function getApCutoverStatus(data = {}, version = null) {
  const meta = readApLedgerMeta(data);
  const bank = data?.bankSyncMeta && typeof data.bankSyncMeta === "object" ? data.bankSyncMeta : {};
  return {
    ...meta,
    emergencyDisbursementWritePause: bank.emergencyDisbursementWritePause === true,
    activated: Boolean(meta.apLedgerActivatedAt && meta.apLedgerCutoverWorkDate),
    writeEnabled:
      meta.disbursementWriteEnabled === true &&
      Boolean(meta.apLedgerActivatedAt) &&
      bank.emergencyDisbursementWritePause !== true,
    legacyWritersFrozen: Boolean(
      meta.apLedgerActivatedAt &&
        (meta.legacyApPayoutPolicy === "READ_ONLY_FOREVER" || meta.apLedgerPolicy === AP_LEDGER_POLICY),
    ),
    legacyHash: computeLegacyApDatasetHash(data),
    legacyCounts: countLegacyApRows(data),
    version,
    confirmationPhrase: CONFIRMATION_PHRASE,
    zeroStartPhrase: ZERO_START_PHRASE,
    recommendedOpeningBalancePolicy: OPENING_BALANCE_APPROVED,
  };
}

/**
 * Preview cutover — mutation 0. Issues signed previewToken.
 */
export function previewApAtomicCutover(input = {}, state = null) {
  const erp = state || getErpState();
  const data = erp.data || {};
  const errors = [];
  const cutoverWorkDate = String(input.apLedgerCutoverWorkDate || "").slice(0, 10);
  const openingBalancePolicy = input.openingBalancePolicy || OPENING_BALANCE_APPROVED;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoverWorkDate)) {
    errors.push({ code: "CUTOVER_WORK_DATE_REQUIRED", message: "Asia/Seoul YYYY-MM-DD required" });
  }
  if (![OPENING_BALANCE_ZERO_START, OPENING_BALANCE_APPROVED].includes(openingBalancePolicy)) {
    errors.push({ code: "OPENING_BALANCE_POLICY_INVALID" });
  }

  const existing = readApLedgerMeta(data);
  if (existing.apLedgerActivatedAt) {
    errors.push({ code: "ALREADY_ACTIVATED", message: "AP ledger already activated" });
  }

  let openingValidation = {
    ok: true,
    errors: [],
    openingBalances: [],
    totals: { workerCount: 0, openingAmountTotal: 0, zeroReviewedCount: 0, inputRowCount: 0 },
  };

  if (openingBalancePolicy === OPENING_BALANCE_ZERO_START) {
    if (input.zeroStartExplicitConfirmation !== true && String(input.zeroStartConfirmation || "") !== ZERO_START_PHRASE) {
      errors.push({
        code: "ZERO_START_CONFIRMATION_REQUIRED",
        message: "ZERO_START requires explicit confirmation that legacy unpaid is fully settled elsewhere.",
      });
    }
    if (Array.isArray(input.openingBalances) && input.openingBalances.length) {
      errors.push({ code: "ZERO_START_MUST_HAVE_EMPTY_OPENINGS", message: "ZERO_START cannot include opening rows" });
    }
  } else {
    openingValidation = validateOpeningBalancePayload(input.openingBalances || [], data.workers || [], {
      effectiveDate: cutoverWorkDate,
      batchOperationId: input.operationId,
      approvedBy: input.approvedBy,
      reviewedWorkerIds: input.reviewedWorkerIds,
    });
    if (!openingValidation.ok) errors.push(...openingValidation.errors);
    if (!openingValidation.openingBalances.length && !(openingValidation.totals.zeroReviewedCount > 0)) {
      // Allow all-zero reviewed workers with zero stored rows only if at least one review recorded
      if (!(input.allWorkersReviewed === true && (input.reviewedWorkerIds || []).length)) {
        errors.push({
          code: "OPENING_REVIEW_INCOMPLETE",
          message: "APPROVED_WORKER_OPENING_BALANCES requires reviewed openings or explicit all-reviewed zero set",
        });
      }
    }
  }

  const legacyHash = computeLegacyApDatasetHash(data);
  const legacyCounts = countLegacyApRows(data);
  const allPayables =
    typeof input.listPayables === "function"
      ? input.listPayables()
      : [];
  const eligible = cutoverWorkDate
    ? filterPayablesByCutover(allPayables, data, { cutoverWorkDate })
    : [];

  const dayBefore = cutoverWorkDate
    ? new Date(`${cutoverWorkDate}T00:00:00+09:00`)
    : null;
  let exampleBefore = "";
  let exampleOn = cutoverWorkDate;
  let exampleAfter = "";
  if (dayBefore && Number.isFinite(dayBefore.getTime())) {
    const prev = new Date(dayBefore.getTime() - 24 * 60 * 60 * 1000);
    const next = new Date(dayBefore.getTime() + 24 * 60 * 60 * 1000);
    exampleBefore = ymdSeoul(prev.toISOString());
    exampleAfter = ymdSeoul(next.toISOString());
  }

  const payloadHash = buildActivationPayloadHash(
    { ...input, openingBalancePolicy, apLedgerCutoverWorkDate: cutoverWorkDate },
    openingValidation.openingBalances,
  );

  const ok = errors.length === 0;
  let previewToken = null;
  if (ok) {
    previewToken = signToken(
      {
        kind: "ap-cutover-preview",
        payloadHash,
        erpVersion: erp.version,
        legacyHash,
        legacyCounts,
        cutoverWorkDate,
        openingBalancePolicy,
        openingBalanceCount: openingValidation.openingBalances.length,
        openingAmountTotal: openingValidation.totals.openingAmountTotal,
        exp: Date.now() + PREVIEW_TTL_MS,
      },
      tokenSecret(),
    );
  }

  return {
    ok,
    errors,
    mutation: 0,
    previewToken,
    previewExpiresAt: ok ? new Date(Date.now() + PREVIEW_TTL_MS).toISOString() : null,
    confirmationPhrase: CONFIRMATION_PHRASE,
    zeroStartPhrase: ZERO_START_PHRASE,
    summary: {
      apLedgerCutoverWorkDate: cutoverWorkDate || null,
      openingBalancePolicy,
      openingBalanceWorkerCount: openingValidation.openingBalances.length,
      openingAmountTotal: openingValidation.totals.openingAmountTotal,
      zeroStartWorkerReviewedCount: openingValidation.totals.zeroReviewedCount,
      eligiblePayableCount: eligible.length,
      excludedPreCutoverCount: Math.max(0, (allPayables || []).length - eligible.length),
      legacyHash,
      legacyCounts,
      erpVersion: erp.version,
      examples: {
        beforeExcluded: exampleBefore,
        onIncluded: exampleOn,
        afterIncluded: exampleAfter,
        timezone: "Asia/Seoul",
        inclusiveFrom: "00:00:00",
      },
      writersToFreeze: [
        "WorkerMonthlyActualPaymentTab",
        "WorkerPayoutHistoryTab",
        "BankErpWorkerLinkModal legacy write",
        "App persist legacy payout arrays",
      ],
      writersToEnable: ["DisbursementRegisterModal", "POST /api/disbursements/register"],
      rollbackLimits: [
        "emergencyDisbursementWritePause only pauses new Disbursement writes",
        "Does not re-enable legacy writers",
        "Does not delete opening balances or cutover metadata",
        "Git rollback alone must not reactivate legacy AP writers after first new payout",
      ],
    },
    openingBalances: openingValidation.openingBalances,
    payloadHash,
  };
}

/**
 * Atomic activate — one saveErpState. On any failure, no partial mutation.
 */
export function activateApAtomicCutover(input = {}, actor = "system", options = {}) {
  const operationId = String(input.operationId || "").trim();
  if (!operationId) throw makeError("OPERATION_ID_REQUIRED", "operationId required");

  if (String(input.confirmation || "") !== CONFIRMATION_PHRASE) {
    throw makeError("CONFIRMATION_REQUIRED", "Explicit confirmation phrase required", 403);
  }

  const tokenCheck = verifyToken(input.previewToken, tokenSecret());
  if (!tokenCheck.ok) {
    throw makeError(tokenCheck.code || "PREVIEW_TOKEN_INVALID", "Invalid preview token", 403);
  }
  const token = tokenCheck.payload;
  if (token.kind !== "ap-cutover-preview") {
    throw makeError("PREVIEW_TOKEN_INVALID", "Wrong token kind", 403);
  }
  if (Number(token.exp) < Date.now()) {
    throw makeError("PREVIEW_TOKEN_EXPIRED", "Preview token expired — create a new preview", 403);
  }

  // Single-attempt read-modify-write. Do NOT auto-retry on version conflict.
  const state = getErpState();
  const data = state.data || {};
  const meta = readApLedgerMeta(data);
  const bankMeta = data.bankSyncMeta && typeof data.bankSyncMeta === "object" ? data.bankSyncMeta : {};

  // Idempotent replay
  if (bankMeta.apCutoverOperationId && String(bankMeta.apCutoverOperationId) === operationId) {
    const priorHash = String(bankMeta.apCutoverPayloadHash || "");
    const currentOpenings = Array.isArray(meta.apOpeningBalances) ? meta.apOpeningBalances : [];
    const replayHash = buildActivationPayloadHash(
      {
        apLedgerCutoverWorkDate: meta.apLedgerCutoverWorkDate,
        openingBalancePolicy: meta.openingBalancePolicy,
        zeroStartExplicitConfirmation: true,
      },
      currentOpenings,
    );
    if (priorHash && priorHash !== String(token.payloadHash)) {
      throw makeError("IDEMPOTENCY_CONFLICT", "Same operationId with different payload", 409);
    }
    return {
      ok: true,
      idempotent: true,
      alreadyActivated: true,
      activation: getApCutoverStatus(data, state.version),
      version: state.version,
    };
  }

  if (meta.apLedgerActivatedAt) {
    throw makeError("ALREADY_ACTIVATED", "AP ledger already activated", 409, {
      activation: getApCutoverStatus(data, state.version),
    });
  }

  if (Number(input.expectedVersion ?? token.erpVersion) !== Number(state.version)) {
    throw makeError("VERSION_CONFLICT", "ERP version changed — create a new preview", 409, {
      expectedVersion: token.erpVersion,
      currentVersion: state.version,
    });
  }

  const liveHash = computeLegacyApDatasetHash(data);
  if (liveHash !== token.legacyHash) {
    throw makeError("LEGACY_HASH_CONFLICT", "Legacy dataset hash changed — create a new preview", 409);
  }
  const liveCounts = countLegacyApRows(data);
  if (stableStringify(liveCounts) !== stableStringify(token.legacyCounts)) {
    throw makeError("LEGACY_COUNT_CONFLICT", "Legacy row counts changed — create a new preview", 409);
  }

  // Re-validate payload against live workers (authoritative)
  const preview = previewApAtomicCutover(
    {
      ...input,
      apLedgerCutoverWorkDate: token.cutoverWorkDate,
      openingBalancePolicy: token.openingBalancePolicy,
      listPayables: options.listPayables,
    },
    state,
  );
  if (!preview.ok) {
    throw makeError("ACTIVATION_VALIDATION_FAILED", "Activation payload failed validation", 400, {
      errors: preview.errors,
    });
  }
  if (preview.payloadHash !== token.payloadHash) {
    throw makeError("PREVIEW_PAYLOAD_MISMATCH", "Payload changed since preview", 409);
  }

  if (options.forceFailAfterValidation === true) {
    throw makeError("FORCED_FAILURE", "Forced failure after validation — no mutation", 500);
  }

  const nowIso = options.nowIso || new Date().toISOString();
  const nextMeta = applyApCutoverActivationToMeta(
    bankMeta,
    {
      apLedgerCutoverAt: nowIso,
      apLedgerCutoverWorkDate: token.cutoverWorkDate,
      openingBalancePolicy: token.openingBalancePolicy,
      disbursementWriteEnabled: true,
      openingBalances: preview.openingBalances,
    },
    actor,
    nowIso,
  );
  nextMeta.apCutoverOperationId = operationId;
  nextMeta.apCutoverPayloadHash = token.payloadHash;
  nextMeta.emergencyDisbursementWritePause = false;
  nextMeta.apCutoverAudit = [
    ...((Array.isArray(bankMeta.apCutoverAudit) ? bankMeta.apCutoverAudit : []).slice(-20)),
    {
      type: "AP_CUTOVER_ACTIVATED",
      at: nowIso,
      by: String(actor || "system"),
      operationId,
      cutoverWorkDate: token.cutoverWorkDate,
      openingBalancePolicy: token.openingBalancePolicy,
      openingBalanceCount: preview.openingBalances.length,
      openingAmountTotal: preview.summary.openingAmountTotal,
      legacyHash: liveHash,
      erpVersion: state.version,
    },
  ];

  if (options.forceFailBeforeSave === true) {
    throw makeError("FORCED_FAILURE", "Forced failure before save — no mutation", 500);
  }

  try {
    const saved = saveErpState(
      {
        ...data,
        bankSyncMeta: nextMeta,
      },
      state.version,
      actor,
      { allowDisbursementMutation: true, allowWorkerApLegacyMutation: false },
    );
    return {
      ok: true,
      idempotent: false,
      activation: getApCutoverStatus(saved.data || { ...data, bankSyncMeta: nextMeta }, saved.version),
      openingBalances: preview.openingBalances,
      version: saved.version,
      updatedAt: saved.updatedAt,
    };
  } catch (error) {
    if (error?.status === 409) {
      throw makeError("VERSION_CONFLICT", "ERP version conflict during activate — create a new preview", 409);
    }
    throw error;
  }
}

export function setEmergencyDisbursementWritePause(enabled, actor = "system", options = {}) {
  const state = getErpState();
  const data = state.data || {};
  const meta = readApLedgerMeta(data);
  if (!meta.apLedgerActivatedAt) {
    throw makeError("NOT_ACTIVATED", "Emergency pause requires an activated AP ledger", 400);
  }
  const bankMeta = data.bankSyncMeta && typeof data.bankSyncMeta === "object" ? { ...data.bankSyncMeta } : {};
  bankMeta.emergencyDisbursementWritePause = enabled === true;
  bankMeta.apCutoverAudit = [
    ...((Array.isArray(bankMeta.apCutoverAudit) ? bankMeta.apCutoverAudit : []).slice(-20)),
    {
      type: enabled ? "EMERGENCY_DISBURSEMENT_WRITE_PAUSE" : "EMERGENCY_DISBURSEMENT_WRITE_RESUME",
      at: new Date().toISOString(),
      by: String(actor || "system"),
      memo: String(options.memo || ""),
    },
  ];
  // Keep disbursementWriteEnabled as-is; pause is a separate gate.
  const saved = saveErpState(
    { ...data, bankSyncMeta: bankMeta },
    state.version,
    actor,
    { allowDisbursementMutation: true },
  );
  return getApCutoverStatus(saved.data || { ...data, bankSyncMeta: bankMeta }, saved.version);
}

export {
  CONFIRMATION_PHRASE,
  ZERO_START_PHRASE,
  PREVIEW_TTL_MS,
  previewOpeningBalances,
};
