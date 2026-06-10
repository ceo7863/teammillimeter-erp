import type { WorkerMasterLike, WorkerPaymentSummaryRow } from "@/utils/workerPayments";
import {
  compareWorkerMastersDefault,
  filterActiveWorkers,
  normalizeWorkerCategory,
  normalizeWorkerName,
  summarizeWorkerPaymentRows,
  WORKER_CATEGORY_TEAM,
  type WorkerPaymentDetailRow,
} from "@/utils/workerPayments";
import { shiftMonthKey } from "@/utils/workerMonthlyPayments";

export type WorkerAssignmentPriority = "high" | "normal" | "low";

export type WorkerAssignmentFairnessRow = {
  workerId?: number | string;
  name: string;
  lineCount: number;
  prevMonthLineCount: number;
  twoMonthLineCount: number;
  averageLineCount: number;
  deltaFromAverage: number;
  priority: WorkerAssignmentPriority;
  priorityLabel: string;
};

export type WorkerAssignmentFairnessSummary = {
  monthKey: string;
  prevMonthKey: string;
  averageLineCount: number;
  teamWorkerCount: number;
  activeWorkerCount: number;
  belowAverageCount: number;
  aboveAverageCount: number;
  maxAbsDelta: number;
  totalLineCount: number;
  totalPrevLineCount: number;
  totalTwoMonthLineCount: number;
};

function roundAverage(value: number) {
  return Math.round(value * 10) / 10;
}

export function resolveWorkerAssignmentPriority(deltaFromAverage: number): {
  priority: WorkerAssignmentPriority;
  priorityLabel: string;
} {
  if (deltaFromAverage <= -0.5) {
    return { priority: "high", priorityLabel: "\uB192\uC74C" };
  }
  if (deltaFromAverage >= 0.5) {
    return { priority: "low", priorityLabel: "\uB0AE\uC74C" };
  }
  return { priority: "normal", priorityLabel: "\uBCF4\uD1B5" };
}

export function formatWorkerAssignmentDelta(deltaFromAverage: number) {
  const rounded = roundAverage(deltaFromAverage);
  if (rounded === 0) return "0";
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function sortFairnessRows(a: WorkerAssignmentFairnessRow, b: WorkerAssignmentFairnessRow) {
  const priorityOrder = { high: 0, normal: 1, low: 2 };
  const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
  if (priorityDiff !== 0) return priorityDiff;
  if (a.deltaFromAverage !== b.deltaFromAverage) return a.deltaFromAverage - b.deltaFromAverage;
  return a.name.localeCompare(b.name, "ko");
}

export function buildWorkerAssignmentFairness(
  summaryRows: WorkerPaymentSummaryRow[],
  monthKey: string,
  prevSummaryRows: WorkerPaymentSummaryRow[] = [],
): { summary: WorkerAssignmentFairnessSummary; rows: WorkerAssignmentFairnessRow[] } {
  const prevMonthKey = shiftMonthKey(monthKey, -1);
  const prevByName = new Map(
    prevSummaryRows.map((row) => [normalizeWorkerName(row.name), row.lineCount]),
  );

  const enrichedRows = summaryRows.map((row) => {
    const prevMonthLineCount = prevByName.get(normalizeWorkerName(row.name)) ?? 0;
    return {
      row,
      prevMonthLineCount,
      twoMonthLineCount: row.lineCount + prevMonthLineCount,
    };
  });

  const activeRows = enrichedRows.filter((entry) => entry.twoMonthLineCount > 0);
  const totalTwoMonthLineCount = activeRows.reduce((sum, entry) => sum + entry.twoMonthLineCount, 0);
  const totalLineCount = enrichedRows.reduce((sum, entry) => sum + entry.row.lineCount, 0);
  const totalPrevLineCount = enrichedRows.reduce((sum, entry) => sum + entry.prevMonthLineCount, 0);
  const activeWorkerCount = activeRows.length;
  const averageLineCount =
    activeWorkerCount > 0 ? roundAverage(totalTwoMonthLineCount / activeWorkerCount) : 0;

  const rows = enrichedRows
    .map(({ row, prevMonthLineCount, twoMonthLineCount }) => {
      const deltaFromAverage = roundAverage(twoMonthLineCount - averageLineCount);
      const { priority, priorityLabel } = resolveWorkerAssignmentPriority(deltaFromAverage);
      return {
        workerId: row.workerId,
        name: row.name,
        lineCount: row.lineCount,
        prevMonthLineCount,
        twoMonthLineCount,
        averageLineCount,
        deltaFromAverage,
        priority,
        priorityLabel,
      };
    })
    .sort(sortFairnessRows);

  const belowAverageCount = rows.filter((row) => row.deltaFromAverage <= -0.5).length;
  const aboveAverageCount = rows.filter((row) => row.deltaFromAverage >= 0.5).length;
  const maxAbsDelta = rows.reduce((max, row) => Math.max(max, Math.abs(row.deltaFromAverage)), 0);

  return {
    summary: {
      monthKey,
      prevMonthKey,
      averageLineCount,
      teamWorkerCount: summaryRows.length,
      activeWorkerCount,
      belowAverageCount,
      aboveAverageCount,
      maxAbsDelta: roundAverage(maxAbsDelta),
      totalLineCount,
      totalPrevLineCount,
      totalTwoMonthLineCount,
    },
    rows,
  };
}

export function listWorkerAssignmentFairnessTeamWorkers(workers: WorkerMasterLike[] = []) {
  return filterActiveWorkers(workers).filter(
    (worker) => normalizeWorkerCategory(worker.category) === WORKER_CATEGORY_TEAM,
  );
}

export function summarizeWorkerAssignmentFairnessRows(
  monthlyDetailRows: WorkerPaymentDetailRow[] = [],
  workers: WorkerMasterLike[] = [],
): WorkerPaymentSummaryRow[] {
  const teamWorkers = listWorkerAssignmentFairnessTeamWorkers(workers);
  const rosterNames = new Set(
    teamWorkers.map((worker) => normalizeWorkerName(worker.name)).filter(Boolean),
  );
  const summarizedByName = new Map(
    summarizeWorkerPaymentRows(monthlyDetailRows, teamWorkers).map((row) => [normalizeWorkerName(row.name), row]),
  );

  return [...teamWorkers]
    .sort(compareWorkerMastersDefault)
    .map((worker) => {
      const name = normalizeWorkerName(worker.name);
      if (!name) return null;
      return (
        summarizedByName.get(name) || {
          workerId: worker.id,
          name,
          phone: worker.phone,
          bank: worker.bank,
          account: worker.account,
          feeRate: worker.feeRate ?? 0,
          lineCount: 0,
          headcount: 0,
          grossPay: 0,
          fee: 0,
          netPay: 0,
        }
      );
    })
    .filter((row): row is WorkerPaymentSummaryRow => Boolean(row) && rosterNames.has(row.name));
}

export function filterWorkerAssignmentFairnessDetailRows(
  detailRows: WorkerPaymentDetailRow[] = [],
  monthKey: string,
) {
  return detailRows.filter((row) => String(row.date || "").slice(0, 7) === monthKey);
}
