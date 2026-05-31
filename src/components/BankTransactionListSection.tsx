import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  BankTransactionSimpleTable,
  type BankTransactionSimpleTableLabels,
} from "@/components/BankTransactionSimpleTable";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import { buildBankTransactionListRowModels } from "@/utils/bankTransactionListDisplay";

export type BankTransactionListSectionLabels = BankTransactionSimpleTableLabels & {
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
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const rowByIdRef = useRef(new Map<string, BankTransaction>());

  rowByIdRef.current = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  const rowModels = useMemo(
    () =>
      buildBankTransactionListRowModels(
        rows,
        folderMap,
        ledgerCategoryFolder,
        companyExpenses,
        fixedExpensePayments,
        fixedExpenses,
        { unfiled: labels.unfiled, memoPlaceholder: labels.memoPlaceholder },
      ),
    [
      rows,
      folderMap,
      ledgerCategoryFolder,
      companyExpenses,
      fixedExpensePayments,
      fixedExpenses,
      labels.unfiled,
      labels.memoPlaceholder,
    ],
  );

  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedTxId(id);
      const row = rowByIdRef.current.get(id);
      if (row) onOpenDetail(row);
    },
    [onOpenDetail],
  );

  const tableLabels = useMemo(
    (): BankTransactionSimpleTableLabels => ({
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
      <BankTransactionSimpleTable
        rowIds={rowIds}
        rowModels={rowModels}
        labels={tableLabels}
        selectedTxId={selectedTxId}
        onSelect={handleSelect}
      />
    </>
  );
}

export const BankTransactionListSection = memo(BankTransactionListSectionComponent);
