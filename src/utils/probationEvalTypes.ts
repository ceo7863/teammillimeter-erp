export type ProbationEvalQuestionType = "scale5" | "yesno" | "checkbox";

export type ProbationEvalQuestion = {
  id: string;
  label: string;
  type: ProbationEvalQuestionType;
  required: boolean;
  weight: number;
  sortOrder: number;
  active: boolean;
};

export type ProbationEvalTemplate = {
  id: string;
  name: string;
  version: number;
  questions: ProbationEvalQuestion[];
  createdAt: string;
};

export type ProbationEvalAnswer = {
  questionId: string;
  value: number | boolean;
};

export type ProbationEvalRequestStatus = "pending" | "sent" | "submitted" | "expired";

export type ProbationEvalSelectionReason = "grade_match" | "highest_grade_fallback";

export type ProbationEvalRequest = {
  id: string;
  token: string;
  workDate: string;
  scheduleId: string;
  siteName: string;
  probationWorkerId: string;
  probationWorkerName: string;
  evaluatorWorkerId: string;
  evaluatorName: string;
  evaluatorPhone: string;
  templateId: string;
  status: ProbationEvalRequestStatus;
  sentAt?: string;
  submittedAt?: string;
  reminderSentAt?: string;
  selectionReason: ProbationEvalSelectionReason;
  answers?: ProbationEvalAnswer[];
  totalScore?: number;
  surveyUrl?: string;
};

export const WORKER_GRADE_RANK: Record<string, number> = {
  S: 6,
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
};
