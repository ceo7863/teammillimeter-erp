import { apiRequest, isApiModeEnabled } from "@/utils/erpApi";

export type ScSchedule = {
  id: string;
  workDate: string;
  startTime: string;
  endTime?: string | null;
  workType: string;
  expectedHeadcount?: number | null;
  participantNames?: string[];
  participantCount?: number;
  source?: "sc";
};

export type ScScheduleSyncStatus = {
  configured: boolean;
  enabled: boolean;
  intervalMs: number;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  lastProjectCount?: number;
  lastScheduleCount?: number;
  lastMappedClientCount?: number;
  windowStart?: string;
  windowEnd?: string;
};

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

async function parseApiError(response: Response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return String(data.error || data.reason || `API ${response.status}`);
  } catch {
    return text || `API ${response.status}`;
  }
}

export function formatScScheduleTimeRange(row: Pick<ScSchedule, "startTime" | "endTime">) {
  const start = String(row.startTime || "").trim();
  const end = String(row.endTime || "").trim();
  if (start && end) return `${start}\u2013${end}`;
  return start || end || "";
}

export function formatScScheduleHeadcount(row: Pick<ScSchedule, "expectedHeadcount" | "participantCount">) {
  const expected = row.expectedHeadcount;
  const assigned = Number(row.participantCount || 0);
  if (expected != null && Number.isFinite(expected)) {
    return assigned > 0 ? `${assigned}/${expected}\uBA85` : `${expected}\uBA85`;
  }
  return assigned > 0 ? `${assigned}\uBA85` : "";
}

export async function fetchPublicScSchedules(token: string, monthKey: string): Promise<ScSchedule[]> {
  const month = String(monthKey || "").trim();
  const url = `${apiBase()}/public/client-site-request/${encodeURIComponent(token)}/sc-schedules?month=${encodeURIComponent(month)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(await parseApiError(response));
  const data = await response.json();
  return Array.isArray(data.schedules) ? data.schedules : [];
}

export async function fetchStaffScSchedules(clientId: number | string, monthKey: string): Promise<ScSchedule[]> {
  if (!isApiModeEnabled()) return [];
  const month = String(monthKey || "").trim();
  const data = await apiRequest<{ schedules?: ScSchedule[] }>(
    `/sc-schedules?clientId=${encodeURIComponent(String(clientId))}&month=${encodeURIComponent(month)}`,
  );
  return Array.isArray(data.schedules) ? data.schedules : [];
}

export async function fetchScScheduleSyncStatus(): Promise<ScScheduleSyncStatus> {
  if (!isApiModeEnabled()) {
    return { configured: false, enabled: false, intervalMs: 0 };
  }
  return apiRequest<ScScheduleSyncStatus>("/sc-schedules/sync-status");
}

export async function runScScheduleSyncNow() {
  if (!isApiModeEnabled()) {
    throw new Error("SC \uB3D9\uAE30\uD654\uB294 API \uBAA8\uB4DC\uC5D0\uC11C\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  }
  return apiRequest<
    ScScheduleSyncStatus & { ok?: boolean; error?: string; skipped?: boolean; reason?: string }
  >("/sc-schedules/sync", { method: "POST" });
}
