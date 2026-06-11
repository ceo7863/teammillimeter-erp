import {
  gradeRank,
  type ProbationEvalSelectionReason,
} from "@/utils/probationEval";
import { isWorkerInProbationPeriod } from "@/utils/workerProbationAutoAdjust";
import type { WorkerAiRules } from "@/utils/workerAiRules";
import { normalizeWorkerAiRules } from "@/utils/workerAiRules";
import { findWorkerByListName } from "@/utils/workerPhoneMatch";
import type { WorkerMasterLike } from "@/utils/workerPayments";

export type ScScheduleLike = {
  id?: string | number;
  participantNames?: string[];
  workDate?: string;
  projectName?: string;
  workType?: string;
  clientName?: string;
};

export type ScheduleParticipantLike = {
  participantName: string;
  name: string;
  phone?: string;
};

export type SelectedEvaluator = {
  worker: WorkerMasterLike;
  participantName: string;
  selectionReason: ProbationEvalSelectionReason;
};

export type ProbationWorkerOnSchedule = {
  worker: WorkerMasterLike;
  participantName: string;
};

function normalizeGrade(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export function resolveParticipantWorker(
  workers: WorkerMasterLike[],
  participantName: string,
): WorkerMasterLike | null {
  return findWorkerByListName(workers, participantName);
}

export function findProbationWorkersOnSchedule(
  schedule: ScScheduleLike,
  workers: WorkerMasterLike[],
  workerAiRulesInput?: WorkerAiRules | null,
  asOfDate?: string,
): ProbationWorkerOnSchedule[] {
  const rules = normalizeWorkerAiRules(workerAiRulesInput);
  const workDate = String(schedule?.workDate || asOfDate || "").slice(0, 10);
  const names = Array.isArray(schedule?.participantNames) ? schedule.participantNames : [];
  const seen = new Set<string>();
  const result: ProbationWorkerOnSchedule[] = [];

  for (const participantName of names) {
    const label = String(participantName || "").trim();
    if (!label) continue;
    const worker = resolveParticipantWorker(workers, label);
    if (!worker) continue;
    const workerId = String(worker.id ?? "");
    if (!workerId || seen.has(workerId)) continue;
    if (!isWorkerInProbationPeriod(worker, rules, workDate)) continue;
    seen.add(workerId);
    result.push({ worker, participantName: label });
  }

  return result;
}

function pickHighestGradeParticipant(
  candidates: Array<{ worker: WorkerMasterLike; participantName: string }>,
) {
  if (!candidates.length) return null;
  return candidates.reduce((best, current) => {
    const bestRank = gradeRank(normalizeGrade(best.worker.grade));
    const currentRank = gradeRank(normalizeGrade(current.worker.grade));
    if (currentRank > bestRank) return current;
    return best;
  });
}

export function selectScheduleEvaluator(
  schedule: ScScheduleLike,
  probationWorker: WorkerMasterLike,
  workers: WorkerMasterLike[],
  evalGrades: string[],
): SelectedEvaluator | null {
  const probationWorkerId = String(probationWorker.id ?? "");
  const names = Array.isArray(schedule?.participantNames) ? schedule.participantNames : [];
  const allowedGrades = new Set(
    (Array.isArray(evalGrades) ? evalGrades : [])
      .map((grade) => normalizeGrade(grade))
      .filter(Boolean),
  );

  const participants: Array<{ worker: WorkerMasterLike; participantName: string }> = [];
  for (const participantName of names) {
    const label = String(participantName || "").trim();
    if (!label) continue;
    const worker = resolveParticipantWorker(workers, label);
    if (!worker) continue;
    if (String(worker.id ?? "") === probationWorkerId) continue;
    participants.push({ worker, participantName: label });
  }

  if (!participants.length) return null;

  const gradeMatches = allowedGrades.size
    ? participants.filter((row) => allowedGrades.has(normalizeGrade(row.worker.grade)))
    : [];

  const picked = gradeMatches.length
    ? pickHighestGradeParticipant(gradeMatches)
    : pickHighestGradeParticipant(participants);

  if (!picked) return null;

  return {
    worker: picked.worker,
    participantName: picked.participantName,
    selectionReason: gradeMatches.length ? "grade_match" : "highest_grade_fallback",
  };
}
