import { config } from "./config.mjs";

const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: false,
  dailyReportEnabled: true,
  commentNotifyEnabled: true,
  scScheduleNotifyEnabled: true,
  dailyReportHour: 8,
  dailyReportMinute: 0,
  scScheduleNotifyHour: 18,
  scScheduleNotifyMinute: 0,
  recipients: [],
  dailyReportExtraPhones: [],
  scScheduleNotifyMode: "both",
};

function normalizePhoneList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const phone = String(item || "").replace(/\D/g, "");
    if (phone.length >= 10 && !seen.has(phone)) {
      seen.add(phone);
      out.push(phone);
    }
  }
  return out;
}

function normalizeScScheduleNotifyMode(value) {
  if (value === "client" || value === "worker") return value;
  return "both";
}

function clampSchedulePart(value, max, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 && num <= max ? num : fallback;
}

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
  const scHour = Number(raw.scScheduleNotifyHour);
  const scMinute = Number(raw.scScheduleNotifyMinute);
  const scHourFallback = raw.scScheduleNotifyHour == null ? config.sc.scheduleNotify.hour : 18;
  const scMinuteFallback = raw.scScheduleNotifyMinute == null ? config.sc.scheduleNotify.minute : 0;
  const recipients = Array.isArray(raw.recipients)
    ? raw.recipients.map(normalizeRecipient).filter(Boolean)
    : [];
  return {
    enabled: raw.enabled === true,
    dailyReportEnabled: raw.dailyReportEnabled !== false,
    commentNotifyEnabled: raw.commentNotifyEnabled !== false,
    scScheduleNotifyEnabled: raw.scScheduleNotifyEnabled !== false,
    dailyReportHour: clampSchedulePart(hour, 23, 8),
    dailyReportMinute: clampSchedulePart(minute, 59, 0),
    scScheduleNotifyHour: clampSchedulePart(scHour, 23, scHourFallback),
    scScheduleNotifyMinute: clampSchedulePart(scMinute, 59, scMinuteFallback),
    recipients,
    dailyReportExtraPhones: normalizePhoneList(raw.dailyReportExtraPhones),
    scScheduleNotifyMode: normalizeScScheduleNotifyMode(raw.scScheduleNotifyMode),
  };
}

function dedupePhones(phones) {
  const seen = new Set();
  return phones.filter((phone) => {
    const normalized = String(phone || "").replace(/\D/g, "");
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function listDailyReportPhones(settings, options = {}) {
  const normalized = normalizeNotificationSettings(settings);
  if (!options.forTest && (!normalized.enabled || !normalized.dailyReportEnabled)) return [];
  const fromRecipients = normalized.recipients.filter((row) => row.dailyReport).map((row) => row.phone);
  return dedupePhones([...fromRecipients, ...normalized.dailyReportExtraPhones]);
}

export function scScheduleNotifyModeAllowsRecipientType(mode, recipientType) {
  const normalized = normalizeScScheduleNotifyMode(mode);
  if (normalized === "both") return true;
  return normalized === recipientType;
}

export function listCommentNotifyPhones(settings, options = {}) {
  const normalized = normalizeNotificationSettings(settings);
  if (!options.forTest && (!normalized.enabled || !normalized.commentNotifyEnabled)) return [];
  return normalized.recipients.filter((row) => row.commentNotify).map((row) => row.phone);
}

export { DEFAULT_NOTIFICATION_SETTINGS };
