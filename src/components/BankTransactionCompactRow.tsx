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
      ? "is-preauth-suppressed opacity-60 bg-slate-50/80"
      : rowTone === "deposit"
        ? "is-deposit-row"
        : rowTone === "withdrawal"
          ? "is-withdrawal-row"
          : "";

  return (
    <tr
      className={`border-t cursor-pointer hover:bg-slate-50/80 ${rowClass} ${isSelected ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : ""}`}
      onClick={() => onSelect(id)}
    >
      <td className="whitespace-nowrap text-slate-600">{dateLabel}</td>
      <td className="text-right font-semibold text-emerald-700">{depositLabel}</td>
      <td className="text-right font-semibold text-red-600">{withdrawalLabel}</td>
      <td className="text-right font-bold text-slate-900">{balanceLabel}</td>
      <td>
        <span className="block max-w-[12rem] truncate font-medium text-slate-900" title={description}>
          {description}
        </span>
      </td>
      <td className="max-w-[10rem]">
        <span className="block truncate text-xs text-slate-700" title={memoLabel}>
          {memoLabel}
        </span>
      </td>
      <td className="max-w-[8rem] truncate text-slate-700" title={counterpartyLabel}>
        {counterpartyLabel}
      </td>
      <td className="max-w-[7rem] truncate text-xs text-slate-700" title={ledgerCategoryLabel}>
        {ledgerCategoryLabel}
      </td>
      <td className="max-w-[7rem] truncate text-xs text-slate-700" title={classificationLabel}>
        {classificationLabel}
      </td>
      <td className="max-w-[6rem] truncate text-xs text-slate-500" title={counterpartyBank}>
        {counterpartyBank}
      </td>
      <td className="max-w-[5rem] truncate text-xs text-slate-600" title={matchStatusLabel}>
        {matchStatusLabel}
      </td>
      <td className="text-xs text-slate-500">{transactionType}</td>
    </tr>
  );
}

export const BankTransactionCompactRow = memo(BankTransactionCompactRowComponent);
