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