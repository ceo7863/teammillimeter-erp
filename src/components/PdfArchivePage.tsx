import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Download, Eye, FileText, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableExportSection } from "@/components/TableExportSection";
import {
  deletePdfArchive,
  downloadPdfBlob,
  formatPdfArchiveSize,
  getPdfArchiveCategoryLabel,
  getPdfArchiveRecord,
  listPdfArchives,
  openPdfBlobInNewTab,
  type PdfArchiveCategory,
  type PdfArchiveMeta,
} from "@/utils/pdfArchive";
import { isApiModeEnabled } from "@/utils/erpApi";

const TAB_ITEMS: Array<{ key: "all" | PdfArchiveCategory; label: string }> = [
  { key: "all", label: "전체" },
  { key: "statement-client", label: "거래처 내역서" },
  { key: "statement-worker", label: "시공자 내역서" },
];

function formatArchiveDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPeriod(start: string, end: string) {
  if (!start && !end) return "전체";
  const compact = (value: string) => (value ? value.slice(2).replace(/-/g, ".") : "");
  const startLabel = compact(start);
  const endLabel = compact(end);
  if (startLabel && endLabel) return `${startLabel}~${endLabel}`;
  return startLabel || endLabel || "전체";
}

function formatPeriodTitle(start: string, end: string) {
  if (!start && !end) return "전체";
  if (start && end) return `${start} ~ ${end}`;
  return start || end || "전체";
}

function matchesCreatedDate(createdAt: string, startDate: string, endDate: string) {
  if (!startDate && !endDate) return true;
  const day = createdAt.slice(0, 10);
  if (startDate && day < startDate) return false;
  if (endDate && day > endDate) return false;
  return true;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="erp-payment-hub-filter">
      <span className="erp-text-caption font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function SearchBox({ query, setQuery, placeholder }: { query: string; setQuery: (value: string) => void; placeholder: string }) {
  return (
    <div className="flex max-w-xl items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
      <Search size={18} className="text-slate-400" />
      <input
        lang="ko"
        className="erp-input w-full bg-transparent outline-none"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export function PdfArchivePage() {
  const [records, setRecords] = useState<PdfArchiveMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | PdfArchiveCategory>("all");
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listPdfArchives();
      setRecords(next);
      setMessage("");
    } catch (error) {
      console.error(error);
      setMessage("PDF 보관함을 불러오지 못했습니다. 서버 연결 또는 로그인 상태를 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const filteredRecords = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return records.filter((record) => {
      if (categoryFilter !== "all" && record.category !== categoryFilter) return false;
      if (!matchesCreatedDate(record.createdAt, startDate, endDate)) return false;
      if (!keyword) return true;
      const haystack = [record.fileName, record.subjectName, getPdfArchiveCategoryLabel(record.category)].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [records, categoryFilter, query, startDate, endDate]);

  const stats = useMemo(() => {
    const clientCount = records.filter((record) => record.category === "statement-client").length;
    const workerCount = records.filter((record) => record.category === "statement-worker").length;
    const totalBytes = filteredRecords.reduce((sum, record) => sum + record.fileSize, 0);
    return {
      total: records.length,
      clientCount,
      workerCount,
      filtered: filteredRecords.length,
      totalBytes,
    };
  }, [records, filteredRecords]);

  const resetFilters = () => {
    setQuery("");
    setStartDate("");
    setEndDate("");
    setCategoryFilter("all");
  };

  const handleOpen = async (id: string) => {
    try {
      const record = await getPdfArchiveRecord(id);
      if (!record) {
        setMessage("PDF를 찾을 수 없습니다.");
        return;
      }
      const opened = openPdfBlobInNewTab(record.blob, record.fileName);
      if (!opened) {
        setMessage("팝업이 차단되어 미리보기를 열 수 없습니다. 브라우저에서 팝업을 허용하거나 다운로드 버튼을 사용해 주세요.");
      } else {
        setMessage("");
      }
    } catch (error) {
      console.error(error);
      setMessage("PDF 미리보기에 실패했습니다.");
    }
  };

  const handleDownload = async (record: PdfArchiveMeta) => {
    try {
      const saved = await getPdfArchiveRecord(record.id);
      if (!saved) {
        setMessage("PDF를 찾을 수 없습니다.");
        return;
      }
      downloadPdfBlob(saved.blob, saved.fileName);
      setMessage("");
    } catch (error) {
      console.error(error);
      setMessage("PDF 다운로드에 실패했습니다.");
    }
  };

  const handleDelete = async (record: PdfArchiveMeta) => {
    if (!window.confirm(`"${record.fileName}" PDF를 보관함에서 삭제할까요?`)) return;
    try {
      await deletePdfArchive(record.id);
      setRecords((prev) => prev.filter((row) => row.id !== record.id));
      setMessage("PDF를 삭제했습니다.");
    } catch (error) {
      console.error(error);
      setMessage("PDF 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="erp-page erp-payment-hub-page">
      <div className="erp-payment-hub-head">
        <div>
          <h1 className="erp-payment-hub-title flex items-center gap-2">
            <Archive size={20} className="text-slate-700" />
            PDF 보관함
          </h1>
          <p className="erp-payment-hub-desc">
            {isApiModeEnabled()
              ? "내역서 PDF 생성 시 서버에 자동 저장됩니다. 모든 사용자가 같은 보관함을 공유합니다."
              : "내역서 PDF 생성 시 자동 저장됩니다. 이 브라우저에 보관되며 다시 열거나 내려받을 수 있습니다."}
          </p>
        </div>
        <div className="erp-payment-hub-metrics">
          <div className="erp-payment-hub-metric">
            <span className="label">전체</span>
            <span className="value">{stats.total.toLocaleString()}건</span>
          </div>
          <div className="erp-payment-hub-metric">
            <span className="label">거래처</span>
            <span className="value">{stats.clientCount.toLocaleString()}건</span>
          </div>
          <div className="erp-payment-hub-metric">
            <span className="label">시공자</span>
            <span className="value">{stats.workerCount.toLocaleString()}건</span>
          </div>
          <div className="erp-payment-hub-metric is-highlight">
            <span className="label">조회</span>
            <span className="value">{stats.filtered.toLocaleString()}건</span>
          </div>
        </div>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
              {TAB_ITEMS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setCategoryFilter(tab.key)}
                  className={`erp-text-body rounded-xl px-4 py-2 font-bold ${categoryFilter === tab.key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="erp-payment-hub-filters">
              <Field label="생성 시작">
                <input
                  type="date"
                  className="erp-input w-full"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </Field>
              <Field label="생성 종료">
                <input
                  type="date"
                  className="erp-input w-full"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </Field>
              <div className="flex items-end gap-2">
                <Button variant="outline" className="rounded-2xl" onClick={resetFilters}>
                  <RotateCcw size={16} />
                  초기화
                </Button>
                <Button variant="outline" className="rounded-2xl" onClick={loadRecords}>
                  <RefreshCw size={16} />
                  새로고침
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <SearchBox query={query} setQuery={setQuery} placeholder="파일명, 거래처, 시공자 검색" />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3 md:p-4">
          <div className="erp-receivable-totals-bar erp-pdf-archive-totals-bar">
            <div className="erp-receivable-totals-group">
              <span className="erp-receivable-totals-label">조회</span>
              <div className="erp-receivable-totals-items">
                <div className="erp-receivable-totals-item">
                  <span>건수</span>
                  <b>{stats.filtered.toLocaleString()}</b>
                </div>
                <div className="erp-receivable-totals-item">
                  <span>용량</span>
                  <b>{formatPdfArchiveSize(stats.totalBytes)}</b>
                </div>
              </div>
            </div>
          </div>

          {message && <p className="mb-2 erp-text-caption font-semibold text-slate-600">{message}</p>}

          <TableExportSection fileName="PDF보관함" title="PDF 보관함" disabled={!loading && filteredRecords.length === 0}>
          <div className="erp-table-wrap erp-pdf-archive-table-wrap">
            <table className="erp-table erp-pdf-archive-table">
              <colgroup>
                <col className="col-created" />
                <col className="col-category" />
                <col className="col-subject" />
                <col className="col-period" />
                <col className="col-file" />
                <col className="col-size" />
                <col className="col-pages" />
                <col className="col-actions" />
              </colgroup>
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left">생성일</th>
                  <th className="text-left">구분</th>
                  <th className="text-left">대상</th>
                  <th className="text-left">기간</th>
                  <th className="text-left">파일명</th>
                  <th className="text-right">용량</th>
                  <th className="text-right">쪽</th>
                  <th className="text-center erp-table-export-skip">관리</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-500">
                      불러오는 중...
                    </td>
                  </tr>
                )}
                {!loading && filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-500">
                      저장된 PDF가 없습니다.
                    </td>
                  </tr>
                )}
                {!loading &&
                  filteredRecords.map((record) => (
                    <tr key={record.id} className="border-t hover:bg-slate-50">
                      <td className="whitespace-nowrap text-slate-600">{formatArchiveDate(record.createdAt)}</td>
                      <td className="text-slate-600">
                        {record.category === "statement-client" ? "거래처" : "시공자"}
                        {record.statementView === "detail" ? "·상세" : record.statementView === "summary" ? "·요약" : ""}
                      </td>
                      <td className="font-semibold erp-pdf-archive-clip" title={record.subjectName || "-"}>
                        {record.subjectName || "-"}
                      </td>
                      <td className="text-slate-600 erp-pdf-archive-clip" title={formatPeriodTitle(record.periodStart, record.periodEnd)}>
                        {formatPeriod(record.periodStart, record.periodEnd)}
                      </td>
                      <td className="erp-pdf-archive-clip" title={record.fileName}>
                        {record.fileName}
                      </td>
                      <td className="text-right whitespace-nowrap">{formatPdfArchiveSize(record.fileSize)}</td>
                      <td className="text-right">{record.pageCount}</td>
                      <td className="erp-table-export-skip">
                        <div className="flex justify-center gap-1">
                          <Button size="sm" variant="outline" className="erp-archive-action-btn rounded-lg" title="보기" onClick={() => handleOpen(record.id)}>
                            <Eye size={13} />
                          </Button>
                          <Button size="sm" variant="outline" className="erp-archive-action-btn rounded-lg" title="다운로드" onClick={() => handleDownload(record)}>
                            <Download size={13} />
                          </Button>
                          <Button size="sm" className="erp-archive-action-btn rounded-lg bg-red-600 hover:bg-red-700" title="삭제" onClick={() => handleDelete(record)}>
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          </TableExportSection>

          <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
            <FileText size={16} className="mt-0.5 shrink-0" />
            <p>
              {isApiModeEnabled()
                ? "PDF 파일은 서버(data/pdf-archives)에 저장됩니다. 배포 시 해당 폴더를 함께 백업해 주세요."
                : "PDF 파일은 이 PC 브라우저 IndexedDB에 저장됩니다. JSON 백업에는 포함되지 않으므로, 중요 PDF는 보관함에서 다시 다운로드해 보관해 주세요."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
