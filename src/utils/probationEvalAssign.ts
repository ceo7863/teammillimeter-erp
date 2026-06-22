import {
  gradeRank,
  isWorkerEvalSubject,
  type ProbationEvalSelectionReason,
} from "@/utils/probationEval";
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

export type SelectedEvaluator = {
  worker: WorkerMasterLike;
  participantName: string;
  selectionReason: ProbationEvalSelectionReason;
};

export type EvalSubjectOnSchedule = {
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

export function findEvalSubjectsOnSchedule(
  schedule: ScScheduleLike,
  workers: WorkerMasterLike[],
  workerAiRulesInput?: WorkerAiRules | null,
): EvalSubjectOnSchedule[] {
  const rules = normalizeWorkerAiRules(workerAiRulesInput);
  const subjectMaxGrade = rules.probationEvalSubjectMaxGrade;
  const names = Array.isArray(schedule?.participantNames) ? schedule.participantNames : [];
  const seen = new Set<string>();
  const result: EvalSubjectOnSchedule[] = [];

  for (const participantName of names) {
    const label = String(participantName || "").trim();
    if (!label) continue;
    const worker = resolveParticipantWorker(workers, label);
    if (!worker) continue;
    const workerId = String(worker.id ?? "");
    if (!workerId || seen.has(workerId)) continue;
    if (!isWorkerEvalSubject(worker, subjectMaxGrade)) continue;
    seen.add(workerId);
    result.push({ worker, participantName: label });
  }

  return result;
}

/** @deprecated use findEvalSubjectsOnSchedule */
export function findProbationWorkersOnSchedule(
  schedule: ScScheduleLike,
  workers: WorkerMasterLike[],
  workerAiRulesInput?: WorkerAiRules | null,
  _asOfDate?: string,
) {
  return findEvalSubjectsOnSchedule(schedule, workers, workerAiRulesInput);
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

function dedupeEvaluatorCandidates(
  candidates: Array<{ worker: WorkerMasterLike; participantName: string }>,
) {
  const seen = new Set<string>();
  const result: Array<{ worker: WorkerMasterLike; participantName: string }> = [];
  for (const row of candidates) {
    const workerId = String(row.worker?.id ?? "");
    if (!workerId || seen.has(workerId)) continue;
    seen.add(workerId);
    result.push(row);
  }
  return result;
}

function mapEvaluators(
  candidates: Array<{ worker: WorkerMasterLike; participantName: string }>,
  selectionReason: ProbationEvalSelectionReason,
): SelectedEvaluator[] {
  return dedupeEvaluatorCandidates(candidates).map((picked) => ({
    worker: picked.worker,
    participantName: picked.participantName,
    selectionReason,
  }));
}

export function selectScheduleEvaluators(
  schedule: ScScheduleLike,
  subjectWorker: WorkerMasterLike,
  workers: WorkerMasterLike[],
  workerAiRulesInput?: WorkerAiRules | null,
): SelectedEvaluator[] {
  const rules = normalizeWorkerAiRules(workerAiRulesInput);
  const evalGrades = rules.probationEvalGrades;
  const mode = rules.probationEvalEvaluatorMode;
  const companionGrades = new Set(
    rules.probationEvalSCompanionGrades.map((grade) => normalizeGrade(grade)).filter(Boolean),
  );

  const subjectWorkerId = String(subjectWorker.id ?? "");
  const subjectRank = gradeRank(normalizeGrade(subjectWorker.grade));
  const names = Array.isArray(schedule?.participantNames) ? schedule.participantNames : [];
  const allowedGrades = new Set(
    evalGrades.map((grade) => normalizeGrade(grade)).filter(Boolean),
  );

  const participants: Array<{ worker: WorkerMasterLike; participantName: string }> = [];
  for (const participantName of names) {
    const label = String(participantName || "").trim();
    if (!label) continue;
    const worker = resolveParticipantWorker(workers, label);
    if (!worker) continue;
    if (String(worker.id ?? "") === subjectWorkerId) continue;
    const evaluatorRank = gradeRank(normalizeGrade(worker.grade));
    if (evaluatorRank <= subjectRank) continue;
    participants.push({ worker, participantName: label });
  }

  if (!participants.length) return [];

  const gradeMatches = allowedGrades.size
    ? participants.filter((row) => allowedGrades.has(normalizeGrade(row.worker.grade)))
    : participants;

  if (mode === "all_matching") {
    const pool = gradeMatches.length ? gradeMatches : participants;
    return mapEvaluators(pool, gradeMatches.length ? "grade_match" : "highest_grade_fallback");
  }

  if (mode === "s_plus_companion_when_s") {
    const sCandidates = participants.filter((row) => normalizeGrade(row.worker.grade) === "S");
    if (sCandidates.length > 0) {
      const companions = participants.filter((row) => companionGrades.has(normalizeGrade(row.worker.grade)));
      return mapEvaluators([...sCandidates, ...companions], "grade_match");
    }
  }

  const pool = gradeMatches.length ? gradeMatches : participants;
  const picked = pickHighestGradeParticipant(pool);
  if (!picked) return [];

  return [
    {
      worker: picked.worker,
      participantName: picked.participantName,
      selectionReason: gradeMatches.length ? "grade_match" : "highest_grade_fallback",
    },
  ];
}

export function selectScheduleEvaluator(
  schedule: ScScheduleLike,
  subjectWorker: WorkerMasterLike,
  workers: WorkerMasterLike[],
  workerAiRulesInput?: WorkerAiRules | null,
): SelectedEvaluator | null {
  return selectScheduleEvaluators(schedule, subjectWorker, workers, workerAiRulesInput)[0] || null;
}
