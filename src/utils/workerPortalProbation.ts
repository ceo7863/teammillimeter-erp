import { addDaysISO, todayISO } from "@/utils/receivables";
import {
  addMonthsToHireDay,
  workerHasEGradePayHistory,
} from "@/utils/workerEGradePayPeriods";
import type { WorkerMasterLike } from "@/utils/workerPayments";

export type WorkerPortalProbationWorker = Pick<
  WorkerMasterLike,
  "grade" | "hireDate" | "eGradeEndedAt"
>;

function getMonthEndISO(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) return monthKey;
  const date = new Date(Number(match[1]), Number(match[2]), 0);
  return `${monthKey}-${String(date.getDate()).padStart(2, "0")}`;
}

/** E\uB4F1\uAE09 \uC218\uC2B5 \uC774\uB825 \uC788\uB294 \uC2DC\uACF5\uC790\uC778\uC9C0 */
export function workerAppliesPortalProbationRules(
  worker?: WorkerPortalProbationWorker | null,
  workerVoucherMonthKeys: string[] = [],
) {
  if (!worker) return false;
  return workerHasEGradePayHistory(worker, workerVoucherMonthKeys);
}

/** \uC785\uC0AC\uC77C \uAE30\uC900 3\uCC28 \uC218\uC2B5 \uB9C8\uAC10\uC77C(\uC218\uC2B5\uAE30\uAC04 \uB05D) */
export function getWorkerProbationEndDate(worker?: WorkerPortalProbationWorker | null) {
  if (!workerAppliesPortalProbationRules(worker)) return "";
  const hireDate = String(worker?.hireDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) return "";
  return addMonthsToHireDay(hireDate, 3);
}

export function getWorkerPortalStatementStartDate(worker?: WorkerPortalProbationWorker | null) {
  const probationEnd = getWorkerProbationEndDate(worker);
  return probationEnd ? addDaysISO(probationEnd, 1) : "";
}

export function isWorkerInProbationForPortal(
  worker?: WorkerPortalProbationWorker | null,
  asOfDate = todayISO(),
) {
  const probationEnd = getWorkerProbationEndDate(worker);
  if (!probationEnd) return false;
  return String(asOfDate || "").slice(0, 10) <= probationEnd;
}

export function resolveWorkerPortalCalendarMonthPeriod(
  monthKey: string,
  worker?: WorkerPortalProbationWorker | null,
): { periodStart: string; periodEnd: string } | null {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) return null;

  const monthStart = `${monthKey}-01`;
  const monthEnd = getMonthEndISO(monthKey);
  const statementStart = getWorkerPortalStatementStartDate(worker);

  if (!statementStart) {
    return { periodStart: monthStart, periodEnd: monthEnd };
  }

  if (monthEnd < statementStart) return null;

  const periodStart = monthStart >= statementStart ? monthStart : statementStart;
  if (periodStart > monthEnd) return null;

  return { periodStart, periodEnd: monthEnd };
}

export function saleDateEligibleForWorkerPortal(
  saleDate: string,
  worker?: WorkerPortalProbationWorker | null,
) {
  const date = String(saleDate || "").slice(0, 10);
  if (!date) return false;
  if (isWorkerInProbationForPortal(worker, date)) return false;

  const statementStart = getWorkerPortalStatementStartDate(worker);
  if (statementStart && date < statementStart) return false;

  return true;
}
