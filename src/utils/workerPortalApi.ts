import type { CompanyProfile } from "./companyProfile";
import type { WorkerMasterLike, WorkerPaymentDetailRow } from "./workerPayments";

const TOKEN_KEY = "workerPortalToken";
const NAME_KEY = "workerPortalWorkerName";

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

export function getWorkerPortalToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) || "";
}

export function getWorkerPortalWorkerName() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(NAME_KEY) || "";
}

export function saveWorkerPortalSession(token: string, workerName: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(NAME_KEY, workerName);
}

export function clearWorkerPortalSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(NAME_KEY);
}

export type WorkerPortalStatementPayload = {
  workerName: string;
  monthKey: string;
  periodStart: string;
  periodEnd: string;
  rows: WorkerPaymentDetailRow[];
  workerInfo: WorkerMasterLike;
  summary: { grossPay: number; fee: number; netPay: number };
  companyProfile: CompanyProfile | null;
  probationActive?: boolean;
  statementStartDate?: string;
};

export type WorkerPortalMonthsPayload = {
  months: string[];
  workerName: string;
  probationActive?: boolean;
  statementStartDate?: string;
  probationEndDate?: string;
};

async function portalRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getWorkerPortalToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${apiBase()}${path}`, { ...options, headers });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    throw new Error(String(data.error || `API ${response.status}`));
  }

  return data as T;
}

export async function loginWorkerPortal(loginId: string, password: string) {
  const result = await portalRequest<{
    token: string;
    workerName: string;
    mustChangePassword?: boolean;
  }>("/worker-portal/login", {
    method: "POST",
    body: JSON.stringify({ loginId, password }),
  });
  if (!result.mustChangePassword) {
    saveWorkerPortalSession(result.token, result.workerName);
  }
  return result;
}

export async function changeWorkerPortalPassword(
  loginId: string,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
) {
  const result = await portalRequest<{
    ok: boolean;
    token?: string;
    workerName?: string;
    mustChangePassword?: boolean;
  }>("/worker-portal/change-password", {
    method: "POST",
    body: JSON.stringify({ loginId, currentPassword, newPassword, confirmPassword }),
  });
  if (result.token && result.workerName && result.mustChangePassword === false) {
    saveWorkerPortalSession(result.token, result.workerName);
  }
  return result;
}

export async function keepWorkerPortalPassword(loginId: string, password: string) {
  const result = await portalRequest<{
    ok: boolean;
    token?: string;
    workerName?: string;
    mustChangePassword?: boolean;
  }>("/worker-portal/keep-password", {
    method: "POST",
    body: JSON.stringify({ loginId, password }),
  });
  if (result.token && result.workerName) {
    saveWorkerPortalSession(result.token, result.workerName);
  }
  return result;
}

export async function fetchWorkerPortalMonths() {
  return portalRequest<WorkerPortalMonthsPayload>("/worker-portal/months");
}

export async function fetchWorkerPortalStatement(monthKey: string) {
  const query = new URLSearchParams({ month: monthKey });
  return portalRequest<WorkerPortalStatementPayload>(`/worker-portal/statement?${query}`);
}

export type WorkerPortalAcknowledgmentRecord = {
  confirmedAt: string;
  workerName: string;
  monthKey: string;
  signatureDataUrl: string;
  lineCount?: number;
  grossPay?: number;
  fee?: number;
  netPay?: number;
};

export type WorkerPortalAcknowledgmentState = {
  monthKey: string;
  eligible: boolean;
  currentMonthKey?: string;
  previousMonthKey?: string;
  canSubmit: boolean;
  acknowledgment: WorkerPortalAcknowledgmentRecord | null;
};

export async function fetchWorkerPortalAcknowledgment(monthKey: string) {
  const query = new URLSearchParams({ month: monthKey });
  return portalRequest<WorkerPortalAcknowledgmentState>(`/worker-portal/acknowledgment?${query}`);
}

export async function saveWorkerPortalAcknowledgment(monthKey: string, signatureDataUrl: string) {
  return portalRequest<{ ok: boolean; acknowledgment: WorkerPortalAcknowledgmentRecord }>(
    "/worker-portal/acknowledgment",
    {
      method: "POST",
      body: JSON.stringify({ monthKey, signatureDataUrl }),
    },
  );
}
