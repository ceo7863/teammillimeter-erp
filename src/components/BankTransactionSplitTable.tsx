import React, { memo } from "react";
import { ChevronDown, Link2, Pencil } from "lucide-react";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { useBankWindowVirtualizer } from "@/hooks/useBankWindowVirtualizer";
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
  fixedExpense: string;
  classifiedAmount: string;
  erpProcess: string;
  taxInvoiceIssue: string;
  taxInvoiceIssueButton: string;
  empty: string;
  evidenceFind: string;
  evidencePlaceholder: string;
  accountSubjectPlaceholder: string;
  clientPlaceholder: string;
  fixedExpensePlaceholder: string;
  memoPlaceholder: string;
  voucherProcessedBadge: string;
};

const BANK_SPLIT_ROW_ESTIMATE_PX = 38;
const BANK_SPLIT_OVERSCAN = 4;
const BANK_SPLIT_VIRTUAL_MIN = 1;
const BANK_SPLIT_COL_SPAN = 14;

type BankTransactionSplitTableProps = {
  rowIds: string[];
  getRowModel: (id: string) => BankTransactionListRowModel | undefined;
  labels: BankTransactionSplitTableLabels;
  onEditMemo: (id: string) => void;
  onEditAccountSubject: (id: string) => void;
  onEditClient: (id: string) => void;
  onEditFixedExpense: (id: string) => void;
  onFindEvidence: (id: string) => void;
  onIssueTaxInvoice?: (id: string) => void;
  onFilterCounterparty?: (label: string) => void;
  tableId?: string;
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
      className={`erp-bank-wehago-cell-btn max-w-full truncate border text-left ${clientPartyCellClass(partyKind, empty)}`}
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

function FixedExpenseCellButton({
  value,
  placeholder,
  onClick,
}: {
  value: string | null;
  placeholder: string;
  onClick: () => void;
}) {
  const empty = !value?.trim();
  const display = value?.trim() || placeholder;
  return (
    <button
      type="button"
      className={`erp-bank-wehago-cell-btn max-w-full truncate border text-left ${
        empty ? "border-dashed border-slate-200 text-slate-400" : "border-violet-300 bg-violet-50 text-violet-900"
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

const SplitRow = memo(function SplitRow({
  model,
  labels,
  onEditMemo,
  onEditAccountSubject,
  onEditClient,
  onEditFixedExpense,
  onFindEvidence,
  onIssueTaxInvoice,
  onFilterCounterparty,
}: {
  model: BankTransactionListRowModel;
  labels: BankTransactionSplitTableLabels;
  onEditMemo: (id: string) => void;
  onEditAccountSubject: (id: string) => void;
  onEditClient: (id: string) => void;
  onEditFixedExpense: (id: string) => void;
  onFindEvidence: (id: string) => void;
  onIssueTaxInvoice?: (id: string) => void;
  onFilterCounterparty?: (label: string) => void;
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

  const counterpartyToneClass =
    model.counterpartyPartyKind === "worker"
      ? "bg-orange-100 text-orange-900"
      : model.counterpartyPartyKind === "client"
        ? "bg-sky-100 text-sky-900"
        : "text-slate-800";
  const counterpartyButtonClass =
    model.counterpartyPartyKind === "worker"
      ? "bg-orange-100 text-orange-900 hover:bg-orange-200"
      : model.counterpartyPartyKind === "client"
        ? "bg-sky-100 text-sky-900 hover:bg-sky-200"
        : "text-slate-800 hover:bg-slate-100";
  const canFilterCounterparty =
    Boolean(onFilterCounterparty) &&
    model.counterpartyLabel.trim() &&
    model.counterpartyLabel.trim() !== "-";

  return (
    <tr className={`erp-bank-wehago-row border-t ${rowClass}`}>
      <td className="erp-bank-wehago-cell erp-bank-wehago-cell--datetime">{model.dateLabel}</td>
      <td className="erp-bank-wehago-cell erp-bank-wehago-cell--account">{model.accountLabel}</td>
      <td className="erp-bank-wehago-cell max-w-[7rem] truncate" title={model.counterpartyLabel}>
        {canFilterCounterparty ? (
          <button
            type="button"
            className={`erp-bank-wehago-cell-btn inline-flex max-w-full truncate underline decoration-current/30 underline-offset-2 ${counterpartyButtonClass}`}
            title={"\uB354\uBE14\uD074\uB9AD: \uC804\uCCB4 \uB0B4\uC5ED \uBCF4\uAE30"}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onFilterCounterparty?.(model.counterpartyLabel);
            }}
          >
            {model.counterpartyLabel}
          </button>
        ) : (
          <span className={`erp-bank-wehago-cell-btn inline-flex max-w-full truncate border border-transparent ${counterpartyToneClass}`}>
            {model.counterpartyLabel}
          </span>
        )}
      </td>
      <td className="erp-bank-wehago-cell max-w-[8rem] truncate font-medium text-slate-900" title={model.description}>
        {model.description}
      </td>
      <td className={`erp-bank-wehago-cell whitespace-nowrap text-right erp-bank-wehago-amount ${amountClass}`}>{model.signedAmountLabel}</td>
      <td className="erp-bank-wehago-cell erp-bank-wehago-split-divider max-w-[7rem]">
        <button
          type="button"
          className="erp-bank-wehago-inline-btn"
          title={model.memoLabel}
          onClick={() => onEditMemo(model.id)}
        >
          <Pencil size={10} className="shrink-0" />
          <span className="truncate">{model.memoEmpty ? labels.memoPlaceholder : model.memoLabel}</span>
        </button>
      </td>
      <td className="erp-bank-wehago-split-bridge text-center text-slate-300">
        <Link2 size={11} className="mx-auto opacity-40" />
      </td>
      <td className="erp-bank-wehago-cell max-w-[9rem]">
        {model.evidenceLinked ? (
          <button
            type="button"
            className="erp-bank-wehago-cell-btn max-w-full truncate border border-blue-200 bg-blue-50 text-left text-blue-800 hover:bg-blue-100"
            title={model.evidenceLabel || ""}
            onClick={() => onFindEvidence(model.id)}
          >
            {model.evidenceLabel}
          </button>
        ) : (
          <button
            type="button"
            className="erp-bank-wehago-cell-btn border border-dashed border-slate-200 text-slate-500 hover:bg-slate-100"
            onClick={() => onFindEvidence(model.id)}
          >
            {labels.evidenceFind}
          </button>
        )}
      </td>
      <td className="erp-bank-excel-cell-wrap max-w-[7rem] p-0">
        <AccountSubjectCellButton
          key={`${model.id}:${model.accountSubjectLabel ?? ""}`}
          triggerId={model.id}
          value={model.accountSubjectLabel}
          placeholder={labels.accountSubjectPlaceholder}
          empty={!model.accountSubjectLabel}
          onClick={() => onEditAccountSubject(model.id)}
        />
      </td>
      <td className="erp-bank-wehago-cell max-w-[7rem]">
        <ClientCellButton
          value={model.clientLabel}
          placeholder={labels.clientPlaceholder}
          partyKind={model.partyKind}
          onClick={() => onEditClient(model.id)}
        />
      </td>
      <td className="erp-bank-wehago-cell max-w-[7rem]">
        <FixedExpenseCellButton
          value={model.fixedExpenseLabel}
          placeholder={labels.fixedExpensePlaceholder}
          onClick={() => onEditFixedExpense(model.id)}
        />
      </td>
      <td className="erp-bank-wehago-cell whitespace-nowrap text-right font-semibold text-slate-800">
        {model.classifiedAmountLabel}
      </td>
      <td className="erp-bank-wehago-cell max-w-[6rem]">
        {model.showVoucherProcessedBadge ? (
          <span className="erp-bank-wehago-badge bg-violet-100 text-violet-800">
            {labels.voucherProcessedBadge}
          </span>
        ) : model.matchLinked ? (
          <span className="erp-bank-wehago-badge bg-emerald-100 text-emerald-700">
            {model.matchStatusLabel}
          </span>
        ) : (
          <span className="text-slate-400">-</span>
        )}
      </td>
      <td className="erp-bank-wehago-cell max-w-[4.5rem] text-center">
        {model.rowTone === "deposit" && onIssueTaxInvoice ? (
          <button
            type="button"
            className="erp-bank-wehago-cell-btn border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            onClick={(event) => {
              event.stopPropagation();
              onIssueTaxInvoice(model.id);
            }}
          >
            {labels.taxInvoiceIssueButton}
          </button>
        ) : (
          <span className="text-slate-300">-</span>
        )}
      </td>
    </tr>
  );
});

function BankTransactionSplitTableComponent({
  rowIds,
  getRowModel,
  labels,
  onEditMemo,
  onEditAccountSubject,
  onEditClient,
  onEditFixedExpense,
  onFindEvidence,
  onIssueTaxInvoice,
  onFilterCounterparty,
  tableId = "bank-transactions-table",
}: BankTransactionSplitTableProps) {
  const useVirtualRows = rowIds.length >= BANK_SPLIT_VIRTUAL_MIN;

  const { anchorRef, virtualizer: rowVirtualizer } = useBankWindowVirtualizer({
    count: rowIds.length,
    enabled: useVirtualRows,
    estimateSize: () => BANK_SPLIT_ROW_ESTIMATE_PX,
    overscan: BANK_SPLIT_OVERSCAN,
    getItemKey: (index) => rowIds[index] ?? index,
  });

  const renderRow = (id: string) => {
    const model = getRowModel(id);
    if (!model) return null;
    return (
      <SplitRow
        key={`${id}:${model.accountSubjectLabel ?? ""}`}
        model={model}
        labels={labels}
        onEditMemo={onEditMemo}
        onEditAccountSubject={onEditAccountSubject}
        onEditClient={onEditClient}
        onEditFixedExpense={onEditFixedExpense}
        onFindEvidence={onFindEvidence}
        onIssueTaxInvoice={onIssueTaxInvoice}
        onFilterCounterparty={onFilterCounterparty}
      />
    );
  };

  const tableHead = (
    <thead>
      <tr className="erp-bank-wehago-split-section-row">
        <th colSpan={6} className="erp-bank-wehago-split-section erp-bank-wehago-split-section--bank">
          {labels.bankSection}
        </th>
        <th className="erp-bank-wehago-split-bridge" aria-hidden="true" />
        <th colSpan={7} className="erp-bank-wehago-split-section erp-bank-wehago-split-section--classify">
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
        <th>{labels.fixedExpense}</th>
        <th className="text-right">{labels.classifiedAmount}</th>
        <th>{labels.erpProcess}</th>
        <th>{labels.taxInvoiceIssue}</th>
      </tr>
    </thead>
  );

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0 ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  return (
    <DesktopTableWrap className="erp-bank-wehago-table-wrap">
      <div ref={anchorRef} className="erp-bank-table-scroll erp-bank-table-scroll--page">
        <table id={tableId} className="erp-table erp-bank-split-table erp-bank-wehago-split-table w-full min-w-[1180px]">
          {tableHead}
          <tbody>
            {!rowIds.length ? (
              <tr>
                <td colSpan={BANK_SPLIT_COL_SPAN} className="py-12 text-center text-slate-500">
                  {labels.empty}
                </td>
              </tr>
            ) : useVirtualRows ? (
              <>
                {paddingTop > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={BANK_SPLIT_COL_SPAN} style={{ height: paddingTop, padding: 0, border: 0 }} />
                  </tr>
                ) : null}
                {virtualRows.map((virtualRow) => renderRow(rowIds[virtualRow.index]!))}
                {paddingBottom > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={BANK_SPLIT_COL_SPAN} style={{ height: paddingBottom, padding: 0, border: 0 }} />
                  </tr>
                ) : null}
              </>
            ) : (
              rowIds.map((id) => renderRow(id))
            )}
          </tbody>
        </table>
      </div>
    </DesktopTableWrap>
  );
}

export const BankTransactionSplitTable = memo(BankTransactionSplitTableComponent);
