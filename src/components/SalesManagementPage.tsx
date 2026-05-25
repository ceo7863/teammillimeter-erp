import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableExportSection } from "@/components/TableExportSection";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { useAudit } from "@/context/AuditContext";
import {
  SALES_SHEET_COLUMNS,
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
import type { SortDirection } from "@/utils/pivotSort";

const SHEET_SORTABLE_COLUMNS = new Set<SalesSheetSortColumn>(["date", "client", "site", "worker"]);

function formatKRW(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function renderCell(row: SalesStatementRow, key: string) {
  const value = row[key as keyof SalesStatementRow];
  const column = SALES_SHEET_COLUMNS.find((item) => item.key === key);
  if (!column) return "-";

  if (column.voucherOnly && !row.isFirstLine) return "";

  if (column.numeric) {
    const amount = Number(value) || 0;
    if (!amount && column.voucherOnly) return row.isFirstLine ? "-" : "";
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

  return String(value ?? "") || "-";
}

function updateTextFilter(
  setTextFilters: React.Dispatch<React.SetStateAction<SalesSheetTextFilters>>,
  key: keyof SalesSheetTextFilters,
  value: string
) {
  setTextFilters((prev) => ({ ...prev, [key]: value }));
}

function SheetSortHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  align = "left",
  sticky = false,
}: {
  label: string;
  column: SalesSheetSortColumn;
  activeColumn: SalesSheetSortColumn;
  direction: SortDirection;
  onSort: (column: SalesSheetSortColumn) => void;
  align?: "left" | "right";
  sticky?: boolean;
}) {
  const isActive = activeColumn === column;
  const SortIcon = !isActive ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th className={`${align === "left" ? "text-left" : "text-right"} ${sticky ? "is-sticky" : ""}`}>
      <button
        type="button"
        className={`erp-pivot-sort-btn erp-sales-sheet-sort-btn ${align === "left" ? "text-left" : "text-right"} ${isActive ? "is-active" : ""}`}
        onClick={() => onSort(column)}
        aria-label={`${label} 정렬`}
      >
        <span>{label}</span>
        <span className="erp-pivot-sort-icon" aria-hidden="true">
          <SortIcon size={12} />
        </span>
      </button>
    </th>
  );
}

export function SalesManagementPage({
  sales = [],
  paymentVouchers = [],
  workers = [],
  setSales,
  setActive,
  currentUser,
}) {
  const { recordAudit } = useAudit();
  const [textFilters, setTextFilters] = useState(emptySalesSheetTextFilters);
  const [dateFilter, setDateFilter] = useState({ startDate: "", endDate: "" });
  const [sort, setSort] = useState<{ column: SalesSheetSortColumn; direction: SortDirection }>({
    column: "date",
    direction: "desc",
  });

  const allRows = useMemo(
    () => flattenSalesToStatementRows(sales, workers, paymentVouchers),
    [sales, workers, paymentVouchers]
  );

  const filteredRows = useMemo(
    () => sortSalesStatementRows(filterSalesStatementRows(allRows, textFilters, dateFilter), sort.column, sort.direction),
    [allRows, textFilters, dateFilter, sort.column, sort.direction]
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
              <span className="erp-text-caption ml-auto font-semibold text-slate-500">{filteredRows.length}행</span>
            </div>
            <p className="erp-text-caption text-slate-500">
              기본 <strong className="font-semibold text-slate-600">최신 일자순</strong> · 일자·거래처·현장·시공자 헤더 클릭으로 오름/내림차순 정렬
            </p>
          </div>

          <TableExportSection fileName="매출내역서" title="매출 내역서" disabled={filteredRows.length === 0}>
            <div className="erp-sales-sheet-table-shell">
              <div className="erp-sales-sheet-wrap">
                <table className="erp-sales-sheet-table">
                  <thead>
                    <tr>
                      {SALES_SHEET_COLUMNS.map((column) => {
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
                            />
                          );
                        }
                        return (
                          <th key={column.key} className={`text-${column.align} ${column.sticky ? "is-sticky" : ""}`}>
                            {column.label}
                          </th>
                        );
                      })}
                      <th className="text-center is-action erp-table-export-skip">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.rowKey} className={row.isFirstLine ? "is-voucher-start" : "is-voucher-line"}>
                        {SALES_SHEET_COLUMNS.map((column) => (
                          <td
                            key={`${row.rowKey}-${column.key}`}
                            className={`text-${column.align} ${column.sticky ? "is-sticky" : ""} ${column.numeric ? "is-num" : ""}`}
                            title={typeof row[column.key as keyof SalesStatementRow] === "string" ? String(row[column.key as keyof SalesStatementRow]) : undefined}
                          >
                            {renderCell(row, column.key)}
                          </td>
                        ))}
                        <td className="text-center is-action erp-table-export-skip">
                          {row.isFirstLine && (
                            <button type="button" className="erp-sales-sheet-delete" onClick={() => deleteSale(row.saleId)} title="전표 삭제">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRows.length === 0 && (
                  <div className="erp-sales-sheet-empty">조건에 맞는 매출 내역이 없습니다.</div>
                )}
              </div>
              {filteredRows.length > 0 ? (
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
