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
  const result = await portalRequest<{ token: string; workerName: string }>("/worker-portal/login", {
    method: "POST",
    body: JSON.stringify({ loginId, password }),
  });
  saveWorkerPortalSession(result.token, result.workerName);
  return result;
}

export async function fetchWorkerPortalMonths() {
  return portalRequest<{ months: string[]; workerName: string }>("/worker-portal/months");
}

export async function fetchWorkerPortalStatement(monthKey: string) {
  const query = new URLSearchParams({ month: monthKey });
  return portalRequest<WorkerPortalStatementPayload>(`/worker-portal/statement?${query}`);
}
