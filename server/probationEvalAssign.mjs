import { findWorkerByListName } from "./workerPhoneMatch.mjs";

const WORKER_GRADE_RANK = { S: 6, A: 5, B: 4, C: 3, D: 2, E: 1 };

export function gradeRank(grade) {
  return WORKER_GRADE_RANK[String(grade || "").trim().toUpperCase()] ?? 0;
}

function normalizeGrade(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export function isWorkerEvalSubject(worker, subjectMaxGrade) {
  const grade = normalizeGrade(worker?.grade);
  const maxGrade = normalizeGrade(subjectMaxGrade);
  const workerRank = gradeRank(grade);
  const maxRank = gradeRank(maxGrade);
  if (!workerRank || !maxRank) return false;
  return workerRank <= maxRank;
}

function pickHighestGradeParticipant(candidates) {
  if (!candidates.length) return null;
  return candidates.reduce((best, current) => {
    const bestRank = gradeRank(normalizeGrade(best.worker.grade));
    const currentRank = gradeRank(normalizeGrade(current.worker.grade));
    if (currentRank > bestRank) return current;
    return best;
  });
}

export function findEvalSubjectsOnSchedule(schedule, workers, workerAiRules) {
  const subjectMaxGrade = workerAiRules?.probationEvalSubjectMaxGrade || "E";
  const names = Array.isArray(schedule?.participantNames) ? schedule.participantNames : [];
  const seen = new Set();
  const result = [];

  for (const participantName of names) {
    const label = String(participantName || "").trim();
    if (!label) continue;
    const worker = findWorkerByListName(workers, label);
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
export function findProbationWorkersOnSchedule(schedule, workers, workerAiRules) {
  return findEvalSubjectsOnSchedule(schedule, workers, workerAiRules);
}

function dedupeEvaluatorCandidates(candidates) {
  const seen = new Set();
  const result = [];
  for (const row of candidates) {
    const workerId = String(row.worker?.id ?? "");
    if (!workerId || seen.has(workerId)) continue;
    seen.add(workerId);
    result.push(row);
  }
  return result;
}

export function selectScheduleEvaluators(schedule, subjectWorker, workers, evalGrades) {
  const subjectWorkerId = String(subjectWorker.id ?? "");
  const subjectRank = gradeRank(normalizeGrade(subjectWorker.grade));
  const names = Array.isArray(schedule?.participantNames) ? schedule.participantNames : [];
  const allowedGrades = new Set(
    (Array.isArray(evalGrades) ? evalGrades : []).map((grade) => normalizeGrade(grade)).filter(Boolean),
  );

  const participants = [];
  for (const participantName of names) {
    const label = String(participantName || "").trim();
    if (!label) continue;
    const worker = findWorkerByListName(workers, label);
    if (!worker) continue;
    if (String(worker.id ?? "") === subjectWorkerId) continue;
    const evaluatorRank = gradeRank(normalizeGrade(worker.grade));
    if (evaluatorRank <= subjectRank) continue;
    participants.push({ worker, participantName: label });
  }

  if (!participants.length) return [];

  const sCandidates = participants.filter((row) => normalizeGrade(row.worker.grade) === "S");
  const aCandidates = participants.filter((row) => normalizeGrade(row.worker.grade) === "A");

  if (sCandidates.length > 0) {
    return dedupeEvaluatorCandidates([...sCandidates, ...aCandidates]).map((picked) => ({
      worker: picked.worker,
      participantName: picked.participantName,
      selectionReason: "grade_match",
    }));
  }

  const gradeMatches = allowedGrades.size
    ? participants.filter((row) => allowedGrades.has(normalizeGrade(row.worker.grade)))
    : participants;

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

export function selectScheduleEvaluator(schedule, subjectWorker, workers, evalGrades) {
  return selectScheduleEvaluators(schedule, subjectWorker, workers, evalGrades)[0] || null;
}
