export type {
  ProbationEvalAnswer,
  ProbationEvalQuestion,
  ProbationEvalQuestionType,
  ProbationEvalRequest,
  ProbationEvalRequestStatus,
  ProbationEvalSelectionReason,
  ProbationEvalTemplate,
} from "@/utils/probationEvalTypes";
import type {
  ProbationEvalAnswer,
  ProbationEvalQuestion,
  ProbationEvalRequest,
  ProbationEvalRequestStatus,
  ProbationEvalSelectionReason,
  ProbationEvalTemplate,
} from "@/utils/probationEvalTypes";
import { WORKER_GRADE_RANK } from "@/utils/probationEvalTypes";
export { WORKER_GRADE_RANK };

export function gradeRank(grade: string) {
  return WORKER_GRADE_RANK[String(grade || "").trim().toUpperCase()] ?? 0;
}

export function isWorkerEvalSubject(
  worker: { grade?: string | null },
  subjectMaxGrade: string,
) {
  const workerRank = gradeRank(String(worker?.grade || ""));
  const maxRank = gradeRank(String(subjectMaxGrade || ""));
  if (!workerRank || !maxRank) return false;
  return workerRank <= maxRank;
}

const DEFAULT_QUESTIONS: ProbationEvalQuestion[] = [
  {
    id: "q-speed",
    label: "\uC791\uC5C5 \uC18D\uB3C4",
    type: "scale5",
    required: true,
    weight: 1.2,
    sortOrder: 1,
    active: true,
  },
  {
    id: "q-quality",
    label: "\uC791\uC5C5 \uD488\uC9C8",
    type: "scale5",
    required: true,
    weight: 1.5,
    sortOrder: 2,
    active: true,
  },
  {
    id: "q-safety",
    label: "\uC548\uC804 \u00B7 \uCCAD\uC18C",
    type: "scale5",
    required: true,
    weight: 1,
    sortOrder: 3,
    active: true,
  },
  {
    id: "q-teamwork",
    label: "\uD611\uC5C5 \u00B7 \uCEE4\uBAE4\uB2C8\uCF00\uC774\uC158",
    type: "scale5",
    required: true,
    weight: 1,
    sortOrder: 4,
    active: true,
  },
  {
    id: "q-customer",
    label: "\uACE0\uAC1D \uC751\uB300",
    type: "scale5",
    required: true,
    weight: 0.8,
    sortOrder: 5,
    active: true,
  },
  {
    id: "q-rework",
    label: "\uC7AC\uC791\uC5C5 \uBC1C\uC0DD",
    type: "yesno",
    required: true,
    weight: 1,
    sortOrder: 6,
    active: true,
  },
  {
    id: "q-attendance",
    label: "\uCD9C\uADFC \u00B7 \uC2DC\uAC04 \uC900\uC218",
    type: "scale5",
    required: true,
    weight: 1,
    sortOrder: 7,
    active: true,
  },
  {
    id: "q-overall",
    label: "\uC885\uD569 \uD3C9\uAC00",
    type: "scale5",
    required: true,
    weight: 1.5,
    sortOrder: 8,
    active: true,
  },
];

export const DEFAULT_PROBATION_EVAL_TEMPLATE_ID = "default-v1";

export function createDefaultProbationEvalTemplate(now = new Date().toISOString()): ProbationEvalTemplate {
  return {
    id: DEFAULT_PROBATION_EVAL_TEMPLATE_ID,
    name: "\uAE30\uBCF8 \uC218\uC2B5 \uD3C9\uAC00 \uC591\uC2DD",
    version: 1,
    questions: DEFAULT_QUESTIONS.map((row) => ({ ...row })),
    createdAt: now,
  };
}

function normalizeQuestion(raw: unknown, index: number): ProbationEvalQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<ProbationEvalQuestion>;
  const id = String(row.id || "").trim();
  const label = String(row.label || "").trim();
  if (!id || !label) return null;
  const type = row.type === "yesno" || row.type === "checkbox" ? row.type : "scale5";
  const weight = Number(row.weight);
  const sortOrder = Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index + 1;
  return {
    id,
    label,
    type,
    required: row.required !== false,
    weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
    sortOrder,
    active: row.active !== false,
  };
}

export function normalizeProbationEvalTemplate(raw: unknown): ProbationEvalTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<ProbationEvalTemplate>;
  const id = String(row.id || "").trim();
  if (!id) return null;
  const questions = (Array.isArray(row.questions) ? row.questions : [])
    .map((item, index) => normalizeQuestion(item, index))
    .filter(Boolean) as ProbationEvalQuestion[];
  questions.sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id,
    name: String(row.name || "").trim() || "\uD3C9\uAC00 \uC591\uC2DD",
    version: Math.max(1, Math.round(Number(row.version) || 1)),
    questions,
    createdAt: String(row.createdAt || new Date().toISOString()),
  };
}

export function normalizeProbationEvalTemplates(raw: unknown): ProbationEvalTemplate[] {
  const list = Array.isArray(raw) ? raw : [];
  const normalized = list.map((item) => normalizeProbationEvalTemplate(item)).filter(Boolean) as ProbationEvalTemplate[];
  if (!normalized.some((row) => row.id === DEFAULT_PROBATION_EVAL_TEMPLATE_ID)) {
    normalized.unshift(createDefaultProbationEvalTemplate());
  }
  return normalized;
}

export function resolveActiveProbationEvalTemplate(
  templates: ProbationEvalTemplate[],
  templateId?: string | null,
) {
  const list = normalizeProbationEvalTemplates(templates);
  const targetId = String(templateId || DEFAULT_PROBATION_EVAL_TEMPLATE_ID).trim();
  return list.find((row) => row.id === targetId) || list[0] || createDefaultProbationEvalTemplate();
}

function normalizeAnswer(raw: unknown): ProbationEvalAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<ProbationEvalAnswer>;
  const questionId = String(row.questionId || "").trim();
  if (!questionId) return null;
  if (typeof row.value === "boolean") return { questionId, value: row.value };
  const num = Number(row.value);
  if (!Number.isFinite(num)) return null;
  return { questionId, value: num };
}

export function normalizeProbationEvalRequest(raw: unknown): ProbationEvalRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<ProbationEvalRequest>;
  const id = String(row.id || "").trim();
  const token = String(row.token || "").trim();
  const workDate = String(row.workDate || "").slice(0, 10);
  const scheduleId = String(row.scheduleId || "").trim();
  const probationWorkerId = String(row.probationWorkerId || "").trim();
  const evaluatorWorkerId = String(row.evaluatorWorkerId || "").trim();
  if (!id || !token || !workDate || !scheduleId || !probationWorkerId || !evaluatorWorkerId) return null;
  const status =
    row.status === "sent" || row.status === "submitted" || row.status === "expired" ? row.status : "pending";
  const selectionReason = row.selectionReason === "highest_grade_fallback" ? "highest_grade_fallback" : "grade_match";
  const answers = (Array.isArray(row.answers) ? row.answers : [])
    .map((item) => normalizeAnswer(item))
    .filter(Boolean) as ProbationEvalAnswer[];
  return {
    id,
    token,
    workDate,
    scheduleId,
    siteName: String(row.siteName || "").trim(),
    probationWorkerId,
    probationWorkerName: String(row.probationWorkerName || "").trim(),
    evaluatorWorkerId,
    evaluatorName: String(row.evaluatorName || "").trim(),
    evaluatorPhone: String(row.evaluatorPhone || "").trim(),
    templateId: String(row.templateId || DEFAULT_PROBATION_EVAL_TEMPLATE_ID).trim(),
    status,
    sentAt: row.sentAt ? String(row.sentAt) : undefined,
    submittedAt: row.submittedAt ? String(row.submittedAt) : undefined,
    reminderSentAt: row.reminderSentAt ? String(row.reminderSentAt) : undefined,
    selectionReason,
    answers: answers.length ? answers : undefined,
    totalScore: row.totalScore != null && Number.isFinite(Number(row.totalScore)) ? Number(row.totalScore) : undefined,
  };
}

export function normalizeProbationEvalRequests(raw: unknown): ProbationEvalRequest[] {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => normalizeProbationEvalRequest(item))
    .filter(Boolean) as ProbationEvalRequest[];
}

export function probationEvalRequestKey(
  workDate: string,
  scheduleId: string,
  probationWorkerId: string,
  evaluatorWorkerId?: string,
) {
  const base = `${String(workDate).slice(0, 10)}:${String(scheduleId)}:${String(probationWorkerId)}`;
  const evaluatorId = String(evaluatorWorkerId ?? "").trim();
  return evaluatorId ? `${base}:${evaluatorId}` : base;
}

export function computeAnswerScore(question: ProbationEvalQuestion, value: number | boolean) {
  if (question.type === "yesno") {
    const yes = value === true || value === 1;
    return yes ? 0 : 100;
  }
  if (question.type === "checkbox") {
    return value === true || value === 1 ? 100 : 0;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const clamped = Math.min(5, Math.max(1, Math.round(num)));
  return ((clamped - 1) / 4) * 100;
}

export function computeTotalScore(answers: ProbationEvalAnswer[], template: ProbationEvalTemplate) {
  const activeQuestions = template.questions.filter((row) => row.active);
  if (!activeQuestions.length) return 0;
  const answerMap = new Map(answers.map((row) => [row.questionId, row.value]));
  let weightedSum = 0;
  let weightTotal = 0;
  for (const question of activeQuestions) {
    const value = answerMap.get(question.id);
    if (value === undefined) continue;
    const score = computeAnswerScore(question, value);
    weightedSum += score * question.weight;
    weightTotal += question.weight;
  }
  if (!weightTotal) return 0;
  return Math.round((weightedSum / weightTotal) * 10) / 10;
}
