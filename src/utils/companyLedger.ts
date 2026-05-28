import { formatKRW, todayISO } from "./receivables";
import { formatMonthLabel, shiftMonthKey } from "./workerMonthlyPayments";

export { formatKRW, formatMonthLabel, shiftMonthKey, todayISO };

export type FixedExpenseCycle = "monthly" | "quarterly" | "yearly";

export type CompanyExpenseKind = "variable" | "fixed";

export type CompanyExpense = {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  memo?: string;
  kind?: CompanyExpenseKind;
  bankTransactionId?: string;
  createdBy?: string;
  createdAt?: string;
};

export type FixedExpense = {
  id: string;
  name: string;
  category: string;
  amount: number;
  cycle: FixedExpenseCycle;
  paymentDayOfMonth?: number;
  startDate?: string;
  memo?: string;
  isActive: boolean;
};

export type FixedExpensePayment = {
  id: string;
  fixedExpenseId: string;
  date: string;
  amount: number;
  category?: string;
  memo?: string;
  bankTransactionId?: string;
  createdBy?: string;
  createdAt?: string;
};

export type LedgerPeriodKey = "today" | "thisMonth" | "lastMonth" | "all";

export type MonthlyLedgerRow = {
  monthKey: string;
  label: string;
  manualTotal: number;
  fixedTotal: number;
  grandTotal: number;
  manualCount: number;
  fixedCount: number;
};

export type MonthlyLedgerDetail = {
  monthKey: string;
  label: string;
  manualExpenses: CompanyExpense[];
  fixedPayments: FixedExpensePayment[];
  manualTotal: number;
  fixedTotal: number;
  grandTotal: number;
};

export const EXPENSE_KIND_OPTIONS: Array<{ value: CompanyExpenseKind; label: string }> = [
  { value: "variable", label: "\uBCC0\uB3D9 \uC9C0\uCD9C" },
  { value: "fixed", label: "\uACE0\uC815\uBE44" },
];

export function expenseKindLabel(kind: CompanyExpenseKind = "variable") {
  return EXPENSE_KIND_OPTIONS.find((row) => row.value === kind)?.label || EXPENSE_KIND_OPTIONS[0].label;
}

export function resolveCompanyExpenseKind(expense: Pick<CompanyExpense, "kind">) {
  return expense.kind === "fixed" ? "fixed" : "variable";
}

export const EXPENSE_CATEGORY_OPTIONS = [
  "\uC0AC\uBB34\uC6A9\uD488",
  "\uAD50\uD86D/\uC8FC\uCC28",
  "\uC811\uB300/\uC2DD\uBE44",
  "\uD1B5\uC2E0\uBE44",
  "\uC18C\uBAA8\uD488",
  "\uB9C8\uCF00\uD305",
  "\uBC29\uBB38/\uC678\uBD80",
  "\uAE30\uD0C0",
];

/** 접대·식비·식대 등 동의어 → EXPENSE_CATEGORY_OPTIONS 표준명 */
const MEAL_EXPENSE_CATEGORY_CANONICAL = "\uC811\uB300/\uC2DD\uBE44";

const EXPENSE_CATEGORY_ALIASES: Record<string, string> = {
  "\uC2DD": MEAL_EXPENSE_CATEGORY_CANONICAL,
  "\uC2DD\uB300": MEAL_EXPENSE_CATEGORY_CANONICAL,
  "\uC2DD\uBE44": MEAL_EXPENSE_CATEGORY_CANONICAL,
  "\uC811\uB300": MEAL_EXPENSE_CATEGORY_CANONICAL,
  "\uC811\uB300/\uC2DD\uB300": MEAL_EXPENSE_CATEGORY_CANONICAL,
};

export function normalizeExpenseCategoryName(category: string): string {
  const trimmed = String(category || "").trim();
  if (!trimmed) return trimmed;
  return EXPENSE_CATEGORY_ALIASES[trimmed] ?? trimmed;
}

export function normalizeExpenseCategories(
  rows: unknown,
  existingExpenses: Array<{ category?: string }> = [],
): string[] {
  const extras = Array.isArray(rows) ? rows.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const fromExpenses = existingExpenses.map((row) => String(row.category || "").trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of [...EXPENSE_CATEGORY_OPTIONS, ...extras, ...fromExpenses]) {
    const category = normalizeExpenseCategoryName(raw);
    if (!category || seen.has(category)) continue;
    seen.add(category);
    result.push(category);
  }

  return result;
}

export function mergeExpenseCategory(categories: string[], category: string): string[] {
  const trimmed = normalizeExpenseCategoryName(String(category || "").trim());
  if (!trimmed) return categories;
  return normalizeExpenseCategories([...categories, trimmed]);
}

export function normalizeFixedExpenseCategories(
  rows: unknown,
  fixedExpenses: Array<{ category?: string }> = [],
): string[] {
  const extras = Array.isArray(rows) ? rows.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const fromFixed = fixedExpenses.map((row) => String(row.category || "").trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const category of [...FIXED_CATEGORY_OPTIONS, ...extras, ...fromFixed]) {
    if (!category || seen.has(category)) continue;
    seen.add(category);
    result.push(category);
  }

  return result;
}

export function mergeFixedExpenseCategory(
  categories: string[],
  category: string,
  fixedExpenses: Array<{ category?: string }> = [],
): string[] {
  const trimmed = String(category || "").trim();
  if (!trimmed) return categories;
  return normalizeFixedExpenseCategories([...categories, trimmed], fixedExpenses);
}

export function buildFixedCategoryOptionList(
  fixedExpenses: FixedExpense[] = [],
  savedCategories: string[] = [],
  draftCategory = "",
): string[] {
  const categories = normalizeFixedExpenseCategories(savedCategories, fixedExpenses);
  const draft = String(draftCategory || "").trim();
  if (draft && !categories.includes(draft)) {
    return [draft, ...categories];
  }
  return categories;
}

export function buildFixedCategorySelectOptions(
  fixedExpenses: FixedExpense[] = [],
  savedCategories: string[] = [],
  draftCategory = "",
) {
  return buildFixedCategoryOptionList(fixedExpenses, savedCategories, draftCategory).map((category) => ({
    label: category,
    value: category,
  }));
}

export const FIXED_CATEGORY_OPTIONS = [
  "\uC784\uB300\uB8CC",
  "\uAD6C\uB3C5/\uC11C\uBE44\uC2A4",
  "\uD1B5\uC2E0\uBE44",
  "\uBCF4\uD5D8",
  "\uC778\uAC74\uBE44",
  "\uAE30\uD0C0",
];

export const FIXED_CYCLE_OPTIONS: Array<{ value: FixedExpenseCycle; label: string }> = [
  { value: "monthly", label: "\uC6D4\uAC04" },
  { value: "quarterly", label: "\uBD84\uAE30" },
  { value: "yearly", label: "\uC5F0\uAC04" },
];

export function makeLedgerId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getMonthKey(dateStr: string) {
  const match = /^(\d{4}-\d{2})/.exec(String(dateStr || "").trim());
  return match ? match[1] : "";
}

export function monthRangeISO(offset = 0) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const startDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  const endDateObj = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, "0")}-${String(endDateObj.getDate()).padStart(2, "0")}`;
  return { startDate, endDate };
}

export function quarterRangeISO(quarter: 1 | 2 | 3 | 4, year = new Date().getFullYear()) {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(year, endMonth, 0).getDate();
  const endDate = `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
}

export function ledgerDateFilter(periodKey: LedgerPeriodKey) {
  if (periodKey === "today") {
    const today = todayISO();
    return { startDate: today, endDate: today };
  }
  if (periodKey === "thisMonth") return monthRangeISO(0);
  if (periodKey === "lastMonth") return monthRangeISO(-1);
  return { startDate: "", endDate: "" };
}

export function ledgerPeriodLabel(periodKey: LedgerPeriodKey) {
  if (periodKey === "today") return `\uC624\uB298 \u00B7 ${todayISO()}`;
  if (periodKey === "thisMonth") {
    const range = monthRangeISO(0);
    return `\uC774\uBC88 \uB2EC \u00B7 ${range.startDate} ~ ${range.endDate}`;
  }
  if (periodKey === "lastMonth") {
    const range = monthRangeISO(-1);
    return `\uC9C0\uB09C \uB2EC \u00B7 ${range.startDate} ~ ${range.endDate}`;
  }
  return "\uC804\uCCB4 \uAE30\uAC04";
}

export function parseLedgerAmount(value: unknown) {
  const num = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

export function fixedMonthlyAmount(expense: Pick<FixedExpense, "amount" | "cycle">) {
  const amount = Number(expense.amount) || 0;
  if (expense.cycle === "yearly") return Math.round(amount / 12);
  if (expense.cycle === "quarterly") return Math.round(amount / 3);
  return amount;
}

export function fixedCycleLabel(cycle: FixedExpenseCycle) {
  return FIXED_CYCLE_OPTIONS.find((row) => row.value === cycle)?.label || cycle;
}

export const RECURRING_FIXED_AMOUNT_TOLERANCE_RATIO = 0.15;

export function areRecurringAmountsCompatible(
  base: number,
  actual: number,
  ratio = RECURRING_FIXED_AMOUNT_TOLERANCE_RATIO,
) {
  if (!(base > 0) || !(actual > 0)) return false;
  if (base === actual) return true;
  const diff = Math.abs(actual - base);
  return diff / base <= ratio;
}

export function normalizeFixedExpensePaymentDay(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.min(31, Math.max(1, Math.round(num)));
}

export function buildFixedExpensePaymentDate(monthKey: string, paymentDayOfMonth?: number): string {
  const day = normalizeFixedExpensePaymentDay(paymentDayOfMonth);
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || "").trim());
  if (!match) return `${monthKey}-01`;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(day, lastDay);
  return `${match[1]}-${match[2]}-${String(clampedDay).padStart(2, "0")}`;
}

export function formatFixedExpensePaymentDay(day?: number): string {
  return `\uB9E4\uC6D4 ${normalizeFixedExpensePaymentDay(day)}\uC77C`;
}

export function isFixedActiveInMonth(expense: FixedExpense, monthKey: string) {
  if (!expense.isActive) return false;
  if (!monthKey) return true;
  const startKey = getMonthKey(expense.startDate || "");
  if (startKey && startKey > monthKey) return false;
  return true;
}

export function filterCompanyExpenses(
  expenses: CompanyExpense[] = [],
  startDate = "",
  endDate = "",
) {
  return expenses.filter((row) => {
    const date = String(row.date || "");
    const startMatch = startDate ? date >= startDate : true;
    const endMatch = endDate ? date <= endDate : true;
    return startMatch && endMatch;
  });
}

export function sumCompanyExpenses(expenses: CompanyExpense[] = []) {
  return expenses.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

export function sumActiveFixedMonthly(fixedExpenses: FixedExpense[] = [], monthKey?: string) {
  return fixedExpenses
    .filter((row) => (monthKey ? isFixedActiveInMonth(row, monthKey) : row.isActive))
    .reduce((sum, row) => sum + fixedMonthlyAmount(row), 0);
}

export function sumFixedExpensePayments(payments: FixedExpensePayment[] = []) {
  return payments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

export function sumExpensesForMonthByKind(
  companyExpenses: CompanyExpense[] = [],
  fixedExpensePayments: FixedExpensePayment[] = [],
  monthKey: string,
  kind: CompanyExpenseKind,
) {
  const expenseTotal = companyExpenses
    .filter((row) => getMonthKey(row.date) === monthKey && resolveCompanyExpenseKind(row) === kind)
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  if (kind !== "fixed") return expenseTotal;
  const paymentTotal = fixedExpensePayments
    .filter((row) => getMonthKey(row.date) === monthKey)
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  return expenseTotal + paymentTotal;
}

export function collectLedgerMonthKeys(
  companyExpenses: CompanyExpense[] = [],
  fixedExpensePayments: FixedExpensePayment[] = [],
) {
  const keys = new Set<string>();
  for (const row of companyExpenses) {
    const key = getMonthKey(row.date);
    if (key) keys.add(key);
  }
  for (const row of fixedExpensePayments) {
    const key = getMonthKey(row.date);
    if (key) keys.add(key);
  }
  if (!keys.size) keys.add(todayISO().slice(0, 7));
  return Array.from(keys).sort((a, b) => b.localeCompare(a));
}

export function buildMonthlyLedgerRows(
  companyExpenses: CompanyExpense[] = [],
  fixedExpensePayments: FixedExpensePayment[] = [],
): MonthlyLedgerRow[] {
  const monthKeys = collectLedgerMonthKeys(companyExpenses, fixedExpensePayments);
  return monthKeys.map((monthKey) => {
    const manualRows = companyExpenses.filter((row) => getMonthKey(row.date) === monthKey);
    const paymentRows = fixedExpensePayments.filter((row) => getMonthKey(row.date) === monthKey);
    const manualTotal = sumCompanyExpenses(manualRows.filter((row) => resolveCompanyExpenseKind(row) === "variable"));
    const fixedTotal =
      sumCompanyExpenses(manualRows.filter((row) => resolveCompanyExpenseKind(row) === "fixed")) +
      sumFixedExpensePayments(paymentRows);
    return {
      monthKey,
      label: formatMonthLabel(monthKey),
      manualTotal,
      fixedTotal,
      grandTotal: manualTotal + fixedTotal,
      manualCount: manualRows.filter((row) => resolveCompanyExpenseKind(row) === "variable").length,
      fixedCount: manualRows.filter((row) => resolveCompanyExpenseKind(row) === "fixed").length + paymentRows.length,
    };
  });
}

export function filterFixedExpensePayments(
  payments: FixedExpensePayment[] = [],
  startDate = "",
  endDate = "",
) {
  return payments.filter((row) => {
    const date = String(row.date || "");
    const startMatch = startDate ? date >= startDate : true;
    const endMatch = endDate ? date <= endDate : true;
    return startMatch && endMatch;
  });
}

export function getFixedExpensePaymentsForMonth(
  payments: FixedExpensePayment[] = [],
  monthKey: string,
) {
  return payments
    .filter((row) => getMonthKey(row.date) === monthKey)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export type LedgerStatsSummary = {
  variableTotal: number;
  fixedTotal: number;
  grandTotal: number;
  variableCount: number;
  fixedCount: number;
  totalCount: number;
};

export type LedgerCategoryStatRow = {
  category: string;
  variableTotal: number;
  fixedTotal: number;
  grandTotal: number;
  variableCount: number;
  fixedCount: number;
  totalCount: number;
  sharePercent: number;
};

export function resolveFixedPaymentCategory(
  payment: FixedExpensePayment,
  fixedExpenses: FixedExpense[] = [],
) {
  const override = String(payment.category || "").trim();
  if (override) return override;
  const category = fixedExpenses.find((row) => row.id === payment.fixedExpenseId)?.category;
  return String(category || "").trim() || "\uAE30\uD0C0";
}

export function buildLedgerCategoryStats(
  companyExpenses: CompanyExpense[] = [],
  fixedExpensePayments: FixedExpensePayment[] = [],
  fixedExpenses: FixedExpense[] = [],
  startDate = "",
  endDate = "",
) {
  const rangedExpenses = filterCompanyExpenses(companyExpenses, startDate, endDate);
  const rangedPayments = filterFixedExpensePayments(fixedExpensePayments, startDate, endDate);
  const bucket = new Map<
    string,
    Omit<LedgerCategoryStatRow, "category" | "sharePercent" | "grandTotal" | "totalCount">
  >();

  const touch = (category: string) => {
    const key = normalizeExpenseCategoryName(category.trim()) || "\uAE30\uD0C0";
    if (!bucket.has(key)) {
      bucket.set(key, {
        variableTotal: 0,
        fixedTotal: 0,
        variableCount: 0,
        fixedCount: 0,
      });
    }
    return key;
  };

  for (const row of rangedExpenses) {
    const key = touch(row.category);
    const entry = bucket.get(key)!;
    const amount = Number(row.amount) || 0;
    if (resolveCompanyExpenseKind(row) === "fixed") {
      entry.fixedTotal += amount;
      entry.fixedCount += 1;
    } else {
      entry.variableTotal += amount;
      entry.variableCount += 1;
    }
  }

  for (const row of rangedPayments) {
    const key = touch(resolveFixedPaymentCategory(row, fixedExpenses));
    const entry = bucket.get(key)!;
    entry.fixedTotal += Number(row.amount) || 0;
    entry.fixedCount += 1;
  }

  const summary: LedgerStatsSummary = {
    variableTotal: 0,
    fixedTotal: 0,
    grandTotal: 0,
    variableCount: 0,
    fixedCount: 0,
    totalCount: 0,
  };

  const rows: LedgerCategoryStatRow[] = Array.from(bucket.entries())
    .map(([category, entry]) => {
      const grandTotal = entry.variableTotal + entry.fixedTotal;
      const totalCount = entry.variableCount + entry.fixedCount;
      summary.variableTotal += entry.variableTotal;
      summary.fixedTotal += entry.fixedTotal;
      summary.variableCount += entry.variableCount;
      summary.fixedCount += entry.fixedCount;
      return {
        category,
        ...entry,
        grandTotal,
        totalCount,
        sharePercent: 0,
      };
    })
    .sort((a, b) => b.grandTotal - a.grandTotal || a.category.localeCompare(b.category, "ko"));

  summary.grandTotal = summary.variableTotal + summary.fixedTotal;
  summary.totalCount = summary.variableCount + summary.fixedCount;

  if (summary.grandTotal > 0) {
    for (const row of rows) {
      row.sharePercent = Math.round((row.grandTotal / summary.grandTotal) * 1000) / 10;
    }
  }

  return { rows, summary };
}

export function buildMonthlyLedgerDetail(
  companyExpenses: CompanyExpense[] = [],
  monthKey: string,
  fixedExpensePayments: FixedExpensePayment[] = [],
): MonthlyLedgerDetail {
  const manualExpenses = companyExpenses
    .filter((row) => getMonthKey(row.date) === monthKey)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const fixedPayments = getFixedExpensePaymentsForMonth(fixedExpensePayments, monthKey);
  const manualTotal = sumCompanyExpenses(manualExpenses.filter((row) => resolveCompanyExpenseKind(row) === "variable"));
  const fixedTotal =
    sumCompanyExpenses(manualExpenses.filter((row) => resolveCompanyExpenseKind(row) === "fixed")) +
    sumFixedExpensePayments(fixedPayments);
  return {
    monthKey,
    label: formatMonthLabel(monthKey),
    manualExpenses,
    fixedPayments,
    manualTotal,
    fixedTotal,
    grandTotal: manualTotal + fixedTotal,
  };
}

export function validateCompanyExpenseInput(input: {
  date?: string;
  category?: string;
  description?: string;
  amount?: unknown;
}) {
  if (!String(input.date || "").trim()) return "\uC9C0\uCD9C \uC77C\uC790\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!String(input.category || "").trim()) return "\uCE74\uD14C\uACE0\uB9AC\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.";
  if (!String(input.description || "").trim()) return "\uB0B4\uC6A9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  const amount = parseLedgerAmount(input.amount);
  if (amount <= 0) return "\uAE08\uC561\uC744 0\uBCF4\uB2E4 \uD06C\uAC8C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  return "";
}

export function validateFixedExpenseInput(input: {
  name?: string;
  category?: string;
  amount?: unknown;
  cycle?: FixedExpenseCycle;
  paymentDayOfMonth?: unknown;
}) {
  if (!String(input.name || "").trim()) return "\uD56D\uBAA9 \uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!String(input.category || "").trim()) return "\uCE74\uD14C\uACE0\uB9AC\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.";
  const amount = parseLedgerAmount(input.amount);
  if (amount <= 0) return "\uAE08\uC561\uC744 0\uBCF4\uB2E4 \uD06C\uAC8C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!input.cycle) return "\uC8FC\uAE30\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.";
  if (
    input.paymentDayOfMonth !== undefined &&
    input.paymentDayOfMonth !== null &&
    String(input.paymentDayOfMonth).trim() !== ""
  ) {
    const raw = Number(input.paymentDayOfMonth);
    if (!Number.isFinite(raw) || raw < 1 || raw > 31) {
      return "\uCD9C\uAE08\uC77C\uC744 1~31 \uC0AC\uC774\uC758 \uC21C\uC790\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
    }
  }
  return "";
}

export function validateFixedExpensePaymentInput(input: {
  date?: string;
  fixedExpenseId?: string;
  amount?: unknown;
}) {
  if (!String(input.date || "").trim()) return "\uB0A9\uBD80 \uC77C\uC790\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!String(input.fixedExpenseId || "").trim()) return "\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.";
  const amount = parseLedgerAmount(input.amount);
  if (amount <= 0) return "\uAE08\uC561\uC744 0\uBCF4\uB2E4 \uD06C\uAC8C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  return "";
}

function amountMatchesFixedPayment(
  withdrawal: number,
  payment: FixedExpensePayment,
  expense?: FixedExpense,
) {
  if (withdrawal <= 0) return false;
  if (withdrawal === Number(payment.amount)) return true;
  if (expense && withdrawal === Number(expense.amount)) return true;
  if (areRecurringAmountsCompatible(Number(payment.amount), withdrawal)) return true;
  if (expense && areRecurringAmountsCompatible(Number(expense.amount), withdrawal)) return true;
  return false;
}

export function isFixedExpensePaymentBankLinked(payment: FixedExpensePayment) {
  return Boolean(String(payment.bankTransactionId || "").trim());
}

export function bankTransactionMatchesFixedPayment(
  tx: { transactionAt?: string; withdrawal?: number },
  payment: FixedExpensePayment,
  fixedExpenses: FixedExpense[] = [],
) {
  const monthKey = getMonthKey(String(tx.transactionAt || "").slice(0, 10));
  if (!monthKey || getMonthKey(payment.date) !== monthKey) return false;
  const expense = fixedExpenses.find((row) => row.id === payment.fixedExpenseId);
  return amountMatchesFixedPayment(Number(tx.withdrawal || 0), payment, expense);
}

export function listLinkableFixedExpensePayments(
  tx: { transactionAt?: string; withdrawal?: number },
  fixedExpenseId: string,
  payments: FixedExpensePayment[],
  fixedExpenses: FixedExpense[] = [],
) {
  const monthKey = getMonthKey(String(tx.transactionAt || "").slice(0, 10));
  if (!monthKey || !fixedExpenseId) return [];

  const expense = fixedExpenses.find((row) => row.id === fixedExpenseId);
  const withdrawal = Number(tx.withdrawal || 0);

  return payments
    .filter(
      (row) =>
        row.fixedExpenseId === fixedExpenseId &&
        getMonthKey(row.date) === monthKey &&
        !isFixedExpensePaymentBankLinked(row) &&
        amountMatchesFixedPayment(withdrawal, row, expense),
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function findLinkableFixedExpensePayment(
  tx: { transactionAt?: string; withdrawal?: number },
  fixedExpenseId: string,
  payments: FixedExpensePayment[],
  fixedExpenses: FixedExpense[] = [],
) {
  return listLinkableFixedExpensePayments(tx, fixedExpenseId, payments, fixedExpenses)[0] || null;
}

export function resolveFixedPaymentFieldsFromBankTx(tx: { transactionAt?: string; withdrawal?: number }) {
  const withdrawal = Number(tx.withdrawal || 0);
  const date = String(tx.transactionAt || "").slice(0, 10);
  return {
    amount: withdrawal > 0 ? withdrawal : undefined,
    date: date || undefined,
  };
}

export function linkFixedExpensePaymentToBankTx(
  payments: FixedExpensePayment[],
  paymentId: string,
  bankTransactionId: string,
  syncFromBank?: { transactionAt?: string; withdrawal?: number },
) {
  const sync = syncFromBank ? resolveFixedPaymentFieldsFromBankTx(syncFromBank) : {};
  return payments.map((row) => {
    if (row.id !== paymentId) return row;
    return {
      ...row,
      bankTransactionId,
      ...(sync.amount != null ? { amount: sync.amount } : {}),
      ...(sync.date ? { date: sync.date } : {}),
    };
  });
}
