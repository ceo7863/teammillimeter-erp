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
  folderMap: Map<string, BankTransactionFolder>;
  ledgerCategoryFolder?: BankTransactionFolder;
  companyExpenses: CompanyExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  fixedExpenses: FixedExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
  taxInvoices: TaxInvoice[];
  paymentVouchers?: Array<{ bankTransactionId?: string | number; isPartialPayment?: boolean }>;
  labels: BankTransactionListSectionLabels;
  onEditMemo: (row: BankTransaction) => void;
  onEditAccountSubject: (row: BankTransaction) => void;
  onEditClient: (row: BankTransaction) => void;
  onFindEvidence: (row: BankTransaction) => void;
  toolbar?: React.ReactNode;
};

function BankTransactionListSectionComponent({
  rows,
  folderMap,
  ledgerCategoryFolder,
  companyExpenses,
  fixedExpensePayments,
  fixedExpenses,
  ledgerCategories,
  accountCodes,
  taxInvoices,
  paymentVouchers = [],
  labels,
  onEditMemo,
  onEditAccountSubject,
  onEditClient,
  onFindEvidence,
  toolbar,
}: BankTransactionListSectionProps) {
  const rowByIdRef = useRef(new Map<string, BankTransaction>());
  rowByIdRef.current = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  const lookupMaps = useMemo(
    () => buildBankTransactionListLookupMaps(companyExpenses, fixedExpensePayments, fixedExpenses),
    [companyExpenses, fixedExpensePayments, fixedExpenses],
  );

  const rowModels = useMemo(
    () =>
      buildBankTransactionListRowModels(
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
      ),
    [
      rows,
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
    ],
  );

  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);

  const handleEditMemo = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(id);
      if (row) onEditMemo(row);
    },
    [onEditMemo],
  );

  const handleEditAccountSubject = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(id);
      if (row) onEditAccountSubject(row);
    },
    [onEditAccountSubject],
  );

  const handleEditClient = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(id);
      if (row) onEditClient(row);
    },
    [onEditClient],
  );

  const handleFindEvidence = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(id);
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
      {toolbar ? <div className="mb-3 flex flex-wrap gap-2">{toolbar}</div> : null}
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
      />
    </>
  );
}

export const BankTransactionListSection = memo(BankTransactionListSectionComponent);
