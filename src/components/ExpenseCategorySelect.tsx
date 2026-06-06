import React, { useMemo } from "react";
import { buildExpenseCategorySelectOptions } from "@/utils/expenseCategoryManage";
import { normalizeExpenseCategoryName } from "@/utils/companyLedger";

type ExpenseCategorySelectProps = {
  value: string;
  categories: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function ExpenseCategorySelect({
  value,
  categories,
  onChange,
  disabled = false,
  compact = true,
  className = "",
  "aria-label": ariaLabel = "지출 카테고리",
}: ExpenseCategorySelectProps) {
  const options = useMemo(() => buildExpenseCategorySelectOptions(categories, value), [categories, value]);
  const normalizedValue = normalizeExpenseCategoryName(value) || value;

  return (
    <select
      className={`erp-input erp-ledger-category-select ${compact ? "erp-input-compact" : ""} ${className}`.trim()}
      value={options.some((row) => row.value === normalizedValue) ? normalizedValue : value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => {
        const next = normalizeExpenseCategoryName(event.target.value);
        if (next && next !== normalizedValue) onChange(next);
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
