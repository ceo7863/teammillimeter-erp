import React, { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Plus, Search, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableExportSection } from "@/components/TableExportSection";
import { useAudit } from "@/context/AuditContext";
import {
  SALES_SHEET_COLUMNS,
  downloadSalesStatementExcel,
  flattenSalesToStatementRows,
  formatSheetNumber,
  summarizeStatementRows,
  type SalesStatementRow,
} from "@/utils/salesStatement";
import { SALE_AUDIT_FIELDS, snapshotSaleForAudit } from "@/utils/auditLog";

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

export function SalesManagementPage({
  sales = [],
  paymentVouchers = [],
  workers = [],
  setSales,
  setActive,
  currentUser,
}) {
  const { recordAudit } = useAudit();
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState({ startDate: "", endDate: "" });
  const [clientFilter, setClientFilter] = useState("");

  const allRows = useMemo(
    () => flattenSalesToStatementRows(sales, workers, paymentVouchers),
    [sales, workers, paymentVouchers]
  );

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((row) => {
      if (dateFilter.startDate && row.date < dateFilter.startDate) return false;
      if (dateFilter.endDate && row.date > dateFilter.endDate) return false;
      if (clientFilter && row.client !== clientFilter) return false;
      if (!q) return true;
      return Object.values(row).join(" ").toLowerCase().includes(q);
    });
  }, [allRows, query, dateFilter, clientFilter]);

  const summary = useMemo(() => summarizeStatementRows(filteredRows), [filteredRows]);

  const clientOptions = useMemo(
    () => [...new Set(sales.map((row) => row.client).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")),
    [sales]
  );

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
          <div className="erp-sales-sheet-toolbar">
            <div className="erp-sales-sheet-search">
              <Search size={16} className="text-slate-400" />
              <input
                lang="ko"
                className="erp-input w-full bg-transparent outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="NO, 거래처, 현장, 시공자 검색"
              />
            </div>
            <input type="date" className="erp-input erp-input-compact" value={dateFilter.startDate} onChange={(e) => setDateFilter((prev) => ({ ...prev, startDate: e.target.value }))} />
            <input type="date" className="erp-input erp-input-compact" value={dateFilter.endDate} onChange={(e) => setDateFilter((prev) => ({ ...prev, endDate: e.target.value }))} />
            <select className="erp-input erp-input-compact" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="">전체 거래처</option>
              {clientOptions.map((client) => (
                <option key={client} value={client}>{client}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" className="rounded-lg" onClick={() => { setQuery(""); setDateFilter({ startDate: "", endDate: "" }); setClientFilter(""); }}>
              초기화
            </Button>
          </div>

          <TableExportSection fileName="매출내역서" title="매출 내역서" disabled={filteredRows.length === 0}>
          <div className="erp-sales-sheet-wrap">
            <table className="erp-sales-sheet-table">
              <thead>
                <tr>
                  {SALES_SHEET_COLUMNS.map((column) => (
                    <th key={column.key} className={`text-${column.align} ${column.sticky ? "is-sticky" : ""}`}>{column.label}</th>
                  ))}
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
              {filteredRows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={SALES_SHEET_COLUMNS.length} className="text-left">
                      합계 · {summary.voucherCount}전표 / {summary.lineCount}행 · 청구 {formatKRW(summary.billTotal)} · 지급 {formatKRW(summary.spendTotal)} · 마진 {formatKRW(summary.marginTotal)} · 입금 {formatKRW(summary.paidTotal)} · 미수 {formatKRW(summary.unpaidTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
            {filteredRows.length === 0 && (
              <div className="erp-sales-sheet-empty">조건에 맞는 매출 내역이 없습니다.</div>
            )}
          </div>
          </TableExportSection>
        </CardContent>
      </Card>
    </div>
  );
}
