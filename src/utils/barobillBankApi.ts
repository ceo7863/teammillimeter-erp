import { getAuthToken } from "@/utils/erpApi";
import type { IbkBankImportPreview } from "@/utils/ibkBankImport";

export type BarobillBankStatus = {
  configured: boolean;
  enabled: boolean;
  test?: boolean;
  bankAccountNum?: string;
  syncDays?: number;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  lastNotice?: string | null;
  lastAdded?: number;
  lastSkipped?: number;
  lastFetched?: number;
  lastLatestTransactionAt?: string | null;
  lastFromDate?: string | null;
  lastToDate?: string | null;
};

export type BarobillBankScrapStatus = {
  active: boolean;
  collecting?: boolean;
  code?: number;
  message?: string;
};

export type BarobillBankSyncResult = {
  ok: boolean;
  added?: number;
  skipped?: number;
  fetched?: number;
  latestTransactionAt?: string | null;
  fromDate?: string;
  toDate?: string;
  preview?: IbkBankImportPreview;
  previewOnly?: boolean;
  errors?: string[];
  notices?: string[];
  collecting?: boolean;
  scrapStatus?: BarobillBankScrapStatus;
  status?: BarobillBankStatus;
  version?: number;
  updatedAt?: string | null;
  bankSyncMeta?: Record<string, unknown> | null;
  error?: string;
  reason?: string;
  skipped?: boolean;
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

export async function fetchBarobillBankStatus() {
  return apiRequest<{ status: BarobillBankStatus; config: BarobillBankStatus }>("/barobill/bank/status");
}

export async function fetchBarobillBankScrapStatus() {
  return apiRequest<BarobillBankScrapStatus>("/barobill/bank/scrap-status");
}

export async function fetchBarobillBankScrapRequestUrl() {
  return apiRequest<{ ok: boolean; url: string }>("/barobill/bank/scrap-request-url");
}

export async function fetchBarobillBankManagementUrl() {
  return apiRequest<{ ok: boolean; url: string }>("/barobill/bank/management-url");
}

export async function syncBarobillBankNow(input?: {
  startDate?: string;
  endDate?: string;
  syncDays?: number;
  previewOnly?: boolean;
  refresh?: boolean;
}) {
  return apiRequest<BarobillBankSyncResult>("/barobill/bank/sync", {
    method: "POST",
    body: JSON.stringify(input || {}),
  });
}
