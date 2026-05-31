import React, { memo } from "react";

export type BankTransactionCompactRowModel = {
  id: string;
  dateLabel: string;
  depositLabel: string;
  withdrawalLabel: string;
  balanceLabel: string;
  description: string;
  memoLabel: string;
  counterpartyLabel: string;
  ledgerCategoryLabel: string;
  classificationLabel: string;
  counterpartyBank: string;
  matchStatusLabel: string;
  transactionType: string;
  rowTone: "" | "deposit" | "withdrawal" | "suppressed";
};

type BankTransactionCompactRowProps = BankTransactionCompactRowModel & {
  isSelected: boolean;
  onSelect: (id: string) => void;
};

function BankTransactionCompactRowComponent({
  id,
  dateLabel,
  depositLabel,
  withdrawalLabel,
  balanceLabel,
  description,
  memoLabel,
  counterpartyLabel,
  ledgerCategoryLabel,
  classificationLabel,
  counterpartyBank,
  matchStatusLabel,
  transactionType,
  rowTone,
  isSelected,
  onSelect,
}: BankTransactionCompactRowProps) {
  const rowClass =
    rowTone === "suppressed"
      ? "is-preauth-suppressed opacity-60"
      : rowTone === "deposit"
        ? "is-deposit-row"
        : rowTone === "withdrawal"
          ? "is-withdrawal-row"
          : "";

  return (
    <div
      role="row"
      className={`erp-bank-virtual-grid-row border-b border-slate-100 text-xs ${rowClass} ${isSelected ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : "hover:bg-slate-50/80"} cursor-pointer`}
      onClick={() => onSelect(id)}
    >
      <div className="whitespace-nowrap text-slate-600">{dateLabel}</div>
      <div className="text-right font-semibold text-emerald-700">{depositLabel}</div>
      <div className="text-right font-semibold text-red-600">{withdrawalLabel}</div>
      <div className="text-right font-bold text-slate-900">{balanceLabel}</div>
      <div className="truncate font-medium text-slate-900" title={description}>
        {description}
      </div>
      <div className="truncate text-slate-700" title={memoLabel}>
        {memoLabel}
      </div>
      <div className="truncate text-slate-700" title={counterpartyLabel}>
        {counterpartyLabel}
      </div>
      <div className="truncate text-slate-700" title={ledgerCategoryLabel}>
        {ledgerCategoryLabel}
      </div>
      <div className="truncate text-slate-700" title={classificationLabel}>
        {classificationLabel}
      </div>
      <div className="truncate text-slate-500" title={counterpartyBank}>
        {counterpartyBank}
      </div>
      <div className="truncate text-slate-600" title={matchStatusLabel}>
        {matchStatusLabel}
      </div>
      <div className="truncate text-slate-500">{transactionType}</div>
    </div>
  );
}

export const BankTransactionCompactRow = memo(BankTransactionCompactRowComponent);
