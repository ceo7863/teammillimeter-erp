/**
 * Sale tax treatment (과세유형) — a property of the sale, never of the payment.
 *
 * Canonical source: `sale.amount` is the supply amount (공급가액, VAT-exclusive) and
 * `sale.taxTreatment` decides VAT. VAT and the gross receivable are always derived here;
 * cached copies on a row are never trusted.
 *
 * - New sales default to TAXABLE_10.
 * - Sales stored before this field existed resolve to LEGACY_UNSPECIFIED ("과세유형 미확인"):
 *   their receivable stays the stored supply amount (no VAT is invented, nothing is rewritten).
 * - Payment channel (bank / cash / personal_account / card / other) and evidence status never
 *   change the treatment. EXEMPT / ZERO_RATED / OUT_OF_SCOPE need an admin and a recorded reason;
 *   the exemption basis is for the tax accountant to confirm, not an automatic judgement.
 */

export const TAX_TREATMENTS = [
  "TAXABLE_10",
  "EXEMPT",
  "ZERO_RATED",
  "OUT_OF_SCOPE",
  "LEGACY_UNSPECIFIED",
] as const;

export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

export const DEFAULT_NEW_SALE_TAX_TREATMENT: TaxTreatment = "TAXABLE_10";
export const TAXABLE_VAT_RATE = 0.1;

/** Treatments that need an admin and a recorded reason. */
export const TAX_TREATMENTS_REQUIRING_REASON: ReadonlySet<TaxTreatment> = new Set([
  "EXEMPT",
  "ZERO_RATED",
  "OUT_OF_SCOPE",
]);

export const TAX_EVIDENCE_STATUSES = ["ISSUED", "NOT_REQUIRED", "REVIEW_REQUIRED"] as const;
export type TaxEvidenceStatus = (typeof TAX_EVIDENCE_STATUSES)[number];

export const PAYMENT_CHANNELS = ["bank", "cash", "personal_account", "card", "other"] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const TAX_TREATMENT_LABELS: Record<TaxTreatment, string> = {
  TAXABLE_10: "\uACFC\uC138(10%)",
  EXEMPT: "\uBA74\uC138",
  ZERO_RATED: "\uC601\uC138\uC728",
  OUT_OF_SCOPE: "\uACFC\uC138 \uB300\uC0C1 \uC544\uB2D8",
  LEGACY_UNSPECIFIED: "\uACFC\uC138\uC720\uD615 \uBBF8\uD655\uC778",
};

export const TAX_UX_TEXT = {
  channelIsolation: "\uACB0\uC81C\uC218\uB2E8\uC740 \uACFC\uC138\uC720\uD615\uC744 \uBCC0\uACBD\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  evidenceReview: "\uC99D\uBE59 \uBC1C\uAE09 \uD655\uC778 \uD544\uC694",
  exemptionReason: "\uBA74\uC138 \uADFC\uAC70\uB97C \uD655\uC778\uD558\uACE0 \uAE30\uB85D\uD574 \uC8FC\uC138\uC694.",
  accountantConfirm: "\uBA74\uC138\u00B7\uC601\uC138\uC728 \uADFC\uAC70\uB294 \uC138\uBB34\uC0AC \uD655\uC778 \uB300\uC0C1\uC774\uBA70 \uC790\uB3D9\uC73C\uB85C \uD655\uC815\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  legacyUnspecified: "\uACFC\uC138\uC720\uD615 \uBBF8\uD655\uC778",
  lockedAfterSettlement:
    "\uC785\uAE08 \uCDA9\uB2F9 \uB610\uB294 \uB0B4\uC5ED\uC11C \uBC1C\uC1A1 \uD6C4\uC5D0\uB294 \uACFC\uC138\uC720\uD615\uC744 \uC9C1\uC811 \uBC14\uAFC0 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC815\uC815 \uC808\uCC28\uB97C \uC774\uC6A9\uD574 \uC8FC\uC138\uC694.",
  adminOnly: "\uBA74\uC138\u00B7\uC601\uC138\uC728\u00B7\uACFC\uC138 \uB300\uC0C1 \uC544\uB2D8\uC740 \uAD00\uB9AC\uC790\uB9CC \uC9C0\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
} as const;

export type SaleTaxLike = {
  amount?: number | string | null;
  taxTreatment?: string | null;
  taxReason?: string | null;
  taxEvidenceStatus?: string | null;
};

export type SaleTaxAmounts = {
  taxTreatment: TaxTreatment;
  taxRate: number;
  supplyAmount: number;
  vatAmount: number;
  grossReceivableAmount: number;
  isLegacyUnspecified: boolean;
};

function money(value: unknown) {
  const amount = Math.round(Number(value) || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function isTaxTreatment(value: unknown): value is TaxTreatment {
  return typeof value === "string" && (TAX_TREATMENTS as readonly string[]).includes(value);
}

/** Missing or unknown values are LEGACY_UNSPECIFIED — never guessed from client, channel or evidence. */
export function resolveSaleTaxTreatment(sale: SaleTaxLike | null | undefined): TaxTreatment {
  const raw = sale?.taxTreatment;
  return isTaxTreatment(raw) ? raw : "LEGACY_UNSPECIFIED";
}

export function taxRateForTreatment(treatment: TaxTreatment) {
  return treatment === "TAXABLE_10" ? TAXABLE_VAT_RATE : 0;
}

export function computeVatForSupply(supplyAmount: number, treatment: TaxTreatment) {
  if (treatment !== "TAXABLE_10") return 0;
  return Math.round(money(supplyAmount) * TAXABLE_VAT_RATE);
}

export function computeSaleTaxAmounts(sale: SaleTaxLike | null | undefined): SaleTaxAmounts {
  const taxTreatment = resolveSaleTaxTreatment(sale);
  const supplyAmount = money(sale?.amount);
  const vatAmount = computeVatForSupply(supplyAmount, taxTreatment);
  return {
    taxTreatment,
    taxRate: taxRateForTreatment(taxTreatment),
    supplyAmount,
    vatAmount,
    grossReceivableAmount: supplyAmount + vatAmount,
    isLegacyUnspecified: taxTreatment === "LEGACY_UNSPECIFIED",
  };
}

export function computeSaleGrossReceivable(sale: SaleTaxLike | null | undefined) {
  return computeSaleTaxAmounts(sale).grossReceivableAmount;
}

export function formatTaxTreatmentLabel(sale: SaleTaxLike | null | undefined) {
  return TAX_TREATMENT_LABELS[resolveSaleTaxTreatment(sale)];
}

/**
 * Split a gross allocation into supply / VAT for one sale (display only).
 * The VAT share follows the sale's own treatment; the last allocation absorbs rounding
 * so that Σ supply + Σ VAT always equals Σ gross cash.
 */
export function splitGrossForSale(
  sale: SaleTaxLike,
  grossAmount: number,
  options: { alreadySplitVat?: number; isLastForSale?: boolean } = {},
) {
  const tax = computeSaleTaxAmounts(sale);
  const gross = money(grossAmount);
  if (tax.vatAmount <= 0 || tax.grossReceivableAmount <= 0) {
    return { supplyAmount: gross, vatAmount: 0 };
  }
  let vat = Math.round((gross * tax.vatAmount) / tax.grossReceivableAmount);
  if (options.isLastForSale) {
    const remainingVat = Math.max(tax.vatAmount - money(options.alreadySplitVat), 0);
    vat = Math.min(remainingVat, gross);
  }
  return { supplyAmount: gross - vat, vatAmount: vat };
}

export type StatementTaxTotals = {
  taxableSupply: number;
  exemptSupply: number;
  zeroRatedSupply: number;
  outOfScopeSupply: number;
  legacySupply: number;
  supplyTotal: number;
  vatAmount: number;
  grossTotal: number;
};

/**
 * Statement totals by per-sale treatment (a statement never creates AR).
 * Legacy sales keep the issued-statement rule (client VAT flag) so already-issued totals do not move.
 */
export function buildStatementTaxTotals(
  rows: Array<{ supplyAmount: number; taxTreatment?: string | null }>,
  options: { legacyClientVat?: string | null } = {},
): StatementTaxTotals {
  const totals: StatementTaxTotals = {
    taxableSupply: 0,
    exemptSupply: 0,
    zeroRatedSupply: 0,
    outOfScopeSupply: 0,
    legacySupply: 0,
    supplyTotal: 0,
    vatAmount: 0,
    grossTotal: 0,
  };
  let explicitVat = 0;
  for (const row of rows) {
    const supply = money(row.supplyAmount);
    const treatment = resolveSaleTaxTreatment({ taxTreatment: row.taxTreatment });
    totals.supplyTotal += supply;
    if (treatment === "TAXABLE_10") {
      totals.taxableSupply += supply;
      explicitVat += computeVatForSupply(supply, treatment);
    } else if (treatment === "EXEMPT") totals.exemptSupply += supply;
    else if (treatment === "ZERO_RATED") totals.zeroRatedSupply += supply;
    else if (treatment === "OUT_OF_SCOPE") totals.outOfScopeSupply += supply;
    else totals.legacySupply += supply;
  }
  const legacyVat =
    String(options.legacyClientVat || "").trim().toUpperCase() === "Y"
      ? Math.round(totals.legacySupply * TAXABLE_VAT_RATE)
      : 0;
  totals.vatAmount = explicitVat + legacyVat;
  totals.grossTotal = totals.supplyTotal + totals.vatAmount;
  return totals;
}

export type TaxTreatmentChangeCheck =
  | { ok: true }
  | { ok: false; code: "TAX_TREATMENT_INVALID" | "TAX_TREATMENT_ADMIN_ONLY" | "TAX_REASON_REQUIRED" | "TAX_TREATMENT_LOCKED"; message: string };

/**
 * Whether a sale's treatment may change from `previous` to `next`.
 * Payment channel and evidence status are deliberately not inputs.
 */
export function checkTaxTreatmentChange(input: {
  previous: SaleTaxLike | null | undefined;
  next: SaleTaxLike;
  isAdmin: boolean;
  hasEffectiveAllocation: boolean;
  inSentStatement: boolean;
}): TaxTreatmentChangeCheck {
  const nextRaw = input.next.taxTreatment;
  if (nextRaw != null && nextRaw !== "" && !isTaxTreatment(nextRaw)) {
    return { ok: false, code: "TAX_TREATMENT_INVALID", message: `unknown taxTreatment ${String(nextRaw)}` };
  }
  const previousTreatment = resolveSaleTaxTreatment(input.previous);
  const nextTreatment = resolveSaleTaxTreatment(input.next);
  if (input.previous && previousTreatment === nextTreatment) return { ok: true };
  if (input.previous && (input.hasEffectiveAllocation || input.inSentStatement)) {
    return { ok: false, code: "TAX_TREATMENT_LOCKED", message: TAX_UX_TEXT.lockedAfterSettlement };
  }
  if (TAX_TREATMENTS_REQUIRING_REASON.has(nextTreatment)) {
    if (!input.isAdmin) return { ok: false, code: "TAX_TREATMENT_ADMIN_ONLY", message: TAX_UX_TEXT.adminOnly };
    if (!String(input.next.taxReason || "").trim()) {
      return { ok: false, code: "TAX_REASON_REQUIRED", message: TAX_UX_TEXT.exemptionReason };
    }
  }
  return { ok: true };
}
