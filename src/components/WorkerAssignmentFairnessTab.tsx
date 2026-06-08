import React, { useMemo } from "react";
import { Scale, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TableExportSection } from "@/components/TableExportSection";
import {
  buildWorkerAssignmentFairness,
  formatWorkerAssignmentDelta,
  type WorkerAssignmentFairnessRow,
} from "@/utils/workerAssignmentFairness";
import { formatKRW, summarizeWorkerPaymentRows, type WorkerPaymentDetailRow } from "@/utils/workerPayments";
import { formatMonthLabel } from "@/utils/workerMonthlyPayments";

const LABEL_COUNT = "\uAC74";
const LABEL_WORKER = "\uC2DC\uACF5\uC790";
const LABEL_MONTH_AVG = "\uC6D4 \uD3C9\uADFC";
const LABEL_VS_AVG = "\uD3C9\uADFC \uB300\uBE44";
const LABEL_NET_PAY = "\uC2E4\uC9C0\uAE09";
const LABEL_PRIORITY = "\uBC30\uCE58 \uC6B0\uC120\uC21C\uC704";
const LABEL_PARTICIPATION = "\uCC38\uC5EC\uAC74\uC218";
const LABEL_BASE_MONTH = "\uAE30\uC900 \uC6D4";
const LABEL_AVG = "\uD3C9\uADFC";
const LABEL_ACTIVE = "\uD65C\uC131";
const LABEL_PEOPLE = "\uBA85";
const LABEL_BELOW_AVG = "\uD3C9\uADFC \uC774\uD558";
const LABEL_ABOVE_AVG = "\uD3C9\uADFC \uC774\uC0C1";
const LABEL_TOTAL_PARTICIPATION = "\uCD1D \uCC38\uC5EC";
const LABEL_MAX_DEVIATION = "\uCD5C\uB300 \uD3B8\uCC28";
const LABEL_ASSIGN_FIRST = "\uB2E4\uC74C \uBC30\uCE58 \uC6B0\uC120 \uAC80\uD1A0";
const LABEL_ASSIGN_ADJUST = "\uBC30\uCE58 \uC5EC\uC720 \uB610\uB294 \uC870\uC815";
const LABEL_MONTH_AVG_PARTICIPATION = "\uC6D4 \uD3C9\uADFC \uCC38\uC5EC";
const LABEL_BY_WORKER = "\uC2DC\uACF5\uC790\uBCF4 \uCC38\uC5EC \uAC74\uC218";
const LABEL_FAIRNESS = "\uBC30\uCE58 \uACF5\uC815\uB3C4";
const LABEL_TOP30 = "\uC0C1\uC704 30\uBA85";
const LABEL_NO_DATA = "\uCC38\uC5EC \uAC74\uC218 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
const LABEL_NO_MONTH_DATA = "\uC120\uD0DD\uD55C \uC6D4\uC5D0 \uC2DC\uACF5\uC790 \uCC38\uC5EC \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
const LABEL_DESC =
  "\uB9E4\uCD9C \uC804\uD45C \uAE30\uC900 \uCC38\uC5EC \uAC74\uC218(1\uD589=1\uAC74)\uB85C \uC6D4 \uD3C9\uADFC\uC744 \uACC4\uC0B0\uD558\uACE0, \uB2E4\uC74C \uD604\uC7A5 \uBC30\uCE58 \uC6B0\uC120\uC21C\uC704\uB97C \uC81C\uC548\uD569\uB2C8\uB2E4.";

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
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-500">
          <Icon size={20} />
        </div>
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ row }: { row: WorkerAssignmentFairnessRow }) {
  return (
    <span className={`erp-worker-fairness-priority is-${row.priority}`} title={row.priorityLabel}>
      {row.priorityLabel}
    </span>
  );
}

function WorkerParticipationFairnessChart({
  rows,
  averageLineCount,
  limit = 30,
}: {
  rows: WorkerAssignmentFairnessRow[];
  averageLineCount: number;
  limit?: number;
}) {
  const visibleRows = useMemo(
    () => rows.filter((row) => row.lineCount > 0).slice(0, limit),
    [rows, limit],
  );
  const maxLineCount = useMemo(
    () => Math.max(...visibleRows.map((row) => row.lineCount), averageLineCount, 1),
    [visibleRows, averageLineCount],
  );

  const barHeight = (value: number) => {
    if (!value) return 0;
    return Math.max((value / maxLineCount) * 100, 12);
  };

  const averageHeight = averageLineCount > 0 ? Math.max((averageLineCount / maxLineCount) * 100, 4) : 0;

  if (!visibleRows.length) {
    return <p className="erp-text-body py-8 text-center text-slate-500">{LABEL_NO_DATA}</p>;
  }

  return (
    <div className="erp-worker-fairness-chart" aria-label={LABEL_BY_WORKER}>
      <div className="erp-worker-fairness-chart-average">
        <span
          className="erp-worker-fairness-chart-average-line"
          style={{ bottom: `${averageHeight}%` }}
          title={`${LABEL_MONTH_AVG} ${averageLineCount}${LABEL_COUNT}`}
        />
        <span className="erp-worker-fairness-chart-average-label" style={{ bottom: `${averageHeight}%` }}>
          {LABEL_AVG} {averageLineCount}
          {LABEL_COUNT}
        </span>
      </div>
      <div
        className="erp-worker-netpay-chart-grid"
        style={{ ["--worker-netpay-count" as string]: String(visibleRows.length) }}
      >
        {visibleRows.map((row) => (
          <div
            key={row.name}
            className="erp-worker-netpay-chart-col"
            title={`${row.name} \u00B7 ${row.lineCount}${LABEL_COUNT} \u00B7 ${LABEL_VS_AVG} ${formatWorkerAssignmentDelta(row.deltaFromAverage)}`}
          >
            <div className="erp-worker-netpay-chart-bar-wrap">
              <span className="erp-worker-netpay-chart-value">
                {row.lineCount}
                {LABEL_COUNT}
              </span>
              <span
                className={`erp-worker-fairness-chart-bar has-value is-${row.priority}`}
                style={{ height: `${barHeight(row.lineCount)}%` }}
              />
            </div>
            <span className="erp-worker-netpay-chart-label">{row.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkerAssignmentFairnessTab({
  monthKey,
  setMonthKey,
  monthlyDetailRows,
  workers,
}: {
  monthKey: string;
  setMonthKey: (value: string) => void;
  monthlyDetailRows: WorkerPaymentDetailRow[];
  workers: Parameters<typeof summarizeWorkerPaymentRows>[1];
}) {
  const summaryRows = useMemo(
    () => summarizeWorkerPaymentRows(monthlyDetailRows, workers),
    [monthlyDetailRows, workers],
  );

  const { summary, rows } = useMemo(
    () => buildWorkerAssignmentFairness(summaryRows, monthKey),
    [summaryRows, monthKey],
  );

  const exportRows = rows.map((row) => ({
    [LABEL_WORKER]: row.name,
    [LABEL_PARTICIPATION]: row.lineCount,
    [LABEL_MONTH_AVG]: summary.averageLineCount,
    [LABEL_VS_AVG]: formatWorkerAssignmentDelta(row.deltaFromAverage),
    [LABEL_NET_PAY]: row.netPay,
    [LABEL_PRIORITY]: row.priorityLabel,
  }));

  return (
    <>
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="erp-payment-hub-filter">
              <span className="erp-text-caption font-bold text-slate-500">{LABEL_BASE_MONTH}</span>
              <input
                type="month"
                className="erp-input rounded-xl border px-3 py-2"
                value={monthKey}
                onChange={(event) => setMonthKey(event.target.value)}
              />
            </label>
            <p className="erp-text-caption text-slate-500">{LABEL_DESC}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title={LABEL_MONTH_AVG_PARTICIPATION}
          value={`${summary.averageLineCount}${LABEL_COUNT}`}
          sub={`${formatMonthLabel(monthKey)} \u00B7 ${LABEL_ACTIVE} ${summary.activeWorkerCount}${LABEL_PEOPLE}`}
          icon={Scale}
        />
        <SummaryCard
          title={LABEL_BELOW_AVG}
          value={`${summary.belowAverageCount}${LABEL_PEOPLE}`}
          sub={LABEL_ASSIGN_FIRST}
          tone="warning"
          icon={TrendingDown}
        />
        <SummaryCard
          title={LABEL_ABOVE_AVG}
          value={`${summary.aboveAverageCount}${LABEL_PEOPLE}`}
          sub={LABEL_ASSIGN_ADJUST}
          tone="success"
          icon={TrendingUp}
        />
        <SummaryCard
          title={LABEL_TOTAL_PARTICIPATION}
          value={`${summary.totalLineCount}${LABEL_COUNT}`}
          sub={`${LABEL_MAX_DEVIATION} ${summary.maxAbsDelta}${LABEL_COUNT}`}
          icon={Users}
        />
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <h2 className="erp-text-section">{LABEL_BY_WORKER}</h2>
            <span className="erp-text-caption text-slate-500">
              {formatMonthLabel(monthKey)} \u00B7 {LABEL_AVG} {summary.averageLineCount}
              {LABEL_COUNT} \u00B7 {LABEL_TOP30}
            </span>
          </div>
          <WorkerParticipationFairnessChart rows={rows} averageLineCount={summary.averageLineCount} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <TableExportSection
            fileName={`\uC2DC\uACF5\uC790_\uBC30\uCE58\uACF5\uC815\uB3C4_${monthKey}`}
            title={`\uC2DC\uACF5\uC790 ${LABEL_FAIRNESS}`}
            disabled={rows.length === 0}
            rows={exportRows}
          >
            <div className="erp-table-wrap">
              <table className="erp-table erp-table--lg">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="text-left">{LABEL_WORKER}</th>
                    <th className="text-right">{LABEL_PARTICIPATION}</th>
                    <th className="text-right">{LABEL_MONTH_AVG}</th>
                    <th className="text-right">{LABEL_VS_AVG}</th>
                    <th className="text-right">{LABEL_NET_PAY}</th>
                    <th className="text-center">{LABEL_PRIORITY}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.name} className="border-t">
                      <td className="font-bold">{row.name}</td>
                      <td className="text-right tabular-nums">{row.lineCount}</td>
                      <td className="text-right tabular-nums text-slate-500">{summary.averageLineCount}</td>
                      <td
                        className={`text-right font-bold tabular-nums ${
                          row.deltaFromAverage <= -0.5
                            ? "text-amber-700"
                            : row.deltaFromAverage >= 0.5
                              ? "text-emerald-700"
                              : "text-slate-600"
                        }`}
                      >
                        {formatWorkerAssignmentDelta(row.deltaFromAverage)}
                      </td>
                      <td className="text-right tabular-nums">{formatKRW(row.netPay)}</td>
                      <td className="text-center">
                        <PriorityBadge row={row} />
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        {LABEL_NO_MONTH_DATA}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </TableExportSection>
        </CardContent>
      </Card>
    </>
  );
}
