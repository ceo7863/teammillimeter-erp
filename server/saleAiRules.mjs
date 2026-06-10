export const DEFAULT_SALE_AI_RULES = {
  shortShiftMaxHours: 5,
  shortShiftBaseAmount: 50000,
  shortShiftHourlyAmount: 50000,
  overtimeBaseHour: 17,
  overtimeStartHour: 19,
  normalEndHour: 18,
};

function parseMoney(value) {
  if (value == null || value === "") return 0;
  const amount = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function clampHour(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(23, Math.max(0, Math.round(num * 10) / 10));
}

function clampPositiveMoney(value, fallback) {
  const amount = parseMoney(value);
  if (!Number.isFinite(amount) || amount < 0) return fallback;
  return Math.round(amount);
}

function clampPositiveHours(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(24, Math.round(num * 10) / 10);
}

export function normalizeSaleAiRules(raw) {
  const row = raw && typeof raw === "object" ? raw : {};
  return {
    shortShiftMaxHours: clampPositiveHours(row.shortShiftMaxHours, DEFAULT_SALE_AI_RULES.shortShiftMaxHours),
    shortShiftBaseAmount: clampPositiveMoney(row.shortShiftBaseAmount, DEFAULT_SALE_AI_RULES.shortShiftBaseAmount),
    shortShiftHourlyAmount: clampPositiveMoney(row.shortShiftHourlyAmount, DEFAULT_SALE_AI_RULES.shortShiftHourlyAmount),
    overtimeBaseHour: clampHour(row.overtimeBaseHour, DEFAULT_SALE_AI_RULES.overtimeBaseHour),
    overtimeStartHour: clampHour(row.overtimeStartHour, DEFAULT_SALE_AI_RULES.overtimeStartHour),
    normalEndHour: clampHour(row.normalEndHour, DEFAULT_SALE_AI_RULES.normalEndHour),
  };
}
