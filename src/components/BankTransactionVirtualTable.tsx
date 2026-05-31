import React, { memo, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { BankTransaction } from "@/utils/bankTransactions";

const BANK_TABLE_ROW_ESTIMATE_PX = 52;
const BANK_TABLE_OVERSCAN = 3;
const BANK_MOBILE_CARD_ESTIMATE_PX = 140;
const BANK_MOBILE_OVERSCAN = 2;
const BANK_SCROLL_HEIGHT_CLASS = "h-[min(72vh,960px)]";

function useBankRowVirtualizer(
  rows: BankTransaction[],
  estimateSize: () => number,
  overscan: number,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan,
    getItemKey: (index) => rows[index]?.id ?? index,
  });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    rowVirtualizer.measure();
    const observer = new ResizeObserver(() => rowVirtualizer.measure());
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const virtualRows = rowVirtualizer.getVirtualItems();

  return { scrollRef, rowVirtualizer, virtualRows };
}

type BankTransactionVirtualTableProps = {
  rows: BankTransaction[];
  tableId: string;
  tableRef?: React.RefObject<HTMLTableElement | null>;
  tableClassName: string;
  colSpan: number;
  header: React.ReactNode;
  empty: React.ReactNode;
  renderRow: (row: BankTransaction) => React.ReactNode;
};

function BankTransactionVirtualTableComponent({
  rows,
  tableId,
  tableRef,
  tableClassName,
  colSpan,
  header,
  empty,
  renderRow,
}: BankTransactionVirtualTableProps) {
  const { scrollRef, rowVirtualizer, virtualRows } = useBankRowVirtualizer(
    rows,
    () => BANK_TABLE_ROW_ESTIMATE_PX,
    BANK_TABLE_OVERSCAN,
  );

  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  return (
    <div
      ref={scrollRef}
      className={`erp-bank-table-scroll ${BANK_SCROLL_HEIGHT_CLASS} overflow-auto overscroll-contain`}
    >
      <table id={tableId} ref={tableRef} className={tableClassName}>
        <thead className="sticky top-0 z-10">{header}</thead>
        <tbody>
          {!rows.length ? (
            empty
          ) : (
            <>
              {paddingTop > 0 ? (
                <tr aria-hidden="true">
                  <td colSpan={colSpan} style={{ height: paddingTop, padding: 0, border: 0 }} />
                </tr>
              ) : null}
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                return <React.Fragment key={row.id}>{renderRow(row)}</React.Fragment>;
              })}
              {paddingBottom > 0 ? (
                <tr aria-hidden="true">
                  <td colSpan={colSpan} style={{ height: paddingBottom, padding: 0, border: 0 }} />
                </tr>
              ) : null}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

export const BankTransactionVirtualTable = memo(BankTransactionVirtualTableComponent);

type BankTransactionVirtualMobileListProps = {
  rows: BankTransaction[];
  empty: React.ReactNode;
  renderCard: (row: BankTransaction) => React.ReactNode;
};

function BankTransactionVirtualMobileListComponent({
  rows,
  empty,
  renderCard,
}: BankTransactionVirtualMobileListProps) {
  const { scrollRef, rowVirtualizer, virtualRows } = useBankRowVirtualizer(
    rows,
    () => BANK_MOBILE_CARD_ESTIMATE_PX,
    BANK_MOBILE_OVERSCAN,
  );

  if (!rows.length) {
    return <div className="erp-mobile-card-list space-y-3 md:hidden">{empty}</div>;
  }

  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  return (
    <div
      ref={scrollRef}
      className={`erp-mobile-card-list erp-bank-mobile-scroll ${BANK_SCROLL_HEIGHT_CLASS} space-y-3 overflow-auto overscroll-contain md:hidden`}
    >
      {paddingTop > 0 ? <div aria-hidden="true" style={{ height: paddingTop }} /> : null}
      {virtualRows.map((virtualRow) => {
        const row = rows[virtualRow.index];
        return <React.Fragment key={row.id}>{renderCard(row)}</React.Fragment>;
      })}
      {paddingBottom > 0 ? <div aria-hidden="true" style={{ height: paddingBottom }} /> : null}
    </div>
  );
}

export const BankTransactionVirtualMobileList = memo(BankTransactionVirtualMobileListComponent);
