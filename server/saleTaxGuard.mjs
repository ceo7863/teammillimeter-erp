/**
 * Server guard for sale tax treatment on user saves.
 *
 * - New sales without a valid treatment are stamped TAXABLE_10 (the default for new sales).
 * - Existing sales keep their stored treatment when a save omits the field; legacy rows
 *   (no treatment) are passed through untouched — nothing is bulk-rewritten.
 * - A change goes through checkTaxTreatmentChange: EXEMPT / ZERO_RATED / OUT_OF_SCOPE need an
 *   admin and a reason, and any change is locked once the sale has an effective allocation,
 *   a legacy applied voucher, or appears in a sent statement (correction flow instead).
 * - Payment channel and evidence are never inputs.
 */
import {
  checkTaxTreatmentChange,
  computeSaleTaxAmounts,
  DEFAULT_NEW_SALE_TAX_TREATMENT,
  isTaxTreatment,
  TAX_TREATMENTS_REQUIRING_REASON,
} from "../src/utils/saleTaxTreatment.ts";
import { isAllocationEffectiveAsOf } from "../src/utils/unifiedArReadModel.ts";

const TAX_FIELD_KEYS = [
  "taxTreatment",
  "taxRate",
  "taxReason",
  "exemptionBasis",
  "taxEvidenceType",
  "taxEvidenceStatus",
  "supplyAmount",
  "vatAmount",
  "grossReceivableAmount",
  "taxTreatmentChangedAt",
  "taxTreatmentChangedBy",
  "previousTaxTreatment",
  "taxTreatmentHistory",
];

function saleKey(sale) {
  return String(sale?.id ?? "").trim();
}

function hasTreatmentField(sale) {
  return sale != null && sale.taxTreatment != null && sale.taxTreatment !== "";
}

function withDerivedTaxFields(sale) {
  const tax = computeSaleTaxAmounts(sale);
  if (tax.isLegacyUnspecified) return sale;
  const next = {
    ...sale,
    taxTreatment: tax.taxTreatment,
    taxRate: tax.taxRate,
    supplyAmount: tax.supplyAmount,
    vatAmount: tax.vatAmount,
    grossReceivableAmount: tax.grossReceivableAmount,
  };
  if (!next.taxEvidenceStatus) next.taxEvidenceStatus = "REVIEW_REQUIRED";
  if (!TAX_TREATMENTS_REQUIRING_REASON.has(tax.taxTreatment)) {
    delete next.taxReason;
    delete next.exemptionBasis;
  }
  return next;
}

function carryStoredTaxFields(previous, incoming) {
  const next = { ...incoming };
  for (const key of TAX_FIELD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(previous, key)) next[key] = previous[key];
  }
  return next;
}

function sameDerived(a, b) {
  return TAX_FIELD_KEYS.every((key) => a?.[key] === b?.[key]);
}

export function makeSaleTaxGuardError(check, saleId) {
  const error = new Error(check.message);
  // 409 is reserved for version conflicts (the client retries those); a lock is a business rule.
  error.status = check.code === "TAX_TREATMENT_LOCKED" ? 422 : check.code === "TAX_TREATMENT_ADMIN_ONLY" ? 403 : 400;
  error.code = check.code;
  error.saleId = saleId;
  return error;
}

/**
 * Pure: returns the guarded sales array plus the audit changes. Throws a coded error when a
 * change is not allowed, so the whole save is rejected rather than silently altered.
 */
export function applySaleTaxGuard({
  previousSales = [],
  incomingSales = [],
  isAdmin = false,
  actor = "",
  now = new Date().toISOString(),
  lockedSaleIds = new Set(),
} = {}) {
  let lockedSet = typeof lockedSaleIds === "function" ? null : lockedSaleIds;
  const isLocked = (id) => {
    if (!lockedSet) lockedSet = lockedSaleIds() || new Set();
    return lockedSet.has(id);
  };
  const previousById = new Map((previousSales || []).map((sale) => [saleKey(sale), sale]));
  const changes = [];
  const stamped = [];
  let mutated = false;

  const sales = (incomingSales || []).map((incoming) => {
    if (!incoming || typeof incoming !== "object") return incoming;
    const id = saleKey(incoming);
    const previous = id ? previousById.get(id) : undefined;

    if (!previous) {
      const raw = incoming.taxTreatment;
      if (raw != null && raw !== "" && !isTaxTreatment(raw)) {
        throw makeSaleTaxGuardError(
          { code: "TAX_TREATMENT_INVALID", message: `unknown taxTreatment ${String(raw)}` },
          id,
        );
      }
      const treatment = isTaxTreatment(raw) && raw !== "LEGACY_UNSPECIFIED" ? raw : DEFAULT_NEW_SALE_TAX_TREATMENT;
      const candidate = { ...incoming, taxTreatment: treatment };
      const check = checkTaxTreatmentChange({
        previous: null,
        next: candidate,
        isAdmin,
        hasEffectiveAllocation: false,
        inSentStatement: false,
      });
      if (!check.ok) throw makeSaleTaxGuardError(check, id);
      const next = withDerivedTaxFields(candidate);
      if (treatment !== raw) stamped.push(id);
      if (!sameDerived(next, incoming)) mutated = true;
      return next;
    }

    if (incoming.taxTreatment === "LEGACY_UNSPECIFIED") {
      if (hasTreatmentField(previous)) {
        throw makeSaleTaxGuardError(
          { code: "TAX_TREATMENT_INVALID", message: "LEGACY_UNSPECIFIED cannot be selected for a classified sale" },
          id,
        );
      }
      const { taxTreatment: _legacy, ...rest } = incoming;
      mutated = true;
      return rest;
    }

    if (!hasTreatmentField(incoming)) {
      if (!hasTreatmentField(previous)) return incoming;
      const carried = withDerivedTaxFields(carryStoredTaxFields(previous, incoming));
      if (!sameDerived(carried, incoming)) mutated = true;
      return carried;
    }

    const treatmentChanges =
      computeSaleTaxAmounts(previous).taxTreatment !== computeSaleTaxAmounts(incoming).taxTreatment;
    const locked = treatmentChanges && isLocked(id);
    const check = checkTaxTreatmentChange({
      previous,
      next: incoming,
      isAdmin,
      hasEffectiveAllocation: locked,
      inSentStatement: locked,
    });
    if (!check.ok) throw makeSaleTaxGuardError(check, id);

    const previousTreatment = computeSaleTaxAmounts(previous).taxTreatment;
    let next = withDerivedTaxFields(incoming);
    const storedHistory = Array.isArray(previous.taxTreatmentHistory) ? previous.taxTreatmentHistory : [];
    if (next.taxTreatment !== previousTreatment) {
      const change = {
        saleId: id,
        previous: previousTreatment,
        next: next.taxTreatment,
        reason: String(next.taxReason || ""),
        actor,
        at: now,
      };
      changes.push(change);
      next = {
        ...next,
        previousTaxTreatment: previousTreatment,
        taxTreatmentChangedAt: now,
        taxTreatmentChangedBy: actor,
        taxTreatmentHistory: [
          ...storedHistory,
          { at: now, by: actor, from: previousTreatment, to: change.next, reason: change.reason },
        ],
      };
    } else {
      for (const key of ["previousTaxTreatment", "taxTreatmentChangedAt", "taxTreatmentChangedBy"]) {
        if (Object.prototype.hasOwnProperty.call(previous, key)) next[key] = previous[key];
        else delete next[key];
      }
      if (storedHistory.length) next.taxTreatmentHistory = storedHistory;
      else delete next.taxTreatmentHistory;
    }
    if (!sameDerived(next, incoming)) mutated = true;
    return next;
  });

  return { sales: mutated ? sales : incomingSales, changes, stampedNewSaleIds: stamped };
}

/**
 * Admin correction flow for sales whose treatment is locked by settlement (allocation, legacy
 * voucher, sent statement). Changes only tax fields and history; receipts and allocations are
 * never touched here. Replaying the same operationId is a no-op.
 */
export function planSaleTaxCorrection({
  sales = [],
  saleIds = [],
  taxTreatment,
  reason = "",
  isAdmin = false,
  actor = "",
  operationId = "",
  now = new Date().toISOString(),
} = {}) {
  const fail = (code, message, saleId = null) => {
    throw makeSaleTaxGuardError({ code, message }, saleId);
  };
  if (!isAdmin) fail("TAX_TREATMENT_ADMIN_ONLY", "과세유형 정정은 관리자만 할 수 있습니다.");
  if (!isTaxTreatment(taxTreatment) || taxTreatment === "LEGACY_UNSPECIFIED") {
    fail("TAX_TREATMENT_INVALID", `invalid correction target ${String(taxTreatment)}`);
  }
  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) fail("TAX_TREATMENT_REASON_REQUIRED", "정정 사유를 입력해 주세요.");
  const op = String(operationId || "").trim();
  if (!op) fail("TAX_TREATMENT_INVALID", "operationId가 필요합니다.");
  const ids = [...new Set((saleIds || []).map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (!ids.length) fail("TAX_TREATMENT_INVALID", "정정할 매출이 없습니다.");

  const byId = new Map((sales || []).map((sale) => [saleKey(sale), sale]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) fail("TAX_TREATMENT_INVALID", `매출을 찾을 수 없습니다: ${missing.join(", ")}`, missing[0]);

  const target = new Set(ids);
  const changes = [];
  const alreadyApplied = [];
  const next = (sales || []).map((sale) => {
    const id = saleKey(sale);
    if (!target.has(id)) return sale;
    const history = Array.isArray(sale.taxTreatmentHistory) ? sale.taxTreatmentHistory : [];
    if (history.some((entry) => entry?.operationId === op)) {
      alreadyApplied.push(id);
      return sale;
    }
    const from = computeSaleTaxAmounts(sale).taxTreatment;
    if (from === taxTreatment) {
      alreadyApplied.push(id);
      return sale;
    }
    const candidate = withDerivedTaxFields({
      ...sale,
      taxTreatment,
      ...(TAX_TREATMENTS_REQUIRING_REASON.has(taxTreatment) ? { taxReason: trimmedReason } : {}),
    });
    changes.push({ saleId: id, previous: from, next: taxTreatment, reason: trimmedReason, actor, at: now, operationId: op });
    return {
      ...candidate,
      // Peers merge sales by updatedAt; without a bump they keep their stale local copy.
      updatedAt: now,
      previousTaxTreatment: from,
      taxTreatmentChangedAt: now,
      taxTreatmentChangedBy: actor,
      taxTreatmentHistory: [
        ...history,
        { at: now, by: actor, from, to: taxTreatment, reason: trimmedReason, correction: true, operationId: op },
      ],
    };
  });
  return { sales: changes.length ? next : sales, changes, alreadyApplied };
}

/** Sale ids whose treatment may no longer change directly (allocation, legacy applied voucher, sent statement). */
export function collectTaxLockedSaleIds({
  receipts = [],
  receiptAllocations = [],
  paymentVouchers = [],
  sentStatementArchives = [],
} = {}) {
  const locked = new Set();
  const receiptById = new Map((receipts || []).map((row) => [String(row?.id ?? ""), row]));
  for (const allocation of receiptAllocations || []) {
    if (allocation?.status && allocation.status !== "posted") continue;
    // Effective at the far future = posted and never reversed.
    if (!isAllocationEffectiveAsOf(allocation, receiptById, "9999-12-31")) continue;
    const id = String(allocation.saleId ?? "").trim();
    if (id) locked.add(id);
  }
  for (const voucher of paymentVouchers || []) {
    const id = String(voucher?.salesId ?? "").trim();
    if (id) locked.add(id);
  }
  for (const archive of sentStatementArchives || []) {
    for (const raw of archive?.statementSalesIds || []) {
      const id = String(raw ?? "").trim();
      if (id) locked.add(id);
    }
  }
  return locked;
}