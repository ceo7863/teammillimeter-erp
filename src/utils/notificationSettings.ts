export type NotificationRecipient = {
  userId: number;
  phone: string;
  name?: string;
  dailyReport?: boolean;
  commentNotify?: boolean;
};

export type NotificationSettings = {
  enabled: boolean;
  dailyReportEnabled: boolean;
  commentNotifyEnabled: boolean;
  dailyReportHour: number;
  dailyReportMinute: number;
  recipients: NotificationRecipient[];
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  dailyReportEnabled: true,
  commentNotifyEnabled: true,
  dailyReportHour: 8,
  dailyReportMinute: 0,
  recipients: [],
};

export function normalizeNotificationSettings(raw: unknown): NotificationSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_NOTIFICATION_SETTINGS, recipients: [] };
  const row = raw as Partial<NotificationSettings>;
  const hour = Number(row.dailyReportHour);
  const minute = Number(row.dailyReportMinute);
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
    dailyReportHour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 8,
    dailyReportMinute: Number.isFinite(minute) && minute >= 0 && minute <= 59 ? minute : 0,
    recipients,
  };
}
