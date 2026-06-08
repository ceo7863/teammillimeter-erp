import React, { useMemo } from "react";
import { Scale, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TableExportSection } from "@/components/TableExportSection";
import {
  buildWorkerAssignmentFairness,
  filterWorkerAssignmentFairnessDetailRows,
  formatWorkerAssignmentDelta,
  summarizeWorkerAssignmentFairnessRows,
  type WorkerAssignmentFairnessRow,
} from "@/utils/workerAssignmentFairness";
import type { WorkerPaymentDetailRow } from "@/utils/workerPayments";
import { formatMonthLabel, shiftMonthKey } from "@/utils/workerMonthlyPayments";

const LABEL_COUNT = "\uAC74";
const LABEL_WORKER = "\uC2DC\uACF5\uC790";
const LABEL_MONTH_AVG = "\uC6D4 \uD3C9\uADFC";
const LABEL_VS_AVG = "\uD3C9\uADFC \uB300\uBE44";
const LABEL_PRIORITY = "\uBC30\uCE58 \uC6B0\uC120\uC21C\uC704";
const LABEL_PARTICIPATION = "\uCC38\uC5EC\uAC74\uC218";
const LABEL_PREV_MONTH = "\uC804\uC6D4 \uCC38\uC5EC";
const LABEL_CURRENT_MONTH = "\uB2F9\uC6D4 \uCC38\uC5EC";
const LABEL_TWO_MONTH_SUM = "2\uAC1C\uC6D4 \uD569\uACC4";
const LABEL_TWO_MONTH_AVG = "2\uAC1C\uC6D4 \uD3C9\uADFC";
const LABEL_BASE_MONTH = "\uAE30\uC900 \uC6D4";
const LABEL_AVG = "\uD3C9\uADFC";
const LABEL_ACTIVE = "\uCC38\uC5EC";
const LABEL_PEOPLE = "\uBA85";
const LABEL_TEAM = "\uD300\uC6D0";
const LABEL_BELOW_AVG = "\uD3C9\uADFC \uC774\uD558";
const LABEL_ABOVE_AVG = "\uD3C9\uADFC \uC774\uC0C1";
const LABEL_TOTAL_PARTICIPATION = "\uCD1D \uCC38\uC5EC";
const LABEL_MAX_DEVIATION = "\uCD5C\uB300 \uD3B8\uCC28";
const LABEL_ASSIGN_FIRST = "\uB2E4\uC74C \uBC30\uCE58 \uC6B0\uC120 \uAC80\uD1A0";
const LABEL_ASSIGN_ADJUST = "\uBC30\uCE58 \uC5EC\uC720 \uB610\uB294 \uC870\uC815";
const LABEL_TWO_MONTH_AVG_PARTICIPATION = "2\uAC1C\uC6D4 \uD3C9\uADFC \uCC38\uC5EC";
const LABEL_BY_WORKER = "\uC2DC\uACF5\uC790\uBCF4 \uCC38\uC5EC \uAC74\uC218";
const LABEL_FAIRNESS = "\uBC30\uCE58 \uACF5\uC815\uB3C4";
const LABEL_ALL_WORKERS = LABEL_TEAM;
const LABEL_NO_DATA = "\uD300\uC6D0 \uCC38\uC5EC \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
const LABEL_NO_MONTH_DATA = "\uC120\uD0DD\uD55C \uAE30\uC900\uC5D0 \uD300\uC6D0 \uCC38\uC5EC \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
const LABEL_DESC =
  "\uD65C\uC131 \uD300\uC6D0\uAE30\uC900 \uC804\uC6D4+\uB2F9\uC6D4 \uCC38\uC5EC \uAC74\uC218(1\uD589=1\uAC74)\uB85C 2\uAC1C\uC6D4 \uD3C9\uADFC\uACFC \uBC30\uCE58 \uC6B0\uC120\uC21C\uC704\uB97C \uACC4\uC0B0\uD569\uB2C8\uB2E4. \uAE08\uC561\uC740 \uC0AC\uC6A9\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.";

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
  prevMonthLabel,
  currentMonthLabel,
}: {
  rows: WorkerAssignmentFairnessRow[];
  averageLineCount: number;
  prevMonthLabel: string;
  currentMonthLabel: string;
}) {
  const maxTwoMonthLineCount = useMemo(
    () => Math.max(...rows.map((row) => row.twoMonthLineCount), averageLineCount, 1),
    [rows, averageLineCount],
  );

  const stackHeight = (value: number) => {
    if (!value) return 0;
    return Math.max((value / maxTwoMonthLineCount) * 100, 12);
  };

  const averageHeight = averageLineCount > 0 ? Math.max((averageLineCount / maxTwoMonthLineCount) * 100, 4) : 0;

  if (!rows.length) {
    return <p className="erp-text-body py-8 text-center text-slate-500">{LABEL_NO_DATA}</p>;
  }

  return (
    <div className="erp-worker-fairness-chart" aria-label={LABEL_BY_WORKER}>
      <div className="erp-worker-fairness-chart-legend">
        <span className="erp-worker-fairness-chart-legend-item">
          <span className="erp-worker-fairness-chart-legend-swatch is-prev" />
          {prevMonthLabel}
        </span>
        <span className="erp-worker-fairness-chart-legend-item">
          <span className="erp-worker-fairness-chart-legend-swatch is-current" />
          {currentMonthLabel}
        </span>
      </div>
      <div className="erp-worker-fairness-chart-average">
        <span
          className="erp-worker-fairness-chart-average-line"
          style={{ bottom: `${averageHeight}%` }}
          title={`${LABEL_TWO_MONTH_AVG} ${averageLineCount}${LABEL_COUNT}`}
        />
        <span className="erp-worker-fairness-chart-average-label" style={{ bottom: `${averageHeight}%` }}>
          2{"\uAC1C\uC6D4"} {LABEL_AVG} {averageLineCount}
          {LABEL_COUNT}
        </span>
      </div>
      <div
        className="erp-worker-netpay-chart-grid"
        style={{ ["--worker-netpay-count" as string]: String(rows.length) }}
      >
        {rows.map((row) => {
          const totalHeight = stackHeight(row.twoMonthLineCount);
          const prevShare = row.twoMonthLineCount > 0 ? row.prevMonthLineCount / row.twoMonthLineCount : 0;
          const prevHeight = totalHeight * prevShare;
          const currentHeight = totalHeight - prevHeight;
          return (
            <div
              key={row.name}
              className="erp-worker-netpay-chart-col"
              title={`${row.name} \u00B7 ${prevMonthLabel} ${row.prevMonthLineCount}${LABEL_COUNT} \u00B7 ${currentMonthLabel} ${row.lineCount}${LABEL_COUNT} \u00B7 ${LABEL_TWO_MONTH_SUM} ${row.twoMonthLineCount}${LABEL_COUNT} \u00B7 ${LABEL_VS_AVG} ${formatWorkerAssignmentDelta(row.deltaFromAverage)}`}
            >
              <div className="erp-worker-netpay-chart-bar-wrap">
                <span className="erp-worker-netpay-chart-value">
                  {row.twoMonthLineCount}
                  {LABEL_COUNT}
                </span>
                <div className="erp-worker-fairness-chart-stack" style={{ height: `${totalHeight}%` }}>
                  {prevHeight > 0 ? (
                    <span
                      className="erp-worker-fairness-chart-bar has-value is-prev"
                      style={{ height: `${(prevHeight / totalHeight) * 100}%` }}
                    />
                  ) : null}
                  {currentHeight > 0 ? (
                    <span
                      className={`erp-worker-fairness-chart-bar has-value is-${row.priority}`}
                      style={{ height: `${(currentHeight / totalHeight) * 100}%` }}
                    />
                  ) : null}
                </div>
              </div>
              <span className="erp-worker-netpay-chart-label">{row.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WorkerAssignmentFairnessTab({
  monthKey,
  setMonthKey,
  allDetailRows,
  workers,
}: {
  monthKey: string;
  setMonthKey: (value: string) => void;
  allDetailRows: WorkerPaymentDetailRow[];
  workers: Parameters<typeof summarizeWorkerAssignmentFairnessRows>[1];
}) {
  const prevMonthKey = useMemo(() => shiftMonthKey(monthKey, -1), [monthKey]);

  const monthlyDetailRows = useMemo(
    () => filterWorkerAssignmentFairnessDetailRows(allDetailRows, monthKey),
    [allDetailRows, monthKey],
  );

  const prevMonthlyDetailRows = useMemo(
    () => filterWorkerAssignmentFairnessDetailRows(allDetailRows, prevMonthKey),
    [allDetailRows, prevMonthKey],
  );

  const summaryRows = useMemo(
    () => summarizeWorkerAssignmentFairnessRows(monthlyDetailRows, workers),
    [monthlyDetailRows, workers],
  );

  const prevSummaryRows = useMemo(
    () => summarizeWorkerAssignmentFairnessRows(prevMonthlyDetailRows, workers),
    [prevMonthlyDetailRows, workers],
  );

  const { summary, rows } = useMemo(
    () => buildWorkerAssignmentFairness(summaryRows, monthKey, prevSummaryRows),
    [summaryRows, monthKey, prevSummaryRows],
  );

  const prevMonthLabel = formatMonthLabel(prevMonthKey);
  const currentMonthLabel = formatMonthLabel(monthKey);

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
          title={LABEL_TWO_MONTH_AVG_PARTICIPATION}
          value={`${summary.averageLineCount}${LABEL_COUNT}`}
          sub={`${prevMonthLabel} + ${currentMonthLabel} \u00B7 ${LABEL_TEAM} ${summary.teamWorkerCount}${LABEL_PEOPLE} \u00B7 ${LABEL_ACTIVE} ${summary.activeWorkerCount}${LABEL_PEOPLE}`}
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
          value={`${summary.totalTwoMonthLineCount}${LABEL_COUNT}`}
          sub={`${prevMonthLabel} ${summary.totalPrevLineCount}${LABEL_COUNT} \u00B7 ${currentMonthLabel} ${summary.totalLineCount}${LABEL_COUNT}`}
          icon={Users}
        />
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <h2 className="erp-text-section">{LABEL_BY_WORKER}</h2>
            <span className="erp-text-caption text-slate-500">
              {prevMonthLabel} + {currentMonthLabel} \u00B7 2\uAC1C\uC6D4 {LABEL_AVG} {summary.averageLineCount}
              {LABEL_COUNT} \u00B7 {LABEL_ALL_WORKERS} {rows.length}
              {LABEL_PEOPLE}
            </span>
          </div>
          <WorkerParticipationFairnessChart
            rows={rows}
            averageLineCount={summary.averageLineCount}
            prevMonthLabel={prevMonthLabel}
            currentMonthLabel={currentMonthLabel}
          />
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <TableExportSection
            fileName={`\uC2DC\uACF5\uC790_\uBC30\uCE58\uACF5\uC815\uB3C4_${monthKey}`}
            title={`\uC2DC\uACF5\uC790 ${LABEL_FAIRNESS}`}
            disabled={rows.length === 0}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="erp-text-caption text-slate-500">
                {prevMonthLabel} + {currentMonthLabel} \u00B7 {LABEL_ALL_WORKERS} {rows.length}
                {LABEL_PEOPLE}
              </span>
            </div>
            <div className="erp-table-wrap erp-table-wrap--page-scroll erp-table-wrap--sticky-head">
              <table className="erp-table erp-table--lg">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="text-left">{LABEL_WORKER}</th>
                    <th className="text-right">{LABEL_PREV_MONTH}</th>
                    <th className="text-right">{LABEL_CURRENT_MONTH}</th>
                    <th className="text-right">{LABEL_TWO_MONTH_SUM}</th>
                    <th className="text-right">{LABEL_TWO_MONTH_AVG}</th>
                    <th className="text-right">{LABEL_VS_AVG}</th>
                    <th className="text-center">{LABEL_PRIORITY}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.name} className="border-t">
                      <td className="font-bold">{row.name}</td>
                      <td className="text-right tabular-nums text-slate-500">{row.prevMonthLineCount}</td>
                      <td className="text-right tabular-nums">{row.lineCount}</td>
                      <td className="text-right font-semibold tabular-nums">{row.twoMonthLineCount}</td>
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
                      <td className="text-center">
                        <PriorityBadge row={row} />
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
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
