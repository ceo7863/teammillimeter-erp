import React, { memo, useMemo } from "react";
import { BankBrandIcon } from "@/components/BankBrandIcon";
import { ChevronDown, Inbox, MessageCircle, Pencil } from "lucide-react";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { BANK_TX_ACCOUNT_TRIGGER_ATTR } from "@/utils/floatingPosition";
import type { BankTransactionListRowModel } from "@/utils/bankTransactionListDisplay";
import { resolveBankTxEvidenceAccentTone } from "@/utils/bankTaxInvoiceLink";
import {
  isBankTransactionColumnVisible,
  type BankTransactionColumnVisibility,
} from "@/utils/bankTransactionColumnVisibility";

export type BankTransactionSplitTableLabels = {
  bankSection: string;
  classifySection: string;
  transactionAt: string;
  account: string;
  counterparty: string;
  balanceAfter: string;
  transactionType: string;
  description: string;
  deposit: string;
  withdrawal: string;
  memo: string;
  evidence: string;
  accountSubject: string;
  client: string;
  fixedExpense: string;
  bankBalance: string;
  erpProcess: string;
  taxInvoiceIssue: string;
  taxInvoiceIssueButton: string;
  empty: string;
  evidenceFind: string;
  erpFind: string;
  erpWorkerFind: string;
  evidencePlaceholder: string;
  accountSubjectPlaceholder: string;
  clientPlaceholder: string;
  fixedExpensePlaceholder: string;
  folder: string;
  memoPlaceholder: string;
  voucherProcessedBadge: string;
};

function countBankSectionColumns(visibility: BankTransactionColumnVisibility) {
  let count = BANK_SPLIT_FIXED_COLUMNS;
  if (isBankTransactionColumnVisible(visibility, "account")) count += 1;
  if (isBankTransactionColumnVisible(visibility, "counterparty")) count += 1;
  if (isBankTransactionColumnVisible(visibility, "transactionType")) count += 1;
  if (isBankTransactionColumnVisible(visibility, "folder")) count += 1;
  if (isBankTransactionColumnVisible(visibility, "memo")) count += 1;
  return count;
}

function countClassifySectionColumns(visibility: BankTransactionColumnVisibility) {
  let count = BANK_SPLIT_CLASSIFY_FIXED_COLUMNS;
  if (isBankTransactionColumnVisible(visibility, "client")) count += 1;
  return count;
}

function countTotalColumns(visibility: BankTransactionColumnVisibility) {
  return countBankSectionColumns(visibility) + 1 + countClassifySectionColumns(visibility);
}

const BANK_SPLIT_FIXED_COLUMNS = 5;
const BANK_SPLIT_CLASSIFY_FIXED_COLUMNS = 5;

function splitRowModelsEqual(
  prev: BankTransactionListRowModel,
  next: BankTransactionListRowModel,
): boolean {
  if (prev === next) return true;
  return (
    prev.id === next.id &&
    prev.dateLabel === next.dateLabel &&
    prev.dateTitle === next.dateTitle &&
    prev.bankName === next.bankName &&
    prev.accountLabel === next.accountLabel &&
    prev.balanceLabel === next.balanceLabel &&
    prev.transactionTypeLabel === next.transactionTypeLabel &&
    prev.folderName === next.folderName &&
    prev.classificationLabel === next.classificationLabel &&
    prev.counterpartyLabel === next.counterpartyLabel &&
    prev.counterpartyPartyKind === next.counterpartyPartyKind &&
    prev.description === next.description &&
    prev.depositLabel === next.depositLabel &&
    prev.withdrawalLabel === next.withdrawalLabel &&
    prev.memoLabel === next.memoLabel &&
    prev.memoEmpty === next.memoEmpty &&
    prev.evidenceLabel === next.evidenceLabel &&
    prev.evidenceLinked === next.evidenceLinked &&
    prev.accountSubjectLabel === next.accountSubjectLabel &&
    prev.clientLabel === next.clientLabel &&
    prev.partyKind === next.partyKind &&
    prev.fixedExpenseLabel === next.fixedExpenseLabel &&
    prev.classifiedAmountLabel === next.classifiedAmountLabel &&
    prev.showVoucherProcessedBadge === next.showVoucherProcessedBadge &&
    prev.matchLinked === next.matchLinked &&
    prev.matchStatusLabel === next.matchStatusLabel &&
    prev.workerErpLinked === next.workerErpLinked &&
    prev.workerErpStatusLabel === next.workerErpStatusLabel &&
    prev.rowTone === next.rowTone
  );
}

type SplitRowProps = {
  model: BankTransactionListRowModel;
  labels: BankTransactionSplitTableLabels;
  columnVisibility: BankTransactionColumnVisibility;
  onEditMemo: (id: string) => void;
  onEditAccountSubject: (id: string) => void;
  onEditClient: (id: string) => void;
  onEditFixedExpense: (id: string) => void;
  onFindEvidence: (id: string) => void;
  onFindErpProcess: (id: string) => void;
  onIssueTaxInvoice?: (id: string) => void;
  onFilterCounterparty?: (label: string) => void;
  onShareTeamChat?: (id: string) => void;
};

type BankTransactionSplitTableProps = {
  rowIds: string[];
  getRowModel: (id: string) => BankTransactionListRowModel | undefined;
  labels: BankTransactionSplitTableLabels;
  columnVisibility: BankTransactionColumnVisibility;
  onEditMemo: (id: string) => void;
  onEditAccountSubject: (id: string) => void;
  onEditClient: (id: string) => void;
  onEditFixedExpense: (id: string) => void;
  onFindEvidence: (id: string) => void;
  onFindErpProcess: (id: string) => void;
  onIssueTaxInvoice?: (id: string) => void;
  onFilterCounterparty?: (label: string) => void;
  onShareTeamChat?: (id: string) => void;
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

function rowToneAsAmounts(rowTone: BankTransactionListRowModel["rowTone"]) {
  return {
    deposit: rowTone === "deposit" ? 1 : 0,
    withdrawal: rowTone === "withdrawal" ? 1 : 0,
  };
}
function clientPartyCellClass(
  kind: BankTransactionListRowModel["partyKind"],
  empty: boolean,
  accentTone: ReturnType<typeof resolveBankTxEvidenceAccentTone>,
) {
  if (empty) return "border-dashed border-slate-200 text-slate-400";
  if (accentTone === "worker") return "border-orange-300 bg-orange-50 text-orange-900";
  if (accentTone === "purchase") return "border-violet-300 bg-violet-50 text-violet-900";
  if (accentTone === "sales" || kind === "client") return "border-sky-300 bg-sky-50 text-sky-900";
  return "border-slate-200 bg-white text-slate-800";
}

function counterpartyAccentClass(
  kind: BankTransactionListRowModel["counterpartyPartyKind"],
  accentTone: ReturnType<typeof resolveBankTxEvidenceAccentTone>,
) {
  if (accentTone === "worker" || kind === "worker") return "bg-orange-100 text-orange-900";
  if (accentTone === "purchase") return "bg-violet-100 text-violet-900";
  if (accentTone === "sales" || kind === "client") return "bg-sky-100 text-sky-900";
  return "text-slate-800";
}

function ClientCellButton({
  value,
  placeholder,
  partyKind,
  accentTone,
  onClick,
}: {
  value: string | null;
  placeholder: string;
  partyKind: BankTransactionListRowModel["partyKind"];
  accentTone: ReturnType<typeof resolveBankTxEvidenceAccentTone>;
  onClick: () => void;
}) {
  const empty = !value?.trim();
  const display = value?.trim() || placeholder;
  return (
    <button
      type="button"
      className={`erp-bank-wehago-cell-btn max-w-full truncate border text-left ${clientPartyCellClass(partyKind, empty, accentTone)}`}
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

function columnVisibilityEqual(
  prev: BankTransactionColumnVisibility,
  next: BankTransactionColumnVisibility,
) {
  return (
    prev.account === next.account &&
    prev.counterparty === next.counterparty &&
    prev.balanceAfter === next.balanceAfter &&
    prev.transactionType === next.transactionType &&
    prev.memo === next.memo &&
    prev.client === next.client &&
    prev.folder === next.folder
  );
}

function splitRowPropsAreEqual(prev: SplitRowProps, next: SplitRowProps): boolean {
  return (
    splitRowModelsEqual(prev.model, next.model) &&
    prev.labels === next.labels &&
    columnVisibilityEqual(prev.columnVisibility, next.columnVisibility) &&
    prev.onEditMemo === next.onEditMemo &&
    prev.onEditAccountSubject === next.onEditAccountSubject &&
    prev.onEditClient === next.onEditClient &&
    prev.onEditFixedExpense === next.onEditFixedExpense &&
    prev.onFindEvidence === next.onFindEvidence &&
    prev.onFindErpProcess === next.onFindErpProcess &&
    prev.onIssueTaxInvoice === next.onIssueTaxInvoice &&
    prev.onFilterCounterparty === next.onFilterCounterparty &&
    prev.onShareTeamChat === next.onShareTeamChat
  );
}

const SplitRow = memo(function SplitRow({
  model,
  labels,
  columnVisibility,
  onEditMemo,
  onEditAccountSubject,
  onEditClient,
  onEditFixedExpense,
  onFindEvidence,
  onFindErpProcess,
  onIssueTaxInvoice,
  onFilterCounterparty,
  onShareTeamChat,
}: SplitRowProps) {
  const showAccount = isBankTransactionColumnVisible(columnVisibility, "account");
  const showCounterparty = isBankTransactionColumnVisible(columnVisibility, "counterparty");
  const showTransactionType = isBankTransactionColumnVisible(columnVisibility, "transactionType");
  const showFolder = isBankTransactionColumnVisible(columnVisibility, "folder");
  const showMemo = isBankTransactionColumnVisible(columnVisibility, "memo");
  const showClient = isBankTransactionColumnVisible(columnVisibility, "client");

  const rowClass =
    model.rowTone === "suppressed"
      ? "is-preauth-suppressed opacity-60 bg-slate-50/80"
      : model.rowTone === "deposit"
        ? "is-deposit-row"
        : model.rowTone === "withdrawal"
          ? "is-withdrawal-row"
          : "";

  const rowAmounts = rowToneAsAmounts(model.rowTone);
  const counterpartyToneClass = counterpartyAccentClass(
    model.counterpartyPartyKind,
    resolveBankTxEvidenceAccentTone(rowAmounts, model.counterpartyPartyKind),
  );
  const counterpartyButtonClass =
    model.counterpartyPartyKind === "worker"
      ? "bg-orange-100 text-orange-900 hover:bg-orange-200"
      : model.rowTone === "withdrawal" && model.counterpartyPartyKind === "client"
        ? "bg-violet-100 text-violet-900 hover:bg-violet-200"
        : model.counterpartyPartyKind === "client"
          ? "bg-sky-100 text-sky-900 hover:bg-sky-200"
          : "text-slate-800 hover:bg-slate-100";
  const canFilterCounterparty =
    Boolean(onFilterCounterparty) &&
    model.counterpartyLabel.trim() &&
    model.counterpartyLabel.trim() !== "-";
  const folderLabel = model.folderName || model.classificationLabel || "-";
  const memoDividerClass = showMemo ? " erp-bank-wehago-split-divider" : "";
  const clientAccentTone = resolveBankTxEvidenceAccentTone(rowAmounts, model.partyKind);
  const evidenceFindTone =
    !model.evidenceLinked && model.clientLabel?.trim()
      ? resolveBankTxEvidenceAccentTone(rowAmounts, model.partyKind)
      : null;
  const erpFindTone =
    !model.matchLinked &&
    !model.workerErpLinked &&
    model.rowTone === "deposit" &&
    model.clientLabel?.trim()
      ? resolveBankTxEvidenceAccentTone(rowAmounts, model.partyKind)
      : null;
  const workerErpFindTone =
    !model.workerErpLinked && model.rowTone === "withdrawal" && model.partyKind === "worker"
      ? "worker"
      : null;

  return (
    <tr className={`erp-bank-wehago-row border-t ${rowClass}`} data-bank-tx-id={model.id}>
      <td className="erp-bank-wehago-cell erp-bank-wehago-cell--datetime" title={model.dateTitle}>
        {model.dateLabel}
      </td>
      {showAccount ? (
        <td className="erp-bank-wehago-cell erp-bank-wehago-cell--account">
          <span className="erp-bank-account-label">
            <BankBrandIcon bankName={model.bankName} />
            <span>{model.accountLabel}</span>
          </span>
        </td>
      ) : null}
      {showCounterparty ? (
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
      ) : null}
      <td className="erp-bank-wehago-cell erp-bank-wehago-cell--description truncate font-medium text-slate-900" title={model.description}>
        {model.description}
      </td>
      <td className="erp-bank-wehago-cell erp-bank-wehago-cell--deposit whitespace-nowrap text-right font-semibold text-emerald-700">
        {model.depositLabel}
      </td>
      <td className="erp-bank-wehago-cell erp-bank-wehago-cell--withdrawal whitespace-nowrap text-right font-semibold text-red-600">
        {model.withdrawalLabel}
      </td>
      <td className="erp-bank-wehago-cell whitespace-nowrap text-right text-slate-700">{model.balanceLabel}</td>
      {showTransactionType ? (
        <td className="erp-bank-wehago-cell max-w-[5rem] truncate text-slate-600" title={model.transactionTypeLabel}>
          {model.transactionTypeLabel}
        </td>
      ) : null}
      {showFolder ? (
        <td className="erp-bank-wehago-cell max-w-[7rem] truncate text-slate-700" title={folderLabel}>
          {folderLabel}
        </td>
      ) : null}
      {showMemo ? (
        <td className={`erp-bank-wehago-cell erp-bank-wehago-cell--memo${memoDividerClass}`}>
          <button
            type="button"
            className="erp-bank-wehago-inline-btn erp-bank-memo-trigger min-w-0 w-full"
            title={model.memoEmpty ? undefined : model.memoLabel}
            onClick={() => onEditMemo(model.id)}
          >
            <Pencil size={10} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{model.memoEmpty ? "" : model.memoLabel}</span>
          </button>
        </td>
      ) : null}
      <td className="erp-bank-wehago-split-bridge text-center">
        {onShareTeamChat ? (
          <button
            type="button"
            className="erp-icon-btn mx-auto inline-flex text-slate-400 hover:text-blue-600"
            title={"\uCC57\uC5D0 \uACF5\uC720"}
            aria-label={"\uCC57\uC5D0 \uACF5\uC720"}
            onClick={(event) => {
              event.stopPropagation();
              onShareTeamChat(model.id);
            }}
          >
            <MessageCircle size={12} />
          </button>
        ) : null}
      </td>
      <td className="erp-bank-wehago-cell erp-bank-wehago-cell--evidence">
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
            className={`erp-bank-wehago-cell-btn erp-bank-evidence-find${evidenceFindTone ? ` erp-bank-evidence-find--${evidenceFindTone}` : " erp-bank-evidence-find--plain"}`}
            title={labels.evidenceFind}
            onClick={() => onFindEvidence(model.id)}
          >
            찾기
          </button>
        )}
      </td>
      <td className="erp-bank-excel-cell-wrap erp-bank-wehago-cell--account-subject p-0">
        <AccountSubjectCellButton
          key={`${model.id}:${model.accountSubjectLabel ?? ""}`}
          triggerId={model.id}
          value={model.accountSubjectLabel}
          placeholder={labels.accountSubjectPlaceholder}
          empty={!model.accountSubjectLabel}
          onClick={() => onEditAccountSubject(model.id)}
        />
      </td>
      <td className="erp-bank-wehago-cell erp-bank-wehago-cell--fixed">
        <FixedExpenseCellButton
          value={model.fixedExpenseLabel}
          placeholder={labels.fixedExpensePlaceholder}
          onClick={() => onEditFixedExpense(model.id)}
        />
      </td>
      {showClient ? (
        <td className="erp-bank-wehago-cell max-w-[7rem]">
          <ClientCellButton
            value={model.clientLabel}
            placeholder={labels.clientPlaceholder}
            partyKind={model.partyKind}
            accentTone={clientAccentTone}
            onClick={() => onEditClient(model.id)}
          />
        </td>
      ) : null}
      <td className="erp-bank-wehago-cell erp-bank-wehago-cell--process">
        {model.showVoucherProcessedBadge ? (
          <button
            type="button"
            className="erp-bank-wehago-cell-btn erp-bank-wehago-badge bg-violet-100 text-violet-800 hover:bg-violet-200"
            title={labels.erpFind}
            onClick={(event) => {
              event.stopPropagation();
              onFindErpProcess(model.id);
            }}
          >
            {labels.voucherProcessedBadge}
          </button>
        ) : model.matchLinked ? (
          <button
            type="button"
            className={
              model.matchStatusLabel.includes("\uBC30\uBD84")
                ? "erp-bank-wehago-cell-btn max-w-full truncate border border-amber-200 bg-amber-100 text-left text-amber-800 hover:bg-amber-200"
                : "erp-bank-wehago-cell-btn max-w-full truncate border border-emerald-200 bg-emerald-100 text-left text-emerald-700 hover:bg-emerald-200"
            }
            title={model.matchStatusLabel}
            onClick={(event) => {
              event.stopPropagation();
              onFindErpProcess(model.id);
            }}
          >
            {model.matchStatusLabel}
          </button>
        ) : model.workerErpLinked ? (
          <button
            type="button"
            className="erp-bank-wehago-cell-btn max-w-full truncate border border-orange-200 bg-orange-100 text-left text-orange-800 hover:bg-orange-200"
            title={model.workerErpStatusLabel}
            onClick={(event) => {
              event.stopPropagation();
              onFindErpProcess(model.id);
            }}
          >
            {model.workerErpStatusLabel}
          </button>
        ) : model.rowTone === "deposit" ? (
          <button
            type="button"
            className={`erp-bank-wehago-cell-btn erp-bank-evidence-find${erpFindTone ? ` erp-bank-evidence-find--${erpFindTone}` : " erp-bank-evidence-find--plain"}`}
            title={labels.erpFind}
            onClick={(event) => {
              event.stopPropagation();
              onFindErpProcess(model.id);
            }}
          >
            찾기
          </button>
        ) : model.rowTone === "withdrawal" && model.partyKind === "worker" ? (
          <button
            type="button"
            className={`erp-bank-wehago-cell-btn erp-bank-evidence-find erp-bank-evidence-find--${workerErpFindTone || "plain"}`}
            title={labels.erpWorkerFind}
            onClick={(event) => {
              event.stopPropagation();
              onFindErpProcess(model.id);
            }}
          >
            찾기
          </button>
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
}, splitRowPropsAreEqual);

function BankTransactionSplitTableComponent({
  rowIds,
  getRowModel,
  labels,
  columnVisibility,
  onEditMemo,
  onEditAccountSubject,
  onEditClient,
  onEditFixedExpense,
  onFindEvidence,
  onFindErpProcess,
  onIssueTaxInvoice,
  onFilterCounterparty,
  onShareTeamChat,
  tableId = "bank-transactions-table",
}: BankTransactionSplitTableProps) {
  const showAccount = isBankTransactionColumnVisible(columnVisibility, "account");
  const showCounterparty = isBankTransactionColumnVisible(columnVisibility, "counterparty");
  const showTransactionType = isBankTransactionColumnVisible(columnVisibility, "transactionType");
  const showFolder = isBankTransactionColumnVisible(columnVisibility, "folder");
  const showMemo = isBankTransactionColumnVisible(columnVisibility, "memo");
  const showClient = isBankTransactionColumnVisible(columnVisibility, "client");

  const bankColSpan = countBankSectionColumns(columnVisibility);
  const classifyColSpan = countClassifySectionColumns(columnVisibility);
  const totalColSpan = countTotalColumns(columnVisibility);

  const colgroup = useMemo(
    () => (
      <colgroup>
        <col className="erp-bank-col-datetime" />
        {showAccount ? <col className="erp-bank-col-account" /> : null}
        {showCounterparty ? <col className="erp-bank-col-counterparty" /> : null}
        <col className="erp-bank-col-description" />
        <col className="erp-bank-col-deposit" />
        <col className="erp-bank-col-withdrawal" />
        <col className="erp-bank-col-balance" />
        {showTransactionType ? <col className="erp-bank-col-tx-type" /> : null}
        {showFolder ? <col className="erp-bank-col-folder" /> : null}
        {showMemo ? <col className="erp-bank-col-memo" /> : null}
        <col className="erp-bank-col-bridge" />
        <col className="erp-bank-col-evidence" />
        <col className="erp-bank-col-account-subject" />
        <col className="erp-bank-col-fixed" />
        {showClient ? <col className="erp-bank-col-client" /> : null}
        <col className="erp-bank-col-process" />
        <col className="erp-bank-col-tax" />
      </colgroup>
    ),
    [showAccount, showClient, showCounterparty, showFolder, showMemo, showTransactionType],
  );

  const renderRow = (id: string) => {
    const model = getRowModel(id);
    if (!model) return null;
    return (
      <SplitRow
        key={id}
        model={model}
        labels={labels}
        columnVisibility={columnVisibility}
        onEditMemo={onEditMemo}
        onEditAccountSubject={onEditAccountSubject}
        onEditClient={onEditClient}
        onEditFixedExpense={onEditFixedExpense}
        onFindEvidence={onFindEvidence}
        onFindErpProcess={onFindErpProcess}
        onIssueTaxInvoice={onIssueTaxInvoice}
        onFilterCounterparty={onFilterCounterparty}
        onShareTeamChat={onShareTeamChat}
      />
    );
  };

  const tableHead = (
    <thead>
      <tr className="erp-bank-wehago-split-section-row">
        <th colSpan={bankColSpan} className="erp-bank-wehago-split-section erp-bank-wehago-split-section--bank">
          {labels.bankSection}
        </th>
        <th className="erp-bank-wehago-split-bridge" aria-hidden="true" />
        <th colSpan={classifyColSpan} className="erp-bank-wehago-split-section erp-bank-wehago-split-section--classify">
          {labels.classifySection}
        </th>
      </tr>
      <tr className="erp-bank-wehago-split-columns-row">
        <th>{labels.transactionAt}</th>
        {showAccount ? <th>{labels.account}</th> : null}
        {showCounterparty ? <th>{labels.counterparty}</th> : null}
        <th>{labels.description}</th>
        <th className="text-right">{labels.deposit}</th>
        <th className="text-right">{labels.withdrawal}</th>
        <th className="text-right">{labels.bankBalance}</th>
        {showTransactionType ? <th>{labels.transactionType}</th> : null}
        {showFolder ? <th>{labels.folder}</th> : null}
        {showMemo ? <th className="erp-bank-wehago-split-divider">{labels.memo}</th> : null}
        <th className="erp-bank-wehago-split-bridge" aria-hidden="true" />
        <th className="erp-bank-wehago-col-evidence">{labels.evidence}</th>
        <th>{labels.accountSubject}</th>
        <th>{labels.fixedExpense}</th>
        {showClient ? <th>{labels.client}</th> : null}
        <th>{labels.erpProcess}</th>
        <th>{labels.taxInvoiceIssue}</th>
      </tr>
    </thead>
  );

  return (
    <DesktopTableWrap className="erp-bank-wehago-table-wrap">
      <div className="erp-bank-table-scroll erp-bank-table-scroll--page">
        <table id={tableId} className="erp-table erp-bank-split-table erp-bank-wehago-split-table w-full min-w-[1320px]">
          {colgroup}
          {tableHead}
          <tbody>
            {!rowIds.length ? (
              <tr>
                <td colSpan={totalColSpan} className="erp-bank-split-empty">
                  <div className="erp-bank-empty-body">
                    <div className="erp-bank-empty-icon">
                      <Inbox size={24} />
                    </div>
                    <p className="text-sm font-semibold text-slate-600">{labels.empty}</p>
                  </div>
                </td>
              </tr>
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
