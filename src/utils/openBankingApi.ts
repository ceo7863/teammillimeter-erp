import { getAuthToken } from "@/utils/erpApi";

export type OpenBankingStatus = {
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  fintechUseNumMask: string;
  accountMask: string;
  bankName: string;
  connectedAt?: string | null;
  lastSyncAt?: string | null;
  lastSyncAdded?: number;
  lastSyncSkipped?: number;
  lastError?: string | null;
  baseUrl: string;
  redirectUri: string;
  syncDays: number;
  intervalMs: number;
};

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAuthToken();
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

export async function fetchOpenBankingStatus() {
  return apiRequest<{ status: OpenBankingStatus }>("/open-banking/status");
}

export async function fetchOpenBankingAuthorizeUrl() {
  return apiRequest<{ url: string }>("/open-banking/authorize-url");
}

export async function connectOpenBankingManual(input: {
  fintechUseNum: string;
  accessToken: string;
  refreshToken?: string;
  accountMask?: string;
}) {
  return apiRequest<{ ok: boolean; status: OpenBankingStatus; error?: string }>("/open-banking/connect", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function disconnectOpenBanking() {
  return apiRequest<{ ok: boolean; status: OpenBankingStatus }>("/open-banking/disconnect", {
    method: "POST",
  });
}

export async function syncOpenBankingNow() {
  return apiRequest<{
    ok: boolean;
    added?: number;
    skipped?: number;
    fetched?: number;
    error?: string;
    version?: number;
  }>("/open-banking/sync", { method: "POST" });
}
