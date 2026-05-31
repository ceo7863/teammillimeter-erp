import React, { useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { BankTransaction } from "@/utils/bankTransactions";

const BANK_TABLE_ROW_ESTIMATE_PX = 56;
const BANK_TABLE_OVERSCAN = 12;
const BANK_MOBILE_CARD_ESTIMATE_PX = 168;
const BANK_MOBILE_OVERSCAN = 6;

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
  });

  useLayoutEffect(() => {
    rowVirtualizer.measure();
  }, [rows.length, rowVirtualizer]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const useFallback = rows.length > 0 && virtualRows.length === 0;

  return { scrollRef, rowVirtualizer, virtualRows, useFallback };
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

export function BankTransactionVirtualTable({
  rows,
  tableId,
  tableRef,
  tableClassName,
  colSpan,
  header,
  empty,
  renderRow,
}: BankTransactionVirtualTableProps) {
  const { scrollRef, rowVirtualizer, virtualRows, useFallback } = useBankRowVirtualizer(
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
      className="erp-bank-table-scroll max-h-[min(72vh,960px)] overflow-auto overscroll-contain"
    >
      <table id={tableId} ref={tableRef} className={tableClassName}>
        <thead className="sticky top-0 z-10">{header}</thead>
        <tbody>
          {!rows.length ? (
            empty
          ) : useFallback ? (
            rows.map((row) => <React.Fragment key={row.id}>{renderRow(row)}</React.Fragment>)
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

type BankTransactionVirtualMobileListProps = {
  rows: BankTransaction[];
  empty: React.ReactNode;
  renderCard: (row: BankTransaction) => React.ReactNode;
};

export function BankTransactionVirtualMobileList({
  rows,
  empty,
  renderCard,
}: BankTransactionVirtualMobileListProps) {
  const { scrollRef, rowVirtualizer, virtualRows, useFallback } = useBankRowVirtualizer(
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
      className="erp-mobile-card-list erp-bank-mobile-scroll max-h-[min(72vh,960px)] space-y-3 overflow-auto overscroll-contain md:hidden"
    >
      {useFallback ? (
        rows.map((row) => <React.Fragment key={row.id}>{renderCard(row)}</React.Fragment>)
      ) : (
        <>
          {paddingTop > 0 ? <div aria-hidden="true" style={{ height: paddingTop }} /> : null}
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            return <React.Fragment key={row.id}>{renderCard(row)}</React.Fragment>;
          })}
          {paddingBottom > 0 ? <div aria-hidden="true" style={{ height: paddingBottom }} /> : null}
        </>
      )}
    </div>
  );
}
