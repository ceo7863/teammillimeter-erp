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
  probationEvalEnabled: boolean;
  /** E~S. Workers at this grade and below (lower rank) are evaluation subjects. */
  probationEvalSubjectMaxGrade: string;
  probationEvalGrades: string[];
  probationEvalNotifyHour: number;
  probationEvalNotifyMinute: number;
  probationEvalReminderEnabled: boolean;
  probationEvalTemplateId: string;
};

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
  probationEvalEnabled: true,
  probationEvalSubjectMaxGrade: "E",
  probationEvalGrades: ["A"],
  probationEvalNotifyHour: 19,
  probationEvalNotifyMinute: 0,
  probationEvalReminderEnabled: true,
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
    probationEvalEnabled: row.probationEvalEnabled !== false,
    probationEvalSubjectMaxGrade: normalizeEvalSubjectMaxGrade(
      row.probationEvalSubjectMaxGrade,
      DEFAULT_WORKER_AI_RULES.probationEvalSubjectMaxGrade,
    ),
    probationEvalGrades: normalizeProbationEvalGrades(
      row.probationEvalGrades,
      DEFAULT_WORKER_AI_RULES.probationEvalGrades,
    ),
    probationEvalNotifyHour: clampHour(row.probationEvalNotifyHour, DEFAULT_WORKER_AI_RULES.probationEvalNotifyHour),
    probationEvalNotifyMinute: clampMinute(
      row.probationEvalNotifyMinute,
      DEFAULT_WORKER_AI_RULES.probationEvalNotifyMinute,
    ),
    probationEvalReminderEnabled: row.probationEvalReminderEnabled !== false,
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
