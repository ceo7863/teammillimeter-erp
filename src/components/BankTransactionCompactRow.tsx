import React, { memo } from "react";
import { BookOpen } from "lucide-react";
import { AutoLinkBadge, ManualLinkBadge, PartialPaymentBadge } from "@/components/AutoLinkBadge";
import { getBankTransactionFolderTone } from "@/utils/bankTransactionFolders";
import type { BankTransactionListRowModel } from "@/utils/bankTransactionListDisplay";

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
  isSelected: boolean;
  onSelect: (id: string) => void;
};

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
  memoLabel,
  counterpartyLabel,
  ledgerCategory,
  ledgerFromFixed,
  folderName,
  folderType,
  classificationLabel,
  counterpartyBank,
  matchLinked,
  matchStatusLabel,
  showAutoLinkBadge,
  showManualLinkBadge,
  showPartialPaymentBadge,
  netGroupRole,
  transactionType,
  rowTone,
  labels,
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
      <td className="max-w-[12rem] truncate font-medium text-slate-900" title={description}>
        {description}
      </td>
      <td className="max-w-[10rem] truncate text-xs text-slate-700" title={memoLabel}>
        {memoLabel}
      </td>
      <td className="max-w-[8rem] truncate text-slate-700" title={counterpartyLabel}>
        {counterpartyLabel}
      </td>
      <td className="max-w-[8rem]">
        {ledgerCategory ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
              ledgerFromFixed ? "bg-amber-100 text-amber-800" : "border border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <BookOpen size={11} />
            {ledgerCategory}
          </span>
        ) : (
          <span className="text-xs text-slate-400">-</span>
        )}
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
      <td className="max-w-[6rem] truncate text-xs text-slate-500" title={counterpartyBank}>
        {counterpartyBank}
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
      <td className="text-xs text-slate-500">
        {transactionType && transactionType !== "-" ? (
          <span className="erp-bank-type-badge">{transactionType}</span>
        ) : (
          "-"
        )}
      </td>
    </tr>
  );
}

export const BankTransactionCompactRow = memo(BankTransactionCompactRowComponent);
