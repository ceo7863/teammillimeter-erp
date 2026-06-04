import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { BankTransactionMobileList } from "@/components/BankTransactionMobileList";
import {
  BankTransactionSimpleTable,
  type BankTransactionSimpleTableLabels,
} from "@/components/BankTransactionSimpleTable";
import type { BankTransactionCompactRowLabels } from "@/components/BankTransactionCompactRow";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import {
  buildBankTransactionListLookupMaps,
  buildBankTransactionListRowModels,
} from "@/utils/bankTransactionListDisplay";

export type BankTransactionListSectionLabels = BankTransactionSimpleTableLabels &
  BankTransactionCompactRowLabels & {
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
  paymentVouchers?: Array<{ bankTransactionId?: string | number; isPartialPayment?: boolean }>;
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
  paymentVouchers = [],
  labels,
  onOpenDetail,
}: BankTransactionListSectionProps) {
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
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
        { unfiled: labels.unfiled, memoPlaceholder: labels.memoPlaceholder },
        paymentVouchers,
      ),
    [rows, folderMap, ledgerCategoryFolder, lookupMaps, labels.unfiled, labels.memoPlaceholder, paymentVouchers],
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
      <p className="mb-2 text-xs font-semibold text-slate-500">{labels.detailRowHint}</p>
      <BankTransactionMobileList
        rowIds={rowIds}
        rowModels={rowModels}
        labels={tableLabels}
        badgeLabels={badgeLabels}
        selectedTxId={selectedTxId}
        onSelect={handleSelect}
      />
      <BankTransactionSimpleTable
        rowIds={rowIds}
        rowModels={rowModels}
        labels={tableLabels}
        badgeLabels={badgeLabels}
        selectedTxId={selectedTxId}
        onSelect={handleSelect}
      />
    </>
  );
}

export const BankTransactionListSection = memo(BankTransactionListSectionComponent);
