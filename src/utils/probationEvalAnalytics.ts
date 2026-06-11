import {
  computeTotalScore,
  normalizeProbationEvalRequests,
  resolveActiveProbationEvalTemplate,
  type ProbationEvalQuestion,
  type ProbationEvalRequest,
  type ProbationEvalTemplate,
} from "@/utils/probationEval";

export type WorkerScoreAggregate = {
  probationWorkerId: string;
  probationWorkerName: string;
  requestCount: number;
  submittedCount: number;
  averageScore: number;
  latestScore: number | null;
};

export type QuestionAverage = {
  questionId: string;
  label: string;
  averageScore: number;
  responseCount: number;
};

export type DailyTrendPoint = {
  workDate: string;
  averageScore: number;
  submittedCount: number;
};

export function aggregateByWorker(requests: ProbationEvalRequest[]): WorkerScoreAggregate[] {
  const rows = normalizeProbationEvalRequests(requests);
  const map = new Map<string, WorkerScoreAggregate>();

  for (const request of rows) {
    const key = request.probationWorkerId;
    const existing =
      map.get(key) ||
      ({
        probationWorkerId: key,
        probationWorkerName: request.probationWorkerName,
        requestCount: 0,
        submittedCount: 0,
        averageScore: 0,
        latestScore: null,
      } satisfies WorkerScoreAggregate);

    existing.requestCount += 1;
    if (request.status === "submitted" && request.totalScore != null) {
      existing.submittedCount += 1;
      existing.averageScore =
        (existing.averageScore * (existing.submittedCount - 1) + request.totalScore) / existing.submittedCount;
      existing.latestScore = request.totalScore;
    }
    if (!existing.probationWorkerName && request.probationWorkerName) {
      existing.probationWorkerName = request.probationWorkerName;
    }
    map.set(key, existing);
  }

  return [...map.values()].sort((a, b) => a.probationWorkerName.localeCompare(b.probationWorkerName, "ko"));
}

export function aggregateByQuestion(
  requests: ProbationEvalRequest[],
  templateInput: ProbationEvalTemplate | ProbationEvalTemplate[],
) {
  const template = Array.isArray(templateInput)
    ? resolveActiveProbationEvalTemplate(templateInput)
    : templateInput;
  const rows = normalizeProbationEvalRequests(requests).filter(
    (row) => row.status === "submitted" && Array.isArray(row.answers),
  );
  const questionMap = new Map<string, QuestionAverage>();

  for (const question of template.questions.filter((row) => row.active)) {
    questionMap.set(question.id, {
      questionId: question.id,
      label: question.label,
      averageScore: 0,
      responseCount: 0,
    });
  }

  for (const request of rows) {
    for (const answer of request.answers || []) {
      const question = template.questions.find((row) => row.id === answer.questionId);
      if (!question || !question.active) continue;
      const bucket = questionMap.get(question.id);
      if (!bucket) continue;
      const score = computeQuestionAnswerScore(question, answer.value);
      bucket.averageScore = (bucket.averageScore * bucket.responseCount + score) / (bucket.responseCount + 1);
      bucket.responseCount += 1;
    }
  }

  return [...questionMap.values()].sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

function computeQuestionAnswerScore(question: ProbationEvalQuestion, value: number | boolean) {
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

function buildDailyTrendPoints(rows: ProbationEvalRequest[]): DailyTrendPoint[] {
  const map = new Map<string, DailyTrendPoint>();

  for (const request of rows) {
    const key = request.workDate;
    const existing = map.get(key) || { workDate: key, averageScore: 0, submittedCount: 0 };
    existing.submittedCount += 1;
    existing.averageScore =
      (existing.averageScore * (existing.submittedCount - 1) + (request.totalScore as number)) /
      existing.submittedCount;
    map.set(key, existing);
  }

  return [...map.values()].sort((a, b) => a.workDate.localeCompare(b.workDate));
}

export function dailyTrendFromRequests(requests: ProbationEvalRequest[]): DailyTrendPoint[] {
  const rows = normalizeProbationEvalRequests(requests).filter(
    (row) => row.status === "submitted" && row.totalScore != null,
  );
  return buildDailyTrendPoints(rows);
}

export function dailyTrend(probationWorkerId: string, requests: ProbationEvalRequest[]): DailyTrendPoint[] {
  const targetId = String(probationWorkerId || "").trim();
  const rows = normalizeProbationEvalRequests(requests).filter(
    (row) => row.probationWorkerId === targetId && row.status === "submitted" && row.totalScore != null,
  );
  return buildDailyTrendPoints(rows);
}

export function dailyCompletionRate(requests: ProbationEvalRequest[], workDate?: string) {
  const rows = normalizeProbationEvalRequests(requests);
  const filtered = workDate
    ? rows.filter((row) => row.workDate === String(workDate).slice(0, 10))
    : rows;
  const total = filtered.length;
  const submitted = filtered.filter((row) => row.status === "submitted").length;
  return {
    total,
    submitted,
    rate: total ? Math.round((submitted / total) * 1000) / 10 : 0,
  };
}

export { computeTotalScore };
