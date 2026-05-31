import React, { memo, useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { BankTransactionVirtualGrid, type BankTransactionVirtualGridLabels } from "@/components/BankTransactionVirtualGrid";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import { buildBankTransactionListRowModels } from "@/utils/bankTransactionListDisplay";

export type BankTransactionListSectionLabels = BankTransactionVirtualGridLabels & {
  detailRowHint: string;
  unfiled: string;
  memoPlaceholder: string;
};

type BankTransactionListSectionProps = {
  rows: BankTransaction[];
  folderMap: Map<string, BankTransactionFolder>;
  ledgerCategoryFolder?: BankTransactionFolder;
  companyExpenses: CompanyExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  fixedExpenses: FixedExpense[];
  labels: BankTransactionListSectionLabels;
  onOpenDetail: (row: BankTransaction) => void;
};

function BankTransactionListSectionComponent({
  rows,
  folderMap,
  ledgerCategoryFolder,
  companyExpenses,
  fixedExpensePayments,
  fixedExpenses,
  labels,
  onOpenDetail,
}: BankTransactionListSectionProps) {
  const deferredRows = useDeferredValue(rows);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const rowByIdRef = useRef(new Map<string, BankTransaction>());

  rowByIdRef.current = useMemo(() => new Map(deferredRows.map((row) => [row.id, row])), [deferredRows]);

  const rowModels = useMemo(
    () =>
      buildBankTransactionListRowModels(
        deferredRows,
        folderMap,
        ledgerCategoryFolder,
        companyExpenses,
        fixedExpensePayments,
        fixedExpenses,
        { unfiled: labels.unfiled, memoPlaceholder: labels.memoPlaceholder },
      ),
    [
      deferredRows,
      folderMap,
      ledgerCategoryFolder,
      companyExpenses,
      fixedExpensePayments,
      fixedExpenses,
      labels.unfiled,
      labels.memoPlaceholder,
    ],
  );

  const rowIds = useMemo(() => deferredRows.map((row) => row.id), [deferredRows]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedTxId(id);
      const row = rowByIdRef.current.get(id);
      if (row) onOpenDetail(row);
    },
    [onOpenDetail],
  );

  const gridLabels = useMemo(
    (): BankTransactionVirtualGridLabels => ({
      transactionAt: labels.transactionAt,
      deposit: labels.deposit,
      withdrawal: labels.withdrawal,
      balance: labels.balance,
      description: labels.description,
      memo: labels.memo,
      counterpartyName: labels.counterpartyName,
      ledgerCategoryColumn: labels.ledgerCategoryColumn,
      classification: labels.classification,
      counterpartyBank: labels.counterpartyBank,
      matchStatus: labels.matchStatus,
      transactionType: labels.transactionType,
      empty: labels.empty,
    }),
    [labels],
  );

  return (
    <>
      <p className="mb-2 text-xs font-semibold text-slate-500">{labels.detailRowHint}</p>
      <BankTransactionVirtualGrid
        rowIds={rowIds}
        rowModels={rowModels}
        labels={gridLabels}
        selectedTxId={selectedTxId}
        onSelect={handleSelect}
      />
    </>
  );
}

export const BankTransactionListSection = memo(BankTransactionListSectionComponent);
