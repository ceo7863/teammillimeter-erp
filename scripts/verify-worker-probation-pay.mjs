import {
  DEFAULT_WORKER_AI_RULES,
  resolveEffectiveProbationPay,
  resolveEffectiveProbationPayWithVat,
  resolveEffectivePostProbationValues,
  resolveWorkerAiProbationFinalPay,
  resolveWorkerProbationExpectedAmount,
} from "../src/utils/workerAiRules.ts";
import { calculateWorkerPaymentVat } from "../src/utils/workerMonthlyPayments.ts";
import {
  applyProbationEndAdjustments,
  enforceProbationEGradeOnWorkers,
  isWorkerInProbationPeriod,
} from "../src/utils/workerProbationAutoAdjust.ts";

if (DEFAULT_WORKER_AI_RULES.probationNetPay !== 2_000_000) {
  throw new Error(`expected probation net pay 2000000, got ${DEFAULT_WORKER_AI_RULES.probationNetPay}`);
}
if (DEFAULT_WORKER_AI_RULES.postProbationGrade !== "D") {
  throw new Error(`expected postProbationGrade D, got ${DEFAULT_WORKER_AI_RULES.postProbationGrade}`);
}
if (DEFAULT_WORKER_AI_RULES.autoAdjustGradeOnProbationEnd !== true) {
  throw new Error("expected autoAdjustGradeOnProbationEnd default true");
}
if (resolveWorkerAiProbationFinalPay(DEFAULT_WORKER_AI_RULES) !== 2_200_000) {
  throw new Error("expected probation final pay 2200000");
}
if (resolveWorkerProbationExpectedAmount() !== 2_000_000) {
  throw new Error("expected default probation expected amount 2000000");
}
if (resolveWorkerProbationExpectedAmount(1_800_000) !== 1_800_000) {
  throw new Error("expected saved probation expected amount to be preserved");
}

if (resolveEffectiveProbationPay({ probationNetPay: 1_900_000 }, DEFAULT_WORKER_AI_RULES) !== 1_900_000) {
  throw new Error("expected worker probation net pay override");
}
if (resolveEffectiveProbationPay({}, DEFAULT_WORKER_AI_RULES) !== 2_000_000) {
  throw new Error("expected global probation net pay fallback");
}
if (resolveEffectiveProbationPayWithVat({ probationPayWithVat: false }, DEFAULT_WORKER_AI_RULES) !== false) {
  throw new Error("expected worker probation pay-with-vat override");
}
if (resolveEffectiveProbationPayWithVat({}, DEFAULT_WORKER_AI_RULES) !== true) {
  throw new Error("expected global probation pay-with-vat fallback");
}

const effectivePost = resolveEffectivePostProbationValues(
  { postProbationConstructionCost: 500000, postProbationGrade: "B" },
  DEFAULT_WORKER_AI_RULES,
);
if (effectivePost.postProbationConstructionCost !== 500000) {
  throw new Error("expected worker post probation construction override");
}
if (effectivePost.postProbationGrade !== "B") {
  throw new Error("expected worker post probation grade override");
}

const withVat = calculateWorkerPaymentVat(DEFAULT_WORKER_AI_RULES.probationNetPay, true);
if (withVat.finalPayAmount !== 2_200_000) {
  throw new Error(`expected probation with-vat total 2200000, got ${withVat.finalPayAmount}`);
}

if (!isWorkerInProbationPeriod({ hireDate: "2020-01-01" }, DEFAULT_WORKER_AI_RULES, "2020-03-01")) {
  throw new Error("expected worker to be in probation period");
}
if (isWorkerInProbationPeriod({ hireDate: "2020-01-01" }, DEFAULT_WORKER_AI_RULES, "2020-04-02")) {
  throw new Error("expected worker to be out of probation period");
}

const enforced = enforceProbationEGradeOnWorkers(
  [{ id: "1", name: "test", grade: "D", hireDate: "2025-01-01", isActive: true }],
  DEFAULT_WORKER_AI_RULES,
  "2025-02-01",
);
if (!enforced.changed || enforced.workers[0].grade !== "E") {
  throw new Error("expected probation E grade enforcement");
}

const worker = {
  id: "test-e",
  name: "???",
  grade: "E",
  hireDate: "2020-01-01",
  constructionCost: 100000,
  customChargeCost: 100000,
  isActive: true,
};
const adjusted = applyProbationEndAdjustments(
  [worker],
  {
    ...DEFAULT_WORKER_AI_RULES,
    postProbationConstructionCost: 350000,
    postProbationCustomChargeCost: 400000,
  },
  "2020-05-01",
);
if (!adjusted.changed) {
  throw new Error("expected probation end adjustment");
}
if (adjusted.workers[0].constructionCost !== 350000) {
  throw new Error("expected constructionCost adjustment");
}
if (adjusted.workers[0].customChargeCost !== 400000) {
  throw new Error("expected customChargeCost adjustment");
}
if (adjusted.workers[0].grade !== "D") {
  throw new Error("expected grade adjustment to D");
}

const perWorkerAdjusted = applyProbationEndAdjustments(
  [
    {
      ...worker,
      id: "test-e2",
      probationAdjustedAt: "",
      postProbationConstructionCost: 280000,
      postProbationCustomChargeCost: 320000,
      postProbationGrade: "C",
    },
  ],
  DEFAULT_WORKER_AI_RULES,
  "2020-05-01",
);
if (perWorkerAdjusted.workers[0].constructionCost !== 280000) {
  throw new Error("expected per-worker constructionCost override");
}
if (perWorkerAdjusted.workers[0].customChargeCost !== 320000) {
  throw new Error("expected per-worker customChargeCost override");
}
if (perWorkerAdjusted.workers[0].grade !== "C") {
  throw new Error("expected per-worker grade override");
}

console.log("verify-worker-probation-pay: ok");
