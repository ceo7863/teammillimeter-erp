import React, { useMemo, useState } from "react";
import { CheckCircle2, CreditCard, FileText, Search, WalletCards } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { TableExportSection } from "@/components/TableExportSection";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { WorkerStatementTab } from "@/components/WorkerStatementTab";
import { WorkerAssignmentFairnessTab } from "@/components/WorkerAssignmentFairnessTab";
import { buildWorkerAssignmentFairness } from "@/utils/workerAssignmentFairness";
import {
  filterSalesByDate,
  flattenSalesToWorkerPaymentRows,
  formatKRW,
  monthStartISO,
  summarizeWorkerPaymentDetailTotals,
  summarizeWorkerPaymentRows,
  todayISO,
  type WorkerMasterLike,
  type WorkerMonthlyPaymentMemos,
  type WorkerPaymentDetailRow,
  type WorkerPaymentSummaryRow,
} from "@/utils/workerPayments";
import {
  formatMonthLabel,
  type WorkerMonthlyPaymentRecord,
} from "@/utils/workerMonthlyPayments";
import { WorkerPayoutHistoryTab } from "@/components/WorkerPayoutHistoryTab";
import { WorkerMonthlyActualPaymentTab } from "@/components/WorkerMonthlyActualPaymentTab";
import { WorkerMonthlyPaymentTab } from "@/components/WorkerMonthlyPaymentTab";
import {
  buildWorkerMonthlyObligationNetPayChartRows,
  buildWorkerMonthlyObligations,
  summarizeWorkerMonthlyMonthHubTotals,
  type WorkerMonthlyActualVoucher,
  type WorkerPayWithVatLearnRule,
} from "@/utils/workerMonthlyActualPayments";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import type { WorkerPayoutVoucher } from "@/utils/workerPayoutLedger";
import type { WorkerPortalStatementAck } from "@/utils/workerPortalAcknowledgment";

type WorkerPaymentTab =
  | "summary"
  | "detail"
  | "monthly"
  | "monthlyActual"
  | "statement"
  | "payoutHistory"
  | "assignmentFairness";

const TAB_ITEMS: Array<{ key: WorkerPaymentTab; label: string }> = [
  { key: "summary", label: "지급 집계" },
  { key: "monthly", label: "월별 지급" },
  { key: "monthlyActual", label: "\uC6D4 \uC2E4\uC9C0\uAE09" },
  { key: "detail", label: "시공자별 상세" },
  { key: "assignmentFairness", label: "\uBC30\uCE58\uACF5\uC815\uB3C4" },
  { key: "payoutHistory", label: "\uC9C0\uAE09\uB0B4\uC5ED" },
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
          <div
            key={row.name}
            className="erp-worker-netpay-chart-col"
            title={`${row.name} · ${row.lineCount}건 · 실지급 ${formatKRW(row.netPay)}`}
          >
            <div className="erp-worker-netpay-chart-bar-wrap">
              <span className="erp-worker-netpay-chart-value">{formatCompactKRW(row.netPay)}</span>
              <span className="erp-worker-netpay-chart-count">{row.lineCount}건</span>
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
  workerPortalStatementAcks = [],
  workerMonthlyPaymentMemos = {},
  sales = [],
  workerPaymentRecords = [],
  setWorkerPaymentRecords,
  bankTransactions = [],
  bankTransactionFolders = [],
  workerPayoutVouchers = [],
  setWorkerPayoutVouchers,
  workerMonthlyActualVouchers = [],
  setWorkerMonthlyActualVouchers,
  workerPayWithVatLearnRules = [],
  setWorkerPayWithVatLearnRules,
  setBankTransactions,
  setWorkers,
  onPersistWorkersImmediate,
  onPersistWorkerMonthlyMemoImmediate,
  onPersistWorkerMonthlyLinksImmediate,
  onPersistBankTransactionMemoUpdates,
  onRequestImmediateSave,
  currentUser,
}: {
  workers?: WorkerMasterLike[];
  workerPortalStatementAcks?: WorkerPortalStatementAck[];
  workerMonthlyPaymentMemos?: WorkerMonthlyPaymentMemos;
  sales?: Parameters<typeof flattenSalesToWorkerPaymentRows>[0];
  workerPaymentRecords?: WorkerMonthlyPaymentRecord[];
  setWorkerPaymentRecords?: React.Dispatch<React.SetStateAction<WorkerMonthlyPaymentRecord[]>>;
  bankTransactions?: BankTransaction[];
  bankTransactionFolders?: BankTransactionFolder[];
  workerPayoutVouchers?: WorkerPayoutVoucher[];
  setWorkerPayoutVouchers?: React.Dispatch<React.SetStateAction<WorkerPayoutVoucher[]>>;
  workerMonthlyActualVouchers?: WorkerMonthlyActualVoucher[];
  setWorkerMonthlyActualVouchers?: React.Dispatch<React.SetStateAction<WorkerMonthlyActualVoucher[]>>;
  workerPayWithVatLearnRules?: WorkerPayWithVatLearnRule[];
  setWorkerPayWithVatLearnRules?: React.Dispatch<React.SetStateAction<WorkerPayWithVatLearnRule[]>>;
  setBankTransactions?: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  setWorkers?: React.Dispatch<React.SetStateAction<WorkerMasterLike[]>>;
  onPersistWorkersImmediate?: (nextWorkers: WorkerMasterLike[]) => boolean | void | Promise<boolean | void>;
  onPersistWorkerMonthlyMemoImmediate?: (
    workerId: number | string,
    memo: string,
  ) => boolean | Promise<boolean>;
  onPersistWorkerMonthlyLinksImmediate?: (patch: {
    workerMonthlyActualVouchers: WorkerMonthlyActualVoucher[];
    bankTransactions: BankTransaction[];
    workerPaymentRecords?: WorkerMonthlyPaymentRecord[];
  }) => void | Promise<void>;
  onPersistBankTransactionMemoUpdates?: (
    updates: Record<string, string>,
  ) => boolean | Promise<boolean>;
  onRequestImmediateSave?: (patch: {
    bankTransactions?: BankTransaction[];
    workers?: WorkerMasterLike[];
    workerMonthlyPaymentMemos?: WorkerMonthlyPaymentMemos;
  }) => void | Promise<boolean>;
  currentUser?: { name?: string; email?: string };
}) {
  const [activeTab, setActiveTab] = useState<WorkerPaymentTab>("summary");
  const [dateFilter, setDateFilter] = useState({ startDate: monthStartISO(), endDate: todayISO() });
  const [selectedWorker, setSelectedWorker] = useState("");
  const [detailQuery, setDetailQuery] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => monthStartISO().slice(0, 7));
  const [monthlyActualFocus, setMonthlyActualFocus] = useState<{ worker: string; voucherId?: string } | null>(null);
  const filteredSales = useMemo(
    () => filterSalesByDate(sales, dateFilter.startDate, dateFilter.endDate),
    [sales, dateFilter.endDate, dateFilter.startDate]
  );

  const allDetailRows = useMemo(
    () => flattenSalesToWorkerPaymentRows(sales, workers),
    [sales, workers]
  );

  const openMonthlyActual = (worker: string, voucherId?: string) => {
    setMonthlyActualFocus({ worker, voucherId });
    setActiveTab("monthlyActual");
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

  const monthlyObligations = useMemo(
    () =>
      buildWorkerMonthlyObligations(
        allDetailRows,
        workers,
        workerMonthlyActualVouchers,
        workerPaymentRecords,
        workerPayWithVatLearnRules,
      ),
    [allDetailRows, workerMonthlyActualVouchers, workerPaymentRecords, workerPayWithVatLearnRules, workers],
  );

  const monthlyHubTotals = useMemo(
    () => summarizeWorkerMonthlyMonthHubTotals(monthlyObligations, workers, selectedMonthKey),
    [monthlyObligations, selectedMonthKey, workers],
  );

  const monthlySalesRows = useMemo(
    () => allDetailRows.filter((row) => String(row.date || "").slice(0, 7) === selectedMonthKey),
    [allDetailRows, selectedMonthKey],
  );

  const monthlySalesTotals = useMemo(
    () => summarizeWorkerPaymentDetailTotals(monthlySalesRows),
    [monthlySalesRows],
  );

  const statementMonthSummaryRows = useMemo(
    () => summarizeWorkerPaymentRows(monthlySalesRows, workers),
    [monthlySalesRows, workers],
  );

  const statementMonthNetPayTotal = useMemo(
    () =>
      statementMonthSummaryRows.reduce((sum, row) => sum + (row.lineCount > 0 ? row.netPay : 0), 0),
    [statementMonthSummaryRows],
  );

  const statementMonthWorkerCount = useMemo(
    () => statementMonthSummaryRows.filter((row) => row.lineCount > 0).length,
    [statementMonthSummaryRows],
  );

  const assignmentFairness = useMemo(
    () => buildWorkerAssignmentFairness(statementMonthSummaryRows, selectedMonthKey),
    [selectedMonthKey, statementMonthSummaryRows],
  );

  const hubMetrics = useMemo(() => {
    if (activeTab === "monthly") {
      return {
        items: [
          { label: "매출 지급", value: monthlySalesTotals.grossPay, tone: "default" as const },
          { label: "매출 수수료", value: monthlySalesTotals.fee, tone: "danger" as const },
          { label: "매출 실지급", value: monthlySalesTotals.netPay, tone: "default" as const },
          { label: "월별 예정", value: monthlyHubTotals.expectedTotal, tone: "default" as const },
          { label: "월별 지급", value: monthlyHubTotals.paidTotal, tone: "highlight" as const },
          { label: "월별 미지급", value: monthlyHubTotals.balanceTotal, tone: "danger" as const },
        ],
      };
    }
    if (activeTab === "statement") {
      return {
        items: [
          { label: "대상 시공자", value: statementMonthWorkerCount, tone: "default" as const, format: "count" as const },
          { label: "지급합계", value: monthlySalesTotals.grossPay, tone: "default" as const },
          { label: "실수령", value: statementMonthNetPayTotal, tone: "highlight" as const },
        ],
      };
    }
    if (activeTab === "assignmentFairness") {
      return {
        items: [
          {
            label: "월 평균 참여",
            value: assignmentFairness.summary.averageLineCount,
            tone: "default" as const,
            format: "lineCount" as const,
          },
          {
            label: "평균 이하",
            value: assignmentFairness.summary.belowAverageCount,
            tone: "warning" as const,
            format: "count" as const,
          },
          {
            label: "평균 이상",
            value: assignmentFairness.summary.aboveAverageCount,
            tone: "highlight" as const,
            format: "count" as const,
          },
          {
            label: "총 참여",
            value: assignmentFairness.summary.totalLineCount,
            tone: "default" as const,
            format: "lineCount" as const,
          },
        ],
      };
    }
    return {
      items: [
        { label: "지급", value: headerTotals.grossPay, tone: "default" as const },
        { label: "수수료", value: headerTotals.fee, tone: "danger" as const },
        { label: "실지급", value: headerTotals.netPay, tone: "highlight" as const },
      ],
    };
  }, [
    activeTab,
    headerTotals,
    monthlyHubTotals,
    monthlySalesTotals,
    statementMonthNetPayTotal,
    statementMonthWorkerCount,
    assignmentFairness,
  ]);

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

  const salesChartSummaryRows = useMemo(
    () => summarizeWorkerPaymentRows(detailRows, workers),
    [detailRows, workers],
  );

  const monthlyChartSummaryRows = useMemo(
    () => buildWorkerMonthlyObligationNetPayChartRows(monthlyObligations, workers, selectedMonthKey),
    [monthlyObligations, selectedMonthKey, workers],
  );

  const monthlySalesChartSummaryRows = useMemo(
    () => summarizeWorkerPaymentRows(monthlySalesRows, workers),
    [monthlySalesRows, workers],
  );

  const chartSummaryRows = activeTab === "monthly" ? monthlyChartSummaryRows : salesChartSummaryRows;

  const monthlySalesChartNetPayTotal = useMemo(
    () => monthlySalesChartSummaryRows.reduce((sum, row) => sum + (row.netPay > 0 ? row.netPay : 0), 0),
    [monthlySalesChartSummaryRows],
  );

  const monthlySalesChartLineCountTotal = useMemo(
    () => monthlySalesChartSummaryRows.reduce((sum, row) => sum + (row.netPay > 0 ? row.lineCount : 0), 0),
    [monthlySalesChartSummaryRows],
  );

  const chartPeriodLabel = useMemo(() => {
    if (activeTab === "monthly" || activeTab === "statement") return formatMonthLabel(selectedMonthKey);
    if (dateFilter.startDate || dateFilter.endDate) {
      return `${dateFilter.startDate || "전체"} ~ ${dateFilter.endDate || "전체"}`;
    }
    return "전체 기간";
  }, [activeTab, dateFilter.endDate, dateFilter.startDate, selectedMonthKey]);

  const chartNetPayTotal = useMemo(
    () =>
      activeTab === "monthly"
        ? monthlyHubTotals.netPayTotal
        : chartSummaryRows.reduce((sum, row) => sum + (row.netPay > 0 ? row.netPay : 0), 0),
    [activeTab, chartSummaryRows, monthlyHubTotals.netPayTotal],
  );

  const chartLineCountTotal = useMemo(
    () => chartSummaryRows.reduce((sum, row) => sum + (row.netPay > 0 ? row.lineCount : 0), 0),
    [chartSummaryRows],
  );

  const chartDataSourceLabel =
    activeTab === "monthly" ? "월별 지급 예정(실지급)" : activeTab === "statement" ? "월별 매출 실지급" : "매출 기간 실지급";

  const openWorkerDetail = (row: WorkerPaymentSummaryRow) => {
    setSelectedWorker(row.name);
    setActiveTab("detail");
  };

  return (
    <div className="erp-page erp-payment-hub-page">
      <div className="erp-payment-hub-head">
        <div>
          <h1 className="erp-payment-hub-title">시공자 지급</h1>
          <p className="erp-payment-hub-desc">지급 집계 · 시공자별 상세 · 내역서 PDF를 한 화면에서 처리합니다.</p>
        </div>
        <div className="erp-payment-hub-metrics">
          {hubMetrics.items.map((metric) => (
            <div
              key={metric.label}
              className={`erp-payment-hub-metric${metric.tone === "highlight" ? " is-highlight" : ""}`}
            >
              <span className="label">{metric.label}</span>
              <span
                className={`value${
                  metric.tone === "danger"
                    ? " text-red-600"
                    : metric.tone === "highlight"
                      ? " text-emerald-700"
                      : ""
                }`}
              >
                {"format" in metric && metric.format === "count"
                  ? `${metric.value}명`
                  : "format" in metric && metric.format === "lineCount"
                    ? `${metric.value}건`
                    : formatKRW(metric.value)}
              </span>
            </div>
          ))}
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
              {activeTab !== "monthly" &&
              activeTab !== "statement" &&
              activeTab !== "assignmentFairness" ? (
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
                  {activeTab === "detail" && (
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
                </>
              ) : null}
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
        <WorkerMonthlyPaymentTab
          workers={workers}
          workerPortalStatementAcks={workerPortalStatementAcks}
          sales={sales}
          workerPaymentRecords={workerPaymentRecords}
          workerMonthlyActualVouchers={workerMonthlyActualVouchers}
          workerPayWithVatLearnRules={workerPayWithVatLearnRules}
          selectedMonthKey={selectedMonthKey}
          setSelectedMonthKey={setSelectedMonthKey}
          onOpenMonthlyActual={openMonthlyActual}
        />
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
              fileName={selectedWorker ? `시공자지급_${selectedWorker}` : "시공자지급_상세"}
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

      {activeTab === "monthlyActual" && (
        <WorkerMonthlyActualPaymentTab
          workers={workers}
          workerMonthlyPaymentMemos={workerMonthlyPaymentMemos}
          sales={sales}
          workerPaymentRecords={workerPaymentRecords}
          setWorkerPaymentRecords={setWorkerPaymentRecords}
          workerMonthlyActualVouchers={workerMonthlyActualVouchers}
          setWorkerMonthlyActualVouchers={setWorkerMonthlyActualVouchers}
          workerPayWithVatLearnRules={workerPayWithVatLearnRules}
          setWorkerPayWithVatLearnRules={setWorkerPayWithVatLearnRules}
          workerPayoutVouchers={workerPayoutVouchers}
          setWorkerPayoutVouchers={setWorkerPayoutVouchers}
          bankTransactions={bankTransactions}
          bankTransactionFolders={bankTransactionFolders}
          setBankTransactions={setBankTransactions}
          setWorkers={setWorkers}
          onPersistWorkersImmediate={onPersistWorkersImmediate}
          onPersistWorkerMonthlyMemoImmediate={onPersistWorkerMonthlyMemoImmediate}
          onPersistWorkerMonthlyLinksImmediate={onPersistWorkerMonthlyLinksImmediate}
          onPersistBankTransactionMemoUpdates={onPersistBankTransactionMemoUpdates}
          onRequestImmediateSave={onRequestImmediateSave}
          selectedMonthKey={selectedMonthKey}
          setSelectedMonthKey={setSelectedMonthKey}
          focusWorker={monthlyActualFocus?.worker}
          focusVoucherId={monthlyActualFocus?.voucherId || null}
          onFocusConsumed={() => setMonthlyActualFocus(null)}
          currentUser={currentUser}
        />
      )}

      {activeTab === "payoutHistory" && (
        <WorkerPayoutHistoryTab
          workers={workers}
          bankTransactions={bankTransactions}
          bankTransactionFolders={bankTransactionFolders}
          workerPayoutVouchers={workerPayoutVouchers}
          setWorkerPayoutVouchers={setWorkerPayoutVouchers}
          dateFilter={dateFilter}
          currentUser={currentUser}
        />
      )}

      {activeTab === "statement" && (
        <WorkerStatementTab
          allDetailRows={allDetailRows}
          workers={workers}
          workerPortalStatementAcks={workerPortalStatementAcks}
          monthKey={selectedMonthKey}
          setMonthKey={setSelectedMonthKey}
        />
      )}

      {activeTab === "assignmentFairness" && (
        <WorkerAssignmentFairnessTab
          monthKey={selectedMonthKey}
          setMonthKey={setSelectedMonthKey}
          monthlyDetailRows={monthlySalesRows}
          workers={workers}
        />
      )}

      {activeTab === "monthly" ? (
        <>
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 md:p-5">
              <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <h2 className="erp-text-section">시공자별 매출 실지급</h2>
                <span className="erp-text-caption text-slate-500">
                  {chartPeriodLabel} · 매출 기간 실지급 · 합계 {formatKRW(monthlySalesChartNetPayTotal)} · {monthlySalesChartLineCountTotal}건 · 상위 30명
                </span>
              </div>
              <WorkerNetPayRankingChart
                rows={monthlySalesChartSummaryRows}
                emptyLabel={`${chartPeriodLabel} 매출 실지급 내역이 없습니다.`}
              />
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 md:p-5">
              <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <h2 className="erp-text-section">시공자별 월별 지급 실지급</h2>
                <span className="erp-text-caption text-slate-500">
                  {chartPeriodLabel} · 월별 지급 예정(실지급) · 합계 {formatKRW(chartNetPayTotal)} · {chartLineCountTotal}건 · 상위 30명
                </span>
              </div>
              <WorkerNetPayRankingChart
                rows={monthlyChartSummaryRows}
                emptyLabel={`${chartPeriodLabel} 월별 지급 내역이 없습니다.`}
              />
            </CardContent>
          </Card>
        </>
      ) : activeTab !== "assignmentFairness" ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <h2 className="erp-text-section">시공자별 실지급</h2>
              <span className="erp-text-caption text-slate-500">
                {chartPeriodLabel} · {chartDataSourceLabel} · 합계 {formatKRW(chartNetPayTotal)} · {chartLineCountTotal}건 · 상위 30명
              </span>
            </div>
            <WorkerNetPayRankingChart
              rows={chartSummaryRows}
              emptyLabel={`${chartPeriodLabel} 실지급 내역이 없습니다.`}
            />
          </CardContent>
        </Card>
      ) : null}
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
