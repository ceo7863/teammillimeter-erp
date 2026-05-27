import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ChevronDown, ChevronRight, Download, Eye, FileText, Link2, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import {
  clearAllPdfArchives,
  deletePdfArchive,
  downloadPdfArchives,
  downloadPdfBlob,
  formatPdfArchiveSize,
  getPdfArchiveCategoryLabel,
  getPdfArchiveRecord,
  listPdfArchives,
  openPdfBlobInNewTab,
  sharePdfBlob,
  type PdfArchiveMeta,
} from "@/utils/pdfArchive";
import { getSentStatementPaymentStatusLabel } from "@/utils/bankSentStatementMatch";
import { isBankMatchAutoLinked } from "@/utils/bankReceivableMatch";
import { AutoLinkBadge } from "@/components/AutoLinkBadge";
import type { BankTransaction } from "@/utils/bankTransactions";
import {
  filterPdfArchiveRecords,
  getPdfArchiveFolderStats,
  groupPdfArchivesBySubject,
  makePdfArchiveFolderId,
  pdfArchiveCategoryToFolderType,
  type PdfArchiveFolder,
  type PdfArchiveFolderSort,
} from "@/utils/pdfArchiveFolders";
import { isApiModeEnabled } from "@/utils/erpApi";

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
  if (!start && !end) return "\uC804\uCCB4";
  if (start && end) return `${start} ~ ${end}`;
  return start || end || "\uC804\uCCB4";
}

function formatStatementViewLabel(view?: string) {
  if (view === "detail") return "\uC0C1\uC138";
  if (view === "summary") return "\uC694\uC57D";
  return "";
}

function paymentStatusTone(status?: PdfArchiveMeta["paymentStatus"]) {
  if (status === "confirmed") return "bg-emerald-100 text-emerald-700";
  if (status === "partial") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function isArchiveAutoLinked(record: PdfArchiveMeta, bankTxById: Map<string, BankTransaction>) {
  if (!record.linkedBankTransactionId) return false;
  return isBankMatchAutoLinked(bankTxById.get(record.linkedBankTransactionId));
}

function buildPdfArchiveSummary(record: PdfArchiveMeta) {
  return [
    formatPeriod(record.periodStart, record.periodEnd),
    formatStatementViewLabel(record.statementView),
    formatArchiveDate(record.createdAt),
    formatPdfArchiveSize(record.fileSize),
    `${record.pageCount}쪽`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="erp-payment-hub-filter">
      <span className="erp-text-caption font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function PdfArchivePage({
  isActive = true,
  bankTransactions = [],
}: {
  isActive?: boolean;
  bankTransactions?: BankTransaction[];
}) {
  const [records, setRecords] = useState<PdfArchiveMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [folderSort, setFolderSort] = useState<PdfArchiveFolderSort>("updated");
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
  const [bulkWorking, setBulkWorking] = useState<"download" | "clear" | null>(null);
  const [confirmAction, setConfirmAction] = useState<"download" | "clear" | null>(null);

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

  useEffect(() => {
    if (isActive) loadRecords();
  }, [isActive, loadRecords]);

  useEffect(() => {
    const handleArchiveUpdated = (event: Event) => {
      const detail = (event as CustomEvent<PdfArchiveMeta>).detail;
      if (!detail?.id) {
        loadRecords();
        return;
      }

      setRecords((prev) => {
        const without = prev.filter((row) => row.id !== detail.id);
        return [detail, ...without].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      });

      const folderType = pdfArchiveCategoryToFolderType(detail.category);
      const folderId = makePdfArchiveFolderId(folderType, detail.subjectName);
      setExpandedFolderIds((prev) => (prev.includes(folderId) ? prev : [folderId, ...prev]));
    };

    window.addEventListener("pdf-archive-updated", handleArchiveUpdated);
    return () => window.removeEventListener("pdf-archive-updated", handleArchiveUpdated);
  }, [loadRecords]);

  const filteredRecords = useMemo(
    () => filterPdfArchiveRecords(records, { query, startDate, endDate }),
    [records, query, startDate, endDate]
  );

  const sentRecords = useMemo(
    () =>
      filteredRecords
        .filter((record) => record.sentViaLink)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    [filteredRecords]
  );

  const bankTxById = useMemo(
    () => new Map(bankTransactions.map((row) => [row.id, row])),
    [bankTransactions]
  );

  const regularFilteredRecords = useMemo(
    () => filteredRecords.filter((record) => !record.sentViaLink),
    [filteredRecords]
  );

  const clientFolders = useMemo(
    () => groupPdfArchivesBySubject(regularFilteredRecords.filter((record) => record.category === "statement-client"), folderSort),
    [regularFilteredRecords, folderSort]
  );
  const workerFolders = useMemo(
    () => groupPdfArchivesBySubject(regularFilteredRecords.filter((record) => record.category === "statement-worker"), folderSort),
    [regularFilteredRecords, folderSort]
  );
  const visibleFolders = useMemo(() => [...clientFolders, ...workerFolders], [clientFolders, workerFolders]);

  const stats = useMemo(() => {
    const clientCount = records.filter((record) => record.category === "statement-client").length;
    const workerCount = records.filter((record) => record.category === "statement-worker").length;
    const sentCount = records.filter((record) => record.sentViaLink).length;
    const filteredStats = getPdfArchiveFolderStats(visibleFolders);
    return {
      total: records.length,
      clientCount,
      workerCount,
      sentCount,
      filtered: filteredRecords.length,
      totalBytes: filteredStats.totalBytes,
      clientFolders: clientFolders.length,
      workerFolders: workerFolders.length,
    };
  }, [records, filteredRecords.length, visibleFolders, clientFolders.length, workerFolders.length]);

  const resetFilters = () => {
    setQuery("");
    setStartDate("");
    setEndDate("");
  };

  const toggleFolderExpanded = (folderId: string) => {
    setExpandedFolderIds((prev) => (prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]));
  };

  const expandVisibleFolders = () => {
    setExpandedFolderIds((prev) => Array.from(new Set([...prev, ...visibleFolders.map((folder) => folder.id)])));
  };

  const collapseVisibleFolders = () => {
    const visibleIds = new Set(visibleFolders.map((folder) => folder.id));
    setExpandedFolderIds((prev) => prev.filter((id) => !visibleIds.has(id)));
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
        setMessage("팝업이 차단되어 미리보기를 열 수 없습니다. 브라우저에서 팝업 허용 또는 다운로드 버튼을 사용해 주세요.");
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

  const handleShare = async (record: PdfArchiveMeta) => {
    try {
      const saved = await getPdfArchiveRecord(record.id);
      if (!saved) {
        setMessage("PDF를 찾을 수 없습니다.");
        return;
      }
      const result = await sharePdfBlob(saved.blob, saved.fileName);
      setMessage(result.message);
    } catch (error) {
      console.error(error);
      setMessage("카카오톡 공유에 실패했습니다.");
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

  const handleDownloadAll = async () => {
    setBulkWorking("download");
    try {
      const { downloaded, failed } = await downloadPdfArchives(records);
      if (downloaded === 0) {
        setMessage("다운로드할 PDF를 불러오지 못했습니다.");
        return;
      }
      setMessage(
        failed > 0
          ? `PDF ${downloaded.toLocaleString()}건을 다운로드했습니다. (${failed.toLocaleString()}건 실패)`
          : `PDF ${downloaded.toLocaleString()}건을 모두 다운로드했습니다.`
      );
    } catch (error) {
      console.error(error);
      setMessage("전체 다운로드에 실패했습니다.");
    } finally {
      setBulkWorking(null);
    }
  };

  const handleClearAll = async () => {
    setBulkWorking("clear");
    try {
      const deletedCount = await clearAllPdfArchives();
      setRecords([]);
      setExpandedFolderIds([]);
      setMessage(`보관함 PDF ${deletedCount.toLocaleString()}건을 모두 삭제했습니다.`);
    } catch (error) {
      console.error(error);
      setMessage("보관함 비우기에 실패했습니다.");
      await loadRecords();
    } finally {
      setBulkWorking(null);
    }
  };

  const openDownloadAllConfirm = () => {
    if (!records.length) {
      setMessage("다운로드할 PDF가 없습니다.");
      return;
    }
    setConfirmAction("download");
  };

  const openClearAllConfirm = () => {
    if (!records.length) {
      setMessage("비울 PDF가 없습니다.");
      return;
    }
    setConfirmAction("clear");
  };

  const executeConfirmedAction = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "download") {
      await handleDownloadAll();
      return;
    }
    if (action === "clear") {
      await handleClearAll();
    }
  };

  const renderSentStatementList = () => {
    if (loading) {
      return <p className="erp-statement-folder-empty">{"\uBD88\uB7EC\uC624\uB294 \uC911..."}</p>;
    }
    if (!sentRecords.length) {
      return <p className="erp-statement-folder-empty">{"\uB9C1\uD06C \uBCF4\uB0B4\uAE30\uB85C \uBC1C\uC1A1\uD55C \uB0B4\uC5ED\uC11C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}</p>;
    }

    return (
      <div className="erp-statement-folder-list">
        {sentRecords.map((record) => {
          const summary = buildPdfArchiveSummary(record);
          return (
            <div key={record.id} className="erp-statement-folder-item">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="erp-pdf-archive-file-name" title={summary}>
                    {record.subjectName}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${paymentStatusTone(record.paymentStatus)}`}>
                    {getSentStatementPaymentStatusLabel(record.paymentStatus)}
                  </span>
                  {isArchiveAutoLinked(record, bankTxById) ? <AutoLinkBadge /> : null}
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                    {getPdfArchiveCategoryLabel(record.category)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{summary}</div>
                {record.statementTotalAmount ? (
                  <div className="mt-1 text-sm font-semibold text-slate-700">
                    {"\uB0B4\uC5ED\uC11C \uCD1D\uD569\uACC4"}{" "}
                    {new Intl.NumberFormat("ko-KR").format(record.statementTotalAmount)}
                    {"\uC6D0"}
                  </div>
                ) : null}
                {record.shareLinkUrl ? (
                  <div className="mt-1 truncate text-xs text-blue-600">{record.shareLinkUrl}</div>
                ) : null}
              </div>
              <div className="erp-statement-folder-item-actions">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="erp-statement-history-btn rounded-lg"
                  title="\uBCF4\uAE30"
                  onClick={() => handleOpen(record.id)}
                >
                  <Eye size={12} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="erp-statement-history-btn rounded-lg"
                  title="\uB2E4\uC6B4\uB85C\uB4DC"
                  onClick={() => handleDownload(record)}
                >
                  <Download size={12} />
                </Button>
                {record.shareLinkUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="erp-statement-history-btn rounded-lg"
                    title="\uB9C1\uD06C \uBCF5\uC0AC"
                    onClick={() => {
                      void navigator.clipboard?.writeText(record.shareLinkUrl || "");
                      setMessage("\uB9C1\uD06C\uB97C \uBCF5\uC0AC\uD588\uC2B5\uB2C8\uB2E4.");
                    }}
                  >
                    <Link2 size={12} />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="erp-statement-history-btn erp-pdf-archive-kakao-btn rounded-lg"
                  title="\uCE74\uCE74\uC624\uD5A1 \uBCF4\uB0B4\uAE30"
                  onClick={() => handleShare(record)}
                >
                  {"\uCE74\uD1A1"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="erp-statement-history-btn rounded-lg text-red-600 hover:text-red-700"
                  title="\uC0AD\uC81C"
                  onClick={() => handleDelete(record)}
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderFolderList = (folders: PdfArchiveFolder[], emptyLabel: string) => {
    if (loading) {
      return <p className="erp-statement-folder-empty">불러오는 중...</p>;
    }
    if (!folders.length) {
      return <p className="erp-statement-folder-empty">{emptyLabel}</p>;
    }

    return (
      <div className="erp-statement-folder-list">
        {folders.map((folder) => {
          const expanded = expandedFolderIds.includes(folder.id);
          return (
            <div key={folder.id} className="erp-statement-folder">
              <button type="button" className="erp-statement-folder-head" onClick={() => toggleFolderExpanded(folder.id)}>
                {expanded ? <ChevronDown size={13} className="shrink-0 text-slate-500" /> : <ChevronRight size={13} className="shrink-0 text-slate-500" />}
                <span className="erp-statement-folder-name">{folder.folderName}</span>
                <span className="erp-statement-folder-meta">
                  {folder.items.length}건 · {formatArchiveDate(folder.updatedAt).split(" ")[0]}
                </span>
              </button>
              {expanded && (
                <div className="erp-statement-folder-items">
                  {folder.items.map((record) => {
                    const summary = buildPdfArchiveSummary(record);
                    return (
                      <div key={record.id} className="erp-statement-folder-item">
                        <div className="min-w-0 flex-1">
                          <div className="erp-pdf-archive-file-name" title={summary}>
                            {record.fileName}
                          </div>
                        </div>
                        <div className="erp-statement-folder-item-actions">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="erp-statement-history-btn rounded-lg"
                            title="보기"
                            onClick={() => handleOpen(record.id)}
                          >
                            <Eye size={12} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="erp-statement-history-btn rounded-lg"
                            title="다운로드"
                            onClick={() => handleDownload(record)}
                          >
                            <Download size={12} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="erp-statement-history-btn erp-pdf-archive-kakao-btn rounded-lg"
                            title="카카오톡 보내기"
                            onClick={() => handleShare(record)}
                          >
                            카톡
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="erp-statement-history-btn rounded-lg text-red-600 hover:text-red-700"
                            title="삭제"
                            onClick={() => handleDelete(record)}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="erp-page erp-payment-hub-page">
      {confirmAction ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setConfirmAction(null)}>
          <div
            className="erp-ledger-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-archive-confirm-title"
          >
            <h2 id="pdf-archive-confirm-title" className="text-base font-bold text-slate-900 md:text-lg">
              {confirmAction === "download" ? "전체 다운로드" : "보관함 비우기"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {confirmAction === "download"
                ? `보관함에 저장된 PDF ${records.length.toLocaleString()}건을 모두 다운로드할까요?`
                : `보관함의 PDF ${records.length.toLocaleString()}건을 모두 삭제할까요?`}
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-700">
              {confirmAction === "download"
                ? "브라우저에서 파일 저장 창이 여러 번 표시될 수 있습니다."
                : "삭제 후에는 복구할 수 없습니다."}
            </p>
            <div className="mt-5 flex gap-2">
              <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmAction(null)}>
                취소
              </Button>
              <Button
                type="button"
                className={`flex-1 rounded-xl ${confirmAction === "clear" ? "bg-red-600 hover:bg-red-700" : ""}`}
                onClick={executeConfirmedAction}
              >
                {confirmAction === "download" ? "다운로드" : "비우기"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="erp-payment-hub-head">
        <div>
          <h1 className="erp-payment-hub-title flex items-center gap-2">
            <Archive size={20} className="text-slate-700" />
            PDF 보관함
          </h1>
          <p className="erp-payment-hub-desc">
            {isApiModeEnabled()
              ? "내역서 PDF 생성 시 거래처·시공자 폴더에 자동 저장됩니다."
              : "내역서 PDF 생성 시 거래처·시공자 폴더에 자동 저장됩니다."}
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
          <div className="erp-payment-hub-metric">
            <span className="label">{"\uBCF4\uB0B8\uB0B4\uC5ED\uC11C"}</span>
            <span className="value">{stats.sentCount.toLocaleString()}{"\uAC74"}</span>
          </div>
          <div className="erp-payment-hub-metric is-highlight">
            <span className="label">조회</span>
            <span className="value">{stats.filtered.toLocaleString()}건</span>
          </div>
        </div>
      </div>

      <Card className="mb-3 rounded-2xl shadow-sm">
        <CardContent className="p-3 md:p-4">
          <div className="erp-statement-folder-toolbar">
            <div className="erp-statement-folder-search">
              <Search size={14} className="shrink-0 text-slate-400" />
              <input
                lang="ko"
                className="erp-input w-full bg-transparent outline-none"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="업체·기간·파일명 검색"
              />
            </div>
            <div className="erp-statement-folder-toolbar-row">
              <Field label="생성 시작">
                <KoreanDateInput value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </Field>
              <Field label="생성 종료">
                <KoreanDateInput value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </Field>
              <select
                className="erp-statement-folder-sort erp-input rounded-lg border px-2 py-1 erp-text-caption"
                value={folderSort}
                onChange={(event) => setFolderSort(event.target.value as PdfArchiveFolderSort)}
              >
                <option value="updated">최근 수정</option>
                <option value="name">이름순</option>
                <option value="items">PDF 많은순</option>
              </select>
              <div className="erp-statement-folder-bulk-actions">
                <Button type="button" variant="outline" size="sm" className="erp-statement-history-btn rounded-lg" onClick={resetFilters}>
                  <RotateCcw size={12} className="mr-1" />
                  초기화
                </Button>
                <Button type="button" variant="outline" size="sm" className="erp-statement-history-btn rounded-lg" onClick={loadRecords}>
                  <RefreshCw size={12} className="mr-1" />
                  새로고침
                </Button>
                <Button type="button" variant="outline" size="sm" className="erp-statement-history-btn rounded-lg" onClick={expandVisibleFolders}>
                  펼치기
                </Button>
                <Button type="button" variant="outline" size="sm" className="erp-statement-history-btn rounded-lg" onClick={collapseVisibleFolders}>
                  접기
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="erp-statement-history-btn rounded-lg"
                  disabled={bulkWorking !== null || records.length === 0}
                  onClick={openDownloadAllConfirm}
                >
                  <Download size={12} className="mr-1" />
                  {bulkWorking === "download" ? "다운로드 중..." : "전체 다운로드"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="erp-statement-history-btn rounded-lg text-red-600 hover:text-red-700"
                  disabled={bulkWorking !== null || records.length === 0}
                  onClick={openClearAllConfirm}
                >
                  <Trash2 size={12} className="mr-1" />
                  {bulkWorking === "clear" ? "삭제 중..." : "보관함 비우기"}
                </Button>
              </div>
            </div>
          </div>

          <div className="erp-receivable-totals-bar erp-pdf-archive-totals-bar">
            <div className="erp-receivable-totals-group">
              <span className="erp-receivable-totals-label">조회</span>
              <div className="erp-receivable-totals-items">
                <div className="erp-receivable-totals-item">
                  <span>PDF</span>
                  <b>{stats.filtered.toLocaleString()}</b>
                </div>
                <div className="erp-receivable-totals-item">
                  <span>폴더</span>
                  <b>{visibleFolders.length.toLocaleString()}</b>
                </div>
                <div className="erp-receivable-totals-item">
                  <span>용량</span>
                  <b>{formatPdfArchiveSize(stats.totalBytes)}</b>
                </div>
              </div>
            </div>
          </div>

          {message && <p className="mb-2 erp-text-caption font-semibold text-slate-600">{message}</p>}

          {!loading && records.length === 0 ? (
            <p className="erp-text-caption text-slate-500">저장된 PDF가 없습니다.</p>
          ) : !loading && filteredRecords.length === 0 ? (
            <p className="erp-text-caption text-slate-500">검색 조건에 맞는 PDF가 없습니다.</p>
          ) : (
            <div className="space-y-4">
              <section className="rounded-2xl border border-violet-200 bg-violet-50/30 p-3 md:p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="erp-statement-folder-column-title">{"\uBCF4\uB0B8\uB0B4\uC5ED\uC11C\uD568"}</h4>
                  <span className="erp-statement-folder-column-count">{sentRecords.length}</span>
                </div>
                {renderSentStatementList()}
              </section>

              <div className="erp-statement-folder-split">
                <section className="erp-statement-folder-column">
                  <div className="erp-statement-folder-column-head">
                    <h4 className="erp-statement-folder-column-title">{"\uAC70\uB798\uCC98"}</h4>
                    <span className="erp-statement-folder-column-count">{clientFolders.length}</span>
                  </div>
                  <div className="erp-statement-folder-column-body">
                    {renderFolderList(clientFolders, "\uAC70\uB798\uCC98 PDF \uD3F4\uB354\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.")}
                  </div>
                </section>
                <section className="erp-statement-folder-column">
                  <div className="erp-statement-folder-column-head">
                    <h4 className="erp-statement-folder-column-title">{"\uC2DC\uACF5\uC790"}</h4>
                    <span className="erp-statement-folder-column-count">{workerFolders.length}</span>
                  </div>
                  <div className="erp-statement-folder-column-body">
                    {renderFolderList(workerFolders, "\uC2DC\uACF5\uC790 PDF \uD3F4\uB354\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.")}
                  </div>
                </section>
              </div>
            </div>
          )}

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
