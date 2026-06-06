import React, { memo, useMemo, useRef, useCallback } from "react";
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
  buildBankTransactionListRowModels,
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
  onFindEvidence: (row: BankTransaction) => void;
  openAccountSubjectId?: string | null;
  toolbar?: React.ReactNode;
};

function BankTransactionListSectionComponent({
  rows,
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
  onFindEvidence,
  openAccountSubjectId = null,
  toolbar,
}: BankTransactionListSectionProps) {
  const rowByIdRef = useRef(new Map<string, BankTransaction>());
  rowByIdRef.current = useMemo(
    () => new Map(rows.map((row) => [String(row.id), row])),
    [rows],
  );

  const lookupMaps = useMemo(
    () => buildBankTransactionListLookupMaps(companyExpenses, fixedExpensePayments, fixedExpenses),
    [companyExpenses, fixedExpensePayments, fixedExpenses],
  );

  const rowModels = useMemo(() => {
    const base = buildBankTransactionListRowModels(
      rows,
      folderMap,
      ledgerCategoryFolder,
      lookupMaps,
      { unfiled: labels.unfiled, accountContentPlaceholder: labels.accountContentPlaceholder },
      paymentVouchers,
      ledgerCategories,
      companyExpenses,
      fixedExpensePayments,
      fixedExpenses,
      accountCodes,
      taxInvoices,
      clients,
      workers,
    );
    const patched = new Map(base);
    for (const row of rows) {
      const model = patched.get(row.id);
      if (!model) continue;
      const txKey = String(row.id);
      const optimisticLabel = accountSubjectLabels[txKey];
      const code = String(row.ledgerAccountCode || "").trim();
      patched.set(row.id, {
        ...model,
        accountSubjectLabel: optimisticLabel
          ? optimisticLabel
          : code
            ? resolveAccountCodeLabel(accountCodes, code) || code
            : null,
      });
    }
    return patched;
  }, [
      rows,
      accountSubjectLabels,
      folderMap,
      ledgerCategoryFolder,
      lookupMaps,
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
    ],
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

  const handleFindEvidence = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(String(id));
      if (row) onFindEvidence(row);
    },
    [onFindEvidence],
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
      empty: labels.empty,
      evidenceFind: labels.evidenceFind,
      evidencePlaceholder: labels.evidencePlaceholder,
      accountSubjectPlaceholder: labels.accountSubjectPlaceholder,
      clientPlaceholder: labels.clientPlaceholder,
      memoPlaceholder: labels.memoPlaceholder,
      voucherProcessedBadge: labels.voucherProcessedBadge,
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
      fixedExpense: labels.client,
      classification: labels.evidence,
      matchStatus: labels.erpProcess,
      empty: labels.empty,
      accountContentPlaceholder: labels.memoPlaceholder,
      categoryPlaceholder: labels.accountSubjectPlaceholder,
      fixedExpensePlaceholder: labels.clientPlaceholder,
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
        rowModels={rowModels}
        labels={mobileLabels}
        badgeLabels={badgeLabels}
        onEditAccountContent={handleEditMemo}
        onEditCategory={handleEditAccountSubject}
        onEditFixedExpense={handleEditClient}
      />
      <BankTransactionSplitTable
        rowIds={rowIds}
        rowModels={rowModels}
        labels={splitLabels}
        onEditMemo={handleEditMemo}
        onEditAccountSubject={handleEditAccountSubject}
        onEditClient={handleEditClient}
        onFindEvidence={handleFindEvidence}
        openAccountSubjectId={openAccountSubjectId}
      />
    </>
  );
}

export const BankTransactionListSection = memo(BankTransactionListSectionComponent);
