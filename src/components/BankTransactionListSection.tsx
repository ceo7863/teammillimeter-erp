import React, { memo, useEffect, useMemo, useRef, useCallback } from "react";
import { BankTransactionMobileList } from "@/components/BankTransactionMobileList";
import type { BankTransactionDisplaySettingsLabels } from "@/components/BankTransactionDisplaySettings";
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
import { buildTaxInvoiceCancellationPairIndex } from "@/utils/taxInvoices";
import {
  buildBankTransactionListLookupMaps,
  buildBankTransactionListRowFingerprint,
  buildBankTransactionListRowModel,
  type BankTransactionListRowBuildContext,
  type BankTransactionListRowModel,
} from "@/utils/bankTransactionListDisplay";
import type { BankTransactionColumnVisibility } from "@/utils/bankTransactionColumnVisibility";

export type BankTransactionListSectionLabels = BankTransactionSplitTableLabels &
  BankTransactionCompactRowLabels & {
    unfiled: string;
    accountContentPlaceholder: string;
    categoryPlaceholder: string;
    fixedExpensePlaceholder: string;
  } & BankTransactionDisplaySettingsLabels;

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
  columnVisibility: BankTransactionColumnVisibility;
  onEditMemo: (row: BankTransaction) => void;
  onEditAccountSubject: (row: BankTransaction) => void;
  onEditClient: (row: BankTransaction) => void;
  onEditFixedExpense: (row: BankTransaction) => void;
  onFindEvidence: (row: BankTransaction) => void;
  onFindErpProcess: (row: BankTransaction) => void;
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
  columnVisibility,
  onEditMemo,
  onEditAccountSubject,
  onEditClient,
  onEditFixedExpense,
  onFindEvidence,
  onFindErpProcess,
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
      taxInvoiceCancellationPairIndex: buildTaxInvoiceCancellationPairIndex(taxInvoices),
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
            (Array.isArray(row.linkedTaxInvoiceIds) ? row.linkedTaxInvoiceIds.join(",") : ""),
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

  const handleFindErpProcess = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(String(id));
      if (row) onFindErpProcess(row);
    },
    [onFindErpProcess],
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
      balanceAfter: labels.balanceAfter,
      transactionType: labels.transactionType,
      folder: labels.folder,
      description: labels.description,
      amount: labels.amount,
      memo: labels.memo,
      evidence: labels.evidence,
      accountSubject: labels.accountSubject,
      client: labels.client,
      bankBalance: labels.bankBalance,
      erpProcess: labels.erpProcess,
      taxInvoiceIssue: labels.taxInvoiceIssue,
      taxInvoiceIssueButton: labels.taxInvoiceIssueButton,
      empty: labels.empty,
      evidenceFind: labels.evidenceFind,
      erpFind: labels.erpFind,
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
      balance: labels.bankBalance,
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
      <div className="erp-bank-legend">
        <span className="erp-bank-legend__item">
          <span className="erp-bank-legend__swatch erp-bank-legend__swatch--client" />
          {"\uAC70\uB798\uCC98"}
        </span>
        <span className="erp-bank-legend__item">
          <span className="erp-bank-legend__swatch erp-bank-legend__swatch--worker" />
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
        onFindErpProcess={handleFindErpProcess}
        onIssueTaxInvoice={onIssueTaxInvoice ? handleIssueTaxInvoice : undefined}
        onFilterCounterparty={onFilterCounterparty ? handleFilterCounterparty : undefined}
        columnVisibility={columnVisibility}
        tableId={tableId}
      />
    </>
  );
}

export const BankTransactionListSection = memo(BankTransactionListSectionComponent);
