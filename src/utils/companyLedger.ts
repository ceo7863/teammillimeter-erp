import { formatKRW, todayISO } from "./receivables";
import { formatMonthLabel, shiftMonthKey } from "./workerMonthlyPayments";

export { formatKRW, formatMonthLabel, shiftMonthKey, todayISO };

export type FixedExpenseCycle = "monthly" | "quarterly" | "yearly";

export type CompanyExpense = {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  memo?: string;
  createdBy?: string;
  createdAt?: string;
};

export type FixedExpense = {
  id: string;
  name: string;
  category: string;
  amount: number;
  cycle: FixedExpenseCycle;
  startDate?: string;
  memo?: string;
  isActive: boolean;
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
  fixedItems: Array<FixedExpense & { monthlyAmount: number }>;
  manualTotal: number;
  fixedTotal: number;
  grandTotal: number;
};

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

export function collectLedgerMonthKeys(
  companyExpenses: CompanyExpense[] = [],
  fixedExpenses: FixedExpense[] = [],
) {
  const keys = new Set<string>();
  for (const row of companyExpenses) {
    const key = getMonthKey(row.date);
    if (key) keys.add(key);
  }
  for (const row of fixedExpenses) {
    const key = getMonthKey(row.startDate || "") || todayISO().slice(0, 7);
    keys.add(key);
  }
  if (!keys.size) keys.add(todayISO().slice(0, 7));
  return Array.from(keys).sort((a, b) => b.localeCompare(a));
}

export function buildMonthlyLedgerRows(
  companyExpenses: CompanyExpense[] = [],
  fixedExpenses: FixedExpense[] = [],
): MonthlyLedgerRow[] {
  const monthKeys = collectLedgerMonthKeys(companyExpenses, fixedExpenses);
  return monthKeys.map((monthKey) => {
    const manualRows = companyExpenses.filter((row) => getMonthKey(row.date) === monthKey);
    const fixedRows = fixedExpenses.filter((row) => isFixedActiveInMonth(row, monthKey));
    const manualTotal = sumCompanyExpenses(manualRows);
    const fixedTotal = fixedRows.reduce((sum, row) => sum + fixedMonthlyAmount(row), 0);
    return {
      monthKey,
      label: formatMonthLabel(monthKey),
      manualTotal,
      fixedTotal,
      grandTotal: manualTotal + fixedTotal,
      manualCount: manualRows.length,
      fixedCount: fixedRows.length,
    };
  });
}

export function buildMonthlyLedgerDetail(
  companyExpenses: CompanyExpense[] = [],
  fixedExpenses: FixedExpense[] = [],
  monthKey: string,
): MonthlyLedgerDetail {
  const manualExpenses = companyExpenses
    .filter((row) => getMonthKey(row.date) === monthKey)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const fixedItems = fixedExpenses
    .filter((row) => isFixedActiveInMonth(row, monthKey))
    .map((row) => ({ ...row, monthlyAmount: fixedMonthlyAmount(row) }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"));
  const manualTotal = sumCompanyExpenses(manualExpenses);
  const fixedTotal = fixedItems.reduce((sum, row) => sum + row.monthlyAmount, 0);
  return {
    monthKey,
    label: formatMonthLabel(monthKey),
    manualExpenses,
    fixedItems,
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
}) {
  if (!String(input.name || "").trim()) return "\uD56D\uBAA9 \uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!String(input.category || "").trim()) return "\uCE74\uD14C\uACE0\uB9AC\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.";
  const amount = parseLedgerAmount(input.amount);
  if (amount <= 0) return "\uAE08\uC561\uC744 0\uBCF4\uB2E4 \uD06C\uAC8C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!input.cycle) return "\uC8FC\uAE30\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.";
  return "";
}
