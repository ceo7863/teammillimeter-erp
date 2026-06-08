import React, { memo, useEffect, useMemo, useRef, useCallback } from "react";
import { BankTransactionMobileList } from "@/components/BankTransactionMobileList";
import {
  BankTransactionSplitTable,
  type BankTransactionSplitTableLabels,
} from "@/components/BankTransactionSplitTable";
import type { BankTransactionCompactRowLabels } from "@/components/BankTransactionCompactRow";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { AccountCode, LedgerCategory } from "@/utils/ledgerSystem";
import { resolveAccountCodeLabel } from "@/utils/ledgerSystem";
import type { TaxInvoice } from "@/utils/taxInvoices";
import {
  buildBankTransactionListLookupMaps,
  buildBankTransactionListRowFingerprint,
  buildBankTransactionListRowModel,
  type BankTransactionListRowBuildContext,
  type BankTransactionListRowModel,
} from "@/utils/bankTransactionListDisplay";

export type BankTransactionListSectionLabels = BankTransactionSplitTableLabels &
  BankTransactionCompactRowLabels & {
    unfiled: string;
    accountContentPlaceholder: string;
    categoryPlaceholder: string;
    fixedExpensePlaceholder: string;
  };

type BankTransactionListSectionProps = {
  rows: BankTransaction[];
  isListActive?: boolean;
  accountSubjectLabels?: Record<string, string>;
  folderMap: Map<string, BankTransactionFolder>;
  ledgerCategoryFolder?: BankTransactionFolder;
  companyExpenses: CompanyExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  fixedExpenses: FixedExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
  taxInvoices: TaxInvoice[];
  clients?: Array<{ name?: string }>;
  workers?: Array<{ name?: string }>;
  paymentVouchers?: Array<{ bankTransactionId?: string | number; isPartialPayment?: boolean }>;
  labels: BankTransactionListSectionLabels;
  onEditMemo: (row: BankTransaction) => void;
  onEditAccountSubject: (row: BankTransaction) => void;
  onEditClient: (row: BankTransaction) => void;
  onEditFixedExpense: (row: BankTransaction) => void;
  onFindEvidence: (row: BankTransaction) => void;
  onIssueTaxInvoice?: (row: BankTransaction) => void;
  onFilterCounterparty?: (label: string) => void;
  toolbar?: React.ReactNode;
  tableId?: string;
};

function BankTransactionListSectionComponent({
  rows,
  isListActive = true,
  accountSubjectLabels = {},
  folderMap,
  ledgerCategoryFolder,
  companyExpenses,
  fixedExpensePayments,
  fixedExpenses,
  ledgerCategories,
  accountCodes,
  taxInvoices,
  clients = [],
  workers = [],
  paymentVouchers = [],
  labels,
  onEditMemo,
  onEditAccountSubject,
  onEditClient,
  onEditFixedExpense,
  onFindEvidence,
  onIssueTaxInvoice,
  onFilterCounterparty,
  toolbar,
  tableId,
}: BankTransactionListSectionProps) {
  const rowByIdRef = useRef(new Map<string, BankTransaction>());
  rowByIdRef.current = useMemo(
    () => new Map(rows.map((row) => [String(row.id), row])),
    [rows],
  );

  const lookupMaps = useMemo(
    () =>
      isListActive && rows.length
        ? buildBankTransactionListLookupMaps(companyExpenses, fixedExpensePayments, fixedExpenses)
        : null,
    [isListActive, rows.length, companyExpenses, fixedExpensePayments, fixedExpenses],
  );

  const rowBuildContext = useMemo((): BankTransactionListRowBuildContext | null => {
    if (!isListActive || !rows.length || !lookupMaps) return null;
    return {
      folderMap,
      ledgerCategoryFolder,
      lookup: lookupMaps,
      labels: { unfiled: labels.unfiled, accountContentPlaceholder: labels.accountContentPlaceholder },
      paymentVouchers,
      ledgerCategories,
      companyExpenses,
      fixedExpensePayments,
      fixedExpenses,
      accountCodes,
      taxInvoiceById: new Map(taxInvoices.map((row) => [row.id, row])),
      clients,
      workers,
    };
  }, [
    isListActive,
    rows.length,
    lookupMaps,
    folderMap,
    ledgerCategoryFolder,
    labels.unfiled,
    labels.accountContentPlaceholder,
    paymentVouchers,
    ledgerCategories,
    companyExpenses,
    fixedExpensePayments,
    fixedExpenses,
    accountCodes,
    taxInvoices,
    clients,
    workers,
  ]);

  const rowModelCacheRef = useRef(
    new Map<string, { fingerprint: string; sourceRow: BankTransaction; model: BankTransactionListRowModel }>(),
  );

  const rowsDataSignature = useMemo(
    () =>
      rows
        .map((row) =>
          [
            row.id,
            row.linkedTaxInvoiceId ?? "",
            row.memo ?? "",
            row.ledgerMemo ?? "",
            row.ledgerClientName ?? "",
            row.linkedSubject ?? "",
            row.ledgerAccountCode ?? "",
            row.linkedCompanyExpenseId ?? "",
            row.linkedFixedExpensePaymentId ?? "",
          ].join(":"),
        )
        .join("|"),
    [rows],
  );

  useEffect(() => {
    rowModelCacheRef.current.clear();
  }, [rowsDataSignature]);

  const getRowModel = useCallback(
    (id: string): BankTransactionListRowModel | undefined => {
      const row = rowByIdRef.current.get(String(id));
      if (!row || !rowBuildContext) return undefined;

      const optimisticLabel = accountSubjectLabels[id];
      const fingerprint = buildBankTransactionListRowFingerprint(
        row,
        rowBuildContext,
        optimisticLabel ?? "",
      );
      const cached = rowModelCacheRef.current.get(id);
      if (cached?.fingerprint === fingerprint && cached.sourceRow === row) return cached.model;

      let model = buildBankTransactionListRowModel(row, rowBuildContext);
      if (optimisticLabel) {
        model = { ...model, accountSubjectLabel: optimisticLabel };
      } else {
        const code = String(row.ledgerAccountCode || "").trim();
        if (code) {
          const resolved = resolveAccountCodeLabel(accountCodes, code) || code;
          if (resolved !== model.accountSubjectLabel) {
            model = { ...model, accountSubjectLabel: resolved };
          }
        }
      }

      rowModelCacheRef.current.set(id, { fingerprint, sourceRow: row, model });
      return model;
    },
    [rowBuildContext, accountSubjectLabels, accountCodes],
  );

  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);

  const handleEditMemo = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(String(id));
      if (row) onEditMemo(row);
    },
    [onEditMemo],
  );

  const handleEditAccountSubject = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(String(id));
      if (row) onEditAccountSubject(row);
    },
    [onEditAccountSubject],
  );

  const handleEditClient = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(String(id));
      if (row) onEditClient(row);
    },
    [onEditClient],
  );

  const handleEditFixedExpense = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(String(id));
      if (row) onEditFixedExpense(row);
    },
    [onEditFixedExpense],
  );

  const handleFindEvidence = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(String(id));
      if (row) onFindEvidence(row);
    },
    [onFindEvidence],
  );

  const handleIssueTaxInvoice = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(String(id));
      if (row) onIssueTaxInvoice?.(row);
    },
    [onIssueTaxInvoice],
  );

  const handleFilterCounterparty = useCallback(
    (label: string) => {
      onFilterCounterparty?.(label);
    },
    [onFilterCounterparty],
  );

  const splitLabels = useMemo(
    (): BankTransactionSplitTableLabels => ({
      bankSection: labels.bankSection,
      classifySection: labels.classifySection,
      transactionAt: labels.transactionAt,
      account: labels.account,
      counterparty: labels.counterparty,
      description: labels.description,
      amount: labels.amount,
      memo: labels.memo,
      evidence: labels.evidence,
      accountSubject: labels.accountSubject,
      client: labels.client,
      classifiedAmount: labels.classifiedAmount,
      erpProcess: labels.erpProcess,
      taxInvoiceIssue: labels.taxInvoiceIssue,
      taxInvoiceIssueButton: labels.taxInvoiceIssueButton,
      empty: labels.empty,
      evidenceFind: labels.evidenceFind,
      evidencePlaceholder: labels.evidencePlaceholder,
      accountSubjectPlaceholder: labels.accountSubjectPlaceholder,
      clientPlaceholder: labels.clientPlaceholder,
      memoPlaceholder: labels.memoPlaceholder,
      voucherProcessedBadge: labels.voucherProcessedBadge,
      fixedExpense: labels.fixedExpense,
      fixedExpensePlaceholder: labels.fixedExpensePlaceholder,
    }),
    [labels],
  );

  const mobileLabels = useMemo(
    () => ({
      transactionAt: labels.transactionAt,
      deposit: labels.amount,
      withdrawal: labels.amount,
      balance: labels.classifiedAmount,
      description: labels.description,
      accountContent: labels.memo,
      category: labels.accountSubject,
      fixedExpense: labels.fixedExpense,
      classification: labels.evidence,
      matchStatus: labels.erpProcess,
      empty: labels.empty,
      accountContentPlaceholder: labels.memoPlaceholder,
      categoryPlaceholder: labels.accountSubjectPlaceholder,
      fixedExpensePlaceholder: labels.fixedExpensePlaceholder,
    }),
    [labels],
  );

  const badgeLabels = useMemo(
    (): BankTransactionCompactRowLabels => ({
      preauthNetSettlementBadge: labels.preauthNetSettlementBadge,
      preauthNetRefundBadge: labels.preauthNetRefundBadge,
      preauthNetSuppressedBadge: labels.preauthNetSuppressedBadge,
      autoLinkBadgeTitle: labels.autoLinkBadgeTitle,
      manualLinkBadgeTitle: labels.manualLinkBadgeTitle,
      partialPaymentBadgeTitle: labels.partialPaymentBadgeTitle,
    }),
    [labels],
  );

  return (
    <>
      {toolbar ? <div className="erp-bank-wehago-table-toolbar">{toolbar}</div> : null}
      <div className="mb-2 hidden flex-wrap items-center gap-3 text-xs font-semibold text-slate-500 md:flex">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-sky-200" />
          {"\uAC70\uB798\uCC98"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-orange-200" />
          {"\uC2DC\uACF5\uC790"}
        </span>
      </div>
      <BankTransactionMobileList
        rowIds={rowIds}
        getRowModel={getRowModel}
        labels={mobileLabels}
        badgeLabels={badgeLabels}
        onEditAccountContent={handleEditMemo}
        onEditAccountSubject={handleEditAccountSubject}
        onEditFixedExpense={handleEditFixedExpense}
      />
      <BankTransactionSplitTable
        rowIds={rowIds}
        getRowModel={getRowModel}
        labels={splitLabels}
        onEditMemo={handleEditMemo}
        onEditAccountSubject={handleEditAccountSubject}
        onEditClient={handleEditClient}
        onEditFixedExpense={handleEditFixedExpense}
        onFindEvidence={handleFindEvidence}
        onIssueTaxInvoice={onIssueTaxInvoice ? handleIssueTaxInvoice : undefined}
        onFilterCounterparty={onFilterCounterparty ? handleFilterCounterparty : undefined}
        tableId={tableId}
      />
    </>
  );
}

export const BankTransactionListSection = memo(BankTransactionListSectionComponent);
