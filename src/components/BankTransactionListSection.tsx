import React, { memo, useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import {
  BankTransactionCompactRow,
  type BankTransactionCompactRowModel,
} from "@/components/BankTransactionCompactRow";
import { BankTransactionVirtualMobileList, BankTransactionVirtualTable } from "@/components/BankTransactionVirtualTable";
import { getBankMatchStatusLabel } from "@/utils/bankReceivableMatch";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import { formatKRW } from "@/utils/companyLedger";
import { formatBankTransactionDateTime, type BankTransaction } from "@/utils/bankTransactions";
import type { BankTransactionRowDisplay } from "@/utils/bankTransactionRowDisplay";

export type BankTransactionListSectionLabels = {
  empty: string;
  unfiled: string;
  memoPlaceholder: string;
  transactionAt: string;
  deposit: string;
  withdrawal: string;
  balance: string;
  description: string;
  memo: string;
  counterpartyName: string;
  ledgerCategoryColumn: string;
  classification: string;
  counterpartyBank: string;
  matchStatus: string;
  transactionType: string;
  detailRowHint: string;
};

type BankTransactionListSectionProps = {
  rows: BankTransaction[];
  folderMap: Map<string, BankTransactionFolder>;
  ledgerCategoryFolder?: BankTransactionFolder;
  rowDisplayById: Map<string, BankTransactionRowDisplay>;
  tableRef?: React.RefObject<HTMLTableElement | null>;
  labels: BankTransactionListSectionLabels;
  onOpenDetail: (row: BankTransaction) => void;
  renderMobileCard?: (row: BankTransaction) => React.ReactNode;
};

function buildCompactRowModel(
  row: BankTransaction,
  display: BankTransactionRowDisplay,
  folderMap: Map<string, BankTransactionFolder>,
  ledgerCategoryFolder: BankTransactionFolder | undefined,
  labels: BankTransactionListSectionLabels,
): BankTransactionCompactRowModel {
  const folder = row.folderId ? folderMap.get(row.folderId) : undefined;
  const ledgerCategoryLabel = display.ledgerCategory || display.ledgerSuggestion || "-";
  const classificationLabel =
    folder?.folderName ||
    (display.ledgerCategory && ledgerCategoryFolder ? ledgerCategoryFolder.folderName : labels.unfiled);

  let matchStatusLabel = "-";
  if (row.linkedPaymentVoucherId) {
    matchStatusLabel = getBankMatchStatusLabel(row);
  } else if (row.deposit > 0) {
    matchStatusLabel = "???";
  }

  const rowTone: BankTransactionCompactRowModel["rowTone"] = display.suppressed
    ? "suppressed"
    : row.deposit > 0
      ? "deposit"
      : row.withdrawal > 0
        ? "withdrawal"
        : "";

  return {
    id: row.id,
    dateLabel: formatBankTransactionDateTime(row.transactionAt),
    depositLabel: row.deposit > 0 ? formatKRW(row.deposit) : "-",
    withdrawalLabel: row.withdrawal > 0 ? formatKRW(row.withdrawal) : "-",
    balanceLabel: formatKRW(row.balanceAfter),
    description: row.description || "-",
    memoLabel: row.memo || labels.memoPlaceholder,
    counterpartyLabel: row.counterpartyName || "-",
    ledgerCategoryLabel,
    classificationLabel,
    counterpartyBank: row.counterpartyBank || "-",
    matchStatusLabel,
    transactionType: row.transactionType || "-",
    rowTone,
  };
}

function BankTransactionListSectionComponent({
  rows,
  folderMap,
  ledgerCategoryFolder,
  rowDisplayById,
  tableRef,
  labels,
  onOpenDetail,
  renderMobileCard,
}: BankTransactionListSectionProps) {
  const deferredRows = useDeferredValue(rows);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const rowById = useMemo(() => new Map(deferredRows.map((row) => [row.id, row])), [deferredRows]);
  const rowByIdRef = useRef(rowById);
  rowByIdRef.current = rowById;

  const compactRowById = useMemo(() => {
    const map = new Map<string, BankTransactionCompactRowModel>();
    for (const row of deferredRows) {
      const display = rowDisplayById.get(row.id);
      if (!display) continue;
      map.set(row.id, buildCompactRowModel(row, display, folderMap, ledgerCategoryFolder, labels));
    }
    return map;
  }, [deferredRows, rowDisplayById, folderMap, ledgerCategoryFolder, labels]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedTxId(id);
      const row = rowByIdRef.current.get(id);
      if (row) onOpenDetail(row);
    },
    [onOpenDetail],
  );

  const renderCompactRow = useCallback(
    (row: BankTransaction) => {
      const model = compactRowById.get(row.id);
      if (!model) return null;
      return (
        <BankTransactionCompactRow
          {...model}
          isSelected={selectedTxId === row.id}
          onSelect={handleSelect}
        />
      );
    },
    [compactRowById, selectedTxId, handleSelect],
  );

  const tableHeader = useMemo(
    () => (
      <tr className="bg-slate-100 text-left text-slate-600">
        <th>{labels.transactionAt}</th>
        <th className="text-right">{labels.deposit}</th>
        <th className="text-right">{labels.withdrawal}</th>
        <th className="text-right">{labels.balance}</th>
        <th>{labels.description}</th>
        <th>{labels.memo}</th>
        <th>{labels.counterpartyName}</th>
        <th>{labels.ledgerCategoryColumn}</th>
        <th>{labels.classification}</th>
        <th>{labels.counterpartyBank}</th>
        <th>{labels.matchStatus}</th>
        <th>{labels.transactionType}</th>
      </tr>
    ),
    [labels],
  );

  const tableEmpty = useMemo(
    () => (
      <tr>
        <td colSpan={12} className="py-12 text-center text-slate-500">
          {labels.empty}
        </td>
      </tr>
    ),
    [labels.empty],
  );

  const mobileEmpty = useMemo(
    () => <div className="py-8 text-center text-slate-500">{labels.empty}</div>,
    [labels.empty],
  );

  return (
    <>
      <p className="mb-2 text-xs font-semibold text-slate-500">{labels.detailRowHint}</p>
      <DesktopTableWrap>
        <BankTransactionVirtualTable
          rows={deferredRows}
          tableId="bank-transactions-table"
          tableRef={tableRef}
          tableClassName="erp-table erp-bank-table w-full min-w-[960px]"
          colSpan={12}
          header={tableHeader}
          empty={tableEmpty}
          renderRow={renderCompactRow}
        />
      </DesktopTableWrap>
      {renderMobileCard ? (
        <BankTransactionVirtualMobileList
          rows={deferredRows}
          empty={mobileEmpty}
          renderCard={renderMobileCard}
        />
      ) : null}
    </>
  );
}

export const BankTransactionListSection = memo(BankTransactionListSectionComponent);
