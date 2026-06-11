import {
  selectScheduleEvaluator,
  findEvalSubjectsOnSchedule,
  gradeRank,
  isWorkerEvalSubject,
} from "../server/probationEvalAssign.mjs";
import { normalizeWorkerAiRules } from "../server/workerAiRules.mjs";

const rules = normalizeWorkerAiRules({
  probationEvalSubjectMaxGrade: "E",
  probationEvalGrades: ["S", "A"],
});

const rulesWithD = normalizeWorkerAiRules({
  probationEvalSubjectMaxGrade: "D",
  probationEvalGrades: ["A"],
});

const workers = [
  { id: "w1", name: "\uAE40\uC218\uC2B5", grade: "E", hireDate: "2026-04-01", phone: "01011112222" },
  { id: "w2", name: "\uBC15\uC2B9\uAE30", grade: "A", hireDate: "2024-01-01", phone: "01033334444" },
  { id: "w3", name: "\uC774\uC900\uBAA9", grade: "C", hireDate: "2025-01-01", phone: "01055556666" },
  { id: "w4", name: "\uCD5C\uACE0\uAE09", grade: "S", hireDate: "2023-01-01", phone: "01077778888" },
  { id: "w5", name: "\uC815\uB4F1\uAE09", grade: "D", hireDate: "2025-06-01", phone: "01099990000" },
];

const schedule = {
  id: "sch-1",
  workDate: "2026-06-10",
  participantNames: ["\uAE40\uC218\uC2B5", "\uBC15\uC2B9\uAE30", "\uC774\uC900\uBAA9"],
  projectName: "\uD14C\uC2A4\uD2B8 \uD604\uC7A5",
};

const scheduleFallback = {
  id: "sch-2",
  workDate: "2026-06-10",
  participantNames: ["\uAE40\uC218\uC2B5", "\uC774\uC900\uBAA9"],
  projectName: "\uD14C\uC2A4\uD2B8 \uD604\uC7A52",
};

const scheduleSameGrade = {
  id: "sch-4",
  workDate: "2026-06-10",
  participantNames: ["\uC815\uB4F1\uAE09", "\uAE40\uC218\uC2B5"],
  projectName: "\uD14C\uC2A4\uD2B8 \uD604\uC7A54",
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  assert(gradeRank("S") > gradeRank("A"), "S should outrank A");
  assert(gradeRank("E") === 1, "E should be lowest rank");
  assert(isWorkerEvalSubject({ grade: "E" }, "E"), "E subject within E max");
  assert(isWorkerEvalSubject({ grade: "D" }, "E") === false, "D should not be subject when max is E");
  assert(isWorkerEvalSubject({ grade: "D" }, "D"), "D subject within D max");

  const subjects = findEvalSubjectsOnSchedule(schedule, workers, rules);
  assert(subjects.length === 1, "expected one E-grade subject");
  assert(subjects[0].worker.id === "w1", "subject should be w1");

  const subjectsD = findEvalSubjectsOnSchedule(
    { ...schedule, participantNames: ["\uAE40\uC218\uC2B5", "\uC815\uB4F1\uAE09", "\uBC15\uC2B9\uAE30"] },
    workers,
    rulesWithD,
  );
  assert(subjectsD.length === 2, "expected E and D subjects when max is D");

  const evaluator = selectScheduleEvaluator(schedule, subjects[0].worker, workers, rules.probationEvalGrades);
  assert(evaluator, "evaluator should be selected");
  assert(evaluator.worker.id === "w2", "grade match should pick A-grade worker");
  assert(evaluator.selectionReason === "grade_match", "should be grade_match");
  assert(gradeRank(evaluator.worker.grade) > gradeRank(subjects[0].worker.grade), "evaluator must outrank subject");

  const fallbackSubject = findEvalSubjectsOnSchedule(scheduleFallback, workers, rules)[0];
  const fallbackEvaluator = selectScheduleEvaluator(
    scheduleFallback,
    fallbackSubject.worker,
    workers,
    rules.probationEvalGrades,
  );
  assert(fallbackEvaluator, "fallback evaluator should exist");
  assert(fallbackEvaluator.worker.id === "w3", "fallback should pick highest eligible participant");
  assert(fallbackEvaluator.selectionReason === "highest_grade_fallback", "should be fallback");

  const sameGradeSubject = findEvalSubjectsOnSchedule(scheduleSameGrade, workers, rulesWithD).find(
    (row) => row.worker.id === "w5",
  );
  assert(sameGradeSubject, "D worker should be subject when max is D");
  const sameGradeEvaluator = selectScheduleEvaluator(
    scheduleSameGrade,
    sameGradeSubject.worker,
    workers,
    rulesWithD.probationEvalGrades,
  );
  assert(sameGradeEvaluator === null, "E worker cannot evaluate D subject (lower rank)");

  const soloSchedule = {
    id: "sch-3",
    workDate: "2026-06-10",
    participantNames: ["\uAE40\uC218\uC2B5"],
  };
  const soloSubject = findEvalSubjectsOnSchedule(soloSchedule, workers, rules)[0];
  const soloEvaluator = selectScheduleEvaluator(soloSchedule, soloSubject.worker, workers, rules.probationEvalGrades);
  assert(soloEvaluator === null, "solo subject should have no evaluator");

  console.log("verify-probation-eval-assign: ok");
}

main();
