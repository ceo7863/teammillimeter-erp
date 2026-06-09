import React, { memo } from "react";
import { BookOpen, Link2 } from "lucide-react";
import { AutoLinkBadge, ManualLinkBadge, PartialPaymentBadge } from "@/components/AutoLinkBadge";
import { Button } from "@/components/ui/button";
import {
  BankTransactionFolderAssignCell,
  type BankFolderSelectGroup,
} from "@/components/BankTransactionFolderAssignCell";
import {
  getBankMatchStatusLabel,
  isBankMatchAutoLinked,
  isBankMatchManualLinked,
  type BankDepositMatchCandidate,
} from "@/utils/bankReceivableMatch";
import { type SentStatementMatchCandidate } from "@/utils/bankSentStatementMatch";
import {
  getBankTransactionFolderTone,
  isCardCompanyDeposit,
  type BankTransactionFolder,
  type BankTransactionFolderType,
} from "@/utils/bankTransactionFolders";
import { formatKRW } from "@/utils/companyLedger";
import { formatBankTransactionDateTime, type BankTransaction } from "@/utils/bankTransactions";
import type { BankTransactionRowDisplay } from "@/utils/bankTransactionRowDisplay";

export type BankTransactionDepositSuggestion =
  | {
      kind: "sentStatement";
      candidates: SentStatementMatchCandidate[];
    }
  | {
      kind: "receivable";
      candidates: BankDepositMatchCandidate[];
    };

export type BankTransactionTableRowLabels = {
  memoPlaceholder: string;
  clientLinkClickHint: string;
  unfiled: string;
  sentStatementMatch: string;
  selectReceivable: string;
  matchScore: string;
  partialStatementMatchHint: (paid: number, remaining: number) => string;
  matchConfirmHint: string;
  matchConfirm: string;
  matchManual: string;
  ledgerSendTo: string;
  folderSuggestionBadge: (label: string, subject?: string) => string;
  clientFolders: string;
  workerFolders: string;
  cardFolders: string;
  classification: string;
  preauthNetSettlementBadge: string;
  preauthNetRefundBadge: string;
  preauthNetSuppressedBadge: string;
  autoLinkBadgeTitle: string;
  manualLinkBadgeTitle: string;
  partialPaymentBadgeTitle: string;
};

function canLinkUnclassifiedClientDeposit(row: BankTransaction) {
  return row.deposit > 0 && !row.folderId && !isCardCompanyDeposit(row);
}

function resolveFolderSuggestionLabel(folderType: BankTransactionFolderType, labels: BankTransactionTableRowLabels) {
  if (folderType === "client") return labels.clientFolders;
  if (folderType === "worker") return labels.workerFolders;
  if (folderType === "card") return labels.cardFolders;
  return labels.classification;
}

type BankTransactionTableRowProps = {
  row: BankTransaction;
  display: BankTransactionRowDisplay;
  isSelected: boolean;
  folder?: BankTransactionFolder;
  ledgerFolder?: BankTransactionFolder;
  folderSuggestion?: { folderType: BankTransactionFolderType; linkedSubject?: string };
  depositSuggestion?: BankTransactionDepositSuggestion;
  folderSelectGroups: BankFolderSelectGroup[];
  hasPartialPayment: boolean;
  labels: BankTransactionTableRowLabels;
  onOpenDetail: (row: BankTransaction) => void;
  onOpenClientLink: (row: BankTransaction) => void;
  onAssignFolder: (txId: string, folderId: string) => void;
  onOpenLedgerRegister: (row: BankTransaction) => void;
  onOpenLinkModal: (row: BankTransaction) => void;
  onConfirmSentStatementMatch: (row: BankTransaction, candidate: SentStatementMatchCandidate) => void;
  onConfirmDepositMatch: (row: BankTransaction, candidate: BankDepositMatchCandidate) => void;
};

function BankAutoLinkBadge({ title }: { title: string }) {
  return <AutoLinkBadge title={title} />;
}

function BankManualLinkBadge({ title }: { title: string }) {
  return <ManualLinkBadge title={title} />;
}

function BankPartialPaymentBadge({ title }: { title: string }) {
  return <PartialPaymentBadge title={title} />;
}

function BankTransactionTableRowComponent({
  row,
  display,
  isSelected,
  folder,
  ledgerFolder,
  folderSuggestion,
  depositSuggestion,
  folderSelectGroups,
  hasPartialPayment,
  labels,
  onOpenDetail,
  onOpenClientLink,
  onAssignFolder,
  onOpenLedgerRegister,
  onOpenLinkModal,
  onConfirmSentStatementMatch,
  onConfirmDepositMatch,
}: BankTransactionTableRowProps) {
  const stopRowClick = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  const isDeposit = row.deposit > 0;
  const isWithdrawal = row.withdrawal > 0;
  const rowClass = display.suppressed
    ? "is-preauth-suppressed opacity-60 bg-slate-50/80"
    : isDeposit
      ? "is-deposit-row"
      : isWithdrawal
        ? "is-withdrawal-row"
        : "";

  const renderLedgerCategoryCell = () => {
    if (display.ledgerCategory) {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
            display.ledgerFromFixed ? "bg-amber-100 text-amber-800" : "border border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <BookOpen size={11} />
          {display.ledgerCategory}
        </span>
      );
    }
    if (display.ledgerSuggestion) {
      return (
        <span className="inline-flex rounded-full border border-dashed border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800">
          {display.ledgerSuggestion}
        </span>
      );
    }
    return <span className="text-xs text-slate-400">-</span>;
  };

  const renderPreauthNetBadges = () => {
    if (!row.netGroupRole) return null;
    if (row.netGroupRole === "settlement") {
      return (
        <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
          {labels.preauthNetSettlementBadge}
        </span>
      );
    }
    if (row.netGroupRole === "preauth_refund") {
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
  };

  const renderFolderSuggestionBadge = () => {
    if (folder || !folderSuggestion) return null;
    const label = resolveFolderSuggestionLabel(folderSuggestion.folderType, labels);
    return (
      <span
        className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800"
        title={labels.folderSuggestionBadge(label, folderSuggestion.linkedSubject)}
      >
        {labels.folderSuggestionBadge(label, folderSuggestion.linkedSubject)}
      </span>
    );
  };

  return (
    <tr
      className={`border-t cursor-pointer hover:bg-slate-50/80 ${rowClass} ${isSelected ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : ""}`}
      onClick={() => onOpenDetail(row)}
    >
      <td className="whitespace-nowrap text-slate-600">{formatBankTransactionDateTime(row.transactionAt)}</td>
      <td className="text-right font-semibold text-emerald-700">{row.deposit > 0 ? formatKRW(row.deposit) : "-"}</td>
      <td className="text-right font-semibold text-red-600">{row.withdrawal > 0 ? formatKRW(row.withdrawal) : "-"}</td>
      <td className="text-right font-bold text-slate-900">{formatKRW(row.balanceAfter)}</td>
      <td>
        <span className="font-medium text-slate-900">{row.description || "-"}</span>
      </td>
      <td className="max-w-[14rem]">
        <span
          className={`block truncate text-xs ${row.memo ? "font-medium text-slate-800" : "text-slate-400"}`}
          title={row.memo || undefined}
        >
          {row.memo || ""}
        </span>
      </td>
      <td className="text-slate-700">
        {canLinkUnclassifiedClientDeposit(row) ? (
          <button
            type="button"
            className="text-left font-medium text-emerald-700 underline decoration-emerald-200 underline-offset-2 hover:text-emerald-900"
            title={labels.clientLinkClickHint}
            onClick={(event) => {
              stopRowClick(event);
              onOpenClientLink(row);
            }}
          >
            {row.counterpartyName || row.description || "-"}
          </button>
        ) : (
          row.counterpartyName || "-"
        )}
      </td>
      <td>{renderLedgerCategoryCell()}</td>
      <td>
        {folder ? (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getBankTransactionFolderTone(folder.folderType)}`}>
            {folder.folderName}
          </span>
        ) : display.ledgerCategory && ledgerFolder ? (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getBankTransactionFolderTone(ledgerFolder.folderType)}`}>
            {ledgerFolder.folderName}
          </span>
        ) : canLinkUnclassifiedClientDeposit(row) ? (
          <button
            type="button"
            className="inline-flex rounded-full border border-dashed border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100"
            title={labels.clientLinkClickHint}
            onClick={(event) => {
              stopRowClick(event);
              onOpenClientLink(row);
            }}
          >
            {labels.unfiled}
          </button>
        ) : (
          <span className="text-xs font-semibold text-slate-400">{labels.unfiled}</span>
        )}
        {!folder ? <div className="mt-1">{renderFolderSuggestionBadge()}</div> : null}
        {row.netGroupRole ? <div className="mt-1">{renderPreauthNetBadges()}</div> : null}
        {row.linkedSubject ? <div className="mt-1 text-xs text-slate-500">{row.linkedSubject}</div> : null}
      </td>
      <td className="text-slate-600">{row.counterpartyBank || "-"}</td>
      <td>
        {row.linkedPaymentVoucherId ? (
          <div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                {getBankMatchStatusLabel(row)}
              </span>
              {isBankMatchAutoLinked(row) ? <BankAutoLinkBadge title={labels.autoLinkBadgeTitle} /> : null}
              {isBankMatchManualLinked(row) ? <BankManualLinkBadge title={labels.manualLinkBadgeTitle} /> : null}
              {hasPartialPayment ? (
                <BankPartialPaymentBadge title={labels.partialPaymentBadgeTitle} />
              ) : null}
            </div>
            {row.linkedSubject ? (
              <div className="mt-1 text-xs text-slate-500">
                {row.linkedSubject}
                {row.linkedSalesId ? ` #${row.linkedSalesId}` : ""}
              </div>
            ) : null}
          </div>
        ) : row.deposit > 0 && !isCardCompanyDeposit(row) ? (
          (() => {
            const top = depositSuggestion?.candidates[0];
            if (depositSuggestion && top) {
              const isSentStatement = depositSuggestion.kind === "sentStatement";
              const sentTop = isSentStatement ? (top as SentStatementMatchCandidate) : null;
              const receivableTop = !isSentStatement ? (top as BankDepositMatchCandidate) : null;
              return (
                <div className="flex flex-wrap gap-1" onClick={stopRowClick}>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-lg text-xs"
                    title={labels.matchConfirmHint}
                    onClick={() =>
                      isSentStatement
                        ? onConfirmSentStatementMatch(row, sentTop!)
                        : onConfirmDepositMatch(row, receivableTop!)
                    }
                  >
                    <Link2 size={12} className="mr-1" />
                    {labels.matchConfirm} ({top.score})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-lg text-xs"
                    onClick={() => onOpenLinkModal(row)}
                  >
                    {labels.matchManual}
                  </Button>
                </div>
              );
            }
            return (
              <div onClick={stopRowClick}>
                <Button type="button" size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => onOpenLinkModal(row)}>
                  <Link2 size={12} className="mr-1" />
                  {labels.matchManual}
                </Button>
              </div>
            );
          })()
        ) : (
          "-"
        )}
      </td>
      <td>{row.transactionType ? <span className="erp-bank-type-badge">{row.transactionType}</span> : "-"}</td>
      <td onClick={stopRowClick}>
        <BankTransactionFolderAssignCell
          folderId={row.folderId || ""}
          folderName={folder?.folderName}
          groups={folderSelectGroups}
          unfiledLabel={labels.unfiled}
          onAssign={(nextFolderId) => onAssignFolder(row.id, nextFolderId)}
        />
      </td>
      <td onClick={stopRowClick}>
        {display.canLedger ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-lg border-amber-200 bg-amber-50 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            onClick={() => onOpenLedgerRegister(row)}
          >
            <BookOpen size={12} className="mr-1" />
            {labels.ledgerSendTo}
          </Button>
        ) : (
          "-"
        )}
      </td>
    </tr>
  );
}

export const BankTransactionTableRow = memo(BankTransactionTableRowComponent);
