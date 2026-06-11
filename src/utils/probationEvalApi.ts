import type { ProbationEvalAnswer, ProbationEvalQuestionType } from "@/utils/probationEval";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export type PublicProbationEvalInfo = {
  id: string;
  workDate: string;
  siteName: string;
  probationWorkerName: string;
  evaluatorName: string;
  status: string;
  phoneVerified?: boolean;
  phoneHint?: string;
  submittedAt?: string | null;
  totalScore?: number | null;
  template: {
    id: string;
    name: string;
    questions: Array<{
      id: string;
      label: string;
      type: ProbationEvalQuestionType;
      required: boolean;
    }>;
  };
};

async function parseJsonResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error || `\uC694\uCCAD \uCC98\uB9AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. (${response.status})`));
  }
  return data;
}

export async function fetchPublicProbationEvalInfo(token: string) {
  const response = await fetch(`${API_BASE}/public/probation-eval/${encodeURIComponent(token)}`);
  return parseJsonResponse(response) as Promise<PublicProbationEvalInfo>;
}

export async function verifyPublicProbationEvalPhone(token: string, phoneLast4: string) {
  const response = await fetch(`${API_BASE}/public/probation-eval/${encodeURIComponent(token)}/verify-phone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneLast4 }),
  });
  return parseJsonResponse(response);
}

export async function submitPublicProbationEval(
  token: string,
  answers: ProbationEvalAnswer[],
) {
  const response = await fetch(`${API_BASE}/public/probation-eval/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  return parseJsonResponse(response) as Promise<{ status: string; totalScore: number; submittedAt: string }>;
}

export async function triggerProbationEvalNotify(targetDate?: string) {
  const response = await fetch(`${API_BASE}/notifications/probation-eval/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ targetDate }),
  });
  return parseJsonResponse(response);
}
