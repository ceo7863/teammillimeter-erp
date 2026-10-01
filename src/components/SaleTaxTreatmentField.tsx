import React, { memo } from "react";
import {
  TAX_TREATMENT_LABELS,
  TAX_TREATMENTS_REQUIRING_REASON,
  TAX_UX_TEXT,
  computeSaleTaxAmounts,
  type TaxTreatment,
} from "@/utils/saleTaxTreatment";

const SELECTABLE_TREATMENTS: TaxTreatment[] = ["TAXABLE_10", "EXEMPT", "ZERO_RATED", "OUT_OF_SCOPE"];

function formatWon(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export type SaleTaxTreatmentFieldProps = {
  value?: TaxTreatment;
  reason?: string;
  supplyAmount: number;
  isAdmin?: boolean;
  locked?: boolean;
  onChange: (key: "taxTreatment" | "taxReason", value: string) => void;
};

/** Sale-level tax treatment. Payment channel is never an input here. */
export const SaleTaxTreatmentField = memo(function SaleTaxTreatmentField({
  value,
  reason = "",
  supplyAmount,
  isAdmin = false,
  locked = false,
  onChange,
}: SaleTaxTreatmentFieldProps) {
  const treatment: TaxTreatment = value || "LEGACY_UNSPECIFIED";
  const tax = computeSaleTaxAmounts({ amount: supplyAmount, taxTreatment: treatment });
  const needsReason = TAX_TREATMENTS_REQUIRING_REASON.has(treatment);
  const options = treatment === "LEGACY_UNSPECIFIED" ? ["LEGACY_UNSPECIFIED" as TaxTreatment, ...SELECTABLE_TREATMENTS] : SELECTABLE_TREATMENTS;

  return (
    <div className="erp-sale-tax-field" data-testid="sale-tax-treatment-field" data-tax-treatment={treatment}>
      <div className="erp-sale-tax-field-row">
        <label className="erp-sale-tax-field-label" htmlFor="sale-tax-treatment-select">
          과세유형
        </label>
        <select
          id="sale-tax-treatment-select"
          className="erp-sale-tax-field-select"
          value={treatment}
          disabled={locked}
          data-testid="sale-tax-treatment-select"
          onChange={(event) => onChange("taxTreatment", event.target.value)}
        >
          {options.map((option) => (
            <option
              key={option}
              value={option}
              disabled={
                option === "LEGACY_UNSPECIFIED" ||
                (!isAdmin && TAX_TREATMENTS_REQUIRING_REASON.has(option) && option !== treatment)
              }
            >
              {TAX_TREATMENT_LABELS[option]}
            </option>
          ))}
        </select>
        <span className="erp-sale-tax-field-amounts" data-testid="sale-tax-amounts">
          공급가액 {formatWon(tax.supplyAmount)} · 부가세 {formatWon(tax.vatAmount)} · 총채권 {formatWon(tax.grossReceivableAmount)}
        </span>
      </div>
      {needsReason ? (
        <div className="erp-sale-tax-field-row">
          <input
            type="text"
            className="erp-sale-tax-field-reason"
            data-testid="sale-tax-reason"
            value={reason}
            disabled={locked}
            placeholder={TAX_UX_TEXT.exemptionReason}
            onChange={(event) => onChange("taxReason", event.target.value)}
          />
        </div>
      ) : null}
      <p className="erp-sale-tax-field-hint">
        {TAX_UX_TEXT.channelIsolation}
        {treatment === "LEGACY_UNSPECIFIED" ? ` · ${TAX_UX_TEXT.legacyUnspecified}` : ""}
        {needsReason ? ` · ${TAX_UX_TEXT.accountantConfirm}` : ` · ${TAX_UX_TEXT.evidenceReview}`}
        {!isAdmin ? ` · ${TAX_UX_TEXT.adminOnly}` : ""}
        {locked ? ` · ${TAX_UX_TEXT.lockedAfterSettlement}` : ""}
      </p>
    </div>
  );
});
