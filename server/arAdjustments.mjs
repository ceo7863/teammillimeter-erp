/**
 * Append-only AR adjustment domain.
 * Must NOT touch receipts, sales amounts, bank transactions, or payment vouchers.
 */
import crypto from "crypto";
import { getErpState, saveErpState } from "./db.mjs";

const SAVE_RETRY_ATTEMPTS = 8;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const AR_ADJUSTMENT_TYPES = Object.freeze([
  "CREDIT_AR_ADJUSTMENT",
  "DEBIT_AR_ADJUSTMENT",
  "OPENING_AR_BALANCE",
  "HISTORICAL_COLLECTION_RECONCILIATION",
]);

export const AR_ADJUSTMENT_TARGET_MODES = Object.freeze(["TARGETED", "BALANCE_ONLY"]);

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function nowIso() {
  return new Date().toISOString();
}

function todaySeoul() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
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

function normalizeSeoulDate(value, label = "date") {
  const text = String(value || "").trim().slice(0, 10);
  if (!DATE_RE.test(text)) {
    throw makeError("INVALID_DATE", `${label}는 YYYY-MM-DD 형식이어야 합니다.`);
  }
  return text;
}

export function hashPayload(canonical) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function listAdjustments(data = {}) {
  return Array.isArray(data.arAdjustments) ? data.arAdjustments : [];
}

function listEvents(data = {}) {
  return Array.isArray(data.arAdjustmentEvents) ? data.arAdjustmentEvents : [];
}

function nextAdjustmentNo(adjustments) {
  const stamp = todaySeoul().replace(/-/g, "");
  const prefix = `ARADJ-${stamp}-`;
  let maxSeq = 0;
  for (const row of adjustments || []) {
    const no = String(row.adjustmentNo || "");
    if (!no.startsWith(prefix)) continue;
    const seq = Number(no.slice(prefix.length));
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

function findByOperationId(adjustments, operationId) {
  const key = String(operationId || "").trim();
  if (!key) return null;
  return (adjustments || []).find((row) => String(row.operationId || "") === key) || null;
}

function assertIdempotentMatch(existingHash, payloadHash, operationId, existingId = null) {
  if (String(existingHash || "") === String(payloadHash)) return;
  throw makeError(
    "IDEMPOTENCY_CONFLICT",
    "동일 operationId에 다른 AR 조정 payload가 요청되었습니다.",
    409,
    { operationId, existingAdjustmentId: existingId },
  );
}

function normalizeType(raw) {
  const type = String(raw || "").trim().toUpperCase();
  if (!AR_ADJUSTMENT_TYPES.includes(type)) {
    throw makeError(
      "INVALID_ADJUSTMENT_TYPE",
      "adjustmentType은 CREDIT_AR_ADJUSTMENT|DEBIT_AR_ADJUSTMENT|OPENING_AR_BALANCE|HISTORICAL_COLLECTION_RECONCILIATION 중 하나여야 합니다.",
    );
  }
  return type;
}

function normalizeTargetMode(raw, hasTargets) {
  const mode = String(raw || (hasTargets ? "TARGETED" : "BALANCE_ONLY"))
    .trim()
    .toUpperCase();
  if (!AR_ADJUSTMENT_TARGET_MODES.includes(mode)) {
    throw makeError("INVALID_TARGET_MODE", "targetMode는 TARGETED|BALANCE_ONLY 중 하나여야 합니다.");
  }
  return mode;
}

function signedAmountForType(type, amount) {
  const abs = Math.abs(money(amount));
  if (type === "DEBIT_AR_ADJUSTMENT" || type === "OPENING_AR_BALANCE") return abs;
  // CREDIT reduces AR
  return -abs;
}

function canonicalizeCreatePayload(input) {
  const targets = (Array.isArray(input?.targets) ? input.targets : [])
    .map((row) => ({
      saleId: row?.saleId != null ? String(row.saleId) : null,
      amount: money(row?.amount),
      memo: String(row?.memo || "").trim() || null,
    }))
    .filter((row) => row.amount !== 0)
    .sort(
      (a, b) =>
        String(a.saleId || "").localeCompare(String(b.saleId || "")) || a.amount - b.amount,
    );

  return {
    action: "create_ar_adjustment",
    clientId: String(input?.clientId || "").trim(),
    effectiveDate: normalizeSeoulDate(input?.effectiveDate || todaySeoul(), "effectiveDate"),
    adjustmentType: normalizeType(input?.adjustmentType || input?.type),
    targetMode: normalizeTargetMode(input?.targetMode, targets.length > 0),
    amount: money(input?.amount),
    memo: String(input?.memo || "").trim() || null,
    targets,
  };
}

/**
 * Pure planner — never touches the database.
 */
export function planCreateArAdjustment(context, input, actor = "system") {
  const adjustments = Array.isArray(context?.arAdjustments)
    ? [...context.arAdjustments]
    : Array.isArray(context?.adjustments)
      ? [...context.adjustments]
      : [];
  const events = Array.isArray(context?.arAdjustmentEvents)
    ? [...context.arAdjustmentEvents]
    : Array.isArray(context?.events)
      ? [...context.events]
      : [];

  const raw = input || {};
  const operationId = String(raw.operationId || raw.idempotencyKey || "").trim();
  if (!operationId) throw makeError("OPERATION_ID_REQUIRED", "operationId가 필요합니다.");

  const canonical = canonicalizeCreatePayload(raw);
  if (!canonical.clientId) throw makeError("CLIENT_REQUIRED", "거래처 ID가 필요합니다.");
  if (canonical.amount === 0 && !canonical.targets.length) {
    throw makeError("AMOUNT_REQUIRED", "조정 금액이 필요합니다.");
  }

  const targetSum = canonical.targets.reduce((sum, row) => sum + money(row.amount), 0);
  let amount = canonical.amount;
  if (!amount && targetSum) amount = Math.abs(targetSum);
  if (canonical.targetMode === "TARGETED" && canonical.targets.length && Math.abs(targetSum) !== Math.abs(amount)) {
    // Prefer explicit amount; targets are informational lines when amounts differ.
    if (!canonical.amount) amount = Math.abs(targetSum);
  }

  const payloadHash = hashPayload({ ...canonical, amount });
  const existing = findByOperationId(adjustments, operationId);
  if (existing) {
    assertIdempotentMatch(existing.payloadHash, payloadHash, operationId, existing.id);
    return {
      shortCircuit: true,
      value: {
        ok: true,
        idempotent: true,
        adjustment: existing,
        events: events.filter((row) => String(row.adjustmentId) === String(existing.id)),
      },
    };
  }

  const signed = signedAmountForType(canonical.adjustmentType, amount);
  const id = makeId("aradj");
  const createdAt = nowIso();
  const adjustment = {
    id,
    adjustmentNo: nextAdjustmentNo(adjustments),
    clientId: canonical.clientId,
    clientName: String(raw.clientName || "").trim() || null,
    clientNameSnapshot: String(raw.clientNameSnapshot || raw.clientName || "").trim() || null,
    effectiveDate: canonical.effectiveDate,
    adjustmentType: canonical.adjustmentType,
    targetMode: canonical.targetMode,
    amount: Math.abs(amount),
    signedAmount: signed,
    currency: "KRW",
    status: "posted",
    memo: canonical.memo,
    targets: canonical.targets,
    operationId,
    idempotencyKey: operationId,
    payloadHash,
    payloadSnapshot: { ...canonical, amount },
    createdAt,
    createdBy: String(actor || "system"),
    postedAt: createdAt,
    postedBy: String(actor || "system"),
    reversalOfAdjustmentId: null,
    reversedEffectiveDate: null,
    version: 1,
  };

  const event = {
    id: makeId("aradjevt"),
    adjustmentId: id,
    eventType: "created",
    operationId,
    payloadHash,
    actor: String(actor || "system"),
    at: createdAt,
    effectiveDate: canonical.effectiveDate,
  };

  return {
    shortCircuit: false,
    arAdjustments: [...adjustments, adjustment],
    arAdjustmentEvents: [...events, event],
    value: { ok: true, idempotent: false, adjustment, events: [event] },
  };
}

function saveArAdjustmentDomainAtomic(mutator, actor) {
  for (let attempt = 0; attempt < SAVE_RETRY_ATTEMPTS; attempt += 1) {
    const state = getErpState();
    const data = state.data || {};
    const result = mutator({
      data,
      arAdjustments: [...listAdjustments(data)],
      arAdjustmentEvents: [...listEvents(data)],
      actor,
      version: state.version,
    });
    if (result.shortCircuit) return result.value;
    try {
      const saved = saveErpState(
        {
          ...data,
          arAdjustments: result.arAdjustments,
          arAdjustmentEvents: result.arAdjustmentEvents,
        },
        state.version,
        actor,
        { allowArAdjustmentMutation: true },
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
  throw makeError("AR_ADJUSTMENT_SAVE_FAILED", "AR 조정 저장에 실패했습니다.", 500);
}

export function createArAdjustment(input, actor = "system") {
  return saveArAdjustmentDomainAtomic((ctx) => planCreateArAdjustment(ctx, input, actor), actor);
}

/** Pure preview — no save. Does not require a durable operationId or persisted client. */
export function previewArAdjustment(input) {
  const raw = input || {};
  const adjustmentType = normalizeType(raw.adjustmentType || raw.type || "CREDIT_AR_ADJUSTMENT");
  const amount = Math.abs(money(raw.amount));
  const targets = (Array.isArray(raw.targets) ? raw.targets : [])
    .map((row) => ({
      saleId: row?.saleId != null ? String(row.saleId) : null,
      amount: money(row?.amount),
    }))
    .filter((row) => row.amount !== 0);
  const targetMode = normalizeTargetMode(raw.targetMode, targets.length > 0 || Boolean(raw.saleIds?.length));
  const signed = signedAmountForType(adjustmentType, amount || targets.reduce((s, r) => s + Math.abs(r.amount), 0));
  const debit = signed >= 0 ? Math.abs(signed) : 0;
  const credit = signed < 0 ? Math.abs(signed) : 0;
  return {
    ok: true,
    preview: true,
    adjustmentType,
    type: adjustmentType,
    targetMode,
    amount: Math.abs(signed) || amount,
    signedAmount: signed,
    direction: signed >= 0 ? "debit" : "credit",
    debit,
    credit,
    netArDelta: signed,
    clientId: raw.clientId != null ? String(raw.clientId) : null,
    targets,
    touchesReceipts: false,
    touchesSalesAmounts: false,
    touchesBankTransactions: false,
    touchesPaymentVouchers: false,
  };
}

export function reverseArAdjustment(id, input = {}, actor = "system") {
  const adjustmentId = String(id || "").trim();
  if (!adjustmentId) throw makeError("ADJUSTMENT_ID_REQUIRED", "조정 ID가 필요합니다.");

  return saveArAdjustmentDomainAtomic(({ arAdjustments, arAdjustmentEvents }) => {
    const operationId = String(input.operationId || input.idempotencyKey || "").trim();
    if (!operationId) throw makeError("OPERATION_ID_REQUIRED", "operationId가 필요합니다.");

    const existing = arAdjustments.find((row) => String(row.id) === adjustmentId);
    if (!existing) throw makeError("ADJUSTMENT_NOT_FOUND", "AR 조정을 찾을 수 없습니다.", 404);
    if (existing.status === "reversed" || existing.reversedEffectiveDate) {
      throw makeError("ALREADY_REVERSED", "이미 취소된 AR 조정입니다.", 409);
    }

    const reversalEffectiveDate = normalizeSeoulDate(
      input.reversalEffectiveDate || input.effectiveDate || todaySeoul(),
      "reversalEffectiveDate",
    );
    const canonical = {
      action: "reverse_ar_adjustment",
      adjustmentId,
      reversalEffectiveDate,
    };
    const payloadHash = hashPayload(canonical);

    const prior = findByOperationId(arAdjustments, operationId);
    if (prior) {
      assertIdempotentMatch(prior.payloadHash, payloadHash, operationId, prior.id);
      return {
        shortCircuit: true,
        value: { ok: true, idempotent: true, adjustment: prior },
      };
    }

    const createdAt = nowIso();
    const reversal = {
      id: makeId("aradj"),
      adjustmentNo: nextAdjustmentNo(arAdjustments),
      clientId: existing.clientId,
      clientName: existing.clientName,
      effectiveDate: reversalEffectiveDate,
      adjustmentType: existing.adjustmentType,
      targetMode: existing.targetMode,
      amount: money(existing.amount),
      signedAmount: -money(existing.signedAmount),
      currency: "KRW",
      status: "posted",
      memo: String(input.memo || `취소: ${existing.adjustmentNo || existing.id}`).trim(),
      targets: Array.isArray(existing.targets)
        ? existing.targets.map((row) => ({ ...row, amount: -money(row.amount) }))
        : [],
      operationId,
      idempotencyKey: operationId,
      payloadHash,
      payloadSnapshot: canonical,
      createdAt,
      createdBy: String(actor || "system"),
      postedAt: createdAt,
      postedBy: String(actor || "system"),
      reversalOfAdjustmentId: existing.id,
      reversedEffectiveDate: null,
      version: 1,
    };

    const nextAdjustments = arAdjustments.map((row) =>
      String(row.id) === adjustmentId
        ? {
            ...row,
            status: "reversed",
            reversedEffectiveDate: reversalEffectiveDate,
            reversedAt: createdAt,
            reversedBy: String(actor || "system"),
            version: Number(row.version || 1) + 1,
          }
        : row,
    );
    nextAdjustments.push(reversal);

    const event = {
      id: makeId("aradjevt"),
      adjustmentId: existing.id,
      eventType: "reversed",
      reversalAdjustmentId: reversal.id,
      operationId,
      payloadHash,
      actor: String(actor || "system"),
      at: createdAt,
      effectiveDate: reversalEffectiveDate,
    };

    return {
      shortCircuit: false,
      arAdjustments: nextAdjustments,
      arAdjustmentEvents: [...arAdjustmentEvents, event],
      value: { ok: true, idempotent: false, adjustment: reversal, reversed: existing.id },
    };
  }, actor);
}

export function listArAdjustments(data = {}) {
  return listAdjustments(data).filter((row) => !row.reversalOfAdjustmentId);
}

export function summarizePeriodAdjustments(adjustments = [], { clientId, start, end } = {}) {
  const cid = clientId != null && String(clientId).trim() !== "" ? String(clientId) : null;
  const startYmd = start ? String(start).slice(0, 10) : "";
  const endYmd = end ? String(end).slice(0, 10) : "";
  let debit = 0;
  let credit = 0;
  for (const row of adjustments || []) {
    if (!row || row.status === "reversed") continue;
    if (row.reversalOfAdjustmentId) continue;
    if (cid && String(row.clientId) !== cid) continue;
    const day = String(row.effectiveDate || "").slice(0, 10);
    if (startYmd && day && day < startYmd) continue;
    if (endYmd && day && day > endYmd) continue;
    const signed = money(row.signedAmount);
    if (signed >= 0) debit += signed;
    else credit += Math.abs(signed);
  }
  return { debit, credit };
}

export { money as arAdjustmentMoney, makeError as arAdjustmentError };
