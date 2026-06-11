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

function normalizeWeekday(value) {
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0 && num <= 6) return num;
  return DEFAULT_NOTIFICATION_SETTINGS.scWeeklyBriefingWeekday;
}

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
  const weeklyHour = Number(raw.scWeeklyBriefingHour);
  const weeklyMinute = Number(raw.scWeeklyBriefingMinute);
  const evalHour = Number(raw.probationEvalNotifyHour);
  const evalMinute = Number(raw.probationEvalNotifyMinute);
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
    scWeeklyBriefingNotifyEnabled: raw.scWeeklyBriefingNotifyEnabled !== false,
    scWeeklyBriefingWeekday: normalizeWeekday(raw.scWeeklyBriefingWeekday),
    scWeeklyBriefingHour: clampSchedulePart(weeklyHour, 23, DEFAULT_NOTIFICATION_SETTINGS.scWeeklyBriefingHour),
    scWeeklyBriefingMinute: clampSchedulePart(weeklyMinute, 59, DEFAULT_NOTIFICATION_SETTINGS.scWeeklyBriefingMinute),
    recipients,
    dailyReportExtraPhones: normalizePhoneList(raw.dailyReportExtraPhones),
    scScheduleNotifyMode: normalizeScScheduleNotifyMode(raw.scScheduleNotifyMode),
    probationEvalNotifyEnabled: raw.probationEvalNotifyEnabled !== false,
    probationEvalNotifyHour: clampSchedulePart(
      evalHour,
      23,
      DEFAULT_NOTIFICATION_SETTINGS.probationEvalNotifyHour,
    ),
    probationEvalNotifyMinute: clampSchedulePart(
      evalMinute,
      59,
      DEFAULT_NOTIFICATION_SETTINGS.probationEvalNotifyMinute,
    ),
    probationEvalReminderEnabled: raw.probationEvalReminderEnabled !== false,
  };
}

/** Merge legacy workerAiRules notify fields when notificationSettings predates eval notify fields. */
export function notificationSettingsWithLegacy(data, workerAiRulesNormalizer) {
  const raw = data?.notificationSettings;
  const base = normalizeNotificationSettings(raw);
  const hasOwn =
    raw &&
    typeof raw === "object" &&
    ("probationEvalNotifyEnabled" in raw ||
      "probationEvalNotifyHour" in raw ||
      "probationEvalReminderEnabled" in raw);
  if (hasOwn || !workerAiRulesNormalizer) return base;
  const legacy = workerAiRulesNormalizer(data?.workerAiRules);
  if (!legacy) return base;
  return normalizeNotificationSettings({
    ...base,
    probationEvalNotifyEnabled: legacy.probationEvalEnabled !== false,
    probationEvalNotifyHour: legacy.probationEvalNotifyHour,
    probationEvalNotifyMinute: legacy.probationEvalNotifyMinute,
    probationEvalReminderEnabled: legacy.probationEvalReminderEnabled !== false,
  });
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
