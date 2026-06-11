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

function addMonthsToHireDay(hireDate, months) {
  const match = String(hireDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  date.setUTCMonth(date.getUTCMonth() + months);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function isWorkerInProbationPeriod(worker, rules, asOfDate) {
  const hireDate = String(worker?.hireDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) return false;
  const probationEnd = addMonthsToHireDay(hireDate, rules?.probationMonths ?? 3);
  if (!probationEnd) return false;
  const today = String(asOfDate || "").slice(0, 10);
  return today <= probationEnd;
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

export function findProbationWorkersOnSchedule(schedule, workers, workerAiRules, asOfDate) {
  const workDate = String(schedule?.workDate || asOfDate || "").slice(0, 10);
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
    if (!isWorkerInProbationPeriod(worker, workerAiRules, workDate)) continue;
    seen.add(workerId);
    result.push({ worker, participantName: label });
  }

  return result;
}

export function selectScheduleEvaluator(schedule, probationWorker, workers, evalGrades) {
  const probationWorkerId = String(probationWorker.id ?? "");
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
