import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, CreditCard, Download, FileText, Search, WalletCards } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { WorkerStatementSheet } from "@/components/WorkerStatementSheet";
import { StatementA4Preview } from "@/components/StatementA4Preview";
import { TableExportSection } from "@/components/TableExportSection";
import { WorkerMonthlyStatementExport } from "@/components/WorkerMonthlyStatementExport";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { createPdfPreviewWindow, downloadPdfFromHtmlElement, revokePdfBlobUrl } from "@/utils/statementPdf";
import { archiveGeneratedPdf } from "@/utils/pdfArchive";
import { confirmDelete } from "@/utils/confirmDelete";
import {
  buildWorkerStatementSummary,
  filterSalesByDate,
  flattenSalesToWorkerPaymentRows,
  formatKRW,
  monthStartISO,
  summarizeWorkerPaymentDetailTotals,
  summarizeWorkerPaymentRows,
  todayISO,
  type WorkerMasterLike,
  type WorkerPaymentDetailRow,
  type WorkerPaymentSummaryRow,
} from "@/utils/workerPayments";
import { dedupeStatementRowMemos } from "@/utils/statementSheets";
import {
  buildWorkerMonthSummaries,
  buildWorkerMonthlyWorkerRows,
  buildWorkerPaymentRecordMap,
  calculateWorkerPaymentVat,
  formatMonthLabel,
  formatPaidAt,
  makeWorkerMonthKey,
  normalizePaidDate,
  shiftMonthKey,
  upsertWorkerPaymentRecord,
  updateWorkerPaymentMemo,
  updateWorkerPaymentPaidDate as setWorkerPaymentPaidDate,
  type WorkerMonthlyPaymentRecord,
} from "@/utils/workerMonthlyPayments";

type WorkerPaymentTab = "summary" | "detail" | "monthly" | "statement";

const TAB_ITEMS: Array<{ key: WorkerPaymentTab; label: string }> = [
  { key: "summary", label: "지급 집계" },
  { key: "monthly", label: "월별 지급" },
  { key: "detail", label: "시공자별 상세" },
  { key: "statement", label: "내역서 / PDF" },
];

function SearchBox({ query, setQuery, placeholder }: { query: string; setQuery: (value: string) => void; placeholder: string }) {
  return (
    <div className="flex max-w-xl items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
      <Search size={18} className="text-slate-400" />
      <input lang="ko" className="erp-input w-full bg-transparent outline-none" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="erp-payment-hub-filter">
      <span className="erp-text-caption font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function formatCompactKRW(value: number) {
  const amount = Math.round(Number(value) || 0);
  if (amount === 0) return "-";
  if (amount >= 100000000) {
    const eok = amount / 100000000;
    return `${Number.isInteger(eok) ? eok : eok.toFixed(1).replace(/\.0$/, "")}억`;
  }
  if (amount >= 10000) return `${Math.round(amount / 10000)}만`;
  if (amount >= 1000) return `${Math.round(amount / 1000)}천`;
  return String(amount);
}

function WorkerNetPayRankingChart({
  rows,
  limit = 30,
  emptyLabel = "실지급 데이터가 없습니다.",
}: {
  rows: WorkerPaymentSummaryRow[];
  limit?: number;
  emptyLabel?: string;
}) {
  const visibleRows = useMemo(
    () => [...rows].filter((row) => row.netPay > 0).sort((a, b) => b.netPay - a.netPay || a.name.localeCompare(b.name, "ko")).slice(0, limit),
    [rows, limit]
  );
  const maxNetPay = useMemo(() => Math.max(...visibleRows.map((row) => row.netPay), 1), [visibleRows]);

  const barHeight = (value: number) => {
    if (!value) return 0;
    return Math.max((value / maxNetPay) * 100, 18);
  };

  if (!visibleRows.length) {
    return <p className="erp-text-body py-8 text-center text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="erp-worker-netpay-chart" aria-label="시공자별 실지급">
      <div
        className="erp-worker-netpay-chart-grid"
        style={{ ["--worker-netpay-count" as string]: String(visibleRows.length) }}
      >
        {visibleRows.map((row) => (
          <div key={row.name} className="erp-worker-netpay-chart-col" title={`${row.name} · 실지급 ${formatKRW(row.netPay)}`}>
            <div className="erp-worker-netpay-chart-bar-wrap">
              <span className="erp-worker-netpay-chart-value">{formatCompactKRW(row.netPay)}</span>
              <div
                className={`erp-worker-netpay-chart-bar${row.netPay > 0 ? " has-value" : ""}`}
                style={{ height: row.netPay > 0 ? `${barHeight(row.netPay)}%` : "0" }}
              />
            </div>
            <span className="erp-worker-netpay-chart-label">{row.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkerPaymentsPage({
  workers = [],
  sales = [],
  workerPaymentRecords = [],
  setWorkerPaymentRecords,
  currentUser,
}: {
  workers?: WorkerMasterLike[];
  sales?: Parameters<typeof flattenSalesToWorkerPaymentRows>[0];
  workerPaymentRecords?: WorkerMonthlyPaymentRecord[];
  setWorkerPaymentRecords?: React.Dispatch<React.SetStateAction<WorkerMonthlyPaymentRecord[]>>;
  currentUser?: { name?: string; email?: string };
}) {
  const [activeTab, setActiveTab] = useState<WorkerPaymentTab>("summary");
  const [dateFilter, setDateFilter] = useState({ startDate: monthStartISO(), endDate: todayISO() });
  const [selectedWorker, setSelectedWorker] = useState("");
  const [detailQuery, setDetailQuery] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => monthStartISO().slice(0, 7));
  const [monthlyUnpaidOnly, setMonthlyUnpaidOnly] = useState(false);
  const [paymentDraftDates, setPaymentDraftDates] = useState<Record<string, string>>({});
  const [paymentDraftVat, setPaymentDraftVat] = useState<Record<string, boolean>>({});
  const [pdfMessage, setPdfMessage] = useState("");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [statementSheetGenerated, setStatementSheetGenerated] = useState(false);
  const [statementHint, setStatementHint] = useState("");
  const pdfBlobUrlRef = useRef("");
  const workerPrintRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => revokePdfBlobUrl(pdfBlobUrlRef.current), []);

  useEffect(() => {
    setStatementSheetGenerated(false);
    setStatementHint("");
    setPdfMessage("");
  }, [dateFilter.startDate, dateFilter.endDate, selectedWorker]);

  useEffect(() => {
    if (activeTab !== "statement") {
      setStatementSheetGenerated(false);
      setStatementHint("");
    }
  }, [activeTab]);

  const filteredSales = useMemo(
    () => filterSalesByDate(sales, dateFilter.startDate, dateFilter.endDate),
    [sales, dateFilter.endDate, dateFilter.startDate]
  );

  const allDetailRows = useMemo(
    () => flattenSalesToWorkerPaymentRows(sales, workers),
    [sales, workers]
  );

  const paymentRecordMap = useMemo(
    () => buildWorkerPaymentRecordMap(workerPaymentRecords),
    [workerPaymentRecords]
  );

  const monthSummaries = useMemo(
    () => buildWorkerMonthSummaries(allDetailRows, workerPaymentRecords),
    [allDetailRows, workerPaymentRecords]
  );

  useEffect(() => {
    if (!monthSummaries.length) return;
    if (!monthSummaries.some((row) => row.monthKey === selectedMonthKey)) {
      setSelectedMonthKey(monthSummaries[0].monthKey);
    }
  }, [monthSummaries, selectedMonthKey]);

  const selectedMonthSummary = useMemo(
    () => monthSummaries.find((row) => row.monthKey === selectedMonthKey) || null,
    [monthSummaries, selectedMonthKey]
  );

  const monthlyWorkerRows = useMemo(
    () => buildWorkerMonthlyWorkerRows(allDetailRows, selectedMonthKey, workers),
    [allDetailRows, selectedMonthKey, workers]
  );

  const visibleMonthlyWorkerRows = useMemo(() => {
    if (!monthlyUnpaidOnly) return monthlyWorkerRows;
    return monthlyWorkerRows.filter((row) => !paymentRecordMap.get(makeWorkerMonthKey(row.worker, selectedMonthKey))?.paid);
  }, [monthlyUnpaidOnly, monthlyWorkerRows, paymentRecordMap, selectedMonthKey]);

  const monthlyWorkerStatementRowsMap = useMemo(() => {
    const map = new Map<string, WorkerPaymentDetailRow[]>();
    for (const row of monthlyWorkerRows) {
      map.set(
        row.worker,
        allDetailRows.filter(
          (detailRow) => detailRow.worker === row.worker && String(detailRow.date || "").slice(0, 7) === selectedMonthKey,
        ),
      );
    }
    return map;
  }, [allDetailRows, monthlyWorkerRows, selectedMonthKey]);

  const monthlyPaidCount = useMemo(
    () => monthlyWorkerRows.filter((row) => paymentRecordMap.get(makeWorkerMonthKey(row.worker, selectedMonthKey))?.paid).length,
    [monthlyWorkerRows, paymentRecordMap, selectedMonthKey]
  );

  const monthlyUnpaidNetPay = useMemo(
    () =>
      monthlyWorkerRows.reduce((sum, row) => {
        const paid = paymentRecordMap.get(makeWorkerMonthKey(row.worker, selectedMonthKey))?.paid;
        return paid ? sum : sum + row.netPay;
      }, 0),
    [monthlyWorkerRows, paymentRecordMap, selectedMonthKey]
  );

  const monthlyPaidVatSummary = useMemo(() => {
    let vatTotal = 0;
    let paidWithVatCount = 0;
    let finalPayTotal = 0;

    for (const row of monthlyWorkerRows) {
      const record = paymentRecordMap.get(makeWorkerMonthKey(row.worker, selectedMonthKey));
      if (!record?.paid || !record.payWithVat) continue;
      const { vatAmount, finalPayAmount } = calculateWorkerPaymentVat(row.netPay, true);
      vatTotal += vatAmount;
      finalPayTotal += finalPayAmount;
      paidWithVatCount += 1;
    }

    return { vatTotal, paidWithVatCount, finalPayTotal };
  }, [monthlyWorkerRows, paymentRecordMap, selectedMonthKey]);

  const getRowPayWithVat = (worker: string, record?: WorkerMonthlyPaymentRecord) => {
    const rowKey = makeWorkerMonthKey(worker, selectedMonthKey);
    if (record?.paid) return Boolean(record.payWithVat);
    return Boolean(paymentDraftVat[rowKey]);
  };

  const updatePaymentRecord = (worker: string, paid: boolean, paidAt = "", payWithVat = false) => {
    if (!setWorkerPaymentRecords) return;
    setWorkerPaymentRecords((prev) =>
      upsertWorkerPaymentRecord(prev, {
        worker,
        monthKey: selectedMonthKey,
        paid,
        paidAt: paid ? paidAt || paymentDraftDates[makeWorkerMonthKey(worker, selectedMonthKey)] || undefined : undefined,
        paidBy: currentUser?.name || currentUser?.email,
        payWithVat: paid ? payWithVat : false,
      }),
    );
  };

  const updatePaymentPaidDate = (worker: string, paidAt: string) => {
    const rowKey = makeWorkerMonthKey(worker, selectedMonthKey);
    const record = paymentRecordMap.get(rowKey);
    if (record?.paid) {
      if (!setWorkerPaymentRecords) return;
      setWorkerPaymentRecords((prev) =>
        setWorkerPaymentPaidDate(prev, worker, selectedMonthKey, paidAt, currentUser?.name || currentUser?.email),
      );
      return;
    }
    setPaymentDraftDates((prev) => ({ ...prev, [rowKey]: paidAt }));
  };

  const confirmPayment = (worker: string) => {
    if (!setWorkerPaymentRecords) return;
    const rowKey = makeWorkerMonthKey(worker, selectedMonthKey);
    const paidAt = paymentDraftDates[rowKey] || todayISO();
    if (!paymentDraftDates[rowKey]) {
      setPaymentDraftDates((prev) => ({ ...prev, [rowKey]: paidAt }));
    }
    const record = paymentRecordMap.get(rowKey);
    updatePaymentRecord(worker, true, paidAt, getRowPayWithVat(worker, record));
  };

  const cancelPayment = (worker: string) => {
    if (!confirmDelete(`${worker} 시공자의 지급 완료 상태를 취소할까요?`)) return;
    const rowKey = makeWorkerMonthKey(worker, selectedMonthKey);
    setPaymentDraftVat((prev) => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
    updatePaymentRecord(worker, false);
  };

  const togglePaymentVat = (worker: string, record?: WorkerMonthlyPaymentRecord) => {
    const rowKey = makeWorkerMonthKey(worker, selectedMonthKey);
    const nextValue = !getRowPayWithVat(worker, record);
    if (record?.paid) {
      updatePaymentRecord(worker, true, record.paidAt || "", nextValue);
      return;
    }
    setPaymentDraftVat((prev) => ({ ...prev, [rowKey]: nextValue }));
  };

  const getRowPaymentDate = (worker: string, record?: WorkerMonthlyPaymentRecord) => {
    const rowKey = makeWorkerMonthKey(worker, selectedMonthKey);
    if (record?.paid) {
      return normalizePaidDate(record.paidAt);
    }
    return paymentDraftDates[rowKey] || "";
  };

  const updatePaymentMemo = (worker: string, memo: string) => {
    if (!setWorkerPaymentRecords) return;
    setWorkerPaymentRecords((prev) => updateWorkerPaymentMemo(prev, worker, selectedMonthKey, memo));
  };

  const markAllMonthlyPaid = (paid: boolean) => {
    if (!setWorkerPaymentRecords) return;
    setWorkerPaymentRecords((prev) =>
      monthlyWorkerRows.reduce((records, row) => {
        const rowKey = makeWorkerMonthKey(row.worker, selectedMonthKey);
        const draftDate = paymentDraftDates[rowKey] || todayISO();
        return upsertWorkerPaymentRecord(records, {
          worker: row.worker,
          monthKey: selectedMonthKey,
          paid,
          paidAt: paid ? draftDate : undefined,
          paidBy: currentUser?.name || currentUser?.email,
          payWithVat: paid ? Boolean(paymentDraftVat[rowKey]) : false,
        });
      }, prev),
    );
  };

  const openWorkerMonthlyDetail = (worker: string) => {
    const monthStart = `${selectedMonthKey}-01`;
    const monthEndDate = new Date(Number(selectedMonthKey.slice(0, 4)), Number(selectedMonthKey.slice(5, 7)), 0);
    const monthEnd = `${selectedMonthKey}-${String(monthEndDate.getDate()).padStart(2, "0")}`;
    setSelectedWorker(worker);
    setDateFilter({ startDate: monthStart, endDate: monthEnd });
    setActiveTab("detail");
  };

  const detailRows = useMemo(
    () => flattenSalesToWorkerPaymentRows(filteredSales, workers),
    [filteredSales, workers]
  );

  const summaryRows = useMemo(
    () => summarizeWorkerPaymentRows(detailRows, workers),
    [detailRows, workers]
  );

  const activeSummaryRows = useMemo(
    () => summaryRows.filter((row) => row.lineCount > 0),
    [summaryRows]
  );

  const headerTotals = useMemo(
    () =>
      activeSummaryRows.reduce(
        (acc, row) => {
          acc.lineCount += row.lineCount;
          acc.grossPay += row.grossPay;
          acc.fee += row.fee;
          acc.netPay += row.netPay;
          if (row.netPay > 0) acc.workerCount += 1;
          return acc;
        },
        { lineCount: 0, grossPay: 0, fee: 0, netPay: 0, workerCount: 0 }
      ),
    [activeSummaryRows]
  );

  const workerOptions = useMemo(
    () => ["전체", ...new Set(detailRows.map((row) => row.worker).filter(Boolean))],
    [detailRows]
  );

  const scopedDetailRows = useMemo(() => {
    const workerMatch = (row: WorkerPaymentDetailRow) => !selectedWorker || selectedWorker === "전체" || row.worker === selectedWorker;
    const query = detailQuery.trim().toLowerCase();
    const queryMatch = (row: WorkerPaymentDetailRow) =>
      !query ||
      [row.date, row.voucherNo, row.client, row.site, row.worker, row.memo]
        .join(" ")
        .toLowerCase()
        .includes(query);

    return detailRows.filter((row) => workerMatch(row) && queryMatch(row));
  }, [detailQuery, detailRows, selectedWorker]);

  const detailTotals = useMemo(() => summarizeWorkerPaymentDetailTotals(scopedDetailRows), [scopedDetailRows]);

  const chartDetailRows = useMemo(() => {
    if (activeTab === "monthly") {
      return allDetailRows.filter((row) => String(row.date || "").slice(0, 7) === selectedMonthKey);
    }
    return detailRows;
  }, [activeTab, allDetailRows, detailRows, selectedMonthKey]);

  const chartSummaryRows = useMemo(
    () => summarizeWorkerPaymentRows(chartDetailRows, workers),
    [chartDetailRows, workers]
  );

  const chartPeriodLabel = useMemo(() => {
    if (activeTab === "monthly") return formatMonthLabel(selectedMonthKey);
    if (dateFilter.startDate || dateFilter.endDate) {
      return `${dateFilter.startDate || "전체"} ~ ${dateFilter.endDate || "전체"}`;
    }
    return "전체 기간";
  }, [activeTab, dateFilter.endDate, dateFilter.startDate, selectedMonthKey]);

  const chartNetPayTotal = useMemo(
    () => chartSummaryRows.reduce((sum, row) => sum + (row.netPay > 0 ? row.netPay : 0), 0),
    [chartSummaryRows]
  );

  const statementWorker = selectedWorker && selectedWorker !== "전체" ? selectedWorker : "";
  const statementRows = useMemo(
    () => (statementWorker ? detailRows.filter((row) => row.worker === statementWorker) : []),
    [detailRows, statementWorker]
  );
  const statementDisplayRows = useMemo(() => dedupeStatementRowMemos(statementRows), [statementRows]);

  const selectedWorkerInfo = workers.find((row) => row.name === statementWorker) || {};
  const workerStatementSummary = buildWorkerStatementSummary(statementRows, selectedWorkerInfo);
  const workerStatementPeriodStart = dateFilter.startDate || statementRows[0]?.date || "";
  const workerStatementPeriodEnd = dateFilter.endDate || statementRows[statementRows.length - 1]?.date || "";

  const workerPrintTotals = useMemo(
    () =>
      statementRows.reduce(
        (acc, row) => {
          acc.count += 1;
          acc.basePay += row.basePay || 0;
          acc.overtime += row.overtime || 0;
          acc.lodging += row.lodging || 0;
          acc.meal += row.meal || 0;
          acc.expense += row.expense || 0;
          acc.totalPay += row.totalPay || 0;
          return acc;
        },
        { count: 0, basePay: 0, overtime: 0, lodging: 0, meal: 0, expense: 0, totalPay: 0 }
      ),
    [statementRows]
  );

  const openWorkerDetail = (row: WorkerPaymentSummaryRow) => {
    setSelectedWorker(row.name);
    setActiveTab("detail");
  };

  const handleGenerateStatementSheet = () => {
    if (!statementWorker) {
      setStatementHint("시공자를 선택해 주세요.");
      return;
    }
    if (!statementRows.length) {
      setStatementHint("선택 기간에 해당 시공자 내역이 없습니다.");
      return;
    }
    setStatementHint("");
    setPdfMessage("");
    setStatementSheetGenerated(true);
  };

  const generateWorkerPdf = async () => {
    if (!statementSheetGenerated) {
      setPdfMessage("PDF 생성 전에 내역서 생성을 먼저 실행해 주세요.");
      return;
    }

    if (!statementWorker) {
      setPdfMessage("PDF 생성 전에 시공자를 선택해 주세요.");
      return;
    }

    if (!statementRows.length) {
      setPdfMessage("PDF로 보낼 시공자 내역이 없습니다.");
      return;
    }

    const element = workerPrintRef.current;
    if (!element) {
      setPdfMessage("PDF 출력 영역을 찾을 수 없습니다. 페이지를 새로고침 후 다시 시도해 주세요.");
      return;
    }

    const safeName = statementWorker.replace(/[\\/:*?"<>|]/g, "_");
    const periodLabel = `${dateFilter.startDate || "전체"}_${dateFilter.endDate || "전체"}`;
    const fileName = `시공내역서_시공자_${safeName}_${periodLabel}.pdf`;

    revokePdfBlobUrl(pdfBlobUrlRef.current);
    setPdfGenerating(true);
    setPdfMessage("PDF 생성 중입니다...");
    pdfBlobUrlRef.current = "";

    const previewWindow = createPdfPreviewWindow();
    if (!previewWindow) {
      setPdfMessage("팝업이 차단되었습니다. 브라우저에서 팝업 허용 후 다시 시도해 주세요.");
    }

    try {
      const result = await downloadPdfFromHtmlElement(element, fileName, {
        orientation: "portrait",
        previewWindow,
      });
      pdfBlobUrlRef.current = result.blobUrl;
      await archiveGeneratedPdf(result, {
        category: "statement-worker",
        subjectName: statementWorker,
        periodStart: dateFilter.startDate,
        periodEnd: dateFilter.endDate,
      });
      setPdfMessage(
        result.previewOpened
          ? "PDF가 다운로드되었고 새 탭에서 열렸습니다. 보관함에도 저장되었습니다."
          : "PDF가 다운로드되었고 보관함에 저장되었습니다. 미리보기는 PDF 보관함에서 열어 주세요."
      );
    } catch (error) {
      console.error(error);
      previewWindow?.close();
      setPdfMessage("PDF 생성에 실패했습니다. 팝업 차단을 해제하거나 잠시 후 다시 시도해 주세요.");
    } finally {
      setPdfGenerating(false);
    }
  };

  return (
    <div className="erp-page erp-payment-hub-page">
      <div className="erp-payment-hub-head">
        <div>
          <h1 className="erp-payment-hub-title">시공자 지급</h1>
          <p className="erp-payment-hub-desc">지급 집계 · 시공자별 상세 · 내역서 PDF를 한 화면에서 처리합니다.</p>
        </div>
        <div className="erp-payment-hub-metrics">
          <div className="erp-payment-hub-metric">
            <span className="label">지급</span>
            <span className="value">{formatKRW(headerTotals.grossPay)}</span>
          </div>
          <div className="erp-payment-hub-metric">
            <span className="label">수수료</span>
            <span className="value text-red-600">{formatKRW(headerTotals.fee)}</span>
          </div>
          <div className="erp-payment-hub-metric is-highlight">
            <span className="label">실지급</span>
            <span className="value text-emerald-700">{formatKRW(headerTotals.netPay)}</span>
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
                  onClick={() => setActiveTab(tab.key)}
                  className={`erp-text-body rounded-xl px-4 py-2 font-bold ${activeTab === tab.key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="erp-payment-hub-filters">
              {activeTab === "monthly" ? (
                <>
                  <div className="erp-worker-month-nav">
                    <button type="button" className="erp-worker-month-nav-btn" onClick={() => setSelectedMonthKey((prev) => shiftMonthKey(prev, -1))} aria-label="이전 달">
                      <ChevronLeft size={16} />
                    </button>
                    <div className="erp-worker-month-nav-label">{formatMonthLabel(selectedMonthKey)}</div>
                    <button type="button" className="erp-worker-month-nav-btn" onClick={() => setSelectedMonthKey((prev) => shiftMonthKey(prev, 1))} aria-label="다음 달">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <Button variant="outline" className="rounded-2xl" onClick={() => setSelectedMonthKey(monthStartISO().slice(0, 7))}>
                      이번 달
                    </Button>
                    <Button variant={monthlyUnpaidOnly ? "default" : "outline"} className="rounded-2xl" onClick={() => setMonthlyUnpaidOnly((prev) => !prev)}>
                      미지급만
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => markAllMonthlyPaid(true)} disabled={!monthlyWorkerRows.length}>
                      전체 지급완료
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Field label="시작일">
                    <KoreanDateInput
                      value={dateFilter.startDate}
                      onChange={(e) => setDateFilter((prev) => ({ ...prev, startDate: e.target.value }))}
                    />
                  </Field>
                  <Field label="종료일">
                    <KoreanDateInput
                      value={dateFilter.endDate}
                      onChange={(e) => setDateFilter((prev) => ({ ...prev, endDate: e.target.value }))}
                    />
                  </Field>
                  {(activeTab === "detail" || activeTab === "statement") && (
                    <Field label="시공자">
                      <AutocompleteInput
                        value={selectedWorker || "전체"}
                        options={workerOptions}
                        onChange={(value) => setSelectedWorker(value === "전체" ? "" : value)}
                        placeholder="시공자 검색"
                        limit={15}
                        renderSub={(name) => {
                          if (name === "전체") return "전체 시공자";
                          const info = workers.find((row) => row.name === name);
                          return info ? `${info.phone || "연락처 없음"} · ${Math.round((info.feeRate || 0) * 100)}%` : "";
                        }}
                      />
                    </Field>
                  )}
                  {activeTab === "statement" ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-end gap-2">
                        <Button variant="outline" className="rounded-2xl" onClick={() => setDateFilter({ startDate: monthStartISO(), endDate: todayISO() })}>
                          이번 달
                        </Button>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setDateFilter({ startDate: "", endDate: "" })}>
                          전체
                        </Button>
                        <Button className="rounded-2xl" onClick={handleGenerateStatementSheet} disabled={!statementWorker}>
                          <FileText size={16} className="mr-1" />
                          내역서 생성
                        </Button>
                      </div>
                      {statementHint && <p className="erp-text-caption font-semibold text-amber-700">{statementHint}</p>}
                    </div>
                  ) : (
                    <div className="flex items-end gap-2">
                      <Button variant="outline" className="rounded-2xl" onClick={() => setDateFilter({ startDate: monthStartISO(), endDate: todayISO() })}>
                        이번 달
                      </Button>
                      <Button variant="outline" className="rounded-2xl" onClick={() => setDateFilter({ startDate: "", endDate: "" })}>
                        전체
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {activeTab === "summary" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title="총 지급" value={formatKRW(headerTotals.grossPay)} sub={`${headerTotals.lineCount}건 · 매출 ${filteredSales.length}전표`} icon={WalletCards} />
            <SummaryCard title="총 수수료" value={formatKRW(headerTotals.fee)} sub="시공자별 수수료 합계" tone="danger" icon={CreditCard} />
            <SummaryCard title="총 실지급" value={formatKRW(headerTotals.netPay)} sub="지급 - 수수료" tone="success" icon={CheckCircle2} />
            <SummaryCard title="지급 대상" value={`${headerTotals.workerCount}명`} sub="실지급액이 있는 시공자" icon={FileText} />
          </div>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 md:p-5">
              <div className="erp-receivable-totals-bar">
                <div className="erp-receivable-totals-group">
                  <span className="erp-receivable-totals-label">집계 합계</span>
                  <div className="erp-receivable-totals-items">
                    <div className="erp-receivable-totals-item">
                      <span>건수</span>
                      <b>{headerTotals.lineCount}</b>
                    </div>
                    <div className="erp-receivable-totals-item">
                      <span>지급</span>
                      <b>{formatKRW(headerTotals.grossPay)}</b>
                    </div>
                    <div className="erp-receivable-totals-item">
                      <span>수수료</span>
                      <b className="text-red-600">{formatKRW(headerTotals.fee)}</b>
                    </div>
                    <div className="erp-receivable-totals-item">
                      <span>실지급</span>
                      <b className="text-emerald-700">{formatKRW(headerTotals.netPay)}</b>
                    </div>
                  </div>
                </div>
              </div>

              <TableExportSection fileName="시공자지급_집계" title="시공자 지급 집계" disabled={activeSummaryRows.length === 0}>
              <div className="erp-table-wrap">
                <table className="erp-table erp-table--lg">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="text-left">시공자</th>
                      <th className="text-right">건수</th>
                      <th className="text-right">인원</th>
                      <th className="text-right">지급</th>
                      <th className="text-right">수수료</th>
                      <th className="text-right">실지급</th>
                      <th className="text-left">계좌</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSummaryRows.map((row) => (
                      <tr
                        key={row.name}
                        className="cursor-pointer border-t hover:bg-slate-50"
                        onClick={() => openWorkerDetail(row)}
                      >
                        <td className="text-left font-bold">{row.name}</td>
                        <td className="text-right">{row.lineCount}</td>
                        <td className="text-right">{row.headcount}</td>
                        <td className="text-right">{formatKRW(row.grossPay)}</td>
                        <td className="text-right text-red-600">{formatKRW(row.fee)}</td>
                        <td className="text-right font-bold text-emerald-600">{formatKRW(row.netPay)}</td>
                        <td className="text-left text-slate-500">{[row.bank, row.account].filter(Boolean).join(" ") || "-"}</td>
                      </tr>
                    ))}
                    {activeSummaryRows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500">
                          선택 기간에 지급 내역이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              </TableExportSection>
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === "monthly" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard
              title="총시공비"
              value={formatKRW(selectedMonthSummary?.totalBill || 0)}
              sub={`${selectedMonthSummary?.workerCount || 0}명 · ${selectedMonthSummary?.lineCount || 0}건`}
              icon={WalletCards}
            />
            <SummaryCard
              title="실제마진"
              value={formatKRW(selectedMonthSummary?.totalMargin || 0)}
              sub="거래처 청구 − 지급 + 수수료"
              tone={(selectedMonthSummary?.totalMargin || 0) >= 0 ? "success" : "danger"}
              icon={CheckCircle2}
            />
            <SummaryCard
              title="월 실지급"
              value={formatKRW(selectedMonthSummary?.netPay || 0)}
              sub={`시공자 지급 ${formatKRW(selectedMonthSummary?.grossPay || 0)} · 수수료 차감 후`}
              icon={CreditCard}
            />
            <SummaryCard
              title="부가세 지급"
              value={formatKRW(monthlyPaidVatSummary.vatTotal)}
              sub={
                monthlyPaidVatSummary.paidWithVatCount
                  ? `${monthlyPaidVatSummary.paidWithVatCount}명 · 최종 ${formatKRW(monthlyPaidVatSummary.finalPayTotal)}`
                  : "부가세 포함 지급 없음"
              }
              tone={monthlyPaidVatSummary.vatTotal > 0 ? "warning" : "default"}
              icon={CreditCard}
            />
            <SummaryCard
              title="지급 완료"
              value={`${monthlyPaidCount}/${monthlyWorkerRows.length}명`}
              sub={monthlyWorkerRows.length ? `${Math.round((monthlyPaidCount / monthlyWorkerRows.length) * 100)}% 처리` : "대상 없음"}
              tone="success"
              icon={CheckCircle2}
            />
            <SummaryCard
              title="미지급 잔액"
              value={formatKRW(monthlyUnpaidNetPay)}
              sub={`${Math.max(monthlyWorkerRows.length - monthlyPaidCount, 0)}명 미지급`}
              tone="danger"
              icon={CreditCard}
            />
          </div>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 md:p-5">
              <h2 className="erp-text-section mb-3">월별 현황</h2>
              <TableExportSection fileName="시공자지급_월별현황" title="시공자 지급 월별 현황" disabled={monthSummaries.length === 0}>
                <div className="erp-table-wrap">
                  <table className="erp-table erp-table--md">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="text-left">월</th>
                        <th className="text-right">시공자</th>
                        <th className="text-right">건수</th>
                        <th className="text-right">총시공비</th>
                        <th className="text-right">실제마진</th>
                        <th className="text-right">실지급</th>
                        <th className="text-right">지급완료</th>
                        <th className="text-left">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthSummaries.map((row) => {
                        const complete = row.workerCount > 0 && row.paidWorkerCount >= row.workerCount;
                        const partial = row.paidWorkerCount > 0 && !complete;
                        return (
                          <tr
                            key={row.monthKey}
                            className={`cursor-pointer border-t hover:bg-slate-50 ${row.monthKey === selectedMonthKey ? "is-selected" : ""}`}
                            onClick={() => setSelectedMonthKey(row.monthKey)}
                          >
                            <td className="font-semibold">{row.label}</td>
                            <td className="text-right">{row.workerCount}</td>
                            <td className="text-right">{row.lineCount}</td>
                            <td className="text-right">{formatKRW(row.totalBill)}</td>
                            <td className={`text-right font-semibold ${row.totalMargin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {formatKRW(row.totalMargin)}
                            </td>
                            <td className="text-right font-semibold">{formatKRW(row.netPay)}</td>
                            <td className="text-right">{row.paidWorkerCount}/{row.workerCount}</td>
                            <td>
                              <span className={`erp-worker-month-status ${complete ? "is-paid" : partial ? "is-partial" : "is-unpaid"}`}>
                                {complete ? "완료" : partial ? "일부" : "미지급"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {monthSummaries.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-500">
                            월별 지급 데이터가 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TableExportSection>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 md:p-5">
              <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <h2 className="erp-text-section">{formatMonthLabel(selectedMonthKey)} 시공자 지급</h2>
                <span className="erp-text-caption text-slate-500">지급일 미입력 시 오늘 날짜로 처리 · 필요 시 부가세+ 버튼</span>
              </div>

              <TableExportSection
                fileName={`시공자지급_${selectedMonthKey}`}
                title={`${formatMonthLabel(selectedMonthKey)} 시공자 지급`}
                disabled={visibleMonthlyWorkerRows.length === 0}
              >
                <div className="erp-table-wrap">
                  <table className="erp-table erp-table--lg">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="text-center">처리</th>
                        <th className="text-left">시공자</th>
                        <th className="text-right">건수</th>
                        <th className="text-right">지급</th>
                        <th className="text-right">수수료</th>
                        <th className="text-right">실지급</th>
                        <th className="text-center">부가세+</th>
                        <th className="text-right">최종지급</th>
                        <th className="text-left">지급일</th>
                        <th className="text-left">계좌</th>
                        <th className="text-center erp-table-export-skip">내역서</th>
                        <th className="text-left">비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleMonthlyWorkerRows.map((row) => {
                        const record = paymentRecordMap.get(makeWorkerMonthKey(row.worker, selectedMonthKey));
                        const paid = Boolean(record?.paid);
                        const paymentDate = getRowPaymentDate(row.worker, record);
                        const payWithVat = getRowPayWithVat(row.worker, record);
                        const { vatAmount, finalPayAmount } = calculateWorkerPaymentVat(row.netPay, payWithVat);
                        return (
                          <tr key={row.worker} className={`border-t hover:bg-slate-50 ${paid ? "erp-worker-month-row is-paid" : ""}`}>
                            <td className="p-1">
                              <div className="erp-worker-month-actions">
                                {paid ? (
                                  <>
                                    <span className="erp-worker-month-paid-badge">지급완료</span>
                                    <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg px-2 text-xs" onClick={() => cancelPayment(row.worker)}>
                                      취소
                                    </Button>
                                  </>
                                ) : (
                                  <Button type="button" size="sm" className="h-7 rounded-lg px-2.5 text-xs" onClick={() => confirmPayment(row.worker)}>
                                    지급
                                  </Button>
                                )}
                              </div>
                            </td>
                            <td className="text-left">
                              <button type="button" className="font-bold text-slate-900 hover:underline" onClick={() => openWorkerMonthlyDetail(row.worker)}>
                                {row.worker}
                              </button>
                            </td>
                            <td className="text-right">{row.lineCount}</td>
                            <td className="text-right">{formatKRW(row.grossPay)}</td>
                            <td className="text-right text-red-600">{formatKRW(row.fee)}</td>
                            <td className="text-right font-bold text-emerald-600">{formatKRW(row.netPay)}</td>
                            <td className="p-1 text-center">
                              <div className="erp-worker-vat-toggle flex flex-col items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={payWithVat ? "default" : "outline"}
                                  className={`h-7 rounded-lg px-2.5 text-xs ${payWithVat ? "bg-amber-600 hover:bg-amber-700" : ""}`}
                                  onClick={() => togglePaymentVat(row.worker, record)}
                                  aria-pressed={payWithVat}
                                  aria-label={`${row.worker} 부가세 포함 지급`}
                                >
                                  부가세+
                                </Button>
                                <span className="erp-text-caption text-slate-600">{payWithVat ? formatKRW(vatAmount) : "-"}</span>
                              </div>
                            </td>
                            <td className="text-right font-semibold">{formatKRW(finalPayAmount)}</td>
                            <td className="p-1">
                              <KoreanDateInput
                                className="erp-input-compact erp-worker-month-date"
                                placeholder="지급일"
                                value={paymentDate}
                                onChange={(event) => updatePaymentPaidDate(row.worker, event.target.value)}
                              />
                            </td>
                            <td className="text-left text-slate-500">{[row.bank, row.account].filter(Boolean).join(" ") || "-"}</td>
                            <td className="p-1 erp-table-export-skip">
                              <WorkerMonthlyStatementExport
                                worker={row.worker}
                                monthKey={selectedMonthKey}
                                rows={monthlyWorkerStatementRowsMap.get(row.worker) || []}
                                workerInfo={workers.find((workerRow) => workerRow.name === row.worker) || {}}
                              />
                            </td>
                            <td className="p-1">
                              <input
                                className="erp-input erp-input-compact w-full min-w-[8rem]"
                                value={record?.memo || ""}
                                onChange={(event) => updatePaymentMemo(row.worker, event.target.value)}
                                placeholder="메모"
                              />
                            </td>
                          </tr>
                        );
                      })}
                      {visibleMonthlyWorkerRows.length === 0 && (
                        <tr>
                          <td colSpan={12} className="p-8 text-center text-slate-500">
                            {monthlyWorkerRows.length ? "미지급 시공자가 없습니다." : "선택한 월에 지급 내역이 없습니다."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TableExportSection>
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === "detail" && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <SearchBox query={detailQuery} setQuery={setDetailQuery} placeholder="일자, 거래처, 현장, 시공자, 비고 검색" />
            </div>

            <div className="erp-receivable-totals-bar">
              <div className="erp-receivable-totals-group">
                <span className="erp-receivable-totals-label">상세 합계</span>
                <div className="erp-receivable-totals-items">
                  <div className="erp-receivable-totals-item">
                    <span>건수</span>
                    <b>{detailTotals.lineCount}</b>
                  </div>
                  <div className="erp-receivable-totals-item">
                    <span>지급</span>
                    <b>{formatKRW(detailTotals.grossPay)}</b>
                  </div>
                  <div className="erp-receivable-totals-item">
                    <span>수수료</span>
                    <b className="text-red-600">{formatKRW(detailTotals.fee)}</b>
                  </div>
                  <div className="erp-receivable-totals-item">
                    <span>실지급</span>
                    <b className="text-emerald-700">{formatKRW(detailTotals.netPay)}</b>
                  </div>
                </div>
              </div>
            </div>

            <TableExportSection
              fileName={statementWorker ? `시공자지급_${statementWorker}` : "시공자지급_상세"}
              title="시공자 지급 상세"
              disabled={scopedDetailRows.length === 0}
            >
            <div className="erp-table-wrap">
              <table className="erp-table erp-table--lg">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="text-left">일자</th>
                    <th className="text-left">전표</th>
                    <th className="text-left">거래처</th>
                    <th className="text-left">현장</th>
                    <th className="text-left">시공자</th>
                    <th className="text-right">인원</th>
                    <th className="text-right">지급단가</th>
                    <th className="text-right">시공비</th>
                    <th className="text-right">식대</th>
                    <th className="text-right">숙박</th>
                    <th className="text-right">경비</th>
                    <th className="text-right">야근</th>
                    <th className="text-right">지급합계</th>
                    <th className="text-right">수수료</th>
                    <th className="text-right">실지급</th>
                    <th className="text-left">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {scopedDetailRows.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-slate-50">
                      <td>{row.date}</td>
                      <td>{row.voucherNo}</td>
                      <td className="text-left font-semibold">{row.client}</td>
                      <td>{row.site || "-"}</td>
                      <td className="font-semibold">{row.worker}</td>
                      <td className="text-right">{row.quantity}</td>
                      <td className="text-right">{formatKRW(row.unitCost)}</td>
                      <td className="text-right">{formatKRW(row.basePay)}</td>
                      <td className="text-right">{row.meal ? formatKRW(row.meal) : "-"}</td>
                      <td className="text-right">{row.lodging ? formatKRW(row.lodging) : "-"}</td>
                      <td className="text-right">{row.expense ? formatKRW(row.expense) : "-"}</td>
                      <td className="text-right">{row.overtime ? formatKRW(row.overtime) : "-"}</td>
                      <td className="text-right font-semibold">{formatKRW(row.totalPay)}</td>
                      <td className="text-right text-red-600">{formatKRW(row.fee)}</td>
                      <td className="text-right font-bold text-emerald-600">{formatKRW(row.netPay)}</td>
                      <td>{row.memo || "-"}</td>
                    </tr>
                  ))}
                  {scopedDetailRows.length === 0 && (
                    <tr>
                      <td colSpan={16} className="p-8 text-center text-slate-500">
                        표시할 지급 상세가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </TableExportSection>
          </CardContent>
        </Card>
      )}

      {activeTab === "statement" && (
        <>
          {!statementSheetGenerated ? (
            <Card className="rounded-2xl border-dashed shadow-sm">
              <CardContent className="p-10 text-center erp-text-body text-slate-500">
                시공자와 기간을 선택한 뒤 <b className="text-slate-700">내역서 생성</b>을 누르면 시공내역서가 표시됩니다.
              </CardContent>
            </Card>
          ) : (
            <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard title="지급합계" value={formatKRW(workerStatementSummary.grossPay)} sub="시공비+부대비용" icon={WalletCards} />
            <SummaryCard title="수수료" value={formatKRW(workerStatementSummary.fee)} sub={`${Math.round((selectedWorkerInfo.feeRate || 0) * 100)}% 차감`} tone="danger" icon={CreditCard} />
            <SummaryCard title="실수령" value={formatKRW(workerStatementSummary.netPay)} sub="합계 - 수수료" tone="success" icon={CheckCircle2} />
          </div>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 md:p-5">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="erp-text-section font-black">시공내역서(개인)</h2>
                  <p className="mt-1 erp-text-body text-slate-500">엑셀 시공내역서 양식과 동일한 표로 미리보기 · PDF 생성</p>
                </div>
                <Button className="rounded-2xl" onClick={generateWorkerPdf} disabled={pdfGenerating || !statementWorker || !statementRows.length}>
                  <FileText size={16} className="mr-2" />
                  {pdfGenerating ? "PDF 생성 중..." : "PDF 생성"}
                </Button>
              </div>

              {pdfMessage && <p className="mb-3 text-sm text-slate-600">{pdfMessage}</p>}

              <TableExportSection
                fileName={`시공내역서_시공자_${statementWorker || "미선택"}`}
                title="시공자 시공내역서"
                hidePdf
                exportRootSelector="[data-pdf-export-root]"
                tableSelector=".excel-data-table"
                disabled={!statementWorker || !statementRows.length}
              >
              <div className="erp-statement-preview-wrap">
                <StatementA4Preview
                  layoutVersion={`w:${statementDisplayRows.length}:${statementDisplayRows.map((row) => row.id).join(",")}`}
                >
                  <WorkerStatementSheet
                    ref={workerPrintRef}
                    workerName={statementWorker || "시공자"}
                    workerInfo={selectedWorkerInfo}
                    periodStart={workerStatementPeriodStart}
                    periodEnd={workerStatementPeriodEnd}
                    summary={workerStatementSummary}
                    rows={statementDisplayRows}
                    totals={workerPrintTotals}
                    emptyMessage="선택 기간에 해당 시공자 내역이 없습니다."
                  />
                </StatementA4Preview>
              </div>
              </TableExportSection>
            </CardContent>
          </Card>
            </>
          )}
        </>
      )}

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <h2 className="erp-text-section">시공자별 실지급</h2>
            <span className="erp-text-caption text-slate-500">
              {chartPeriodLabel} · 실지급 합계 {formatKRW(chartNetPayTotal)} · 상위 30명
            </span>
          </div>
          <WorkerNetPayRankingChart rows={chartSummaryRows} emptyLabel={`${chartPeriodLabel} 실지급 내역이 없습니다.`} />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  sub,
  tone = "default",
  icon: Icon,
}: {
  title: string;
  value: string;
  sub: string;
  tone?: "default" | "success" | "danger" | "warning";
  icon: React.ComponentType<{ size?: number }>;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-red-600"
        : tone === "warning"
          ? "text-amber-600"
          : "text-slate-950";

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="flex items-start justify-between p-4 md:p-5">
        <div>
          <div className="erp-text-caption font-bold text-slate-500">{title}</div>
          <div className={`erp-text-title mt-1 font-black ${toneClass}`}>{value}</div>
          <div className="erp-text-caption mt-1 text-slate-500">{sub}</div>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">
          <Icon size={20} />
        </div>
      </CardContent>
    </Card>
  );
}
