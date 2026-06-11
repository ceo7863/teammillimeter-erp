export const DEFAULT_SALE_AI_RULE_FORM_TEXTS = {
  intro:
    "SC \uC2A4\uCF00\uC904\uC5D0\uC11C \uB9E4\uCD9C \uC804\uD45C\uB97C \uAC00\uC838\uC62C \uB54C \uC544\uB798 \uADDC\uCE59\uC73C\uB85C \uCCAD\uAD6C\uC561\uACFC \uC57C\uADFC \uC2DC\uAC04\uC744 \uC790\uB3D9 \uACC4\uC0B0\uD569\uB2C8\uB2E4.",
  shortShiftTitle: "\uB2E8\uCD95 \uADFC\uBB34 \uCCAD\uAD6C",
  shortShiftBody:
    "{maxHours}\uC2DC\uAC04 \uC774\uD558 \uADFC\uBB34\uC758 \uACBD\uC6B0 \uADFC\uBB34\uAE30\uB85D \uC2DC\uAC04\uC744 \uAE30\uC900\uC73C\uB85C \uB2E8\uCD95 \uADFC\uBB34 \uACF5\uC2DD\uC744 \uC801\uC6A9\uD569\uB2C8\uB2E4.",
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

export const DEFAULT_SALE_AI_RULES = {
  shortShiftMaxHours: 5,
  shortShiftBaseAmount: 50000,
  shortShiftHourlyAmount: 50000,
  overtimeBaseHour: 17,
  overtimeStartHour: 19,
  normalEndHour: 18,
  formTexts: { ...DEFAULT_SALE_AI_RULE_FORM_TEXTS },
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

function normalizeFormText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeFormTexts(raw) {
  const row = raw && typeof raw === "object" ? raw : {};
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

export function normalizeSaleAiRules(raw) {
  const row = raw && typeof raw === "object" ? raw : {};
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
