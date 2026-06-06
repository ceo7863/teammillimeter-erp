import React, { memo } from "react";
import { ChevronDown, Link2, Pencil } from "lucide-react";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { BANK_TX_ACCOUNT_TRIGGER_ATTR } from "@/utils/floatingPosition";
import type { BankTransactionListRowModel } from "@/utils/bankTransactionListDisplay";

export type BankTransactionSplitTableLabels = {
  bankSection: string;
  classifySection: string;
  transactionAt: string;
  account: string;
  counterparty: string;
  description: string;
  amount: string;
  memo: string;
  evidence: string;
  accountSubject: string;
  client: string;
  classifiedAmount: string;
  erpProcess: string;
  empty: string;
  evidenceFind: string;
  evidencePlaceholder: string;
  accountSubjectPlaceholder: string;
  clientPlaceholder: string;
  memoPlaceholder: string;
  voucherProcessedBadge: string;
};

type BankTransactionSplitTableProps = {
  rowIds: string[];
  rowModels: Map<string, BankTransactionListRowModel>;
  labels: BankTransactionSplitTableLabels;
  onEditMemo: (id: string) => void;
  onEditAccountSubject: (id: string) => void;
  onEditClient: (id: string) => void;
  onFindEvidence: (id: string) => void;
};

function AccountSubjectCellButton({
  triggerId,
  value,
  placeholder,
  empty,
  onClick,
}: {
  triggerId: string;
  value: string | null;
  placeholder: string;
  empty?: boolean;
  onClick: () => void;
}) {
  const display = value?.trim() || placeholder;
  return (
    <button
      type="button"
      {...{ [BANK_TX_ACCOUNT_TRIGGER_ATTR]: triggerId }}
      className={`erp-bank-excel-cell__trigger${empty || !value?.trim() ? " is-empty" : ""}`}
      title={display}
      aria-haspopup="listbox"
      aria-expanded={false}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <span className="erp-bank-excel-cell__label truncate">{display}</span>
      <ChevronDown size={12} className="erp-bank-excel-cell__chevron" aria-hidden="true" />
    </button>
  );
}

function clientPartyCellClass(kind: BankTransactionListRowModel["partyKind"], empty: boolean) {
  if (empty) return "border-dashed border-slate-200 text-slate-400";
  if (kind === "client") return "border-sky-300 bg-sky-50 text-sky-900";
  if (kind === "worker") return "border-orange-300 bg-orange-50 text-orange-900";
  return "border-slate-200 bg-white text-slate-800";
}

function ClientCellButton({
  value,
  placeholder,
  partyKind,
  onClick,
}: {
  value: string | null;
  placeholder: string;
  partyKind: BankTransactionListRowModel["partyKind"];
  onClick: () => void;
}) {
  const empty = !value?.trim();
  const display = value?.trim() || placeholder;
  return (
    <button
      type="button"
      className={`max-w-full truncate rounded-lg border px-2 py-1 text-left text-xs font-semibold transition hover:opacity-90 ${clientPartyCellClass(partyKind, empty)}`}
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

const SplitRow = memo(function SplitRow({
  model,
  labels,
  onEditMemo,
  onEditAccountSubject,
  onEditClient,
  onFindEvidence,
}: {
  model: BankTransactionListRowModel;
  labels: BankTransactionSplitTableLabels;
  onEditMemo: (id: string) => void;
  onEditAccountSubject: (id: string) => void;
  onEditClient: (id: string) => void;
  onFindEvidence: (id: string) => void;
}) {
  const rowClass =
    model.rowTone === "suppressed"
      ? "is-preauth-suppressed opacity-60 bg-slate-50/80"
      : model.rowTone === "deposit"
        ? "is-deposit-row"
        : model.rowTone === "withdrawal"
          ? "is-withdrawal-row"
          : "";

  const amountClass =
    model.signedAmountLabel.startsWith("+")
      ? "font-bold text-emerald-700"
      : model.signedAmountLabel.startsWith("-")
        ? "font-bold text-slate-900"
        : "text-slate-500";

  return (
    <tr className={`erp-bank-wehago-row border-t ${rowClass}`}>
      <td className="erp-bank-wehago-cell erp-bank-wehago-cell--datetime">{model.dateLabel}</td>
      <td className="erp-bank-wehago-cell erp-bank-wehago-cell--account">{model.accountLabel}</td>
      <td className="max-w-[8rem] truncate text-xs" title={model.counterpartyLabel}>
        <span
          className={`inline-flex max-w-full truncate rounded-md px-1.5 py-0.5 font-medium ${
            model.counterpartyPartyKind === "worker"
              ? "bg-orange-100 text-orange-900"
              : model.counterpartyPartyKind === "client"
                ? "bg-sky-100 text-sky-900"
                : "text-slate-800"
          }`}
        >
          {model.counterpartyLabel}
        </span>
      </td>
      <td className="max-w-[10rem] truncate text-xs font-medium text-slate-900" title={model.description}>
        {model.description}
      </td>
      <td className={`whitespace-nowrap text-right text-sm erp-bank-wehago-amount ${amountClass}`}>{model.signedAmountLabel}</td>
      <td className="erp-bank-wehago-cell erp-bank-wehago-split-divider max-w-[8rem]">
        <button
          type="button"
          className="erp-bank-wehago-inline-btn"
          title={model.memoLabel}
          onClick={() => onEditMemo(model.id)}
        >
          <Pencil size={12} className="shrink-0" />
          <span className="truncate">{model.memoEmpty ? labels.memoPlaceholder : model.memoLabel}</span>
        </button>
      </td>
      <td className="erp-bank-wehago-split-bridge text-center text-slate-300">
        <Link2 size={14} className="mx-auto opacity-40" />
      </td>
      <td className="max-w-[11rem]">
        {model.evidenceLinked ? (
          <button
            type="button"
            className="max-w-full truncate rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-left text-xs font-semibold text-blue-800 hover:bg-blue-100"
            title={model.evidenceLabel || ""}
            onClick={() => onFindEvidence(model.id)}
          >
            {model.evidenceLabel}
          </button>
        ) : (
          <button
            type="button"
            className="rounded-lg border border-dashed border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            onClick={() => onFindEvidence(model.id)}
          >
            {labels.evidenceFind}
          </button>
        )}
      </td>
      <td className="erp-bank-excel-cell-wrap max-w-[8rem] p-0">
        <AccountSubjectCellButton
          key={`${model.id}:${model.accountSubjectLabel ?? ""}`}
          triggerId={model.id}
          value={model.accountSubjectLabel}
          placeholder={labels.accountSubjectPlaceholder}
          empty={!model.accountSubjectLabel}
          onClick={() => onEditAccountSubject(model.id)}
        />
      </td>
      <td className="max-w-[8rem]">
        <ClientCellButton
          value={model.clientLabel}
          placeholder={labels.clientPlaceholder}
          partyKind={model.partyKind}
          onClick={() => onEditClient(model.id)}
        />
      </td>
      <td className="whitespace-nowrap text-right text-xs font-semibold text-slate-800">
        {model.classifiedAmountLabel}
      </td>
      <td className="max-w-[7rem]">
        {model.showVoucherProcessedBadge ? (
          <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
            {labels.voucherProcessedBadge}
          </span>
        ) : model.matchLinked ? (
          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
            {model.matchStatusLabel}
          </span>
        ) : (
          <span className="text-xs text-slate-400">-</span>
        )}
      </td>
    </tr>
  );
});

function BankTransactionSplitTableComponent({
  rowIds,
  rowModels,
  labels,
  onEditMemo,
  onEditAccountSubject,
  onEditClient,
  onFindEvidence,
}: BankTransactionSplitTableProps) {
  return (
    <DesktopTableWrap className="erp-bank-wehago-table-wrap">
      <table id="bank-transactions-table" className="erp-table erp-bank-split-table erp-bank-wehago-split-table w-full min-w-[1280px]">
        <thead>
          <tr className="erp-bank-wehago-split-section-row">
            <th colSpan={6} className="erp-bank-wehago-split-section erp-bank-wehago-split-section--bank">
              {labels.bankSection}
            </th>
            <th className="erp-bank-wehago-split-bridge" aria-hidden="true" />
            <th colSpan={5} className="erp-bank-wehago-split-section erp-bank-wehago-split-section--classify">
              {labels.classifySection}
            </th>
          </tr>
          <tr className="erp-bank-wehago-split-columns-row">
            <th>{labels.transactionAt}</th>
            <th>{labels.account}</th>
            <th>{labels.counterparty}</th>
            <th>{labels.description}</th>
            <th className="text-right">{labels.amount}</th>
            <th className="erp-bank-wehago-split-divider">{labels.memo}</th>
            <th className="erp-bank-wehago-split-bridge" aria-hidden="true" />
            <th>{labels.evidence}</th>
            <th>{labels.accountSubject}</th>
            <th>{labels.client}</th>
            <th className="text-right">{labels.classifiedAmount}</th>
            <th>{labels.erpProcess}</th>
          </tr>
        </thead>
        <tbody>
          {!rowIds.length ? (
            <tr>
              <td colSpan={12} className="py-12 text-center text-slate-500">
                {labels.empty}
              </td>
            </tr>
          ) : (
            rowIds.map((id) => {
              const model = rowModels.get(id);
              if (!model) return null;
              return (
                <SplitRow
                  key={`${id}:${model.accountSubjectLabel ?? ""}`}
                  model={model}
                  labels={labels}
                  onEditMemo={onEditMemo}
                  onEditAccountSubject={onEditAccountSubject}
                  onEditClient={onEditClient}
                  onFindEvidence={onFindEvidence}
                />
              );
            })
          )}
        </tbody>
      </table>
    </DesktopTableWrap>
  );
}

export const BankTransactionSplitTable = memo(BankTransactionSplitTableComponent);
