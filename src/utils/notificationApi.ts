import { apiRequest } from "@/utils/erpApi";
import type { NotificationSettings } from "@/utils/notificationSettings";

export type AlimtalkStatus = {
  enabled: boolean;
  provider: string;
  dailyTemplate: string | null;
  commentTemplate: string | null;
  scheduleTemplate?: string | null;
  contractTemplate?: string | null;
  weeklyBriefingTemplate?: string | null;
  probationEvalTemplate?: string | null;
};

export type ProbationEvalNotifyStatus = {
  enabled: boolean;
  notifyHour: number;
  notifyMinute: number;
  reminderEnabled: boolean;
  templateConfigured: boolean;
  meta?: {
    lastRunAt?: string | null;
    lastTargetDate?: string | null;
    lastCreatedCount?: number;
    lastSentCount?: number;
  } | null;
};

export type ScScheduleNotifyStatus = {
  configured: boolean;
  scShareConfigured: boolean;
  enabled: boolean;
  hour: number;
  minute: number;
  scScheduleNotifyMode?: "both" | "client" | "worker";
  template: string | null;
  lastRunAt?: string | null;
  lastTargetDate?: string | null;
  lastSentCount?: number;
};

export type ScWeeklyBriefingNotifyStatus = {
  enabled: boolean;
  template: string | null;
  scheduleEnabled?: boolean;
  weekday?: number;
  hour?: number;
  minute?: number;
  lastWeekStart?: string | null;
  lastSentAt?: string | null;
  lastSentCount?: number | null;
};

export async function fetchNotificationStatus() {
  return apiRequest<{
    alimtalk: AlimtalkStatus;
    scScheduleNotify?: ScScheduleNotifyStatus;
    scWeeklyBriefing?: ScWeeklyBriefingNotifyStatus;
    probationEvalNotify?: ProbationEvalNotifyStatus;
  }>("/notifications/status");
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

export async function sendDailyReportNow(options?: { skipSync?: boolean; settings?: NotificationSettings }) {
  return apiRequest<{ ok: boolean; message?: string; skipped?: boolean; reason?: string; dryRun?: boolean }>(
    "/notifications/daily-report/send",
    {
      method: "POST",
      body: JSON.stringify({
        skipSync: options?.skipSync ?? true,
        force: true,
        settings: options?.settings,
      }),
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
  scScheduleNotifyMode?: "both" | "client" | "worker";
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

export async function sendScScheduleNotifyNow(options?: {
  force?: boolean;
  skipSync?: boolean;
  settings?: NotificationSettings;
}) {
  return apiRequest<{ ok: boolean; skipped?: boolean; reason?: string; sentCount?: number; targetDate?: string; dryRun?: boolean }>(
    "/notifications/sc-schedule/send",
    {
      method: "POST",
      body: JSON.stringify({ force: true, ...(options || {}) }),
    },
  );
}

export async function sendCommentNotifyTest(settings?: NotificationSettings) {
  return apiRequest<{ ok: boolean; skipped?: boolean; reason?: string; message?: string; dryRun?: boolean }>(
    "/notifications/comment/send-test",
    { method: "POST", body: JSON.stringify({ settings }) },
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
  skippedNoParticipants?: boolean;
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
  options?: { skipSync?: boolean; phones?: string[]; recipientTypes?: Array<"client" | "worker"> },
) {
  return apiRequest<ScScheduleNotifyOneResult>("/notifications/sc-schedule/send-one", {
    method: "POST",
    body: JSON.stringify({ scheduleId, ...(options || {}) }),
  });
}

export type ScWeeklyBriefingSiteEntry = {
  siteKey: string;
  siteName: string;
  siteManagerName?: string;
  dateRange: string;
  headcounts: string;
  dayEntries: Array<{ date: string; headcount: number }>;
  scheduleIds: string[];
  scheduleCount: number;
};

export type ScWeeklyBriefingPreview = {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  scheduleCount: number;
  clientCount: number;
  siteCount: number;
  notifyCount: number;
  missingPhoneCount: number;
  templateConfigured: boolean;
  groups: Array<{
    groupKey: string;
    clientId: string;
    clientName: string;
    siteName: string;
    siteManagerName?: string;
    clientManager: string;
    dateRange: string;
    headcounts: string;
    weekLabel: string;
    sites: ScWeeklyBriefingSiteEntry[];
    siteCount: number;
    dayEntries: Array<{ date: string; headcount: number }>;
    scheduleIds: string[];
    scheduleCount: number;
    variables: Record<string, string>;
    notifyCount: number;
    missingPhoneCount: number;
    recipientRows: Array<{
      recipientType: "client";
      participantName: string;
      phone: string | null;
      contactId?: string | null;
      variables: Record<string, string>;
    }>;
  }>;
};

export type ScWeeklyBriefingSendResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  notFound?: boolean;
  groupKey?: string;
  weekStart?: string;
  weekEnd?: string;
  clientName?: string;
  siteName?: string;
  dateRange?: string;
  headcounts?: string;
  sentCount?: number;
  failedCount?: number;
  notifyCount?: number;
  missingPhoneCount?: number;
  variables?: Record<string, string>;
  results?: Array<{
    recipientType: "client";
    participantName: string;
    phone: string | null;
    ok: boolean;
    skipped?: boolean;
    reason?: string;
    variables?: Record<string, string>;
  }>;
};

export async function previewScWeeklyBriefing(weekStart?: string) {
  const query = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : "";
  return apiRequest<ScWeeklyBriefingPreview>(`/notifications/sc-weekly-briefing/preview${query}`);
}

export async function sendScWeeklyBriefingGroup(
  groupKey: string,
  options?: { weekStart?: string; weekEnd?: string; skipSync?: boolean; phones?: string[] },
) {
  return apiRequest<ScWeeklyBriefingSendResult>("/notifications/sc-weekly-briefing/send", {
    method: "POST",
    body: JSON.stringify({ groupKey, ...(options || {}) }),
  });
}

export async function sendScWeeklyBriefingNotifyNow(options?: {
  skipSync?: boolean;
  weekStart?: string;
  settings?: NotificationSettings;
}) {
  return apiRequest<{
    ok: boolean;
    skipped?: boolean;
    reason?: string;
    weekStart?: string;
    weekEnd?: string;
    weekLabel?: string;
    sentCount?: number;
    failedCount?: number;
    clientCount?: number;
    siteCount?: number;
  }>("/notifications/sc-weekly-briefing/send-all", {
    method: "POST",
    body: JSON.stringify({ force: true, ...(options || {}) }),
  });
}

export async function sendProbationEvalNotifyNow(options?: {
  targetDate?: string;
  settings?: NotificationSettings;
}) {
  return apiRequest<{
    ok: boolean;
    skipped?: boolean;
    reason?: string;
    targetDate?: string;
    schedules?: number;
    created?: number;
    sent?: number;
  }>("/notifications/probation-eval/send", {
    method: "POST",
    body: JSON.stringify({ ...(options?.targetDate ? { targetDate: options.targetDate } : {}), ...(options || {}) }),
  });
}
