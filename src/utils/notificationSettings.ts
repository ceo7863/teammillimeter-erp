export type NotificationRecipient = {
  userId: number;
  phone: string;
  name?: string;
  dailyReport?: boolean;
  commentNotify?: boolean;
};

export type ScScheduleNotifyMode = "both" | "client" | "worker";

export type NotificationSettings = {
  enabled: boolean;
  dailyReportEnabled: boolean;
  commentNotifyEnabled: boolean;
  scScheduleNotifyEnabled: boolean;
  dailyReportHour: number;
  dailyReportMinute: number;
  scScheduleNotifyHour: number;
  scScheduleNotifyMinute: number;
  scWeeklyBriefingNotifyEnabled: boolean;
  /** 0=일 ... 6=토 (KST) */
  scWeeklyBriefingWeekday: number;
  scWeeklyBriefingHour: number;
  scWeeklyBriefingMinute: number;
  /** User-linked recipients with per-type flags */
  recipients: NotificationRecipient[];
  /** Additional daily-report phones not tied to ERP users */
  dailyReportExtraPhones: string[];
  /** Who receives tomorrow SC schedule alimtalk */
  scScheduleNotifyMode: ScScheduleNotifyMode;
  /** Daily worker evaluation alimtalk (SC same-day schedules) */
  probationEvalNotifyEnabled: boolean;
  probationEvalNotifyHour: number;
  probationEvalNotifyMinute: number;
  probationEvalReminderEnabled: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  dailyReportEnabled: true,
  commentNotifyEnabled: true,
  scScheduleNotifyEnabled: true,
  dailyReportHour: 8,
  dailyReportMinute: 0,
  scScheduleNotifyHour: 18,
  scScheduleNotifyMinute: 0,
  scWeeklyBriefingNotifyEnabled: true,
  scWeeklyBriefingWeekday: 1,
  scWeeklyBriefingHour: 9,
  scWeeklyBriefingMinute: 0,
  recipients: [],
  dailyReportExtraPhones: [],
  scScheduleNotifyMode: "both",
  probationEvalNotifyEnabled: true,
  probationEvalNotifyHour: 19,
  probationEvalNotifyMinute: 0,
  probationEvalReminderEnabled: true,
};

export function normalizePhoneList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const phone = String(item || "").replace(/\D/g, "");
    if (phone.length >= 10 && !seen.has(phone)) {
      seen.add(phone);
      out.push(phone);
    }
  }
  return out;
}

function normalizeScScheduleNotifyMode(value: unknown): ScScheduleNotifyMode {
  if (value === "client" || value === "worker") return value;
  return "both";
}

function clampSchedulePart(value: unknown, max: number, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 && num <= max ? num : fallback;
}

export function normalizeNotificationSettings(raw: unknown): NotificationSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_NOTIFICATION_SETTINGS, recipients: [] };
  const row = raw as Partial<NotificationSettings>;
  const hour = Number(row.dailyReportHour);
  const minute = Number(row.dailyReportMinute);
  const scHour = Number(row.scScheduleNotifyHour);
  const scMinute = Number(row.scScheduleNotifyMinute);
  const weeklyHour = Number(row.scWeeklyBriefingHour);
  const weeklyMinute = Number(row.scWeeklyBriefingMinute);
  const weeklyWeekday = Number(row.scWeeklyBriefingWeekday);
  const evalHour = Number(row.probationEvalNotifyHour);
  const evalMinute = Number(row.probationEvalNotifyMinute);
  const recipients = Array.isArray(row.recipients)
    ? row.recipients
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const userId = Number((item as NotificationRecipient).userId);
          const phone = String((item as NotificationRecipient).phone || "").replace(/\D/g, "");
          if (!Number.isFinite(userId) || !phone) return null;
          return {
            userId,
            phone,
            name: String((item as NotificationRecipient).name || "").trim(),
            dailyReport: (item as NotificationRecipient).dailyReport !== false,
            commentNotify: (item as NotificationRecipient).commentNotify !== false,
          } satisfies NotificationRecipient;
        })
        .filter(Boolean) as NotificationRecipient[]
    : [];
  return {
    enabled: row.enabled === true,
    dailyReportEnabled: row.dailyReportEnabled !== false,
    commentNotifyEnabled: row.commentNotifyEnabled !== false,
    scScheduleNotifyEnabled: row.scScheduleNotifyEnabled !== false,
    dailyReportHour: clampSchedulePart(hour, 23, 8),
    dailyReportMinute: clampSchedulePart(minute, 59, 0),
    scScheduleNotifyHour: clampSchedulePart(scHour, 23, 18),
    scScheduleNotifyMinute: clampSchedulePart(scMinute, 59, 0),
    scWeeklyBriefingNotifyEnabled: row.scWeeklyBriefingNotifyEnabled !== false,
    scWeeklyBriefingWeekday:
      Number.isFinite(weeklyWeekday) && weeklyWeekday >= 0 && weeklyWeekday <= 6
        ? weeklyWeekday
        : DEFAULT_NOTIFICATION_SETTINGS.scWeeklyBriefingWeekday,
    scWeeklyBriefingHour: clampSchedulePart(weeklyHour, 23, DEFAULT_NOTIFICATION_SETTINGS.scWeeklyBriefingHour),
    scWeeklyBriefingMinute: clampSchedulePart(weeklyMinute, 59, DEFAULT_NOTIFICATION_SETTINGS.scWeeklyBriefingMinute),
    recipients,
    dailyReportExtraPhones: normalizePhoneList(row.dailyReportExtraPhones),
    scScheduleNotifyMode: normalizeScScheduleNotifyMode(row.scScheduleNotifyMode),
    probationEvalNotifyEnabled: row.probationEvalNotifyEnabled !== false,
    probationEvalNotifyHour: clampSchedulePart(evalHour, 23, DEFAULT_NOTIFICATION_SETTINGS.probationEvalNotifyHour),
    probationEvalNotifyMinute: clampSchedulePart(
      evalMinute,
      59,
      DEFAULT_NOTIFICATION_SETTINGS.probationEvalNotifyMinute,
    ),
    probationEvalReminderEnabled: row.probationEvalReminderEnabled !== false,
  };
}
