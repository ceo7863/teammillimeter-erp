import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, CreditCard, FileText, WalletCards } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableExportSection } from "@/components/TableExportSection";
import {
  flattenSalesToWorkerPaymentRows,
  findWorkerMasterByListName,
  formatKRW,
  monthStartISO,
  normalizeWorkerCategory,
  normalizeWorkerName,
  filterActiveWorkers,
  WORKER_CATEGORY_OUTSOURCE,
  WORKER_CATEGORY_TEAM,
  compareWorkerFolderRows,
  type WorkerCategory,
  type WorkerMasterLike,
} from "@/utils/workerPayments";
import { formatMonthLabel, shiftMonthKey, type WorkerMonthlyPaymentRecord } from "@/utils/workerMonthlyPayments";
import {
  findWorkerPortalAck,
  workerPortalPreviousMonthKey,
  type WorkerPortalStatementAck,
} from "@/utils/workerPortalAcknowledgment";
import {
  buildWorkerMonthlyActualMonthSummaries,
  buildWorkerMonthlyMonthRowsForMasters,
  buildWorkerMonthlyObligations,
  computeVoucherStatus,
  listActiveWorkerMastersForCategory,
  summarizeWorkerMonthlyDisplayedMonthTotals,
  summarizeWorkerMonthlyObligationAmounts,
  WORKER_MONTHLY_VOUCHER_STATUS_LABELS,
  type WorkerMonthlyActualVoucher,
  type WorkerMonthlyObligation,
  type WorkerMonthlyObligationWithCategory,
  type WorkerPayWithVatLearnRule,
} from "@/utils/workerMonthlyActualPayments";
import { compareSortValues, type SortDirection } from "@/utils/pivotSort";

type WorkerMonthlyPaymentTabProps = {
  workers?: WorkerMasterLike[];
  workerPortalStatementAcks?: WorkerPortalStatementAck[];
  sales?: Parameters<typeof flattenSalesToWorkerPaymentRows>[0];
  workerPaymentRecords?: WorkerMonthlyPaymentRecord[];
  workerMonthlyActualVouchers?: WorkerMonthlyActualVoucher[];
  workerPayWithVatLearnRules?: WorkerPayWithVatLearnRule[];
  selectedMonthKey: string;
  setSelectedMonthKey: (value: string | ((prev: string) => string)) => void;
  onOpenMonthlyActual?: (worker: string, voucherId?: string) => void;
};

const STATUS_CLASS: Record<string, string> = {
  unpaid: "bg-slate-100 text-slate-700",
  partial: "bg-amber-100 text-amber-900",
  paid: "bg-emerald-100 text-emerald-900",
  overpaid: "bg-sky-100 text-sky-900",
};

type WorkerCategoryTab = "team" | "outsource";

const CATEGORY_FILTER_OPTIONS: Array<{ value: WorkerCategoryTab; label: string }> = [
  { value: "team", label: "\uD300\uC6D0" },
  { value: "outsource", label: "\uC678\uC8FC" },
];

type ObligationWithCategory = WorkerMonthlyObligationWithCategory;

type MonthSummarySortColumn = "month" | "workerCount" | "expected" | "paid" | "balance" | "complete" | "status";
type DetailSortColumn =
  | "worker"
  | "periodBill"
  | "periodMargin"
  | "netPay"
  | "vat"
  | "total"
  | "paid"
  | "balance"
  | "status";

const STATUS_SORT_RANK: Record<string, number> = {
  unpaid: 0,
  partial: 1,
  paid: 2,
  overpaid: 3,
};

function monthSummaryStatusRank(row: {
  workerCount: number;
  paidWorkerCount: number;
  partialWorkerCount: number;
}) {
  const complete = row.workerCount > 0 && row.paidWorkerCount >= row.workerCount;
  const partial = row.partialWorkerCount > 0 || (row.paidWorkerCount > 0 && !complete);
  if (complete) return 2;
  if (partial) return 1;
  return 0;
}

function MonthlyPaymentSortHeader<T extends string>({
  label,
  column,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  column: T;
  sort: { column: T | null; direction: SortDirection };
  onSort: (column: T) => void;
  align?: "left" | "center" | "right";
}) {
  const isActive = sort.column === column;
  const SortIcon = !isActive ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <th className={alignClass}>
      <button
        type="button"
        className={`erp-pivot-sort-btn ${alignClass} ${isActive ? "is-active" : ""}`}
        onClick={() => onSort(column)}
        aria-label={`${label} ${isActive ? (sort.direction === "asc" ? "\uC624\uB984\uCC28\uC21C" : "\uB0B4\uB9BC\uCC28\uC21C") : "\uC815\uB82C"}`}
      >
        <span>{label}</span>
        <span className="erp-pivot-sort-icon" aria-hidden="true">
          <SortIcon size={12} />
        </span>
      </button>
    </th>
  );
}

function toggleSortColumn<T extends string>(
  column: T,
  setSort: React.Dispatch<React.SetStateAction<{ column: T | null; direction: SortDirection }>>,
) {
  setSort((prev) => ({
    column,
    direction: prev.column === column && prev.direction === "asc" ? "desc" : "asc",
  }));
}

function countUniqueWorkers(rows: Array<{ worker: string }>) {
  return new Set(rows.map((row) => row.worker)).size;
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
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700"
      : tone === "danger"
        ? "text-red-600"
        : tone === "warning"
          ? "text-amber-700"
          : "text-slate-950";
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Icon size={16} className="text-slate-400" />
          <div className="erp-text-caption font-bold text-slate-500">{title}</div>
        </div>
        <div className={`erp-text-title font-black ${toneClass}`}>{value}</div>
        <div className="erp-text-caption mt-1 text-slate-500">{sub}</div>
      </CardContent>
    </Card>
  );
}

function WorkerCategoryBadge({ category }: { category: WorkerCategory }) {
  const normalized = normalizeWorkerCategory(category);
  return (
    <span
      className={`erp-worker-category-select is-readonly is-${normalized === WORKER_CATEGORY_OUTSOURCE ? "outsource" : "team"}`}
    >
      {normalized}
    </span>
  );
}

function resolveObligationStatus(row: WorkerMonthlyObligation) {
  const voucher = row.voucher;
  return computeVoucherStatus(
    voucher
      ? {
          ...voucher,
          expectedAmount: row.expectedAmount,
          expectedFinalAmount: row.expectedFinalAmount,
          payWithVat: row.payWithVat,
        }
      : {
          paidAmount: row.paid,
          expectedAmount: row.expectedAmount,
          expectedFinalAmount: row.expectedFinalAmount,
          payWithVat: row.payWithVat,
          entries: [],
          allocations: [],
          monthKey: row.monthKey,
        },
  );
}

export function WorkerMonthlyPaymentTab({
  workers = [],
  workerPortalStatementAcks = [],
  sales = [],
  workerPaymentRecords = [],
  workerMonthlyActualVouchers = [],
  workerPayWithVatLearnRules = [],
  selectedMonthKey,
  setSelectedMonthKey,
  onOpenMonthlyActual,
}: WorkerMonthlyPaymentTabProps) {
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<WorkerCategoryTab>("team");
  const [monthSummarySort, setMonthSummarySort] = useState<{
    column: MonthSummarySortColumn | null;
    direction: SortDirection;
  }>({ column: "month", direction: "desc" });
  const [detailSort, setDetailSort] = useState<{ column: DetailSortColumn | null; direction: SortDirection }>({
    column: null,
    direction: "asc",
  });

  const detailRows = useMemo(() => flattenSalesToWorkerPaymentRows(sales, workers), [sales, workers]);
  const showPortalAckColumn = selectedMonthKey === workerPortalPreviousMonthKey();

  const allObligations = useMemo(
    () =>
      buildWorkerMonthlyObligations(
        detailRows,
        workers,
        workerMonthlyActualVouchers,
        workerPaymentRecords,
        workerPayWithVatLearnRules,
      ),
    [detailRows, workerMonthlyActualVouchers, workerPaymentRecords, workerPayWithVatLearnRules, workers],
  );

  const monthSummaries = useMemo(
    () => buildWorkerMonthlyActualMonthSummaries(allObligations, workers, categoryFilter),
    [allObligations, categoryFilter, workers],
  );

  const sortedMonthSummaries = useMemo(() => {
    if (!monthSummarySort.column) return monthSummaries;
    const { column, direction } = monthSummarySort;
    return [...monthSummaries].sort((a, b) => {
      switch (column) {
        case "month":
          return compareSortValues(a.monthKey, b.monthKey, direction);
        case "workerCount":
          return compareSortValues(a.workerCount, b.workerCount, direction);
        case "expected":
          return compareSortValues(a.expectedTotal, b.expectedTotal, direction);
        case "paid":
          return compareSortValues(a.paidTotal, b.paidTotal, direction);
        case "balance":
          return compareSortValues(a.balanceTotal, b.balanceTotal, direction);
        case "complete": {
          const aRatio = a.workerCount > 0 ? a.paidWorkerCount / a.workerCount : 0;
          const bRatio = b.workerCount > 0 ? b.paidWorkerCount / b.workerCount : 0;
          return compareSortValues(aRatio, bRatio, direction);
        }
        case "status":
          return compareSortValues(monthSummaryStatusRank(a), monthSummaryStatusRank(b), direction);
        default:
          return 0;
      }
    });
  }, [monthSummaries, monthSummarySort]);

  useEffect(() => {
    if (!monthSummaries.length) return;
    if (!monthSummaries.some((row) => row.monthKey === selectedMonthKey)) {
      setSelectedMonthKey(monthSummaries[0].monthKey);
    }
  }, [monthSummaries, selectedMonthKey, setSelectedMonthKey]);

  const activeWorkers = useMemo(() => filterActiveWorkers(workers), [workers]);

  const teamCount = useMemo(
    () => activeWorkers.filter((worker) => normalizeWorkerCategory(worker.category) === WORKER_CATEGORY_TEAM).length,
    [activeWorkers],
  );
  const outsourceCount = useMemo(
    () =>
      activeWorkers.filter((worker) => normalizeWorkerCategory(worker.category) === WORKER_CATEGORY_OUTSOURCE).length,
    [activeWorkers],
  );

  const mastersForTab = useMemo(
    () => listActiveWorkerMastersForCategory(workers, categoryFilter),
    [categoryFilter, workers],
  );

  const obligationsWithCategory = useMemo(
    (): ObligationWithCategory[] =>
      buildWorkerMonthlyMonthRowsForMasters(allObligations, workers, selectedMonthKey, mastersForTab),
    [allObligations, mastersForTab, selectedMonthKey, workers],
  );

  const filteredObligations = useMemo(() => {
    let rows = obligationsWithCategory;
    if (unpaidOnly) rows = rows.filter((row) => row.balance > 0);
    return [...rows].sort((a, b) =>
      compareWorkerFolderRows({ category: a.category, worker: a.worker }, { category: b.category, worker: b.worker }),
    );
  }, [obligationsWithCategory, unpaidOnly]);

  const sortedObligations = useMemo(() => {
    if (!detailSort.column) return filteredObligations;
    const { column, direction } = detailSort;
    return [...filteredObligations].sort((a, b) => {
      const amountsA = summarizeWorkerMonthlyObligationAmounts(a, a.voucher);
      const amountsB = summarizeWorkerMonthlyObligationAmounts(b, b.voucher);
      switch (column) {
        case "worker":
          return compareSortValues(a.worker, b.worker, direction);
        case "periodBill":
          return compareSortValues(a.periodBill || 0, b.periodBill || 0, direction);
        case "periodMargin":
          return compareSortValues(a.periodMargin || 0, b.periodMargin || 0, direction);
        case "netPay":
          return compareSortValues(amountsA.netPay, amountsB.netPay, direction);
        case "vat":
          return compareSortValues(amountsA.vatAmount, amountsB.vatAmount, direction);
        case "total":
          return compareSortValues(amountsA.totalAmount, amountsB.totalAmount, direction);
        case "paid":
          return compareSortValues(a.paid, b.paid, direction);
        case "balance":
          return compareSortValues(a.balance, b.balance, direction);
        case "status":
          return compareSortValues(
            STATUS_SORT_RANK[resolveObligationStatus(a)] ?? 0,
            STATUS_SORT_RANK[resolveObligationStatus(b)] ?? 0,
            direction,
          );
        default:
          return 0;
      }
    });
  }, [detailSort, filteredObligations]);

  const activeCategory = categoryFilter === "team" ? WORKER_CATEGORY_TEAM : WORKER_CATEGORY_OUTSOURCE;
  const activeCategoryCount = categoryFilter === "team" ? teamCount : outsourceCount;

  const obligationGroups = useMemo(
    () => [{ category: activeCategory, rows: sortedObligations, masterCount: activeCategoryCount }],
    [activeCategory, activeCategoryCount, sortedObligations],
  );

  const visibleObligations = sortedObligations;

  const showProbationBillMargin = useMemo(
    () => visibleObligations.some((row) => row.isProbation),
    [visibleObligations],
  );

  const monthTotals = useMemo(
    () => summarizeWorkerMonthlyDisplayedMonthTotals(visibleObligations),
    [visibleObligations],
  );

  const monthDetailColSpan = showProbationBillMargin ? 10 : 8;

  const openWorker = (worker: string, voucherId?: string) => {
    onOpenMonthlyActual?.(worker, voucherId);
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="erp-worker-month-nav">
          <button
            type="button"
            className="erp-worker-month-nav-btn"
            onClick={() => setSelectedMonthKey((prev) => shiftMonthKey(prev, -1))}
            aria-label="\uC774\uC804 \uB2EC"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="erp-worker-month-nav-label">{formatMonthLabel(selectedMonthKey)}</div>
          <button
            type="button"
            className="erp-worker-month-nav-btn"
            onClick={() => setSelectedMonthKey((prev) => shiftMonthKey(prev, 1))}
            aria-label="\uB2E4\uC74C \uB2EC"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="rounded-2xl" onClick={() => setSelectedMonthKey(monthStartISO().slice(0, 7))}>
            {"\uC774\uBC88 \uB2EC"}
          </Button>
          <Button variant={unpaidOnly ? "default" : "outline"} className="rounded-2xl" onClick={() => setUnpaidOnly((prev) => !prev)}>
            {"\uBBF8\uC9C0\uAE09\uB9CC"}
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          title={"\uC608\uC815 \uD569\uACC4"}
          value={formatKRW(monthTotals.totalAmount)}
          sub={`${activeCategoryCount}\uBA85 \u00B7 \uC2E4\uC9C0\uAE09 ${formatKRW(monthTotals.netPay)}`}
          icon={WalletCards}
        />
        <SummaryCard
          title={"\uC2E4\uC9C0\uAE09 \uD569\uACC4"}
          value={formatKRW(monthTotals.netPay)}
          sub={monthTotals.vatAmount > 0 ? `\uBD80\uAC00\uC138 ${formatKRW(monthTotals.vatAmount)} \uD3EC\uD568` : "\uBD80\uAC00\uC138 \uBBF8\uD3EC\uD568"}
          icon={CreditCard}
        />
        <SummaryCard
          title={"\uC9C0\uAE09 \uC644\uB8CC"}
          value={formatKRW(monthTotals.paid)}
          sub={`${monthTotals.paidWorkerCount}/${activeCategoryCount}\uBA85 \uC644\uB8CC`}
          tone="success"
          icon={CheckCircle2}
        />
        {showProbationBillMargin ? (
          <>
            <SummaryCard
              title={"\uCCAD\uAD6C\uAE08\uC561"}
              value={formatKRW(monthTotals.periodBill)}
              sub={"\uC218\uC2B5 \uAD6C\uAC04 \uD569\uACC4"}
              icon={WalletCards}
            />
            <SummaryCard
              title={"\uB9C8\uC9C4"}
              value={formatKRW(monthTotals.periodMargin)}
              sub={"\uC218\uC2B5 \uAD6C\uAC04 \uD569\uACC4"}
              tone={monthTotals.periodMargin >= 0 ? "success" : "danger"}
              icon={CheckCircle2}
            />
          </>
        ) : null}
        <SummaryCard
          title={"\uBBF8\uC9C0\uAE09"}
          value={formatKRW(monthTotals.balance)}
          sub={`${monthTotals.unpaidWorkerCount}\uBA85 \uBBF8\uC644\uB8CC`}
          tone="danger"
          icon={CreditCard}
        />
      </div>

      <Card className="mb-4 rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <h2 className="erp-text-section mb-3">{"\uC6D4\uBCC4 \uD604\uD669"}</h2>
          <TableExportSection fileName="\uC2DC\uACF5\uC790\uC9C0\uAE09_\uC6D4\uBCC4\uD604\uD669" title="\uC2DC\uACF5\uC790 \uC6D4\uC2E4\uC9C0\uAE09 \uC6D4\uBCC4 \uD604\uD669" disabled={monthSummaries.length === 0}>
            <div className="erp-table-wrap erp-table-wrap--sticky-head">
              <table className="erp-table erp-table--md">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <MonthlyPaymentSortHeader
                      label={"\uC6D4"}
                      column="month"
                      sort={monthSummarySort}
                      onSort={(column) => toggleSortColumn(column, setMonthSummarySort)}
                    />
                    <MonthlyPaymentSortHeader
                      label={"\uC2DC\uACF5\uC790"}
                      column="workerCount"
                      sort={monthSummarySort}
                      onSort={(column) => toggleSortColumn(column, setMonthSummarySort)}
                      align="right"
                    />
                    <MonthlyPaymentSortHeader
                      label={"\uC608\uC815"}
                      column="expected"
                      sort={monthSummarySort}
                      onSort={(column) => toggleSortColumn(column, setMonthSummarySort)}
                      align="right"
                    />
                    <MonthlyPaymentSortHeader
                      label={"\uC9C0\uAE09"}
                      column="paid"
                      sort={monthSummarySort}
                      onSort={(column) => toggleSortColumn(column, setMonthSummarySort)}
                      align="right"
                    />
                    <MonthlyPaymentSortHeader
                      label={"\uBBF8\uC9C0\uAE09"}
                      column="balance"
                      sort={monthSummarySort}
                      onSort={(column) => toggleSortColumn(column, setMonthSummarySort)}
                      align="right"
                    />
                    <MonthlyPaymentSortHeader
                      label={"\uC644\uB8CC"}
                      column="complete"
                      sort={monthSummarySort}
                      onSort={(column) => toggleSortColumn(column, setMonthSummarySort)}
                      align="right"
                    />
                    <MonthlyPaymentSortHeader
                      label={"\uC0C1\uD0DC"}
                      column="status"
                      sort={monthSummarySort}
                      onSort={(column) => toggleSortColumn(column, setMonthSummarySort)}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedMonthSummaries.map((row) => {
                    const complete = row.workerCount > 0 && row.paidWorkerCount >= row.workerCount;
                    const partial = row.partialWorkerCount > 0 || (row.paidWorkerCount > 0 && !complete);
                    return (
                      <tr
                        key={row.monthKey}
                        className={`cursor-pointer border-t hover:bg-slate-50 ${row.monthKey === selectedMonthKey ? "is-selected" : ""}`}
                        onClick={() => setSelectedMonthKey(row.monthKey)}
                      >
                        <td className="font-semibold">{row.label}</td>
                        <td className="text-right">{row.workerCount}</td>
                        <td className="text-right">{formatKRW(row.expectedTotal)}</td>
                        <td className="text-right font-semibold text-emerald-700">{formatKRW(row.paidTotal)}</td>
                        <td className="text-right text-red-600">{formatKRW(row.balanceTotal)}</td>
                        <td className="text-right">
                          {row.paidWorkerCount}/{row.workerCount}
                        </td>
                        <td>
                          <span className={`erp-worker-month-status ${complete ? "is-paid" : partial ? "is-partial" : "is-unpaid"}`}>
                            {complete ? "\uC644\uB8CC" : partial ? "\uC77C\uBD80" : "\uBBF8\uC9C0\uAE09"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {monthSummaries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        {"\uC6D4\uBCC4 \uC9C0\uAE09 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}
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
          <div className="mb-3 flex flex-col gap-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="erp-text-section">
                {formatMonthLabel(selectedMonthKey)}
                {" \uC6D4\uC2E4\uC9C0\uAE09 \u00B7 "}
                {activeCategory}
                {" "}
                {activeCategoryCount}
                {"\uBA85"}
              </h2>
              <span className="erp-text-caption text-slate-500">
                {"\uC6D4\uC2E4\uC9C0\uAE09 \uD0ED\uACFC \uB3D9\uC77C\uD55C \uC804\uD45C\u00B7\uC9C0\uAE09 \uAE30\uC900 \u00B7 \uC804\uD45C \uBC84\uD2BC\uC73C\uB85C \uC0C1\uC138 \uCC98\uB9AC"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="erp-text-caption font-bold text-slate-500">{"\uAD6C\uBD84"}</span>
              <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
                {CATEGORY_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`erp-text-body rounded-xl px-4 py-2 font-bold ${
                      categoryFilter === option.value
                        ? option.value === "outsource"
                          ? "bg-amber-600 text-white shadow-sm"
                          : "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500"
                    }`}
                    onClick={() => setCategoryFilter(option.value)}
                  >
                    {option.label}
                    {option.value === "team" ? ` (${teamCount})` : ` (${outsourceCount})`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <TableExportSection
            fileName={`\uC2DC\uACF5\uC790\uC6D4\uC2E4\uC9C0\uAE09_${selectedMonthKey}`}
            title={`${formatMonthLabel(selectedMonthKey)} \uC2DC\uACF5\uC790 \uC6D4\uC2E4\uC9C0\uAE09`}
            disabled={visibleObligations.length === 0}
          >
            <div className="erp-table-wrap erp-table-wrap--sticky-head erp-table-wrap--worker-monthly-pay">
              <table className="erp-table erp-table--lg">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <MonthlyPaymentSortHeader
                      label={"\uC2DC\uACF5\uC790"}
                      column="worker"
                      sort={detailSort}
                      onSort={(column) => toggleSortColumn(column, setDetailSort)}
                    />
                    {showProbationBillMargin ? (
                      <>
                        <MonthlyPaymentSortHeader
                          label={"\uCCAD\uAD6C\uAE08\uC561"}
                          column="periodBill"
                          sort={detailSort}
                          onSort={(column) => toggleSortColumn(column, setDetailSort)}
                          align="right"
                        />
                        <MonthlyPaymentSortHeader
                          label={"\uB9C8\uC9C4"}
                          column="periodMargin"
                          sort={detailSort}
                          onSort={(column) => toggleSortColumn(column, setDetailSort)}
                          align="right"
                        />
                      </>
                    ) : null}
                    <MonthlyPaymentSortHeader
                      label={"\uC2E4\uC9C0\uAE09"}
                      column="netPay"
                      sort={detailSort}
                      onSort={(column) => toggleSortColumn(column, setDetailSort)}
                      align="right"
                    />
                    <MonthlyPaymentSortHeader
                      label={"\uBD80\uAC00\uC138"}
                      column="vat"
                      sort={detailSort}
                      onSort={(column) => toggleSortColumn(column, setDetailSort)}
                      align="right"
                    />
                    <MonthlyPaymentSortHeader
                      label={"\uCD1D \uD569\uACC4"}
                      column="total"
                      sort={detailSort}
                      onSort={(column) => toggleSortColumn(column, setDetailSort)}
                      align="right"
                    />
                    <MonthlyPaymentSortHeader
                      label={"\uC9C0\uAE09\uC561"}
                      column="paid"
                      sort={detailSort}
                      onSort={(column) => toggleSortColumn(column, setDetailSort)}
                      align="right"
                    />
                    <MonthlyPaymentSortHeader
                      label={"\uBBF8\uC9C0\uAE09"}
                      column="balance"
                      sort={detailSort}
                      onSort={(column) => toggleSortColumn(column, setDetailSort)}
                      align="right"
                    />
                    <MonthlyPaymentSortHeader
                      label={"\uC0C1\uD0DC"}
                      column="status"
                      sort={detailSort}
                      onSort={(column) => toggleSortColumn(column, setDetailSort)}
                      align="center"
                    />
                    <th className="text-right">{"\uC804\uD45C"}</th>
                  </tr>
                </thead>
                <tbody>
                  {obligationGroups.map((group) => (
                    <React.Fragment key={group.category}>
                      <tr className="border-t bg-slate-50">
                        <td colSpan={monthDetailColSpan} className="px-3 py-2">
                          <WorkerCategoryBadge category={group.category} />
                          <span className="erp-text-caption ml-2 font-bold text-slate-500">
                            {"\uC2DC\uACF5\uC790 \uBAA9\uB85D "}
                            {group.masterCount}
                            {"\uBA85"}
                          </span>
                        </td>
                      </tr>
                      {group.rows.length === 0 ? (
                        <tr className="border-t">
                          <td colSpan={monthDetailColSpan} className="px-3 py-4 text-center text-slate-400">
                            {"\uD574\uB2F9 \uAD6C\uBD84\uC758 \uC2DC\uACF5\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}
                          </td>
                        </tr>
                      ) : null}
                      {group.rows.map((row) => {
                        const status = resolveObligationStatus(row);
                        const amounts = summarizeWorkerMonthlyObligationAmounts(row, row.voucher);
                        return (
                          <tr key={row.key} className="border-t hover:bg-slate-50">
                            <td className="text-left">
                              <button
                                type="button"
                                className="font-bold text-slate-900 hover:underline"
                                onClick={() => openWorker(row.worker, row.voucher?.id)}
                              >
                                {row.worker}
                              </button>
                              {row.isProbation ? (
                                <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                  {"\uC218\uC2B5"}
                                </span>
                              ) : null}
                              {row.isHistorical ? (
                                <span className="ml-2 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                                  {"E\uB4F1\uAE09 \uC774\uB825"}
                                </span>
                              ) : null}
                              {row.periodLabel ? (
                                <div className="erp-text-caption mt-0.5 text-slate-500">{row.periodLabel}</div>
                              ) : null}
                              {showPortalAckColumn ? (
                                <div className="mt-1">
                                  {(() => {
                                    const master = findWorkerMasterByListName(workers, row.worker);
                                    const ack =
                                      master?.id != null
                                        ? findWorkerPortalAck(workerPortalStatementAcks, master.id, selectedMonthKey)
                                        : null;
                                    if (!master?.portalLoginId) {
                                      return (
                                        <span className="erp-text-caption text-slate-400">{"\uD3EC\uD138 \uBBF8\uC0AC\uC6A9"}</span>
                                      );
                                    }
                                    return ack ? (
                                      <span className="erp-worker-portal-ack-badge is-done">{"\uC2DC\uACF5\uB0B4\uC5ED\uC11C \uD655\uC778"}</span>
                                    ) : (
                                      <span className="erp-worker-portal-ack-badge is-pending">{"\uBBF8\uD655\uC778"}</span>
                                    );
                                  })()}
                                </div>
                              ) : null}
                            </td>
                            {showProbationBillMargin ? (
                              <>
                                <td className="text-right text-slate-700">
                                  {row.isProbation ? formatKRW(row.periodBill || 0) : "-"}
                                </td>
                                <td className="text-right text-slate-700">
                                  {row.isProbation ? formatKRW(row.periodMargin || 0) : "-"}
                                </td>
                              </>
                            ) : null}
                            <td className="text-right">{formatKRW(amounts.netPay)}</td>
                            <td className="text-right text-slate-600">{amounts.vatAmount > 0 ? formatKRW(amounts.vatAmount) : "-"}</td>
                            <td className="text-right font-bold">{formatKRW(amounts.totalAmount)}</td>
                            <td className="text-right font-bold text-emerald-700">{formatKRW(row.paid)}</td>
                            <td className="text-right text-red-600">{formatKRW(row.balance)}</td>
                            <td className="text-center">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_CLASS[status]}`}>
                                {WORKER_MONTHLY_VOUCHER_STATUS_LABELS[status]}
                              </span>
                            </td>
                            <td className="text-right">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-xl"
                                onClick={() => openWorker(row.worker, row.voucher?.id)}
                              >
                                <FileText size={14} className="mr-1" />
                                {row.voucher ? "\uC804\uD45C \uC5F4\uAE30" : "\uC6D4\uC2E4\uC9C0\uAE09"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                  {visibleObligations.length === 0 && (
                    <tr>
                      <td colSpan={monthDetailColSpan} className="p-8 text-center text-slate-500">
                        {unpaidOnly
                          ? "\uBBF8\uC9C0\uAE09 \uC2DC\uACF5\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."
                          : "\uC2DC\uACF5\uC790 \uBAA9\uB85D\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4."}
                      </td>
                    </tr>
                  )}
                </tbody>
                {monthTotals && visibleObligations.length > 0 ? (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                    <tr>
                      <td colSpan={2}>{"\uD569\uACC4"}</td>
                      {showProbationBillMargin ? (
                        <>
                          <td className="text-right text-slate-700">{formatKRW(monthTotals.periodBill)}</td>
                          <td className="text-right text-slate-700">{formatKRW(monthTotals.periodMargin)}</td>
                        </>
                      ) : null}
                      <td className="text-right">{formatKRW(monthTotals.netPay)}</td>
                      <td className="text-right text-slate-600">
                        {monthTotals.vatAmount > 0 ? formatKRW(monthTotals.vatAmount) : "-"}
                      </td>
                      <td className="text-right">{formatKRW(monthTotals.totalAmount)}</td>
                      <td className="text-right text-emerald-700">{formatKRW(monthTotals.paid)}</td>
                      <td className="text-right text-red-600">{formatKRW(monthTotals.balance)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </TableExportSection>
        </CardContent>
      </Card>
    </>
  );
}
