import { apiRequest, isApiModeEnabled } from "@/utils/erpApi";
import { parseMoney } from "@/utils/receivables";
import { findWorkerMasterByListName, type WorkerMasterLike } from "@/utils/workerPayments";

const SC_PARTICIPANT_MEAL_KEYS = ["meal", "mealCost", "mealAmount", "foodAllowance"] as const;
const SC_PARTICIPANT_EXPENSE_KEYS = ["expense", "expenseCost", "expenseAmount"] as const;

export function parseScParticipantMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = parseMoney(value);
  return amount > 0 ? amount : null;
}

export function isScMealExpenseCategory(category: unknown) {
  const key = String(category || "").trim().toUpperCase();
  return key === "MEALS" || key === "\uC2DD\uBE44" || key === "\uC2DD\uB300";
}

export type ScParticipantExpenseItem = {
  category?: string | null;
  amount?: number | string | null;
};

export function aggregateScParticipantExpenses(items: ScParticipantExpenseItem[] = []) {
  let mealTotal = 0;
  let expenseTotal = 0;
  for (const item of items) {
    const amount = parseScParticipantMoney(item?.amount);
    if (amount == null) continue;
    if (isScMealExpenseCategory(item?.category)) {
      mealTotal += amount;
    } else {
      expenseTotal += amount;
    }
  }
  return {
    meal: mealTotal > 0 ? mealTotal : null,
    expense: expenseTotal > 0 ? expenseTotal : null,
  };
}

export function extractScParticipantExtras(participant: Record<string, unknown> | null | undefined) {
  if (!participant) return { meal: null as number | null, expense: null as number | null };
  let meal: number | null = null;
  let expense: number | null = null;
  for (const key of SC_PARTICIPANT_MEAL_KEYS) {
    const amount = parseScParticipantMoney(participant[key]);
    if (amount != null) {
      meal = (meal ?? 0) + amount;
    }
  }
  for (const key of SC_PARTICIPANT_EXPENSE_KEYS) {
    const amount = parseScParticipantMoney(participant[key]);
    if (amount != null) {
      expense = (expense ?? 0) + amount;
    }
  }
  if (Array.isArray(participant.expenses)) {
    const aggregated = aggregateScParticipantExpenses(
      participant.expenses as ScParticipantExpenseItem[],
    );
    if (aggregated.meal != null) meal = (meal ?? 0) + aggregated.meal;
    if (aggregated.expense != null) expense = (expense ?? 0) + aggregated.expense;
  }
  return {
    meal: meal != null && meal > 0 ? meal : null,
    expense: expense != null && expense > 0 ? expense : null,
  };
}

export type ScScheduleWorkLog = {
  startTime: string;
  endTime: string;
  durationMinutes?: number | null;
};

export type ScSchedule = {
  id: string;
  workDate: string;
  startTime: string;
  endTime?: string | null;
  workType: string;
  expectedHeadcount?: number | null;
  participantNames?: string[];
  participants?: ScScheduleWorkerInfo[];
  participantCount?: number;
  clientId?: number | string;
  clientName?: string;
  projectName?: string;
  siteManagerName?: string;
  /** SC \uADFC\uBB34\uAE30\uB85D (\uC788\uC73C\uBA74 \uC608\uC815 \uC2DC\uAC04 \uB300\uC2E0 \uC0AC\uC6A9) */
  workLog?: ScScheduleWorkLog | null;
  source?: "sc";
};

export type ScScheduleClientContact = {
  clientName: string;
  managerName: string;
  phoneDisplay: string;
  phoneNormalized: string;
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

function parseScScheduleTimeToMinutes(value: string | null | undefined) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function formatScScheduleWorkHoursLabel(workHours: number) {
  if (!Number.isFinite(workHours)) return "";
  const rounded = Math.round(workHours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function normalizeScScheduleWorkLog(raw: unknown): ScScheduleWorkLog | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<ScScheduleWorkLog & { duration?: number | null }>;
  const startTime = String(row.startTime || "").trim();
  const endTime = String(row.endTime || "").trim();
  if (!startTime || !endTime) return null;
  const durationRaw = row.durationMinutes ?? row.duration;
  const durationMinutes =
    durationRaw == null || durationRaw === "" ? null : Math.max(0, Number(durationRaw) || 0);
  return {
    startTime,
    endTime,
    ...(durationMinutes != null && durationMinutes > 0 ? { durationMinutes } : {}),
  };
}

export function formatScScheduleWorkLogSummary(
  schedule: Pick<ScSchedule, "workLog">,
) {
  try {
    const workLog = normalizeScScheduleWorkLog(schedule?.workLog);
    if (!workLog) return "";
    const range = formatScScheduleTimeRange(workLog);
    let workHours: number | null = null;
    if (workLog.durationMinutes != null && workLog.durationMinutes > 0) {
      workHours = workLog.durationMinutes / 60;
    } else {
      const start = parseScScheduleTimeToMinutes(workLog.startTime);
      const end = parseScScheduleTimeToMinutes(workLog.endTime);
      if (start != null && end != null && end > start) workHours = (end - start) / 60;
    }
    const hoursLabel = workHours != null ? formatScScheduleWorkHoursLabel(workHours) : "";
    if (range && hoursLabel) return `${range} (${hoursLabel}\uC2DC\uAC04)`;
    return range;
  } catch {
    return "";
  }
}

/** \uADFC\uBB34\uAE30\uB85D \uC788\uC73C\uBA74 \uADF8 \uC2DC\uAC04, \uC5C6\uC73C\uBA74 \uC77C\uC815 \uC608\uC815 \uC2DC\uAC04 */
export function getScScheduleEffectiveWorkTimes(
  schedule: Pick<ScSchedule, "startTime" | "endTime" | "workLog">,
) {
  const workLog = normalizeScScheduleWorkLog(schedule.workLog);
  if (workLog) {
    return { ...workLog, fromWorkLog: true as const };
  }
  return {
    startTime: String(schedule.startTime || "").trim(),
    endTime: String(schedule.endTime || "").trim(),
    durationMinutes: null as number | null,
    fromWorkLog: false as const,
  };
}

export type ScScheduleWorkerInfo = {
  participantName: string;
  name: string;
  phone: string;
  vehicleNo: string;
  /** SC schedule-export participant meal (식대), when provided */
  meal?: number | string | null;
  /** SC schedule-export participant expense (경비), when provided */
  expense?: number | string | null;
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

export function getScScheduleWorkerDetails(
  schedule: Pick<ScSchedule, "participants" | "participantNames">,
  workers: WorkerMasterLike[] = [],
): ScScheduleWorkerInfo[] {
  const nameList =
    (schedule.participantNames?.length
      ? schedule.participantNames
      : schedule.participants?.map((row) => row.participantName || row.name)) || [];
  const resolved = resolveScScheduleWorkers(
    workers,
    nameList.map((name) => String(name || "").trim()).filter(Boolean),
  );

  if (!Array.isArray(schedule.participants) || !schedule.participants.length) {
    return resolved;
  }

  return schedule.participants.map((participant, index) => {
    const key = String(participant.participantName || participant.name || "").trim();
    const fallback =
      resolved.find((row) => row.participantName === key || row.name === key) || resolved[index];
    const extras = extractScParticipantExtras(participant as Record<string, unknown>);
    return {
      participantName: key || fallback?.participantName || "",
      name: String(participant.name || fallback?.name || key).trim(),
      phone: String(participant.phone || "").trim() || String(fallback?.phone || "").trim(),
      vehicleNo: String(participant.vehicleNo || "").trim() || String(fallback?.vehicleNo || "").trim(),
      ...(extras.meal != null ? { meal: extras.meal } : {}),
      ...(extras.expense != null ? { expense: extras.expense } : {}),
    };
  });
}

export function formatScScheduleWorkerVehicleSummary(
  schedule: Pick<ScSchedule, "participants" | "participantNames">,
  workers: WorkerMasterLike[] = [],
) {
  return getScScheduleWorkerDetails(schedule, workers)
    .map((worker) => worker.vehicleNo)
    .filter((value) => value && value !== "-")
    .join(", ");
}

export function formatScScheduleWorkerCopyText(worker: ScScheduleWorkerInfo) {
  const lines = [
    worker.name,
    worker.phone && worker.phone !== "-" ? worker.phone : "",
    worker.vehicleNo && worker.vehicleNo !== "-" ? worker.vehicleNo : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export {
  listScScheduleClientContacts,
  resolveScScheduleClientContact,
} from "@/utils/clientContacts";

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

export async function fetchStaffScSchedulesForMonth(monthKey: string): Promise<ScSchedule[]> {
  if (!isApiModeEnabled()) return [];
  const month = String(monthKey || "").trim();
  const data = await apiRequest<{ schedules?: ScSchedule[] }>(
    `/sc-schedules?month=${encodeURIComponent(month)}`,
  );
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
