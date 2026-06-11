import { addDaysISO, todayISO } from "@/utils/receivables";
import { addMonthsToHireDay } from "@/utils/workerEGradePayPeriods";
import type { WorkerAiRules } from "@/utils/workerAiRules";
import {
  DEFAULT_WORKER_AI_RULES,
  normalizeWorkerAiRules,
  resolveEffectivePostProbationValues,
} from "@/utils/workerAiRules";
import {
  filterActiveWorkers,
  isWorkerActive,
  normalizeWorkerRecordId,
  type WorkerMasterLike,
} from "@/utils/workerPayments";

export function getWorkerProbationEndDateFromRules(
  worker: Pick<WorkerMasterLike, "hireDate">,
  rules: Pick<WorkerAiRules, "probationMonths"> = DEFAULT_WORKER_AI_RULES,
) {
  const hireDate = String(worker.hireDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) return "";
  return addMonthsToHireDay(hireDate, rules.probationMonths);
}

export function isWorkerInProbationPeriod(
  worker: Pick<WorkerMasterLike, "hireDate">,
  rulesInput?: WorkerAiRules | null,
  asOfDate = todayISO(),
) {
  const probationEnd = getWorkerProbationEndDateFromRules(worker, normalizeWorkerAiRules(rulesInput));
  if (!probationEnd) return false;
  const today = String(asOfDate || todayISO()).slice(0, 10);
  return today <= probationEnd;
}

export function workerNeedsProbationEndAdjustment(
  worker: WorkerMasterLike,
  rulesInput?: WorkerAiRules | null,
  asOfDate = todayISO(),
) {
  const rules = normalizeWorkerAiRules(rulesInput);
  if (!rules.autoAdjustOnProbationEnd && !rules.autoAdjustGradeOnProbationEnd) return false;
  if (!isWorkerActive(worker)) return false;
  if (String(worker.probationAdjustedAt || "").trim()) return false;

  const probationEnd = getWorkerProbationEndDateFromRules(worker, rules);
  if (!probationEnd) return false;

  const today = String(asOfDate || todayISO()).slice(0, 10);
  return today > probationEnd;
}

export function buildWorkerAfterProbationAdjustment(
  worker: WorkerMasterLike,
  rulesInput?: WorkerAiRules | null,
  asOfDate = todayISO(),
): WorkerMasterLike {
  const rules = normalizeWorkerAiRules(rulesInput);
  const effective = resolveEffectivePostProbationValues(worker, rules);
  const today = String(asOfDate || todayISO()).slice(0, 10);
  const next: WorkerMasterLike = {
    ...worker,
    probationAdjustedAt: today,
  };

  if (rules.autoAdjustOnProbationEnd) {
    if (effective.postProbationConstructionCost > 0) {
      next.constructionCost = effective.postProbationConstructionCost;
    }
    if (effective.postProbationCustomChargeCost > 0) {
      next.customChargeCost = effective.postProbationCustomChargeCost;
    }
  }

  if (rules.autoAdjustGradeOnProbationEnd && effective.postProbationGrade) {
    const prevGrade = String(worker.grade || "")
      .trim()
      .toUpperCase();
    if (prevGrade === "E") {
      next.grade = effective.postProbationGrade;
      next.eGradeEndedAt = today;
    }
  }

  return next;
}

export function enforceProbationEGradeOnWorkers(
  workers: WorkerMasterLike[] = [],
  rulesInput?: WorkerAiRules | null,
  asOfDate = todayISO(),
) {
  const rules = normalizeWorkerAiRules(rulesInput);
  if (!rules.enforceEGradeDuringProbation) {
    return { workers, changed: false, enforcedNames: [] as string[] };
  }

  const enforcedNames: string[] = [];
  let changed = false;

  const nextWorkers = workers.map((worker) => {
    if (!isWorkerActive(worker)) return worker;
    if (!isWorkerInProbationPeriod(worker, rules, asOfDate)) return worker;

    const grade = String(worker.grade || "")
      .trim()
      .toUpperCase();
    if (grade === "E") return worker;

    changed = true;
    enforcedNames.push(String(worker.name || "").trim() || normalizeWorkerRecordId(worker.id));
    return { ...worker, grade: "E", eGradeEndedAt: "" };
  });

  return {
    workers: changed ? nextWorkers : workers,
    changed,
    enforcedNames: enforcedNames.filter(Boolean),
  };
}

export function applyProbationEndAdjustments(
  workers: WorkerMasterLike[] = [],
  rulesInput?: WorkerAiRules | null,
  asOfDate = todayISO(),
) {
  const rules = normalizeWorkerAiRules(rulesInput);
  const enforceResult = enforceProbationEGradeOnWorkers(workers, rules, asOfDate);
  const currentWorkers = enforceResult.workers;
  const adjustedNames: string[] = [];
  let endChanged = false;

  const nextWorkers = currentWorkers.map((worker) => {
    if (!workerNeedsProbationEndAdjustment(worker, rules, asOfDate)) return worker;
    endChanged = true;
    adjustedNames.push(String(worker.name || "").trim() || normalizeWorkerRecordId(worker.id));
    return buildWorkerAfterProbationAdjustment(worker, rules, asOfDate);
  });

  return {
    workers: enforceResult.changed || endChanged ? nextWorkers : workers,
    changed: enforceResult.changed || endChanged,
    adjustedNames: adjustedNames.filter(Boolean),
    enforcedNames: enforceResult.enforcedNames,
  };
}

export function listWorkersPendingProbationEndAdjustment(
  workers: WorkerMasterLike[] = [],
  rulesInput?: WorkerAiRules | null,
  asOfDate = todayISO(),
) {
  return filterActiveWorkers(workers).filter((worker) =>
    workerNeedsProbationEndAdjustment(worker, rulesInput, asOfDate),
  );
}

export function getWorkerPortalStatementStartDateFromRules(
  worker: Pick<WorkerMasterLike, "hireDate">,
  rules?: Pick<WorkerAiRules, "probationMonths"> | null,
) {
  const probationEnd = getWorkerProbationEndDateFromRules(worker, rules || DEFAULT_WORKER_AI_RULES);
  return probationEnd ? addDaysISO(probationEnd, 1) : "";
}
