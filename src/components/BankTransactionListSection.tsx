import React, { memo, useMemo, useRef, useCallback } from "react";
import { BankTransactionMobileList } from "@/components/BankTransactionMobileList";
import {
  BankTransactionSimpleTable,
  type BankTransactionSimpleTableLabels,
} from "@/components/BankTransactionSimpleTable";
import type { BankTransactionCompactRowLabels } from "@/components/BankTransactionCompactRow";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { LedgerCategory } from "@/utils/ledgerSystem";
import {
  buildBankTransactionListLookupMaps,
  buildBankTransactionListRowModels,
} from "@/utils/bankTransactionListDisplay";

export type BankTransactionListSectionLabels = BankTransactionSimpleTableLabels &
  BankTransactionCompactRowLabels & {
  unfiled: string;
};

type BankTransactionListSectionProps = {
  rows: BankTransaction[];
  folderMap: Map<string, BankTransactionFolder>;
  ledgerCategoryFolder?: BankTransactionFolder;
  companyExpenses: CompanyExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  fixedExpenses: FixedExpense[];
  ledgerCategories: LedgerCategory[];
  paymentVouchers?: Array<{ bankTransactionId?: string | number; isPartialPayment?: boolean }>;
  labels: BankTransactionListSectionLabels;
  onEditAccountContent: (row: BankTransaction) => void;
  onEditCategory: (row: BankTransaction) => void;
  onEditFixedExpense: (row: BankTransaction) => void;
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
  paymentVouchers = [],
  labels,
  onEditAccountContent,
  onEditCategory,
  onEditFixedExpense,
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
    ],
  );

  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);

  const handleEditAccountContent = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(id);
      if (row) onEditAccountContent(row);
    },
    [onEditAccountContent],
  );

  const handleEditCategory = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(id);
      if (row) onEditCategory(row);
    },
    [onEditCategory],
  );

  const handleEditFixedExpense = useCallback(
    (id: string) => {
      const row = rowByIdRef.current.get(id);
      if (row) onEditFixedExpense(row);
    },
    [onEditFixedExpense],
  );

  const tableLabels = useMemo(
    (): BankTransactionSimpleTableLabels => ({
      transactionAt: labels.transactionAt,
      deposit: labels.deposit,
      withdrawal: labels.withdrawal,
      balance: labels.balance,
      description: labels.description,
      accountContent: labels.accountContent,
      category: labels.category,
      fixedExpense: labels.fixedExpense,
      classification: labels.classification,
      matchStatus: labels.matchStatus,
      empty: labels.empty,
      accountContentPlaceholder: labels.accountContentPlaceholder,
      categoryPlaceholder: labels.categoryPlaceholder,
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
      {toolbar ? <div className="mb-3 flex flex-wrap gap-2">{toolbar}</div> : null}
      <BankTransactionMobileList
        rowIds={rowIds}
        rowModels={rowModels}
        labels={tableLabels}
        badgeLabels={badgeLabels}
        onEditAccountContent={handleEditAccountContent}
        onEditCategory={handleEditCategory}
        onEditFixedExpense={handleEditFixedExpense}
      />
      <BankTransactionSimpleTable
        rowIds={rowIds}
        rowModels={rowModels}
        labels={tableLabels}
        badgeLabels={badgeLabels}
        onEditAccountContent={handleEditAccountContent}
        onEditCategory={handleEditCategory}
        onEditFixedExpense={handleEditFixedExpense}
      />
    </>
  );
}

export const BankTransactionListSection = memo(BankTransactionListSectionComponent);
