import { parseMoney } from "@/utils/receivables";

export type SaleAiRules = {
  shortShiftMaxHours: number;
  shortShiftBaseAmount: number;
  shortShiftHourlyAmount: number;
  overtimeBaseHour: number;
  overtimeStartHour: number;
  normalEndHour: number;
};

export const DEFAULT_SALE_AI_RULES: SaleAiRules = {
  shortShiftMaxHours: 5,
  shortShiftBaseAmount: 50000,
  shortShiftHourlyAmount: 50000,
  overtimeBaseHour: 17,
  overtimeStartHour: 19,
  normalEndHour: 18,
};

function clampHour(value: unknown, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(23, Math.max(0, Math.round(num * 10) / 10));
}

function clampPositiveMoney(value: unknown, fallback: number) {
  const amount = parseMoney(value);
  if (!Number.isFinite(amount) || amount < 0) return fallback;
  return Math.round(amount);
}

function clampPositiveHours(value: unknown, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(24, Math.round(num * 10) / 10);
}

export function normalizeSaleAiRules(raw: unknown): SaleAiRules {
  const row = raw && typeof raw === "object" ? (raw as Partial<SaleAiRules>) : {};
  return {
    shortShiftMaxHours: clampPositiveHours(row.shortShiftMaxHours, DEFAULT_SALE_AI_RULES.shortShiftMaxHours),
    shortShiftBaseAmount: clampPositiveMoney(row.shortShiftBaseAmount, DEFAULT_SALE_AI_RULES.shortShiftBaseAmount),
    shortShiftHourlyAmount: clampPositiveMoney(row.shortShiftHourlyAmount, DEFAULT_SALE_AI_RULES.shortShiftHourlyAmount),
    overtimeBaseHour: clampHour(row.overtimeBaseHour, DEFAULT_SALE_AI_RULES.overtimeBaseHour),
    overtimeStartHour: clampHour(row.overtimeStartHour, DEFAULT_SALE_AI_RULES.overtimeStartHour),
    normalEndHour: clampHour(row.normalEndHour, DEFAULT_SALE_AI_RULES.normalEndHour),
  };
}

export function parseScheduleTimeToMinutes(time: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export function computeScheduleWorkHours(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
) {
  const start = parseScheduleTimeToMinutes(startTime);
  const end = parseScheduleTimeToMinutes(endTime);
  if (start == null || end == null || end <= start) return null;
  return (end - start) / 60;
}

export function computeScheduleOvertimeHours(
  endTime: string | null | undefined,
  rules: SaleAiRules = DEFAULT_SALE_AI_RULES,
) {
  const endMinutes = parseScheduleTimeToMinutes(endTime);
  if (endMinutes == null) return 0;
  const endHour = endMinutes / 60;
  if (endHour <= rules.normalEndHour) return 0;
  if (endHour < rules.overtimeStartHour) return 0;
  return Math.max(0, endHour - rules.overtimeBaseHour);
}

export function computeShortShiftChargeAmount(
  workHours: number,
  rules: SaleAiRules = DEFAULT_SALE_AI_RULES,
) {
  const hours = Math.max(0, workHours);
  return rules.shortShiftBaseAmount + rules.shortShiftHourlyAmount * hours;
}

export function formatScheduleWorkHoursLabel(workHours: number) {
  if (!Number.isFinite(workHours)) return "";
  const rounded = Math.round(workHours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function buildShortShiftFormulaPreview(rules: SaleAiRules = DEFAULT_SALE_AI_RULES) {
  const base = rules.shortShiftBaseAmount.toLocaleString("ko-KR");
  const hourly = rules.shortShiftHourlyAmount.toLocaleString("ko-KR");
  return `${base}\uC6D0 + ${hourly}\uC6D0 \u00D7 \uADFC\uBB34\uAE30\uB85D (${rules.shortShiftMaxHours}\uC2DC\uAC04 \uBBF8\uB9CC)`;
}

export function buildOvertimeFormulaPreview(rules: SaleAiRules = DEFAULT_SALE_AI_RULES) {
  return `${Math.floor(rules.normalEndHour)}\uC2DC\uAE4C\uC9C0 \uC57C\uADFC \uC5C6\uC74C \u00B7 ${Math.floor(rules.overtimeStartHour)}\uC2DC\uBD80\uD130 \uC885\uB8CC\u2212${Math.floor(rules.overtimeBaseHour)}\uC2DC\uAC04`;
}
