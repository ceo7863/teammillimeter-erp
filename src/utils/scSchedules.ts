import { apiRequest, isApiModeEnabled } from "@/utils/erpApi";
import { findWorkerMasterByListName, type WorkerMasterLike } from "@/utils/workerPayments";

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
  lastUnmappedProjectCount?: number;
  lastDroppedScheduleCount?: number;
  windowStart?: string;
  windowEnd?: string;
};

export type ScProjectMappingRow = {
  scProjectId: string;
  scProjectName: string;
  clientId?: number | string;
  clientName?: string;
  manual?: boolean;
  updatedAt?: string | null;
};

export type ScUnmappedProjectRow = {
  scProjectId: string;
  scProjectName: string;
  address?: string;
};

export type ScProjectMappingStatus = {
  ok?: boolean;
  configured: boolean;
  mappings: ScProjectMappingRow[];
  unmapped: ScUnmappedProjectRow[];
  projectCount: number;
  mappedCount: number;
  unmappedCount: number;
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

export type ScScheduleWorkerInfo = {
  participantName: string;
  name: string;
  phone: string;
  vehicleNo: string;
};

/** SC participant name → 시공자 마스터 (이름·전화·차량번호) */
export function resolveScScheduleWorkers(
  workers: WorkerMasterLike[] = [],
  participantNames: string[] = [],
): ScScheduleWorkerInfo[] {
  return participantNames
    .map((participantName) => String(participantName || "").trim())
    .filter(Boolean)
    .map((participantName) => {
      const master = findWorkerMasterByListName(workers, participantName);
      return {
        participantName,
        name: String(master?.name || participantName).trim(),
        phone: String(master?.phone || "").trim(),
        vehicleNo: String(master?.vehicleNo || "").trim(),
      };
    });
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

export async function fetchScProjectMappingStatus(): Promise<ScProjectMappingStatus> {
  if (!isApiModeEnabled()) {
    return {
      configured: false,
      mappings: [],
      unmapped: [],
      projectCount: 0,
      mappedCount: 0,
      unmappedCount: 0,
    };
  }
  return apiRequest<ScProjectMappingStatus>("/sc-schedules/project-mappings");
}

export async function saveScProjectClientMapping(scProjectId: string, clientId: number | string) {
  if (!isApiModeEnabled()) {
    throw new Error("SC \uAC70\uB798\uCC98 \uB9E4\uCE6D\uC740 API \uBAA8\uB4DC\uC5D0\uC11C\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  }
  return apiRequest<{ ok?: boolean; error?: string }>(`/sc-schedules/project-mappings/${encodeURIComponent(scProjectId)}`, {
    method: "PUT",
    body: JSON.stringify({ clientId }),
  });
}

export async function removeScProjectClientMapping(scProjectId: string) {
  if (!isApiModeEnabled()) {
    throw new Error("SC \uAC70\uB798\uCC98 \uB9E4\uCE6D\uC740 API \uBAA8\uB4DC\uC5D0\uC11C\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  }
  return apiRequest<{ ok?: boolean; error?: string }>(`/sc-schedules/project-mappings/${encodeURIComponent(scProjectId)}`, {
    method: "DELETE",
  });
}
