import {
  selectScheduleEvaluator,
  selectScheduleEvaluators,
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

const scheduleWithS = {
  id: "sch-sa",
  workDate: "2026-06-10",
  participantNames: ["\uAE40\uC218\uC2B5", "\uBC15\uC2B9\uAE30", "\uCD5C\uACE0\uAE09", "\uC774\uC900\uBAA9"],
  projectName: "\uD14C\uC2A4\uD2B8 \uD604\uC7A5 S+A",
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

  const evaluatorsOnlyA = selectScheduleEvaluators(schedule, subjects[0].worker, workers, rules.probationEvalGrades);
  assert(evaluatorsOnlyA.length === 1, "without S on schedule only A should be selected");
  assert(evaluatorsOnlyA[0].worker.id === "w2", "A-grade worker should evaluate");

  const evaluatorsWithS = selectScheduleEvaluators(
    scheduleWithS,
    subjects[0].worker,
    workers,
    rules.probationEvalGrades,
  );
  assert(evaluatorsWithS.length === 2, "S on schedule should notify both S and A");
  assert(
    evaluatorsWithS.some((row) => row.worker.id === "w2") && evaluatorsWithS.some((row) => row.worker.id === "w4"),
    "both A and S evaluators should be selected",
  );

  const legacySingle = selectScheduleEvaluator(schedule, subjects[0].worker, workers, rules.probationEvalGrades);
  assert(legacySingle?.worker.id === "w2", "legacy helper should return first evaluator");

  const fallbackSubject = findEvalSubjectsOnSchedule(scheduleFallback, workers, rules)[0];
  const fallbackEvaluators = selectScheduleEvaluators(
    scheduleFallback,
    fallbackSubject.worker,
    workers,
    rules.probationEvalGrades,
  );
  assert(fallbackEvaluators.length === 1, "fallback should pick one evaluator");
  assert(fallbackEvaluators[0].worker.id === "w3", "fallback should pick highest eligible participant");
  assert(fallbackEvaluators[0].selectionReason === "highest_grade_fallback", "should be fallback");

  const sameGradeSubject = findEvalSubjectsOnSchedule(scheduleSameGrade, workers, rulesWithD).find(
    (row) => row.worker.id === "w5",
  );
  assert(sameGradeSubject, "D worker should be subject when max is D");
  const sameGradeEvaluators = selectScheduleEvaluators(
    scheduleSameGrade,
    sameGradeSubject.worker,
    workers,
    rulesWithD.probationEvalGrades,
  );
  assert(sameGradeEvaluators.length === 0, "E worker cannot evaluate D subject (lower rank)");

  const soloSchedule = {
    id: "sch-3",
    workDate: "2026-06-10",
    participantNames: ["\uAE40\uC218\uC2B5"],
  };
  const soloSubject = findEvalSubjectsOnSchedule(soloSchedule, workers, rules)[0];
  const soloEvaluators = selectScheduleEvaluators(soloSchedule, soloSubject.worker, workers, rules.probationEvalGrades);
  assert(soloEvaluators.length === 0, "solo subject should have no evaluator");

  console.log("verify-probation-eval-assign: ok");
}

main();
