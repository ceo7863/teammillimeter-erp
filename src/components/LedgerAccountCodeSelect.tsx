import React, { useMemo } from "react";
import { buildBankLedgerAccountSelectOptions } from "@/utils/bankLedgerAccounts";
import type { AccountCode } from "@/utils/ledgerSystem";

type LedgerAccountCodeSelectProps = {
  value: string;
  accountCodes: AccountCode[];
  onChange: (accountCode: string) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
};

export function LedgerAccountCodeSelect({
  value,
  accountCodes,
  onChange,
  disabled = false,
  compact = true,
  className = "",
  placeholder = "\uACC4\uC815 \uC120\uD0DD",
  "aria-label": ariaLabel = "\uACC4\uC815",
}: LedgerAccountCodeSelectProps) {
  const options = useMemo(() => buildBankLedgerAccountSelectOptions(accountCodes), [accountCodes]);

  return (
    <select
      className={`erp-input erp-ledger-category-select ${compact ? "erp-input-compact" : ""} ${className}`.trim()}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
