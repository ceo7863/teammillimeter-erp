import {
  isOfficeStaffActive,
  normalizeOfficeStaffRecordId,
  type OfficeStaffRecord,
} from "@/utils/officeStaff";

export type OfficePayrollPayType = "monthly" | "daily_33";

export type OfficePayrollMoneyLine = {
  label: string;
  amount: number;
};

export type OfficePayrollSettings = {
  payDay: number;
  defaultIncomeTaxRate: number;
  dailyWithholdingRate: number;
  defaultAllowanceLabels: string[];
  defaultDeductionLabels: string[];
};

export type OfficePayrollProfile = {
  staffId: string;
  payType: OfficePayrollPayType;
  baseSalary: number;
  dailyRate: number;
  allowances: OfficePayrollMoneyLine[];
  memo?: string;
};

export type OfficePayrollSheetStatus = "draft" | "confirmed" | "paid";

export type OfficePayrollLine = {
  id: string;
  staffId: string;
  staffName: string;
  department?: string;
  position?: string;
  payType: OfficePayrollPayType;
  baseSalary: number;
  dailyDays: number;
  dailyRate: number;
  allowances: OfficePayrollMoneyLine[];
  deductions: OfficePayrollMoneyLine[];
  grossPay: number;
  withholdingAmount: number;
  netPay: number;
  bank?: string;
  account?: string;
  memo?: string;
  excluded?: boolean;
};

export type OfficePayrollSheet = {
  id: string;
  monthKey: string;
  status: OfficePayrollSheetStatus;
  payDate?: string;
  lines: OfficePayrollLine[];
  memo?: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  paidAt?: string;
};

export const DEFAULT_OFFICE_PAYROLL_SETTINGS: OfficePayrollSettings = {
  payDay: 22,
  defaultIncomeTaxRate: 0.03,
  dailyWithholdingRate: 0.033,
  defaultAllowanceLabels: ["식대", "직책수당"],
  defaultDeductionLabels: ["국민연금", "건강보험", "장기요양", "고용보험", "소득세", "지방세"],
};

export const OFFICE_PAYROLL_STATUS_LABELS: Record<OfficePayrollSheetStatus, string> = {
  draft: "작성 중",
  confirmed: "확정",
  paid: "지급완료",
};

export const OFFICE_PAYROLL_PAY_TYPE_LABELS: Record<OfficePayrollPayType, string> = {
  monthly: "월급",
  daily_33: "일당(3.3%)",
};

export function makeOfficePayrollId(prefix: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function currentMonthKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).slice(0, 7);
}

export function shiftMonthKey(monthKey: string, delta: number) {
  const [yearText, monthText] = String(monthKey || currentMonthKey()).split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return currentMonthKey();
  const date = new Date(year, month - 1 + delta, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatMonthLabel(monthKey: string) {
  const [year, month] = String(monthKey || "").split("-");
  if (!year || !month) return monthKey;
  return `${year}년 ${Number.parseInt(month, 10)}월`;
}

export function roundPayAmount(value: unknown) {
  return Math.round(Number(value) || 0);
}

export function sumMoneyLines(lines: OfficePayrollMoneyLine[] = []) {
  return lines.reduce((sum, line) => sum + roundPayAmount(line.amount), 0);
}

export function normalizeMoneyLines(value: unknown): OfficePayrollMoneyLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const source = row as Partial<OfficePayrollMoneyLine>;
      const label = String(source.label || "").trim();
      if (!label) return null;
      return { label, amount: roundPayAmount(source.amount) };
    })
    .filter((row): row is OfficePayrollMoneyLine => Boolean(row));
}

export function normalizeOfficePayrollSettings(value: unknown): OfficePayrollSettings {
  const defaults = DEFAULT_OFFICE_PAYROLL_SETTINGS;
  if (!value || typeof value !== "object") return { ...defaults };
  const source = value as Partial<OfficePayrollSettings>;
  const payDay = Number(source.payDay);
  const defaultIncomeTaxRate = Number(source.defaultIncomeTaxRate);
  const dailyWithholdingRate = Number(source.dailyWithholdingRate);
  return {
    payDay: Number.isFinite(payDay) && payDay >= 1 && payDay <= 31 ? Math.trunc(payDay) : defaults.payDay,
    defaultIncomeTaxRate:
      Number.isFinite(defaultIncomeTaxRate) && defaultIncomeTaxRate >= 0
        ? defaultIncomeTaxRate
        : defaults.defaultIncomeTaxRate,
    dailyWithholdingRate:
      Number.isFinite(dailyWithholdingRate) && dailyWithholdingRate >= 0
        ? dailyWithholdingRate
        : defaults.dailyWithholdingRate,
    defaultAllowanceLabels: Array.isArray(source.defaultAllowanceLabels)
      ? source.defaultAllowanceLabels.map((item) => String(item || "").trim()).filter(Boolean)
      : [...defaults.defaultAllowanceLabels],
    defaultDeductionLabels: Array.isArray(source.defaultDeductionLabels)
      ? source.defaultDeductionLabels.map((item) => String(item || "").trim()).filter(Boolean)
      : [...defaults.defaultDeductionLabels],
  };
}

export function normalizeOfficePayrollProfile(row: unknown): OfficePayrollProfile | null {
  if (!row || typeof row !== "object") return null;
  const source = row as Partial<OfficePayrollProfile>;
  const staffId = normalizeOfficeStaffRecordId(source.staffId);
  if (!staffId) return null;
  const payType = source.payType === "daily_33" ? "daily_33" : "monthly";
  return {
    staffId,
    payType,
    baseSalary: roundPayAmount(source.baseSalary),
    dailyRate: roundPayAmount(source.dailyRate),
    allowances: normalizeMoneyLines(source.allowances),
    memo: String(source.memo || "").trim(),
  };
}

export function normalizeOfficePayrollProfiles(value: unknown): OfficePayrollProfile[] {
  if (!Array.isArray(value)) return [];
  const map = new Map<string, OfficePayrollProfile>();
  for (const row of value) {
    const profile = normalizeOfficePayrollProfile(row);
    if (profile) map.set(profile.staffId, profile);
  }
  return [...map.values()];
}

export function normalizeOfficePayrollLine(row: unknown): OfficePayrollLine | null {
  if (!row || typeof row !== "object") return null;
  const source = row as Partial<OfficePayrollLine>;
  const staffId = normalizeOfficeStaffRecordId(source.staffId);
  const staffName = String(source.staffName || "").trim();
  if (!staffId || !staffName) return null;
  const payType = source.payType === "daily_33" ? "daily_33" : "monthly";
  const line: OfficePayrollLine = {
    id: String(source.id || makeOfficePayrollId("payroll-line")).trim(),
    staffId,
    staffName,
    department: String(source.department || "").trim(),
    position: String(source.position || "").trim(),
    payType,
    baseSalary: roundPayAmount(source.baseSalary),
    dailyDays: Math.max(0, roundPayAmount(source.dailyDays)),
    dailyRate: roundPayAmount(source.dailyRate),
    allowances: normalizeMoneyLines(source.allowances),
    deductions: normalizeMoneyLines(source.deductions),
    grossPay: 0,
    withholdingAmount: 0,
    netPay: 0,
    bank: String(source.bank || "").trim(),
    account: String(source.account || "").trim(),
    memo: String(source.memo || "").trim(),
    excluded: Boolean(source.excluded),
  };
  return recalculateOfficePayrollLine(line);
}

export function normalizeOfficePayrollSheet(row: unknown): OfficePayrollSheet | null {
  if (!row || typeof row !== "object") return null;
  const source = row as Partial<OfficePayrollSheet>;
  const monthKey = String(source.monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const status =
    source.status === "confirmed" || source.status === "paid" ? source.status : "draft";
  const lines = Array.isArray(source.lines)
    ? source.lines.map(normalizeOfficePayrollLine).filter((line): line is OfficePayrollLine => Boolean(line))
    : [];
  const now = new Date().toISOString();
  return {
    id: String(source.id || makeOfficePayrollId("payroll-sheet")).trim(),
    monthKey,
    status,
    payDate: String(source.payDate || "").trim(),
    lines,
    memo: String(source.memo || "").trim(),
    createdAt: String(source.createdAt || now),
    updatedAt: String(source.updatedAt || now),
    confirmedAt: String(source.confirmedAt || "").trim() || undefined,
    paidAt: String(source.paidAt || "").trim() || undefined,
  };
}

export function normalizeOfficePayrollSheets(value: unknown): OfficePayrollSheet[] {
  if (!Array.isArray(value)) return [];
  const map = new Map<string, OfficePayrollSheet>();
  for (const row of value) {
    const sheet = normalizeOfficePayrollSheet(row);
    if (sheet) map.set(sheet.monthKey, sheet);
  }
  return [...map.values()].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export function resolveOfficePayrollProfile(
  staffId: string,
  profiles: OfficePayrollProfile[],
): OfficePayrollProfile | undefined {
  return profiles.find((row) => row.staffId === staffId);
}

export function buildDefaultAllowances(
  settings: OfficePayrollSettings,
  profile?: OfficePayrollProfile,
): OfficePayrollMoneyLine[] {
  if (profile?.allowances?.length) {
    return profile.allowances.map((line) => ({ ...line }));
  }
  return settings.defaultAllowanceLabels.map((label) => ({ label, amount: 0 }));
}

export function buildDefaultDeductions(settings: OfficePayrollSettings): OfficePayrollMoneyLine[] {
  return settings.defaultDeductionLabels.map((label) => ({ label, amount: 0 }));
}

export function computeOfficePayrollGross(line: Pick<
  OfficePayrollLine,
  "payType" | "baseSalary" | "dailyDays" | "dailyRate" | "allowances"
>) {
  const allowanceTotal = sumMoneyLines(line.allowances);
  if (line.payType === "daily_33") {
    return roundPayAmount(line.dailyDays * line.dailyRate) + allowanceTotal;
  }
  return roundPayAmount(line.baseSalary) + allowanceTotal;
}

export function computeOfficePayrollWithholding(
  line: Pick<OfficePayrollLine, "payType" | "grossPay">,
  settings: OfficePayrollSettings,
) {
  if (line.payType === "daily_33") {
    return roundPayAmount(line.grossPay * settings.dailyWithholdingRate);
  }
  return 0;
}

export function recalculateOfficePayrollLine(
  line: OfficePayrollLine,
  settings: OfficePayrollSettings = DEFAULT_OFFICE_PAYROLL_SETTINGS,
): OfficePayrollLine {
  if (line.excluded) {
    return { ...line, grossPay: 0, withholdingAmount: 0, netPay: 0 };
  }
  const grossPay = computeOfficePayrollGross(line);
  const withholdingAmount = computeOfficePayrollWithholding({ ...line, grossPay }, settings);
  const manualDeductionTotal = sumMoneyLines(line.deductions);
  const netPay = Math.max(grossPay - withholdingAmount - manualDeductionTotal, 0);
  return {
    ...line,
    grossPay,
    withholdingAmount,
    netPay,
  };
}

export function recalculateOfficePayrollSheet(
  sheet: OfficePayrollSheet,
  settings: OfficePayrollSettings,
): OfficePayrollSheet {
  return {
    ...sheet,
    lines: sheet.lines.map((line) => recalculateOfficePayrollLine(line, settings)),
    updatedAt: new Date().toISOString(),
  };
}

export function isOfficeStaffPayrollEligible(
  staff: OfficeStaffRecord,
  monthKey: string,
): boolean {
  if (!isOfficeStaffActive(staff)) return false;
  const hireDate = String(staff.hireDate || "").trim();
  if (hireDate && hireDate.slice(0, 7) > monthKey) return false;
  const resignDate = String(staff.resignDate || "").trim();
  if (staff.status === "resigned" && resignDate && resignDate.slice(0, 7) < monthKey) return false;
  return true;
}

export function buildOfficePayrollLineFromStaff(input: {
  staff: OfficeStaffRecord;
  profile?: OfficePayrollProfile;
  settings: OfficePayrollSettings;
  existing?: OfficePayrollLine;
}): OfficePayrollLine {
  const { staff, profile, settings, existing } = input;
  const staffId = normalizeOfficeStaffRecordId(staff.id)!;
  const payType = existing?.payType || profile?.payType || "monthly";
  const line: OfficePayrollLine = {
    id: existing?.id || makeOfficePayrollId("payroll-line"),
    staffId,
    staffName: staff.name,
    department: staff.department,
    position: staff.position,
    payType,
    baseSalary: existing?.baseSalary ?? profile?.baseSalary ?? 0,
    dailyDays: existing?.dailyDays ?? 0,
    dailyRate: existing?.dailyRate ?? profile?.dailyRate ?? 0,
    allowances: existing?.allowances?.length
      ? existing.allowances.map((row) => ({ ...row }))
      : buildDefaultAllowances(settings, profile),
    deductions: existing?.deductions?.length
      ? existing.deductions.map((row) => ({ ...row }))
      : buildDefaultDeductions(settings),
    grossPay: 0,
    withholdingAmount: 0,
    netPay: 0,
    bank: existing?.bank || staff.bank,
    account: existing?.account || staff.account,
    memo: existing?.memo || profile?.memo,
    excluded: existing?.excluded,
  };
  return recalculateOfficePayrollLine(line, settings);
}

export function buildOfficePayrollSheetForMonth(input: {
  monthKey: string;
  officeStaff: OfficeStaffRecord[];
  profiles: OfficePayrollProfile[];
  settings: OfficePayrollSettings;
  existing?: OfficePayrollSheet;
}): OfficePayrollSheet {
  const { monthKey, officeStaff, profiles, settings, existing } = input;
  const eligible = officeStaff.filter((staff) => isOfficeStaffPayrollEligible(staff, monthKey));
  const existingByStaff = new Map(
    (existing?.lines || []).map((line) => [line.staffId, line] as const),
  );
  const lines = eligible.map((staff) =>
    buildOfficePayrollLineFromStaff({
      staff,
      profile: resolveOfficePayrollProfile(normalizeOfficeStaffRecordId(staff.id)!, profiles),
      settings,
      existing: existingByStaff.get(normalizeOfficeStaffRecordId(staff.id)!),
    }),
  );
  const [year, month] = monthKey.split("-");
  const payDay = String(settings.payDay).padStart(2, "0");
  const payDate = existing?.payDate || `${year}-${month}-${payDay}`;
  const now = new Date().toISOString();
  const sheet: OfficePayrollSheet = {
    id: existing?.id || makeOfficePayrollId("payroll-sheet"),
    monthKey,
    status: existing?.status || "draft",
    payDate,
    lines,
    memo: existing?.memo || "",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    confirmedAt: existing?.confirmedAt,
    paidAt: existing?.paidAt,
  };
  return recalculateOfficePayrollSheet(sheet, settings);
}

export function summarizeOfficePayrollSheet(sheet: OfficePayrollSheet) {
  const activeLines = sheet.lines.filter((line) => !line.excluded);
  return {
    headcount: activeLines.length,
    grossPay: activeLines.reduce((sum, line) => sum + line.grossPay, 0),
    withholdingAmount: activeLines.reduce((sum, line) => sum + line.withholdingAmount, 0),
    deductionTotal: activeLines.reduce((sum, line) => sum + sumMoneyLines(line.deductions), 0),
    netPay: activeLines.reduce((sum, line) => sum + line.netPay, 0),
  };
}

export function formatPayrollKRW(value: number) {
  return `${roundPayAmount(value).toLocaleString("ko-KR")}원`;
}

export function upsertOfficePayrollProfile(
  profiles: OfficePayrollProfile[],
  profile: OfficePayrollProfile,
): OfficePayrollProfile[] {
  const next = profiles.filter((row) => row.staffId !== profile.staffId);
  next.push(profile);
  return next.sort((a, b) => a.staffId.localeCompare(b.staffId));
}

export function upsertOfficePayrollSheet(
  sheets: OfficePayrollSheet[],
  sheet: OfficePayrollSheet,
): OfficePayrollSheet[] {
  const next = sheets.filter((row) => row.monthKey !== sheet.monthKey);
  next.push(sheet);
  return next.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}
