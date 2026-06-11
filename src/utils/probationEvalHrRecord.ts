import {
  aggregateByQuestion,
  dailyCompletionRate,
  dailyTrend,
  type QuestionAverage,
} from "@/utils/probationEvalAnalytics";
import {
  normalizeProbationEvalRequests,
  resolveActiveProbationEvalTemplate,
  type ProbationEvalQuestion,
  type ProbationEvalRequest,
  type ProbationEvalTemplate,
} from "@/utils/probationEval";
import type { WorkerMasterLike } from "@/utils/workerPayments";
import { normalizeWorkerRecordId } from "@/utils/workerPayments";
import type { CompanyProfile } from "@/utils/companyProfile";

export type WorkerQuestionScore = QuestionAverage & {
  averageScale: number | null;
};

export type PromotionGrade = "strong" | "recommend" | "hold" | "reject";

export type PromotionAssessment = {
  grade: PromotionGrade;
  label: string;
  summary: string;
  strengths: string[];
  improvements: string[];
};

export type WorkerHrRecordData = {
  workerId: string;
  workerName: string;
  worker: WorkerMasterLike | null;
  periodFrom: string;
  periodTo: string;
  issuedAt: string;
  documentNo: string;
  evalCount: number;
  submittedCount: number;
  completionRate: number;
  averageScore: number;
  latestScore: number | null;
  questionScores: WorkerQuestionScore[];
  trend: ReturnType<typeof dailyTrend>;
  requests: ProbationEvalRequest[];
  assessment: PromotionAssessment;
};

function todayKstISO() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}

function scaleFromPercent(score: number, question?: ProbationEvalQuestion) {
  if (!question || question.type !== "scale5") return null;
  const clamped = Math.min(100, Math.max(0, score));
  return Math.round(((clamped / 100) * 4 + 1) * 10) / 10;
}

export function resolveWorkerForEval(
  workers: WorkerMasterLike[],
  workerId: string,
  workerName?: string,
): WorkerMasterLike | null {
  const id = normalizeWorkerRecordId(workerId);
  if (id) {
    const byId = workers.find((row) => normalizeWorkerRecordId(row.id) === id);
    if (byId) return byId;
  }
  const name = String(workerName || "").trim().replace(/\s+/g, "");
  if (!name) return null;
  return (
    workers.find((row) => String(row.name || "").trim().replace(/\s+/g, "") === name) || null
  );
}

export function filterWorkerEvalRequests(
  requests: ProbationEvalRequest[],
  workerId: string,
  dateFrom?: string,
  dateTo?: string,
) {
  const id = normalizeWorkerRecordId(workerId);
  const from = dateFrom?.slice(0, 10);
  const to = dateTo?.slice(0, 10);
  return normalizeProbationEvalRequests(requests).filter((row) => {
    if (normalizeWorkerRecordId(row.probationWorkerId) !== id) return false;
    if (from && row.workDate < from) return false;
    if (to && row.workDate > to) return false;
    return true;
  });
}

export function aggregateWorkerQuestionScores(
  workerId: string,
  requests: ProbationEvalRequest[],
  templateInput: ProbationEvalTemplate | ProbationEvalTemplate[],
  dateFrom?: string,
  dateTo?: string,
): WorkerQuestionScore[] {
  const template = Array.isArray(templateInput)
    ? resolveActiveProbationEvalTemplate(templateInput)
    : templateInput;
  const filtered = filterWorkerEvalRequests(requests, workerId, dateFrom, dateTo);
  const rows = aggregateByQuestion(filtered, template);
  const questionById = new Map(template.questions.map((row) => [row.id, row]));
  return rows.map((row) => {
    const question = questionById.get(row.questionId);
    return {
      ...row,
      averageScale: row.responseCount ? scaleFromPercent(row.averageScore, question) : null,
    };
  });
}

export function assessPromotionRecommendation(input: {
  averageScore: number;
  completionRate: number;
  submittedCount: number;
  questionScores: WorkerQuestionScore[];
  trend: ReturnType<typeof dailyTrend>;
}): PromotionAssessment {
  const { averageScore, completionRate, submittedCount, questionScores, trend } = input;
  const activeScores = questionScores.filter((row) => row.responseCount > 0);
  const sorted = [...activeScores].sort((a, b) => b.averageScore - a.averageScore);
  const strengths = sorted.slice(0, 2).map((row) => row.label);
  const improvements = [...activeScores]
    .sort((a, b) => a.averageScore - b.averageScore)
    .slice(0, 2)
    .map((row) => row.label);

  const recent = trend.slice(-5);
  const early = trend.slice(0, 5);
  const recentAvg =
    recent.length > 0 ? recent.reduce((sum, row) => sum + row.averageScore, 0) / recent.length : averageScore;
  const earlyAvg =
    early.length > 0 ? early.reduce((sum, row) => sum + row.averageScore, 0) / early.length : averageScore;
  const improving = recent.length >= 2 && recentAvg >= earlyAvg + 3;

  let grade: PromotionGrade = "hold";
  if (submittedCount >= 5 && averageScore >= 85 && completionRate >= 80) grade = "strong";
  else if (submittedCount >= 3 && averageScore >= 75 && completionRate >= 60) grade = "recommend";
  else if (submittedCount < 2 || averageScore < 55 || completionRate < 40) grade = "reject";

  const labelMap: Record<PromotionGrade, string> = {
    strong: "\uC9C4\uAE09 \uC801\uADF9 \uAD8C\uACE0",
    recommend: "\uC9C4\uAE09 \uAD8C\uACE0",
    hold: "\uCD94\uAC00 \uAD00\uCC30",
    reject: "\uC9C4\uAE09 \uBCF4\uB958",
  };

  const parts: string[] = [];
  parts.push(
    `\uD3C9\uADE0 ${Math.round(averageScore * 10) / 10}\uC810 \u00B7 \uC81C\uCD9C ${submittedCount}\uAC74 \u00B7 \uC644\uB8CC\uC728 ${completionRate}%`,
  );
  if (improving) parts.push("\uCD5C\uADFC \uCD94\uC138 \uC0C1\uC2B9");
  else if (recent.length >= 2 && recentAvg < earlyAvg - 3) parts.push("\uCD5C\uADFC \uCD94\uC138 \uD558\uB77D");

  return {
    grade,
    label: labelMap[grade],
    summary: parts.join(" \u00B7 "),
    strengths: strengths.length ? strengths : ["\uD3C9\uAC00 \uB370\uC774\uD130 \uCD95\uC801 \uC911"],
    improvements: improvements.length ? improvements : ["\u2014"],
  };
}

export function buildWorkerHrRecordData(input: {
  workerId: string;
  workerName: string;
  workers: WorkerMasterLike[];
  requests: ProbationEvalRequest[];
  templates: ProbationEvalTemplate[];
  dateFrom: string;
  dateTo: string;
  companyProfile?: CompanyProfile;
}): WorkerHrRecordData {
  const workerId = normalizeWorkerRecordId(input.workerId);
  const filtered = filterWorkerEvalRequests(input.requests, workerId, input.dateFrom, input.dateTo);
  const template = resolveActiveProbationEvalTemplate(input.templates);
  const submitted = filtered.filter((row) => row.status === "submitted" && row.totalScore != null);
  const averageScore = submitted.length
    ? submitted.reduce((sum, row) => sum + (row.totalScore as number), 0) / submitted.length
    : 0;
  const latestScore =
    submitted.length > 0
      ? [...submitted].sort((a, b) => b.workDate.localeCompare(a.workDate))[0].totalScore ?? null
      : null;
  const completion = dailyCompletionRate(filtered);
  const questionScores = aggregateWorkerQuestionScores(workerId, input.requests, template, input.dateFrom, input.dateTo);
  const trend = dailyTrend(workerId, filtered);
  const issuedAt = todayKstISO();
  const companyCode = String(input.companyProfile?.name || "TM")
    .replace(/[^\w\uAC00-\uD7A3]/g, "")
    .slice(0, 4)
    .toUpperCase();

  return {
    workerId,
    workerName: input.workerName,
    worker: resolveWorkerForEval(input.workers, workerId, input.workerName),
    periodFrom: input.dateFrom.slice(0, 10),
    periodTo: input.dateTo.slice(0, 10),
    issuedAt,
    documentNo: `HR-${companyCode}-${issuedAt.replace(/-/g, "")}-${workerId || "000"}`,
    evalCount: filtered.length,
    submittedCount: submitted.length,
    completionRate: completion.rate,
    averageScore,
    latestScore,
    questionScores,
    trend,
    requests: filtered,
    assessment: assessPromotionRecommendation({
      averageScore,
      completionRate: completion.rate,
      submittedCount: submitted.length,
      questionScores,
      trend,
    }),
  };
}

export function formatHrScore(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "\u2014";
  return String(Math.round(value * 10) / 10);
}

export type WorkerProfileExtended = WorkerMasterLike & {
  address?: string;
  businessNo?: string;
  memo?: string;
};
