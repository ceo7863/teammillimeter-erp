import React, { memo } from "react";
import { AutoLinkBadge, ManualLinkBadge, PartialPaymentBadge } from "@/components/AutoLinkBadge";
import { getBankTransactionFolderTone } from "@/utils/bankTransactionFolders";
import type { BankTransactionListRowModel } from "@/utils/bankTransactionListDisplay";
import type { BankTransactionSimpleTableLabels } from "@/components/BankTransactionSimpleTable";

export type BankTransactionCompactRowModel = BankTransactionListRowModel;

export type BankTransactionCompactRowLabels = {
  preauthNetSettlementBadge: string;
  preauthNetRefundBadge: string;
  preauthNetSuppressedBadge: string;
  autoLinkBadgeTitle: string;
  manualLinkBadgeTitle: string;
  partialPaymentBadgeTitle: string;
};

type BankTransactionCompactRowProps = BankTransactionCompactRowModel & {
  labels: BankTransactionCompactRowLabels;
  tableLabels: Pick<
    BankTransactionSimpleTableLabels,
    "accountContentPlaceholder" | "categoryPlaceholder" | "fixedExpensePlaceholder"
  >;
  onEditAccountContent: (id: string) => void;
  onEditAccountSubject: (id: string) => void;
  onEditFixedExpense: (id: string) => void;
};

function LedgerCellButton({
  value,
  placeholder,
  empty,
  onClick,
}: {
  value: string | null;
  placeholder: string;
  empty?: boolean;
  onClick: () => void;
}) {
  const display = value?.trim() || placeholder;
  return (
    <button
      type="button"
      className={`max-w-full truncate rounded-lg border px-2 py-1 text-left text-xs font-semibold transition hover:bg-slate-100 ${
        empty || !value?.trim()
          ? "border-dashed border-slate-200 text-slate-400"
          : "border-slate-200 bg-white text-slate-800"
      }`}
      title={display}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {display}
    </button>
  );
}

function renderPreauthNetBadge(
  netGroupRole: BankTransactionListRowModel["netGroupRole"],
  labels: BankTransactionCompactRowLabels,
) {
  if (!netGroupRole) return null;
  if (netGroupRole === "settlement") {
    return (
      <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
        {labels.preauthNetSettlementBadge}
      </span>
    );
  }
  if (netGroupRole === "preauth_refund") {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
        {labels.preauthNetRefundBadge}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
      {labels.preauthNetSuppressedBadge}
    </span>
  );
}

function BankTransactionCompactRowComponent({
  id,
  dateLabel,
  depositLabel,
  withdrawalLabel,
  balanceLabel,
  description,
  accountContentLabel,
  accountContentEmpty,
  categoryLabel,
  accountSubjectLabel,
  fixedExpenseLabel,
  folderName,
  folderType,
  classificationLabel,
  matchLinked,
  matchStatusLabel,
  showAutoLinkBadge,
  showManualLinkBadge,
  showPartialPaymentBadge,
  netGroupRole,
  rowTone,
  labels,
  tableLabels,
  onEditAccountContent,
  onEditAccountSubject,
  onEditFixedExpense,
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
    <tr className={`border-t hover:bg-slate-50/40 ${rowClass}`}>
      <td className="whitespace-nowrap text-slate-600">{dateLabel}</td>
      <td className="text-right font-semibold text-emerald-700">{depositLabel}</td>
      <td className="text-right font-semibold text-red-600">{withdrawalLabel}</td>
      <td className="text-right font-bold text-slate-900">{balanceLabel}</td>
      <td className="max-w-[12rem] truncate font-medium text-slate-900" title={description}>
        {description}
      </td>
      <td className="max-w-[10rem]">
        <LedgerCellButton
          value={accountContentEmpty ? null : accountContentLabel}
          placeholder={tableLabels.accountContentPlaceholder}
          empty={accountContentEmpty}
          onClick={() => onEditAccountContent(id)}
        />
      </td>
      <td className="max-w-[8rem]">
        <LedgerCellButton
          value={accountSubjectLabel}
          placeholder={tableLabels.categoryPlaceholder}
          empty={!accountSubjectLabel}
          onClick={() => onEditAccountSubject(id)}
        />
      </td>
      <td className="max-w-[8rem]">
        <LedgerCellButton
          value={fixedExpenseLabel}
          placeholder={tableLabels.fixedExpensePlaceholder}
          empty={!fixedExpenseLabel}
          onClick={() => onEditFixedExpense(id)}
        />
      </td>
      <td className="max-w-[8rem]">
        {folderName && folderType ? (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getBankTransactionFolderTone(folderType)}`}>
            {folderName}
          </span>
        ) : (
          <span className="text-xs font-semibold text-slate-400">{classificationLabel}</span>
        )}
        {netGroupRole ? <div className="mt-1">{renderPreauthNetBadge(netGroupRole, labels)}</div> : null}
      </td>
      <td className="max-w-[9rem]">
        {matchLinked ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
              {matchStatusLabel}
            </span>
            {showAutoLinkBadge ? <AutoLinkBadge title={labels.autoLinkBadgeTitle} /> : null}
            {showManualLinkBadge ? <ManualLinkBadge title={labels.manualLinkBadgeTitle} /> : null}
            {showPartialPaymentBadge ? <PartialPaymentBadge title={labels.partialPaymentBadgeTitle} /> : null}
          </div>
        ) : (
          <span className="truncate text-xs text-slate-600" title={matchStatusLabel}>
            {matchStatusLabel}
          </span>
        )}
      </td>
    </tr>
  );
}

export const BankTransactionCompactRow = memo(BankTransactionCompactRowComponent);
