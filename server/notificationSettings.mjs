const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: false,
  dailyReportEnabled: true,
  commentNotifyEnabled: true,
  dailyReportHour: 8,
  dailyReportMinute: 0,
  recipients: [],
};

function normalizeRecipient(raw) {
  if (!raw || typeof raw !== "object") return null;
  const userId = Number(raw.userId);
  if (!Number.isFinite(userId)) return null;
  const phone = String(raw.phone || "").replace(/\D/g, "");
  if (!phone) return null;
  return {
    userId,
    phone,
    name: String(raw.name || "").trim(),
    dailyReport: raw.dailyReport !== false,
    commentNotify: raw.commentNotify !== false,
  };
}

export function normalizeNotificationSettings(raw) {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_NOTIFICATION_SETTINGS, recipients: [] };
  }
  const hour = Number(raw.dailyReportHour);
  const minute = Number(raw.dailyReportMinute);
  const recipients = Array.isArray(raw.recipients)
    ? raw.recipients.map(normalizeRecipient).filter(Boolean)
    : [];
  return {
    enabled: raw.enabled === true,
    dailyReportEnabled: raw.dailyReportEnabled !== false,
    commentNotifyEnabled: raw.commentNotifyEnabled !== false,
    dailyReportHour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 8,
    dailyReportMinute: Number.isFinite(minute) && minute >= 0 && minute <= 59 ? minute : 0,
    recipients,
  };
}

export function listDailyReportPhones(settings) {
  const normalized = normalizeNotificationSettings(settings);
  if (!normalized.enabled || !normalized.dailyReportEnabled) return [];
  return normalized.recipients.filter((row) => row.dailyReport).map((row) => row.phone);
}

export function listCommentNotifyPhones(settings) {
  const normalized = normalizeNotificationSettings(settings);
  if (!normalized.enabled || !normalized.commentNotifyEnabled) return [];
  return normalized.recipients.filter((row) => row.commentNotify).map((row) => row.phone);
}

export { DEFAULT_NOTIFICATION_SETTINGS };
