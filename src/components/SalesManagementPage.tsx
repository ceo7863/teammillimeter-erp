import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableExportSection } from "@/components/TableExportSection";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { useAudit } from "@/context/AuditContext";
import {
  isSalesSheetVoucherMergeColumn,
  SALES_SHEET_UI_COLUMNS,
  downloadSalesStatementExcel,
  emptySalesSheetTextFilters,
  filterSalesStatementRows,
  flattenSalesToStatementRows,
  formatSheetNumber,
  sortSalesStatementRows,
  summarizeStatementRows,
  type SalesSheetSortColumn,
  type SalesSheetTextFilters,
  type SalesStatementRow,
} from "@/utils/salesStatement";
import { SALE_AUDIT_FIELDS, snapshotSaleForAudit } from "@/utils/auditLog";
import {
  DEFAULT_SALES_SHEET_COLUMN_WIDTHS,
  SALES_SHEET_ACTION_COLUMN_KEY,
  clampSalesSheetColumnWidth,
  loadSalesSheetColumnWidths,
  resolveSalesSheetColumnWidth,
  saveSalesSheetColumnWidths,
} from "@/utils/salesSheetColumnResize";
import type { SortDirection } from "@/utils/pivotSort";
import { SalePaymentLinkBadge } from "@/components/AutoLinkBadge";
import { SaleCommentBadge } from "@/components/SaleCommentBadge";

const SHEET_SORTABLE_COLUMNS = new Set<SalesSheetSortColumn>(["date", "client", "site", "worker"]);

type SalesSheetDisplayRow = SalesStatementRow & {
  voucherLineCount: number;
  isFirstVisibleLine: boolean;
};

function formatKRW(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function buildSalesSheetDisplayRows(rows: SalesStatementRow[]): SalesSheetDisplayRow[] {
  const countBySale = new Map<string, number>();
  rows.forEach((row) => {
    const key = String(row.saleId);
    countBySale.set(key, (countBySale.get(key) || 0) + 1);
  });

  const seen = new Set<string>();
  return rows.map((row) => {
    const saleKey = String(row.saleId);
    const isFirstVisibleLine = !seen.has(saleKey);
    if (isFirstVisibleLine) seen.add(saleKey);
    return {
      ...row,
      voucherLineCount: countBySale.get(saleKey) || 1,
      isFirstVisibleLine,
    };
  });
}

function renderCell(
  row: SalesSheetDisplayRow,
  key: string,
  saleCommentCounts?: Map<string, number>,
  saleCommentUnreadCounts?: Map<string, number>,
  onOpenSaleComments?: (saleId: string | number) => void,
) {
  const value = row[key as keyof SalesStatementRow];
  const column = SALES_SHEET_UI_COLUMNS.find((item) => item.key === key);
  if (!column) return "-";

  if (column.voucherOnly && !row.isFirstVisibleLine) return "";

  if (column.numeric) {
    const amount = Number(value) || 0;
    if (!amount && column.voucherOnly) return row.isFirstVisibleLine ? "-" : "";
    if (!amount) return "-";
    if (key === "unpaid" && amount > 0) {
      return <span className="text-red-600 font-bold">{formatKRW(amount)}</span>;
    }
    if (key === "paid" && amount > 0) {
      return <span className="text-emerald-700 font-semibold">{formatKRW(amount)}</span>;
    }
    if (key === "lineMargin") {
      return <span className={amount < 0 ? "text-red-600 font-semibold" : "text-emerald-700 font-semibold"}>{formatKRW(amount)}</span>;
    }
    if (column.percent) return formatSheetNumber(amount, { percent: true });
    return formatKRW(amount);
  }

  if (key === "officeMemo") {
    const text = String(value ?? "").trim();
    if (!text) return row.isFirstVisibleLine ? "-" : "";
    return <span className="erp-sales-sheet-office-memo">{text}</span>;
  }

  if (key === "client" && row.isFirstVisibleLine) {
    const text = String(value ?? "") || "-";
    return (
      <span className="erp-sales-sheet-badge-cell">
        <SalePaymentLinkBadge saleId={row.saleId} />
        <SaleCommentBadge
          saleId={row.saleId}
          saleCommentCounts={saleCommentCounts}
          saleCommentUnreadCounts={saleCommentUnreadCounts}
          onClick={onOpenSaleComments}
        />
        <span>{text}</span>
      </span>
    );
  }

  if (key === "date" && row.isFirstVisibleLine) {
    return String(value ?? "") || "-";
  }

  return String(value ?? "") || "-";
}

function updateTextFilter(
  setTextFilters: React.Dispatch<React.SetStateAction<SalesSheetTextFilters>>,
  key: keyof SalesSheetTextFilters,
  value: string
) {
  setTextFilters((prev) => ({ ...prev, [key]: value }));
}

function SheetColumnHeader({
  label,
  columnKey,
  width,
  stickyLeft,
  align = "left",
  sticky = false,
  sortable = false,
  activeColumn,
  direction,
  onSort,
  onResizeStart,
  onResetWidth,
}: {
  label: string;
  columnKey: string;
  width: number;
  stickyLeft?: number;
  align?: "left" | "right";
  sticky?: boolean;
  sortable?: boolean;
  activeColumn?: SalesSheetSortColumn;
  direction?: SortDirection;
  onSort?: (column: SalesSheetSortColumn) => void;
  onResizeStart: (columnKey: string, event: React.MouseEvent) => void;
  onResetWidth: (columnKey: string) => void;
}) {
  const isActive = sortable && activeColumn === columnKey;
  const SortIcon = !isActive ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th
      className={`text-${align} ${sticky ? "is-sticky" : ""}`}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        ...(sticky && stickyLeft != null ? { left: stickyLeft } : null),
      }}
    >
      <div className="erp-sales-sheet-th-inner">
        {sortable && onSort ? (
          <button
            type="button"
            className={`erp-pivot-sort-btn erp-sales-sheet-sort-btn ${align === "left" ? "text-left" : "text-right"} ${isActive ? "is-active" : ""}`}
            onClick={() => onSort(columnKey as SalesSheetSortColumn)}
            aria-label={`${label} 정렬`}
          >
            <span>{label}</span>
            <span className="erp-pivot-sort-icon" aria-hidden="true">
              <SortIcon size={12} />
            </span>
          </button>
        ) : (
          <span className="erp-sales-sheet-th-label">{label}</span>
        )}
        <span
          className="erp-sales-sheet-col-resize"
          onMouseDown={(event) => onResizeStart(columnKey, event)}
          onDoubleClick={() => onResetWidth(columnKey)}
          role="separator"
          aria-orientation="vertical"
          aria-label={`${label} 열 너비 조절`}
        />
      </div>
    </th>
  );
}

function SheetSortHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  align = "left",
  sticky = false,
  width,
  stickyLeft,
  onResizeStart,
  onResetWidth,
}: {
  label: string;
  column: SalesSheetSortColumn;
  activeColumn: SalesSheetSortColumn;
  direction: SortDirection;
  onSort: (column: SalesSheetSortColumn) => void;
  align?: "left" | "right";
  sticky?: boolean;
  width: number;
  stickyLeft?: number;
  onResizeStart: (columnKey: string, event: React.MouseEvent) => void;
  onResetWidth: (columnKey: string) => void;
}) {
  return (
    <SheetColumnHeader
      label={label}
      columnKey={column}
      width={width}
      stickyLeft={stickyLeft}
      align={align}
      sticky={sticky}
      sortable
      activeColumn={activeColumn}
      direction={direction}
      onSort={onSort}
      onResizeStart={onResizeStart}
      onResetWidth={onResetWidth}
    />
  );
}

export function SalesManagementPage({
  sales = [],
  paymentVouchers = [],
  workers = [],
  setSales,
  setActive,
  currentUser,
  onEditSale,
  saleCommentCounts,
  saleCommentUnreadCounts,
  onOpenSaleComments,
}) {
  const { recordAudit } = useAudit();
  const [textFilters, setTextFilters] = useState(emptySalesSheetTextFilters);
  const [dateFilter, setDateFilter] = useState({ startDate: "", endDate: "" });
  const [sort, setSort] = useState<{ column: SalesSheetSortColumn; direction: SortDirection }>({
    column: "date",
    direction: "desc",
  });
  const [columnWidths, setColumnWidths] = useState(loadSalesSheetColumnWidths);
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const columnWidthsRef = useRef(columnWidths);

  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  const getColumnWidth = useCallback(
    (key: string) => resolveSalesSheetColumnWidth(columnWidths, key),
    [columnWidths],
  );

  const stickyLeftByKey = useMemo(() => {
    const lefts: Record<string, number> = {};
    let cumulative = 0;
    SALES_SHEET_UI_COLUMNS.forEach((column) => {
      if (!column.sticky) return;
      lefts[column.key] = cumulative;
      cumulative += getColumnWidth(column.key);
    });
    return lefts;
  }, [getColumnWidth]);

  const tableWidth = useMemo(() => {
    const dataWidth = SALES_SHEET_UI_COLUMNS.reduce((sum, column) => sum + getColumnWidth(column.key), 0);
    return dataWidth + getColumnWidth(SALES_SHEET_ACTION_COLUMN_KEY);
  }, [getColumnWidth]);

  const handleResizeStart = useCallback((columnKey: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      key: columnKey,
      startX: event.clientX,
      startWidth: resolveSalesSheetColumnWidth(columnWidthsRef.current, columnKey),
    };
    document.body.classList.add("erp-col-resizing");
  }, []);

  const handleResetWidth = useCallback((columnKey: string) => {
    setColumnWidths((prev) => {
      const next = {
        ...prev,
        [columnKey]: DEFAULT_SALES_SHEET_COLUMN_WIDTHS[columnKey] ?? 80,
      };
      saveSalesSheetColumnWidths(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const state = resizeRef.current;
      if (!state) return;
      const nextWidth = clampSalesSheetColumnWidth(state.startWidth + (event.clientX - state.startX));
      setColumnWidths((prev) => ({ ...prev, [state.key]: nextWidth }));
    };

    const handleMouseUp = () => {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      document.body.classList.remove("erp-col-resizing");
      saveSalesSheetColumnWidths(columnWidthsRef.current);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.classList.remove("erp-col-resizing");
    };
  }, []);

  const allRows = useMemo(
    () => flattenSalesToStatementRows(sales, workers, paymentVouchers),
    [sales, workers, paymentVouchers]
  );

  const filteredRows = useMemo(
    () => sortSalesStatementRows(filterSalesStatementRows(allRows, textFilters, dateFilter), sort.column, sort.direction),
    [allRows, textFilters, dateFilter, sort.column, sort.direction]
  );

  const displayRows = useMemo(
    () => buildSalesSheetDisplayRows(filteredRows),
    [filteredRows]
  );

  const summary = useMemo(() => summarizeStatementRows(filteredRows), [filteredRows]);

  const toggleSort = (column: SalesSheetSortColumn) => {
    setSort((prev) => {
      if (prev.column !== column) return { column, direction: "asc" };
      return { column, direction: prev.direction === "asc" ? "desc" : "asc" };
    });
  };

  const deleteSale = (saleId: number | string) => {
    const sale = sales.find((row) => String(row.id) === String(saleId));
    if (!sale) return;
    if (!window.confirm(`전표 ${sale.voucherNo || sale.id} (${sale.client} · ${sale.site})를 삭제할까요?`)) return;

    recordAudit({
      entityType: "sale",
      entityId: saleId,
      entityLabel: `${sale.client} · ${sale.site}`,
      screen: "매출관리",
      action: "delete",
      before: snapshotSaleForAudit(sale),
      fields: SALE_AUDIT_FIELDS,
      user: currentUser,
    });
    setSales((prev) => prev.filter((row) => String(row.id) !== String(saleId)));
  };

  const exportExcel = () => {
    if (!filteredRows.length) {
      window.alert("다운로드할 데이터가 없습니다.");
      return;
    }
    downloadSalesStatementExcel(filteredRows);
  };

  const resetFilters = () => {
    setTextFilters(emptySalesSheetTextFilters);
    setDateFilter({ startDate: "", endDate: "" });
    setSort({ column: "date", direction: "desc" });
  };

  return (
    <div className="erp-page erp-sales-sheet-page">
      <div className="erp-sales-sheet-head">
        <div>
          <h1 className="erp-sales-sheet-title">
            <FileSpreadsheet size={22} />
            매출관리
          </h1>
          <p className="erp-sales-sheet-desc">엑셀 매출내역서 형식으로 전체 시공자 행을 조회·다운로드합니다.</p>
        </div>
        <div className="erp-sales-sheet-head-actions">
          <Button variant="outline" className="rounded-xl" onClick={() => setActive?.("salesInput")}>
            <Plus size={16} />
            매출등록
          </Button>
          <Button className="rounded-xl" onClick={exportExcel}>
            <Download size={16} />
            엑셀 다운로드
          </Button>
        </div>
      </div>

      <div className="erp-sales-sheet-stats">
        <div className="erp-sales-sheet-stat"><span>전표</span><b>{summary.voucherCount.toLocaleString()}</b></div>
        <div className="erp-sales-sheet-stat"><span>행</span><b>{summary.lineCount.toLocaleString()}</b></div>
        <div className="erp-sales-sheet-stat"><span>청구</span><b>{formatKRW(summary.billTotal)}</b></div>
        <div className="erp-sales-sheet-stat"><span>지급</span><b>{formatKRW(summary.spendTotal)}</b></div>
        <div className="erp-sales-sheet-stat"><span>마진</span><b className={summary.marginTotal < 0 ? "text-red-600" : "text-emerald-700"}>{formatKRW(summary.marginTotal)}</b></div>
        <div className="erp-sales-sheet-stat"><span>미수</span><b className="text-red-600">{formatKRW(summary.unpaidTotal)}</b></div>
      </div>

      <Card className="rounded-xl border-slate-200/80 shadow-sm">
        <CardContent className="p-3 md:p-4">
          <div className="erp-sales-sheet-search-panel">
            <div className="erp-sales-voucher-search-fields">
              <label className="erp-sales-voucher-search-field">
                <span className="erp-text-caption font-semibold text-slate-500">거래처</span>
                <input
                  lang="ko"
                  className="erp-input erp-input-compact w-full"
                  value={textFilters.client}
                  onChange={(e) => updateTextFilter(setTextFilters, "client", e.target.value)}
                  placeholder="거래처명"
                />
              </label>
              <label className="erp-sales-voucher-search-field">
                <span className="erp-text-caption font-semibold text-slate-500">현장</span>
                <input
                  lang="ko"
                  className="erp-input erp-input-compact w-full"
                  value={textFilters.site}
                  onChange={(e) => updateTextFilter(setTextFilters, "site", e.target.value)}
                  placeholder="현장명"
                />
              </label>
              <label className="erp-sales-voucher-search-field">
                <span className="erp-text-caption font-semibold text-slate-500">시공자</span>
                <input
                  lang="ko"
                  className="erp-input erp-input-compact w-full"
                  value={textFilters.worker}
                  onChange={(e) => updateTextFilter(setTextFilters, "worker", e.target.value)}
                  placeholder="시공자명"
                />
              </label>
            </div>
            <div className="erp-sales-sheet-toolbar">
              <KoreanDateInput
                className="erp-input-compact"
                value={dateFilter.startDate}
                onChange={(e) => setDateFilter((prev) => ({ ...prev, startDate: e.target.value }))}
                aria-label="검색 시작일"
              />
              <span className="erp-text-caption text-slate-400">~</span>
              <KoreanDateInput
                className="erp-input-compact"
                value={dateFilter.endDate}
                onChange={(e) => setDateFilter((prev) => ({ ...prev, endDate: e.target.value }))}
                aria-label="검색 종료일"
              />
              <Button variant="outline" size="sm" className="rounded-lg" onClick={resetFilters}>
                초기화
              </Button>
              <span className="erp-text-caption ml-auto font-semibold text-slate-500">{displayRows.length}행</span>
            </div>
            <p className="erp-text-caption text-slate-500">
              기본 <strong className="font-semibold text-slate-600">최신 일자순</strong> · 행 클릭으로 전표 수정 · 헤더 클릭 정렬 · 열 경계 드래그로 너비 조절(더블클릭 초기화)
            </p>
          </div>

          <TableExportSection fileName="매출내역서" title="매출 내역서" disabled={displayRows.length === 0}>
            <div className="erp-sales-sheet-table-shell">
              <div className="erp-sales-sheet-wrap">
                <table className="erp-sales-sheet-table" style={{ width: tableWidth, minWidth: "100%" }}>
                  <colgroup>
                    {SALES_SHEET_UI_COLUMNS.map((column) => {
                      const width = getColumnWidth(column.key);
                      return <col key={column.key} style={{ width, minWidth: width }} />;
                    })}
                    <col style={{ width: getColumnWidth(SALES_SHEET_ACTION_COLUMN_KEY), minWidth: getColumnWidth(SALES_SHEET_ACTION_COLUMN_KEY) }} />
                  </colgroup>
                  <thead>
                    <tr>
                      {SALES_SHEET_UI_COLUMNS.map((column) => {
                        const width = getColumnWidth(column.key);
                        const stickyLeft = column.sticky ? stickyLeftByKey[column.key] : undefined;
                        if (SHEET_SORTABLE_COLUMNS.has(column.key as SalesSheetSortColumn)) {
                          return (
                            <SheetSortHeader
                              key={column.key}
                              label={column.label}
                              column={column.key as SalesSheetSortColumn}
                              activeColumn={sort.column}
                              direction={sort.direction}
                              onSort={toggleSort}
                              align={column.align}
                              sticky={Boolean(column.sticky)}
                              width={width}
                              stickyLeft={stickyLeft}
                              onResizeStart={handleResizeStart}
                              onResetWidth={handleResetWidth}
                            />
                          );
                        }
                        return (
                          <SheetColumnHeader
                            key={column.key}
                            label={column.label}
                            columnKey={column.key}
                            width={width}
                            stickyLeft={stickyLeft}
                            align={column.align}
                            sticky={Boolean(column.sticky)}
                            onResizeStart={handleResizeStart}
                            onResetWidth={handleResetWidth}
                          />
                        );
                      })}
                      <th
                        className="text-center is-action erp-table-export-skip"
                        style={{
                          width: getColumnWidth(SALES_SHEET_ACTION_COLUMN_KEY),
                          minWidth: getColumnWidth(SALES_SHEET_ACTION_COLUMN_KEY),
                          maxWidth: getColumnWidth(SALES_SHEET_ACTION_COLUMN_KEY),
                        }}
                      >
                        <div className="erp-sales-sheet-th-inner erp-sales-sheet-th-inner--action">
                          <span className="erp-sales-sheet-th-label">관리</span>
                          <span
                            className="erp-sales-sheet-col-resize"
                            onMouseDown={(event) => handleResizeStart(SALES_SHEET_ACTION_COLUMN_KEY, event)}
                            onDoubleClick={() => handleResetWidth(SALES_SHEET_ACTION_COLUMN_KEY)}
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="관리 열 너비 조절"
                          />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row) => {
                      const editTarget = sales.find(
                        (sale) =>
                          String(sale.id) === String(row.saleId)
                          || String(sale.voucherNo ?? "") === String(row.saleId),
                      );
                      return (
                      <tr
                        key={row.rowKey}
                        className={`${row.isFirstVisibleLine ? "is-voucher-start" : "is-voucher-line"}${onEditSale && editTarget ? " cursor-pointer hover:bg-slate-50" : ""}`}
                        onClick={onEditSale && editTarget ? () => onEditSale(editTarget) : undefined}
                      >
                        {SALES_SHEET_UI_COLUMNS.map((column) => {
                          if (isSalesSheetVoucherMergeColumn(column.key) && !row.isFirstVisibleLine) {
                            return null;
                          }
                          const rowSpan = isSalesSheetVoucherMergeColumn(column.key) && row.voucherLineCount > 1
                            ? row.voucherLineCount
                            : undefined;
                          const hasOfficeMemo = column.key === "officeMemo" && Boolean(String(row.officeMemo || "").trim());
                          return (
                            <td
                              key={`${row.rowKey}-${column.key}`}
                              rowSpan={rowSpan}
                              className={`text-${column.align} ${column.sticky ? "is-sticky" : ""} ${column.numeric ? "is-num" : ""} ${rowSpan ? "is-voucher-merged" : ""} ${hasOfficeMemo ? "is-office-memo" : ""}`}
                              style={column.sticky ? { left: stickyLeftByKey[column.key] } : undefined}
                              title={typeof row[column.key as keyof SalesStatementRow] === "string" ? String(row[column.key as keyof SalesStatementRow]) : undefined}
                            >
                              {renderCell(row, column.key, saleCommentCounts, saleCommentUnreadCounts, onOpenSaleComments)}
                            </td>
                          );
                        })}
                        {row.isFirstVisibleLine ? (
                          <td
                            rowSpan={row.voucherLineCount > 1 ? row.voucherLineCount : undefined}
                            className={`text-center is-action erp-table-export-skip ${row.voucherLineCount > 1 ? "is-voucher-merged" : ""}`}
                          >
                            <button type="button" className="erp-sales-sheet-delete" onClick={(event) => { event.stopPropagation(); deleteSale(row.saleId); }} title="전표 삭제">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                {displayRows.length === 0 && (
                  <div className="erp-sales-sheet-empty">조건에 맞는 매출 내역이 없습니다.</div>
                )}
              </div>
              {displayRows.length > 0 ? (
                <div className="erp-sales-sheet-summary-footer">
                  합계 · {summary.voucherCount}전표 / {summary.lineCount}행 · 청구 {formatKRW(summary.billTotal)} · 지급 {formatKRW(summary.spendTotal)} · 마진 {formatKRW(summary.marginTotal)} · 입금 {formatKRW(summary.paidTotal)} · 미수 {formatKRW(summary.unpaidTotal)}
                </div>
              ) : null}
            </div>
          </TableExportSection>
        </CardContent>
      </Card>
    </div>
  );
}
