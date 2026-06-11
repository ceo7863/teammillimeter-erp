export const DEFAULT_WORKER_AI_RULES = {
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
  probationEvalGrades: ["A"],
  probationEvalTemplateId: "default-v1",
};

const WORKER_GRADE_OPTIONS = ["S", "A", "B", "C", "D", "E"];

function parseMoney(value) {
  if (value == null || value === "") return 0;
  const amount = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function clampPositiveMoney(value, fallback) {
  if (value == null || value === "") return fallback;
  const amount = parseMoney(value);
  if (!Number.isFinite(amount) || amount < 0) return fallback;
  return Math.round(amount);
}

function clampPositiveInt(value, fallback, max = 12) {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(max, num);
}

function normalizeProbationEvalGrades(value, fallback) {
  const list = Array.isArray(value) ? value : fallback;
  const normalized = [...new Set(list.map((grade) => String(grade || "").trim().toUpperCase()).filter(Boolean))];
  return normalized.filter((grade) => WORKER_GRADE_OPTIONS.includes(grade));
}

function clampHour(value, fallback) {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return fallback;
  return Math.min(23, Math.max(0, num));
}

function clampMinute(value, fallback) {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return fallback;
  return Math.min(59, Math.max(0, num));
}

function normalizeEvalSubjectMaxGrade(value, fallback) {
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

function normalizePostProbationGrade(value, fallback) {
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

export function normalizeWorkerAiRules(raw) {
  const row = raw && typeof raw === "object" ? raw : {};
  return {
    probationNetPay: clampPositiveMoney(row.probationNetPay, DEFAULT_WORKER_AI_RULES.probationNetPay),
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
    probationEvalTemplateId:
      String(row.probationEvalTemplateId || DEFAULT_WORKER_AI_RULES.probationEvalTemplateId).trim() ||
      DEFAULT_WORKER_AI_RULES.probationEvalTemplateId,
  };
}
