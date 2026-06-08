import { apiRequest } from "@/utils/erpApi";
import type { NotificationSettings } from "@/utils/notificationSettings";

export type AlimtalkStatus = {
  enabled: boolean;
  provider: string;
  dailyTemplate: string | null;
  commentTemplate: string | null;
  scheduleTemplate?: string | null;
  contractTemplate?: string | null;
};

export type ScScheduleNotifyStatus = {
  configured: boolean;
  scShareConfigured: boolean;
  enabled: boolean;
  hour: number;
  minute: number;
  template: string | null;
  lastRunAt?: string | null;
  lastTargetDate?: string | null;
  lastSentCount?: number;
};

export async function fetchNotificationStatus() {
  return apiRequest<{ alimtalk: AlimtalkStatus; scScheduleNotify?: ScScheduleNotifyStatus }>(
    "/notifications/status",
  );
}

export async function fetchNotificationSettings() {
  return apiRequest<{ settings: NotificationSettings }>("/notifications/settings");
}

export async function saveNotificationSettings(settings: NotificationSettings, version?: number) {
  return apiRequest<{ ok: boolean; settings: NotificationSettings; version: number }>("/notifications/settings", {
    method: "PATCH",
    body: JSON.stringify({ settings, version }),
  });
}

export async function previewDailyReport() {
  return apiRequest<{ report: unknown; message: string }>("/notifications/daily-report/preview");
}

export async function sendDailyReportNow(skipSync = false) {
  return apiRequest<{ ok: boolean; message?: string; skipped?: boolean; reason?: string }>(
    "/notifications/daily-report/send",
    {
      method: "POST",
      body: JSON.stringify({ skipSync }),
    },
  );
}

export type ScScheduleNotifyPreview = {
  targetDate: string;
  scheduleCount: number;
  notifyCount: number;
  workerNotifyCount?: number;
  clientNotifyCount?: number;
  missingPhoneCount: number;
  missingClientPhoneCount?: number;
  scheduleLinks?: Array<{
    scheduleId: string;
    clientName: string;
    projectName: string;
    shareUrl: string;
    shareToken: string;
    error: string | null;
  }>;
  rows: Array<{
    recipientType?: "client" | "worker";
    scheduleId: string;
    participantName: string;
    phone: string | null;
    shareUrl?: string;
    variables: Record<string, string>;
  }>;
};

export async function previewScScheduleNotify() {
  return apiRequest<ScScheduleNotifyPreview>("/notifications/sc-schedule/preview");
}

export async function sendScScheduleNotifyNow(options?: { force?: boolean; skipSync?: boolean }) {
  return apiRequest<{ ok: boolean; skipped?: boolean; reason?: string; sentCount?: number; targetDate?: string }>(
    "/notifications/sc-schedule/send",
    {
      method: "POST",
      body: JSON.stringify(options || {}),
    },
  );
}

export type ScScheduleNotifyOneResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  scheduleId?: string;
  workDate?: string;
  clientName?: string;
  projectName?: string;
  shareUrl?: string;
  shareToken?: string;
  shareError?: string | null;
  sentCount?: number;
  failedCount?: number;
  notifyCount?: number;
  missingPhoneCount?: number;
  variables?: Record<string, string>;
  results?: Array<{
    recipientType: "client" | "worker";
    participantName: string;
    phone: string | null;
    ok: boolean;
    skipped?: boolean;
    reason?: string;
    shareUrl?: string;
    variables?: Record<string, string>;
  }>;
};

export async function sendScScheduleNotifyOne(
  scheduleId: string,
  options?: { skipSync?: boolean; phones?: string[] },
) {
  return apiRequest<ScScheduleNotifyOneResult>("/notifications/sc-schedule/send-one", {
    method: "POST",
    body: JSON.stringify({ scheduleId, ...(options || {}) }),
  });
}
