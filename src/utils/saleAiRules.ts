import { parseMoney } from "@/utils/receivables";

export type SaleAiRuleFormTexts = {
  intro: string;
  shortShiftTitle: string;
  shortShiftBody: string;
  shortShiftFormula: string;
  shortShiftCapRule: string;
  shortShiftManwonRule: string;
  overtimeTitle: string;
  overtimeBody: string;
  overtimeFormula: string;
};

export type SaleAiRules = {
  shortShiftMaxHours: number;
  shortShiftBaseAmount: number;
  shortShiftHourlyAmount: number;
  overtimeBaseHour: number;
  overtimeStartHour: number;
  normalEndHour: number;
  formTexts: SaleAiRuleFormTexts;
};

export const DEFAULT_SALE_AI_RULE_FORM_TEXTS: SaleAiRuleFormTexts = {
  intro:
    "SC \uC2A4\uCF00\uC904\uC5D0\uC11C \uB9E4\uCD9C \uC804\uD45C\uB97C \uAC00\uC838\uC62C \uB54C \uC544\uB798 \uADDC\uCE59\uC73C\uB85C \uCCAD\uAD6C\uC561\uACFC \uC57C\uADFC \uC2DC\uAC04\uC744 \uC790\uB3D9 \uACC4\uC0B0\uD569\uB2C8\uB2E4.",
  shortShiftTitle: "\uB2E8\uCD95 \uADFC\uBB34 \uCCAD\uAD6C",
  shortShiftBody:
    "{maxHours}\uC2DC\uAC04 \uC774\uD558 \uADFC\uBB34\uC758 \uACBD\uC6B0 \uADFC\uBB34\uAE30\uB85D(\uC608\uC815 \uB300\uC2E0 \uADFC\uBB34\uAE30\uB85D \uC788\uC73C\uBA74 \uADFC\uBB34\uAE30\uB85D) \uC2DC\uAC04\uC744 \uAE30\uC900\uC73C\uB85C \uB2E8\uCD95 \uADFC\uBB34 \uACF5\uC2DD\uC744 \uC801\uC6A9\uD569\uB2C8\uB2E4.",
  shortShiftFormula: "{base}\uC6D0 + {hourly}\uC6D0 \u00D7 \uADFC\uBB34\uAE30\uB85D \uC2DC\uAC04 ({maxHours}\uC2DC\uAC04 \uC774\uD558)",
  shortShiftCapRule:
    "\uACF5\uC2DD \uCCAD\uAD6C\uC561\uC774 \uD574\uB2F9 \uC2DC\uACF5\uC790\uC758 \uAE30\uBCF8 \uCCAD\uAD6C\uB2E8\uAC00\uBCF4\uB2E4 \uB192\uC73C\uBA74 \uC2DC\uACF5\uC790 \uAE30\uBCF8 \uCCAD\uAD6C\uB2E8\uAC00\uB97C \uC801\uC6A9\uD569\uB2C8\uB2E4.",
  shortShiftManwonRule:
    "{maxHours}\uC2DC\uAC04 \uC774\uD558 \uADFC\uBB34 \uCCAD\uAD6C\uC561\uC774 \uB9CC\uC6D0 \uB2E8\uC704\uAC00 \uC544\uB2C8\uBA74 \uCC9C\uC6D0 \uC790\uB9AC \uC774\uD558\uB97C \uC808\uC0AD\uD558\uC5EC \uB9CC\uC6D0 \uB2E8\uC704\uB85C \uB9DE\uCD94\uB2C8\uB2E4.",
  overtimeTitle: "\uC57C\uADFC \uC2DC\uAC04",
  overtimeBody:
    "\uADFC\uBB34\uAE30\uB85D \uC885\uB8CC \uC2DC\uAC01\uC744 \uAE30\uC900\uC73C\uB85C \uC57C\uADFC \uC2DC\uAC04\uC744 \uACC4\uC0B0\uD569\uB2C8\uB2E4. \uC18C\uC218\uC810 \uC774\uD558\uB294 \uBC84\uB9BD\uB2C8\uB2E4.",
  overtimeFormula:
    "{normalEnd}\uC2DC\uAE4C\uC9C0 \uC57C\uADFC \uC5C6\uC74C \u00B7 {overtimeStart}\uC2DC\uBD80\uD130 \uC885\uB8CC\u2212{overtimeBase}\uC2DC\uAC04 (\uC18C\uC218\uC810 \uBC84\uB9BC)",
};

export const DEFAULT_SALE_AI_RULES: SaleAiRules = {
  shortShiftMaxHours: 5,
  shortShiftBaseAmount: 50000,
  shortShiftHourlyAmount: 50000,
  overtimeBaseHour: 17,
  overtimeStartHour: 19,
  normalEndHour: 18,
  formTexts: { ...DEFAULT_SALE_AI_RULE_FORM_TEXTS },
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

function normalizeFormText(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeFormTexts(raw: unknown): SaleAiRuleFormTexts {
  const row = raw && typeof raw === "object" ? (raw as Partial<SaleAiRuleFormTexts>) : {};
  return {
    intro: normalizeFormText(row.intro, DEFAULT_SALE_AI_RULE_FORM_TEXTS.intro),
    shortShiftTitle: normalizeFormText(row.shortShiftTitle, DEFAULT_SALE_AI_RULE_FORM_TEXTS.shortShiftTitle),
    shortShiftBody: normalizeFormText(row.shortShiftBody, DEFAULT_SALE_AI_RULE_FORM_TEXTS.shortShiftBody),
    shortShiftFormula: normalizeFormText(row.shortShiftFormula, DEFAULT_SALE_AI_RULE_FORM_TEXTS.shortShiftFormula),
    shortShiftCapRule: normalizeFormText(row.shortShiftCapRule, DEFAULT_SALE_AI_RULE_FORM_TEXTS.shortShiftCapRule),
    shortShiftManwonRule: normalizeFormText(row.shortShiftManwonRule, DEFAULT_SALE_AI_RULE_FORM_TEXTS.shortShiftManwonRule),
    overtimeTitle: normalizeFormText(row.overtimeTitle, DEFAULT_SALE_AI_RULE_FORM_TEXTS.overtimeTitle),
    overtimeBody: normalizeFormText(row.overtimeBody, DEFAULT_SALE_AI_RULE_FORM_TEXTS.overtimeBody),
    overtimeFormula: normalizeFormText(row.overtimeFormula, DEFAULT_SALE_AI_RULE_FORM_TEXTS.overtimeFormula),
  };
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
    formTexts: normalizeFormTexts(row.formTexts),
  };
}

export function saleAiRuleTemplateVars(rules: SaleAiRules = DEFAULT_SALE_AI_RULES) {
  return {
    maxHours: String(rules.shortShiftMaxHours),
    base: rules.shortShiftBaseAmount.toLocaleString("ko-KR"),
    hourly: rules.shortShiftHourlyAmount.toLocaleString("ko-KR"),
    normalEnd: String(Math.floor(rules.normalEndHour)),
    overtimeStart: String(Math.floor(rules.overtimeStartHour)),
    overtimeBase: String(Math.floor(rules.overtimeBaseHour)),
  };
}

export function renderSaleAiRuleText(template: string, rules: SaleAiRules = DEFAULT_SALE_AI_RULES) {
  const vars = saleAiRuleTemplateVars(rules);
  return String(template || "").replace(/\{(\w+)\}/g, (_, key: string) => {
    return key in vars ? vars[key as keyof typeof vars] : `{${key}}`;
  });
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

export function isShortShiftWorkHours(workHours: number | null | undefined, rules: SaleAiRules = DEFAULT_SALE_AI_RULES) {
  const hours = Number(workHours);
  return Number.isFinite(hours) && hours > 0 && hours <= rules.shortShiftMaxHours;
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
  return Math.floor(Math.max(0, endHour - rules.overtimeBaseHour));
}

export function computeShortShiftChargeAmount(
  workHours: number,
  rules: SaleAiRules = DEFAULT_SALE_AI_RULES,
) {
  const hours = Math.max(0, workHours);
  return rules.shortShiftBaseAmount + rules.shortShiftHourlyAmount * hours;
}

export function truncateShortShiftChargeToManwon(amount: number) {
  const value = Math.max(0, Math.round(Number(amount) || 0));
  return Math.floor(value / 10000) * 10000;
}

export function resolveShortShiftChargeAmount(
  workHours: number,
  rules: SaleAiRules = DEFAULT_SALE_AI_RULES,
  workerDefaultCharge = 0,
) {
  const formulaCharge = computeShortShiftChargeAmount(workHours, rules);
  const workerCharge = Math.max(0, Math.round(Number(workerDefaultCharge) || 0));
  let charge = formulaCharge;
  if (workerCharge > 0 && formulaCharge > workerCharge) {
    charge = workerCharge;
  }
  return truncateShortShiftChargeToManwon(charge);
}

export function formatScheduleWorkHoursLabel(workHours: number) {
  if (!Number.isFinite(workHours)) return "";
  const rounded = Math.round(workHours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function buildShortShiftFormulaPreview(rules: SaleAiRules = DEFAULT_SALE_AI_RULES) {
  return renderSaleAiRuleText(rules.formTexts.shortShiftFormula, rules);
}

export function buildOvertimeFormulaPreview(rules: SaleAiRules = DEFAULT_SALE_AI_RULES) {
  return renderSaleAiRuleText(rules.formTexts.overtimeFormula, rules);
}

export type SaleAiRuleFormPreview = {
  intro: string;
  shortShiftTitle: string;
  shortShiftBody: string;
  shortShiftFormula: string;
  shortShiftCapRule: string;
  shortShiftManwonRule: string;
  shortShiftExample: string;
  shortShiftCapExample: string;
  shortShiftManwonExample: string;
  overtimeTitle: string;
  overtimeBody: string;
  overtimeFormula: string;
};

export function buildSaleAiRuleFormPreview(
  rules: SaleAiRules = DEFAULT_SALE_AI_RULES,
  options: { sampleHours?: number; sampleWorkerCharge?: number; capSampleHours?: number; manwonSampleHours?: number } = {},
): SaleAiRuleFormPreview {
  const sampleHours = options.sampleHours ?? 2;
  const capSampleHours = options.capSampleHours ?? 4;
  const manwonSampleHours = options.manwonSampleHours ?? 1.5;
  const sampleWorkerCharge = options.sampleWorkerCharge ?? 120000;
  const sampleCharge = resolveShortShiftChargeAmount(sampleHours, rules, 0);
  const capFormulaCharge = computeShortShiftChargeAmount(capSampleHours, rules);
  const capAppliedCharge = resolveShortShiftChargeAmount(capSampleHours, rules, sampleWorkerCharge);
  const manwonFormulaCharge = computeShortShiftChargeAmount(manwonSampleHours, rules);
  const manwonAppliedCharge = resolveShortShiftChargeAmount(manwonSampleHours, rules, 0);

  return {
    intro: rules.formTexts.intro,
    shortShiftTitle: rules.formTexts.shortShiftTitle,
    shortShiftBody: renderSaleAiRuleText(rules.formTexts.shortShiftBody, rules),
    shortShiftFormula: buildShortShiftFormulaPreview(rules),
    shortShiftCapRule: rules.formTexts.shortShiftCapRule,
    shortShiftManwonRule: renderSaleAiRuleText(rules.formTexts.shortShiftManwonRule, rules),
    shortShiftExample: `${sampleHours}\uC2DC\uAC04 \uADFC\uBB34\uAE30\uB85D \u2192 ${sampleCharge.toLocaleString("ko-KR")}\uC6D0`,
    shortShiftCapExample: `${capSampleHours}\uC2DC\uAC04 \uACF5\uC2DD ${capFormulaCharge.toLocaleString("ko-KR")}\uC6D0 > \uC2DC\uACF5\uC790 \uAE30\uBCF8 ${sampleWorkerCharge.toLocaleString("ko-KR")}\uC6D0 \u2192 ${capAppliedCharge.toLocaleString("ko-KR")}\uC6D0`,
    shortShiftManwonExample: `${manwonSampleHours}\uC2DC\uAC04 \uACF5\uC2DD ${manwonFormulaCharge.toLocaleString("ko-KR")}\uC6D0 \u2192 ${manwonAppliedCharge.toLocaleString("ko-KR")}\uC6D0`,
    overtimeTitle: rules.formTexts.overtimeTitle,
    overtimeBody: rules.formTexts.overtimeBody,
    overtimeFormula: buildOvertimeFormulaPreview(rules),
  };
}
