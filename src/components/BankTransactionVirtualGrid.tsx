import React, { memo, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  BankTransactionCompactRow,
  type BankTransactionCompactRowModel,
} from "@/components/BankTransactionCompactRow";

const ROW_HEIGHT_PX = 40;
const OVERSCAN = 2;
const SCROLL_HEIGHT_CLASS = "h-[min(72vh,960px)]";

export type BankTransactionVirtualGridLabels = {
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
  empty: string;
};

type BankTransactionVirtualGridProps = {
  rowIds: string[];
  rowModels: Map<string, BankTransactionCompactRowModel>;
  labels: BankTransactionVirtualGridLabels;
  selectedTxId: string | null;
  onSelect: (id: string) => void;
};

function BankTransactionVirtualGridComponent({
  rowIds,
  rowModels,
  labels,
  selectedTxId,
  onSelect,
}: BankTransactionVirtualGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const rowVirtualizer = useVirtualizer({
    count: rowIds.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: OVERSCAN,
    getItemKey: (index) => rowIds[index] ?? index,
  });

  useLayoutEffect(() => {
    rowVirtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowIds.length]);

  const virtualRows = rowVirtualizer.getVirtualItems();

  if (!rowIds.length) {
    return (
      <div className={`erp-bank-virtual-grid ${SCROLL_HEIGHT_CLASS} flex items-center justify-center text-slate-500`}>
        {labels.empty}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      id="bank-transactions-table"
      className={`erp-bank-virtual-grid ${SCROLL_HEIGHT_CLASS} overflow-auto overscroll-contain rounded-2xl border border-slate-200 bg-white`}
    >
      <div className="erp-bank-virtual-grid-header sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold text-slate-600">
        <div>{labels.transactionAt}</div>
        <div className="text-right">{labels.deposit}</div>
        <div className="text-right">{labels.withdrawal}</div>
        <div className="text-right">{labels.balance}</div>
        <div>{labels.description}</div>
        <div>{labels.memo}</div>
        <div>{labels.counterpartyName}</div>
        <div>{labels.ledgerCategoryColumn}</div>
        <div>{labels.classification}</div>
        <div>{labels.counterpartyBank}</div>
        <div>{labels.matchStatus}</div>
        <div>{labels.transactionType}</div>
      </div>
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {virtualRows.map((virtualRow) => {
          const id = rowIds[virtualRow.index];
          const model = rowModels.get(id);
          if (!model) return null;
          return (
            <div
              key={id}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <BankTransactionCompactRow
                {...model}
                isSelected={selectedTxId === id}
                onSelect={(nextId) => onSelectRef.current(nextId)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const BankTransactionVirtualGrid = memo(BankTransactionVirtualGridComponent);
