import {
  aggregateByQuestion,
  aggregateByWorker,
  dailyCompletionRate,
  dailyTrend,
  dailyTrendFromRequests,
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
import { filterActiveWorkers, isWorkerActive, normalizeWorkerRecordId } from "@/utils/workerPayments";
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
  workerName?: string,
) {
  const id = normalizeWorkerRecordId(workerId);
  const nameKey = String(workerName || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
  const from = dateFrom?.slice(0, 10);
  const to = dateTo?.slice(0, 10);
  return normalizeProbationEvalRequests(requests).filter((row) => {
    const idMatch = Boolean(id) && normalizeWorkerRecordId(row.probationWorkerId) === id;
    const rowNameKey = String(row.probationWorkerName || "")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
    const nameMatch = Boolean(nameKey) && rowNameKey === nameKey;
    if (!idMatch && !nameMatch) return false;
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
  workerName?: string,
): WorkerQuestionScore[] {
  const template = Array.isArray(templateInput)
    ? resolveActiveProbationEvalTemplate(templateInput)
    : templateInput;
  const filtered = filterWorkerEvalRequests(requests, workerId, dateFrom, dateTo, workerName);
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
  if (submittedCount <= 0) {
    return {
      grade: "hold",
      label: "\uD3C9\uAC00 \uC774\uB825 \uC5C6\uC74C",
      summary: "\uC120\uD0DD \uAE30\uAC04\uC5D0 \uC81C\uCD9C\uB41C \uC77C\uC77C \uD3C9\uAC00\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
      strengths: ["\u2014"],
      improvements: ["\u2014"],
    };
  }
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
  const workerName = String(input.workerName || "").trim();
  const filtered = filterWorkerEvalRequests(input.requests, workerId, input.dateFrom, input.dateTo, workerName);
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
  const questionScores = aggregateWorkerQuestionScores(
    workerId,
    input.requests,
    template,
    input.dateFrom,
    input.dateTo,
    workerName,
  );
  const trend = dailyTrendFromRequests(filtered);
  const issuedAt = todayKstISO();
  const companyCode = String(input.companyProfile?.name || "TM")
    .replace(/[^\w\uAC00-\uD7A3]/g, "")
    .slice(0, 4)
    .toUpperCase();

  return {
    workerId,
    workerName: workerName || input.workerName,
    worker: resolveWorkerForEval(input.workers, workerId, workerName || input.workerName),
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

export type WorkerHrRecordListRow = {
  workerId: string;
  workerName: string;
  grade: string;
  hireDate: string;
  isActive: boolean;
  evalCount: number;
  submittedCount: number;
  averageScore: number | null;
  worker: WorkerMasterLike;
};

export function workerHrRecordKey(worker: WorkerMasterLike) {
  const id = normalizeWorkerRecordId(worker.id);
  if (id) return id;
  const name = String(worker.name || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
  return name ? `name:${name}` : "";
}

export function buildWorkerHrRecordList(input: {
  workers: WorkerMasterLike[];
  requests: ProbationEvalRequest[];
  dateFrom: string;
  dateTo: string;
  query?: string;
  includeInactive?: boolean;
}): WorkerHrRecordListRow[] {
  const from = input.dateFrom.slice(0, 10);
  const to = input.dateTo.slice(0, 10);
  const q = String(input.query || "")
    .trim()
    .toLowerCase();
  const periodRequests = normalizeProbationEvalRequests(input.requests).filter(
    (row) => row.workDate >= from && row.workDate <= to,
  );
  const aggMap = new Map(aggregateByWorker(periodRequests).map((row) => [row.probationWorkerId, row]));

  const baseWorkers = input.includeInactive === false ? filterActiveWorkers(input.workers) : input.workers;

  return baseWorkers
    .map((worker) => {
      const workerId = workerHrRecordKey(worker);
      const workerName = String(worker.name || "").trim();
      const agg =
        aggMap.get(workerId) ||
        [...aggMap.values()].find(
          (row) =>
            String(row.probationWorkerName || "")
              .trim()
              .replace(/\s+/g, "")
              .toLowerCase() ===
            workerName.replace(/\s+/g, "").toLowerCase(),
        );
      return {
        workerId,
        workerName,
        grade: String(worker.grade || "").trim(),
        hireDate: String(worker.hireDate || "").slice(0, 10),
        isActive: isWorkerActive(worker),
        evalCount: agg?.requestCount ?? 0,
        submittedCount: agg?.submittedCount ?? 0,
        averageScore: agg?.submittedCount ? agg.averageScore : null,
        worker,
      };
    })
    .filter((row) => row.workerName)
    .filter((row) => {
      if (!q) return true;
      return (
        row.workerName.toLowerCase().includes(q) ||
        row.grade.toLowerCase().includes(q) ||
        row.hireDate.includes(q)
      );
    })
    .sort((a, b) => {
      const activeCmp = Number(b.isActive) - Number(a.isActive);
      if (activeCmp !== 0) return activeCmp;
      return a.workerName.localeCompare(b.workerName, "ko");
    });
}
