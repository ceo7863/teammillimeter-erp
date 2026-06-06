import React from "react";

export function FixedExpenseLinkCell({
  value,
  placeholder,
  onClick,
  disabled = false,
}: {
  value: string | null;
  placeholder: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const empty = !value?.trim();
  const display = value?.trim() || placeholder;

  if (disabled) {
    return (
      <span className="erp-text-caption truncate text-slate-500" title={display}>
        {empty ? "-" : display}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`max-w-full truncate rounded-lg border px-2 py-1 text-left text-xs font-semibold transition hover:opacity-90 ${
        empty ? "border-dashed border-slate-200 text-slate-400" : "border-violet-300 bg-violet-50 text-violet-900"
      }`}
      title={display}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      {display}
    </button>
  );
}
