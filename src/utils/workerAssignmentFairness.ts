import type { WorkerPaymentSummaryRow } from "@/utils/workerPayments";

export type WorkerAssignmentPriority = "high" | "normal" | "low";

export type WorkerAssignmentFairnessRow = {
  workerId?: number | string;
  name: string;
  lineCount: number;
  netPay: number;
  averageLineCount: number;
  deltaFromAverage: number;
  priority: WorkerAssignmentPriority;
  priorityLabel: string;
};

export type WorkerAssignmentFairnessSummary = {
  monthKey: string;
  averageLineCount: number;
  activeWorkerCount: number;
  belowAverageCount: number;
  aboveAverageCount: number;
  maxAbsDelta: number;
  totalLineCount: number;
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

export function buildWorkerAssignmentFairness(
  summaryRows: WorkerPaymentSummaryRow[],
  monthKey: string,
): { summary: WorkerAssignmentFairnessSummary; rows: WorkerAssignmentFairnessRow[] } {
  const activeRows = summaryRows.filter((row) => row.lineCount > 0);
  const totalLineCount = activeRows.reduce((sum, row) => sum + row.lineCount, 0);
  const activeWorkerCount = activeRows.length;
  const averageLineCount =
    activeWorkerCount > 0 ? roundAverage(totalLineCount / activeWorkerCount) : 0;

  const rows = summaryRows
    .map((row) => {
      const deltaFromAverage = roundAverage(row.lineCount - averageLineCount);
      const { priority, priorityLabel } = resolveWorkerAssignmentPriority(deltaFromAverage);
      return {
        workerId: row.workerId,
        name: row.name,
        lineCount: row.lineCount,
        netPay: row.netPay,
        averageLineCount,
        deltaFromAverage,
        priority,
        priorityLabel,
      };
    })
    .sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      if (a.deltaFromAverage !== b.deltaFromAverage) return a.deltaFromAverage - b.deltaFromAverage;
      return a.name.localeCompare(b.name, "ko");
    });

  const belowAverageCount = rows.filter((row) => row.deltaFromAverage <= -0.5).length;
  const aboveAverageCount = rows.filter((row) => row.deltaFromAverage >= 0.5).length;
  const maxAbsDelta = rows.reduce((max, row) => Math.max(max, Math.abs(row.deltaFromAverage)), 0);

  return {
    summary: {
      monthKey,
      averageLineCount,
      activeWorkerCount,
      belowAverageCount,
      aboveAverageCount,
      maxAbsDelta: roundAverage(maxAbsDelta),
      totalLineCount,
    },
    rows,
  };
}
