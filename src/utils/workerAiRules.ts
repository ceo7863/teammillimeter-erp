import { parseMoney } from "@/utils/receivables";
import { calculateWorkerPaymentVat } from "@/utils/workerMonthlyPayments";
import type { WorkerMasterLike } from "@/utils/workerPayments";

export type WorkerAiRules = {
  probationNetPay: number;
  probationPayWithVat: boolean;
  probationMonths: number;
  alertLeadDays: number;
  autoAdjustOnProbationEnd: boolean;
  postProbationConstructionCost: number;
  postProbationCustomChargeCost: number;
  autoAdjustGradeOnProbationEnd: boolean;
  postProbationGrade: string;
  enforceEGradeDuringProbation: boolean;
  /** Eval subject max grade (E~S). Grade rules for who gets evaluated. */
  probationEvalSubjectMaxGrade: string;
  probationEvalGrades: string[];
  /** How evaluators are picked on each SC schedule. */
  probationEvalEvaluatorMode: ProbationEvalEvaluatorMode;
  /** Extra grades to notify when S is on site (s_plus_companion_when_s mode). */
  probationEvalSCompanionGrades: string[];
  probationEvalTemplateId: string;
};

export type ProbationEvalEvaluatorMode = "highest" | "all_matching" | "s_plus_companion_when_s";

export const PROBATION_EVAL_EVALUATOR_MODE_OPTIONS: Array<{
  value: ProbationEvalEvaluatorMode;
  label: string;
  hint: string;
}> = [
  {
    value: "highest",
    label: "설정 등급 중 최고 1명",
    hint: "같은 현장에서 허용 등급 중 가장 높은 등급 1명만 알림톡",
  },
  {
    value: "all_matching",
    label: "설정 등급 해당자 전원",
    hint: "허용 등급에 해당하는 참여자 모두에게 각각 발송",
  },
  {
    value: "s_plus_companion_when_s",
    label: "S 현장 시 S + 동반 등급",
    hint: "S등급 참여자가 있으면 S와 아래 동반 등급(기본 A) 모두, 없으면 최고 1명",
  },
];

export const PROBATION_EVAL_SUBJECT_GRADE_OPTIONS = ["E", "D", "C", "B", "A", "S"];
export const PROBATION_EVAL_EVALUATOR_GRADE_OPTIONS = ["S", "A", "B", "C", "D"];
export const PROBATION_EVAL_COMPANION_GRADE_OPTIONS = ["A", "B", "C", "D"];

export const DEFAULT_WORKER_AI_RULES: WorkerAiRules = {
  probationNetPay: 2_000_000,
  probationPayWithVat: true,
  probationMonths: 3,
  alertLeadDays: 3,
  autoAdjustOnProbationEnd: true,
  postProbationConstructionCost: 0,
  postProbationCustomChargeCost: 0,
  autoAdjustGradeOnProbationEnd: true,
  postProbationGrade: "D",
  enforceEGradeDuringProbation: true,
  probationEvalSubjectMaxGrade: "E",
  probationEvalGrades: ["S", "A"],
  probationEvalEvaluatorMode: "s_plus_companion_when_s",
  probationEvalSCompanionGrades: ["A"],
  probationEvalTemplateId: "default-v1",
};

const WORKER_GRADE_OPTIONS = ["S", "A", "B", "C", "D", "E"];

function clampPositiveMoney(value: unknown, fallback: number) {
  const amount = parseMoney(value);
  if (!Number.isFinite(amount) || amount < 0) return fallback;
  return Math.round(amount);
}

function clampPositiveInt(value: unknown, fallback: number, max = 12) {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(max, num);
}

function normalizeProbationEvalGrades(value: unknown, fallback: string[]) {
  const list = Array.isArray(value) ? value : fallback;
  const normalized = [...new Set(list.map((grade) => String(grade || "").trim().toUpperCase()).filter(Boolean))];
  return normalized.filter((grade) => WORKER_GRADE_OPTIONS.includes(grade));
}

function normalizeProbationEvalEvaluatorMode(value: unknown, fallback: ProbationEvalEvaluatorMode) {
  const mode = String(value || "").trim() as ProbationEvalEvaluatorMode;
  if (PROBATION_EVAL_EVALUATOR_MODE_OPTIONS.some((row) => row.value === mode)) return mode;
  return fallback;
}

function normalizeCompanionGrades(value: unknown, fallback: string[]) {
  const list = Array.isArray(value) ? value : fallback;
  const normalized = [...new Set(list.map((grade) => String(grade || "").trim().toUpperCase()).filter(Boolean))];
  return normalized.filter((grade) => PROBATION_EVAL_COMPANION_GRADE_OPTIONS.includes(grade));
}

function clampHour(value: unknown, fallback: number) {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return fallback;
  return Math.min(23, Math.max(0, num));
}

function clampMinute(value: unknown, fallback: number) {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return fallback;
  return Math.min(59, Math.max(0, num));
}

function normalizeEvalSubjectMaxGrade(value: unknown, fallback: string) {
  const grade = String(value || "")
    .trim()
    .toUpperCase();
  if (WORKER_GRADE_OPTIONS.includes(grade)) return grade;
  const fallbackGrade = String(fallback || "")
    .trim()
    .toUpperCase();
  if (WORKER_GRADE_OPTIONS.includes(fallbackGrade)) return fallbackGrade;
  return DEFAULT_WORKER_AI_RULES.probationEvalSubjectMaxGrade;
}

function normalizePostProbationGrade(value: unknown, fallback: string) {
  const grade = String(value || "")
    .trim()
    .toUpperCase();
  if (WORKER_GRADE_OPTIONS.includes(grade) && grade !== "E") return grade;
  const fallbackGrade = String(fallback || "")
    .trim()
    .toUpperCase();
  if (WORKER_GRADE_OPTIONS.includes(fallbackGrade) && fallbackGrade !== "E") return fallbackGrade;
  return DEFAULT_WORKER_AI_RULES.postProbationGrade;
}

export function normalizeWorkerAiRules(raw: unknown): WorkerAiRules {
  const row = raw && typeof raw === "object" ? (raw as Partial<WorkerAiRules>) : {};
  return {
    probationNetPay:
      row.probationNetPay != null && row.probationNetPay !== ""
        ? clampPositiveMoney(row.probationNetPay, DEFAULT_WORKER_AI_RULES.probationNetPay)
        : DEFAULT_WORKER_AI_RULES.probationNetPay,
    probationPayWithVat: row.probationPayWithVat !== false,
    probationMonths: clampPositiveInt(row.probationMonths, DEFAULT_WORKER_AI_RULES.probationMonths),
    alertLeadDays: clampPositiveInt(row.alertLeadDays, DEFAULT_WORKER_AI_RULES.alertLeadDays, 30),
    autoAdjustOnProbationEnd: row.autoAdjustOnProbationEnd !== false,
    postProbationConstructionCost: clampPositiveMoney(
      row.postProbationConstructionCost,
      DEFAULT_WORKER_AI_RULES.postProbationConstructionCost,
    ),
    postProbationCustomChargeCost: clampPositiveMoney(
      row.postProbationCustomChargeCost,
      DEFAULT_WORKER_AI_RULES.postProbationCustomChargeCost,
    ),
    autoAdjustGradeOnProbationEnd: row.autoAdjustGradeOnProbationEnd !== false,
    postProbationGrade: normalizePostProbationGrade(
      row.postProbationGrade,
      DEFAULT_WORKER_AI_RULES.postProbationGrade,
    ),
    enforceEGradeDuringProbation: row.enforceEGradeDuringProbation !== false,
    probationEvalSubjectMaxGrade: normalizeEvalSubjectMaxGrade(
      row.probationEvalSubjectMaxGrade,
      DEFAULT_WORKER_AI_RULES.probationEvalSubjectMaxGrade,
    ),
    probationEvalGrades: normalizeProbationEvalGrades(
      row.probationEvalGrades,
      DEFAULT_WORKER_AI_RULES.probationEvalGrades,
    ),
    probationEvalEvaluatorMode: normalizeProbationEvalEvaluatorMode(
      row.probationEvalEvaluatorMode,
      DEFAULT_WORKER_AI_RULES.probationEvalEvaluatorMode,
    ),
    probationEvalSCompanionGrades: normalizeCompanionGrades(
      row.probationEvalSCompanionGrades,
      DEFAULT_WORKER_AI_RULES.probationEvalSCompanionGrades,
    ),
    probationEvalTemplateId:
      String(row.probationEvalTemplateId || DEFAULT_WORKER_AI_RULES.probationEvalTemplateId).trim() ||
      DEFAULT_WORKER_AI_RULES.probationEvalTemplateId,
  };
}

export function resolveWorkerAiProbationNetPay(rules?: Pick<WorkerAiRules, "probationNetPay"> | null) {
  const raw = rules?.probationNetPay;
  if (raw == null || raw === "") return DEFAULT_WORKER_AI_RULES.probationNetPay;
  return clampPositiveMoney(raw, DEFAULT_WORKER_AI_RULES.probationNetPay);
}

export function resolveWorkerAiProbationFinalPay(
  rules?: Pick<WorkerAiRules, "probationNetPay" | "probationPayWithVat"> | null,
) {
  const netPay = resolveWorkerAiProbationNetPay(rules);
  const payWithVat = rules?.probationPayWithVat !== false;
  return calculateWorkerPaymentVat(netPay, payWithVat).finalPayAmount;
}

export function resolveWorkerProbationExpectedAmount(
  savedExpectedAmount?: number | null,
  rules?: Pick<WorkerAiRules, "probationNetPay"> | null,
) {
  const saved = Math.round(Number(savedExpectedAmount) || 0);
  if (saved > 0) return saved;
  return resolveWorkerAiProbationNetPay(rules);
}

export function resolveEffectiveProbationPay(
  worker?: Pick<WorkerMasterLike, "probationNetPay"> | null,
  rules?: Pick<WorkerAiRules, "probationNetPay"> | null,
) {
  const workerVal = worker?.probationNetPay;
  if (workerVal != null && workerVal !== "") {
    return clampPositiveMoney(workerVal, DEFAULT_WORKER_AI_RULES.probationNetPay);
  }
  return resolveWorkerAiProbationNetPay(rules);
}

export function resolveEffectiveProbationPayWithVat(
  worker?: Pick<WorkerMasterLike, "probationPayWithVat"> | null,
  rules?: Pick<WorkerAiRules, "probationPayWithVat"> | null,
) {
  if (worker?.probationPayWithVat !== undefined) {
    return worker.probationPayWithVat;
  }
  return rules?.probationPayWithVat !== false;
}

export function resolveEffectivePostProbationValues(
  worker?: Pick<
    WorkerMasterLike,
    "postProbationConstructionCost" | "postProbationCustomChargeCost" | "postProbationGrade"
  > | null,
  rulesInput?: WorkerAiRules | null,
) {
  const rules = normalizeWorkerAiRules(rulesInput);
  const workerConstruction = parseMoney(worker?.postProbationConstructionCost);
  const workerCustomCharge = parseMoney(worker?.postProbationCustomChargeCost);
  const workerGrade = String(worker?.postProbationGrade || "")
    .trim()
    .toUpperCase();

  return {
    postProbationConstructionCost:
      workerConstruction > 0 ? workerConstruction : rules.postProbationConstructionCost,
    postProbationCustomChargeCost:
      workerCustomCharge > 0 ? workerCustomCharge : rules.postProbationCustomChargeCost,
    postProbationGrade:
      WORKER_GRADE_OPTIONS.includes(workerGrade) && workerGrade !== "E"
        ? workerGrade
        : rules.postProbationGrade,
  };
}
