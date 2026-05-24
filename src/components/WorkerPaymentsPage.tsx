import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CreditCard, Download, FileText, Search, WalletCards } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { WorkerStatementSheet } from "@/components/WorkerStatementSheet";
import { TableExportSection } from "@/components/TableExportSection";
import { createPdfPreviewWindow, downloadPdfFromHtmlElement, revokePdfBlobUrl } from "@/utils/statementPdf";
import { archiveGeneratedPdf } from "@/utils/pdfArchive";
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

type WorkerPaymentTab = "summary" | "detail" | "statement";

const TAB_ITEMS: Array<{ key: WorkerPaymentTab; label: string }> = [
  { key: "summary", label: "지급 집계" },
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

export function WorkerPaymentsPage({
  workers = [],
  sales = [],
}: {
  workers?: WorkerMasterLike[];
  sales?: Parameters<typeof flattenSalesToWorkerPaymentRows>[0];
}) {
  const [activeTab, setActiveTab] = useState<WorkerPaymentTab>("summary");
  const [dateFilter, setDateFilter] = useState({ startDate: monthStartISO(), endDate: todayISO() });
  const [selectedWorker, setSelectedWorker] = useState("");
  const [detailQuery, setDetailQuery] = useState("");
  const [pdfMessage, setPdfMessage] = useState("");
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState("");
  const [pdfFileName, setPdfFileName] = useState("");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const workerPrintRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => revokePdfBlobUrl(pdfDownloadUrl), [pdfDownloadUrl]);

  const filteredSales = useMemo(
    () => filterSalesByDate(sales, dateFilter.startDate, dateFilter.endDate),
    [sales, dateFilter.endDate, dateFilter.startDate]
  );

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

  const statementWorker = selectedWorker && selectedWorker !== "전체" ? selectedWorker : "";
  const statementRows = useMemo(
    () => (statementWorker ? detailRows.filter((row) => row.worker === statementWorker) : []),
    [detailRows, statementWorker]
  );

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

  const generateWorkerPdf = async () => {
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

    revokePdfBlobUrl(pdfDownloadUrl);
    setPdfGenerating(true);
    setPdfMessage("PDF 생성 중입니다...");
    setPdfDownloadUrl("");
    setPdfFileName("");

    const previewWindow = createPdfPreviewWindow();
    if (!previewWindow) {
      setPdfMessage("팝업이 차단되었습니다. 브라우저에서 팝업 허용 후 다시 시도해 주세요.");
    }

    try {
      const result = await downloadPdfFromHtmlElement(element, fileName, {
        orientation: "portrait",
        previewWindow,
      });
      setPdfDownloadUrl(result.blobUrl);
      setPdfFileName(result.fileName);
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
              <Field label="시작일">
                <input
                  type="date"
                  className="erp-input w-full"
                  value={dateFilter.startDate}
                  onChange={(e) => setDateFilter((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </Field>
              <Field label="종료일">
                <input
                  type="date"
                  className="erp-input w-full"
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
              <div className="flex items-end gap-2">
                <Button variant="outline" className="rounded-2xl" onClick={() => setDateFilter({ startDate: monthStartISO(), endDate: todayISO() })}>
                  이번 달
                </Button>
                <Button variant="outline" className="rounded-2xl" onClick={() => setDateFilter({ startDate: "", endDate: "" })}>
                  전체
                </Button>
              </div>
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
              {pdfDownloadUrl && (
                <a href={pdfDownloadUrl} download={pdfFileName} className="mb-4 inline-flex text-sm font-semibold text-emerald-700 underline">
                  {pdfFileName || "PDF 다운로드"}
                </a>
              )}

              <TableExportSection
                fileName={`시공내역서_시공자_${statementWorker || "미선택"}`}
                title="시공자 시공내역서"
                hidePdf
                tableSelector=".excel-data-table"
                disabled={!statementWorker || !statementRows.length}
              >
              <div className="erp-statement-preview-wrap">
                <WorkerStatementSheet
                  ref={workerPrintRef}
                  workerName={statementWorker || "시공자"}
                  workerInfo={selectedWorkerInfo}
                  periodStart={workerStatementPeriodStart}
                  periodEnd={workerStatementPeriodEnd}
                  summary={workerStatementSummary}
                  rows={statementRows}
                  totals={workerPrintTotals}
                  emptyMessage={
                    !statementWorker
                      ? "시공자를 선택하면 엑셀과 같은 시공내역서 표가 표시됩니다."
                      : "선택 기간에 해당 시공자 내역이 없습니다."
                  }
                />
              </div>
              </TableExportSection>
            </CardContent>
          </Card>
        </>
      )}
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
  tone?: "default" | "success" | "danger";
  icon: React.ComponentType<{ size?: number }>;
}) {
  const toneClass =
    tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-red-600" : "text-slate-950";

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
