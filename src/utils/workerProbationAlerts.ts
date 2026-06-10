import { addDaysISO, todayISO } from "@/utils/receivables";
import { addMonthsToHireDay, isWorkerEGrade } from "@/utils/workerEGradePayPeriods";
import {
  filterActiveWorkers,
  isWorkerActive,
  normalizeWorkerRecordId,
  type WorkerMasterLike,
} from "@/utils/workerPayments";

export const WORKER_PROBATION_ALERT_LEAD_DAYS = 3;
export const WORKER_PROBATION_MILESTONE_MONTHS = [1, 2, 3] as const;

export type WorkerProbationMilestoneMonth = (typeof WORKER_PROBATION_MILESTONE_MONTHS)[number];

export type WorkerProbationAlert = {
  alertKey: string;
  workerId: string;
  workerName: string;
  hireDate: string;
  monthIndex: WorkerProbationMilestoneMonth;
  milestoneDate: string;
  daysUntil: number;
};

export const WORKER_SCROLL_TO_STORAGE_KEY = "teammillimeter-erp-worker-scroll-to";
const DISMISS_STORAGE_PREFIX = "teammillimeter-erp-probation-alert-dismiss:";

function diffDaysISO(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00+09:00`);
  const to = new Date(`${toDate}T00:00:00+09:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function formatDisplayDate(date: string) {
  return date.replace(/-/g, ".");
}

export function formatWorkerProbationAlertRelative(daysUntil: number) {
  if (daysUntil <= 0) return "\uC624\uB298";
  if (daysUntil === 1) return "\uB0B4\uC77C";
  return `${daysUntil}\uC77C \uD6C4`;
}

export function formatWorkerProbationAlertMessage(alert: WorkerProbationAlert) {
  const relative = formatWorkerProbationAlertRelative(alert.daysUntil);
  const dateLabel = formatDisplayDate(alert.milestoneDate);
  if (alert.monthIndex === 3) {
    return `${alert.workerName} \u2014 \uC218\uC2B5 3\uAC1C\uC6D4(\uC218\uC2B5 \uC885\uB8CC) ${dateLabel} \u00B7 ${relative} \u00B7 \uB2E4\uC74C\uB09C\uBD80\uD130 \uD3EC\uD138 \uB0B4\uC5ED\uC11C \uACF5\uAC1C`;
  }
  return `${alert.workerName} \u2014 \uC218\uC2B5 ${alert.monthIndex}\uAC1C\uC6D4 ${dateLabel} \u00B7 ${relative}`;
}

export function buildWorkerProbationAlertKey(workerId: string, monthIndex: WorkerProbationMilestoneMonth) {
  return `${workerId}:${monthIndex}`;
}

export function buildWorkerProbationAlerts(
  workers: WorkerMasterLike[] = [],
  asOfDate = todayISO(),
): WorkerProbationAlert[] {
  const today = String(asOfDate || todayISO()).slice(0, 10);
  const alerts: WorkerProbationAlert[] = [];

  for (const worker of filterActiveWorkers(workers)) {
    if (!isWorkerActive(worker) || !isWorkerEGrade(worker)) continue;

    const hireDate = String(worker.hireDate || "").trim();
    const workerId = normalizeWorkerRecordId(worker.id);
    const workerName = String(worker.name || "").trim();
    if (!workerId || !workerName || !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) continue;

    for (const monthIndex of WORKER_PROBATION_MILESTONE_MONTHS) {
      const milestoneDate = addMonthsToHireDay(hireDate, monthIndex);
      if (!milestoneDate) continue;

      const alertStart = addDaysISO(milestoneDate, -WORKER_PROBATION_ALERT_LEAD_DAYS);
      if (today < alertStart || today > milestoneDate) continue;

      alerts.push({
        alertKey: buildWorkerProbationAlertKey(workerId, monthIndex),
        workerId,
        workerName,
        hireDate,
        monthIndex,
        milestoneDate,
        daysUntil: diffDaysISO(today, milestoneDate),
      });
    }
  }

  return alerts.sort((left, right) => {
    if (left.milestoneDate !== right.milestoneDate) {
      return left.milestoneDate.localeCompare(right.milestoneDate);
    }
    if (left.monthIndex !== right.monthIndex) {
      return left.monthIndex - right.monthIndex;
    }
    return left.workerName.localeCompare(right.workerName, "ko");
  });
}

export function loadDismissedWorkerProbationAlertKeys(activeAlertKeys: string[] = []) {
  if (typeof window === "undefined") return new Set<string>();
  const active = new Set(activeAlertKeys);
  const dismissed = new Set<string>();

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(DISMISS_STORAGE_PREFIX)) continue;
    const alertKey = key.slice(DISMISS_STORAGE_PREFIX.length);
    if (!active.has(alertKey)) {
      window.localStorage.removeItem(key);
      continue;
    }
    dismissed.add(alertKey);
  }

  return dismissed;
}

export function dismissWorkerProbationAlert(alertKey: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${DISMISS_STORAGE_PREFIX}${alertKey}`, "1");
}

export function storeWorkerScrollTarget(workerId: string | number) {
  if (typeof window === "undefined") return;
  const key = normalizeWorkerRecordId(workerId);
  if (!key) return;
  window.sessionStorage.setItem(WORKER_SCROLL_TO_STORAGE_KEY, key);
}

export function consumeWorkerScrollTarget() {
  if (typeof window === "undefined") return "";
  const value = window.sessionStorage.getItem(WORKER_SCROLL_TO_STORAGE_KEY) || "";
  if (value) window.sessionStorage.removeItem(WORKER_SCROLL_TO_STORAGE_KEY);
  return value;
}
