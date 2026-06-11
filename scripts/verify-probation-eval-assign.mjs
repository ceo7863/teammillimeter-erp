import { selectScheduleEvaluator, findProbationWorkersOnSchedule, gradeRank } from "../server/probationEvalAssign.mjs";
import { normalizeWorkerAiRules } from "../server/workerAiRules.mjs";

const rules = normalizeWorkerAiRules({ probationMonths: 3, probationEvalGrades: ["S", "A"] });

const workers = [
  { id: "w1", name: "\uAE40\uC218\uC2B5", grade: "E", hireDate: "2026-04-01", phone: "01011112222" },
  { id: "w2", name: "\uBC15\uC2B9\uAE30", grade: "A", hireDate: "2024-01-01", phone: "01033334444" },
  { id: "w3", name: "\uC774\uC900\uBAA9", grade: "C", hireDate: "2025-01-01", phone: "01055556666" },
  { id: "w4", name: "\uCD5C\uACE0\uAE09", grade: "S", hireDate: "2023-01-01", phone: "01077778888" },
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  assert(gradeRank("S") > gradeRank("A"), "S should outrank A");
  assert(gradeRank("E") === 1, "E should be lowest rank");

  const probationWorkers = findProbationWorkersOnSchedule(schedule, workers, rules, "2026-06-10");
  assert(probationWorkers.length === 1, "expected one probation worker");
  assert(probationWorkers[0].worker.id === "w1", "probation worker should be w1");

  const evaluator = selectScheduleEvaluator(schedule, probationWorkers[0].worker, workers, rules.probationEvalGrades);
  assert(evaluator, "evaluator should be selected");
  assert(evaluator.worker.id === "w2", "grade match should pick A-grade worker");
  assert(evaluator.selectionReason === "grade_match", "should be grade_match");

  const fallbackProbation = findProbationWorkersOnSchedule(scheduleFallback, workers, rules, "2026-06-10")[0];
  const fallbackEvaluator = selectScheduleEvaluator(
    scheduleFallback,
    fallbackProbation.worker,
    workers,
    rules.probationEvalGrades,
  );
  assert(fallbackEvaluator, "fallback evaluator should exist");
  assert(fallbackEvaluator.worker.id === "w3", "fallback should pick highest grade participant");
  assert(fallbackEvaluator.selectionReason === "highest_grade_fallback", "should be fallback");

  const soloSchedule = {
    id: "sch-3",
    workDate: "2026-06-10",
    participantNames: ["\uAE40\uC218\uC2B5"],
  };
  const soloProbation = findProbationWorkersOnSchedule(soloSchedule, workers, rules, "2026-06-10")[0];
  const soloEvaluator = selectScheduleEvaluator(soloSchedule, soloProbation.worker, workers, rules.probationEvalGrades);
  assert(soloEvaluator === null, "solo probation worker should have no evaluator");

  console.log("verify-probation-eval-assign: ok");
}

main();
