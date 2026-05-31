import {
  formatKRW,
  formatMonthLabel,
  getMonthKey,
  isFixedExpensePaymentSettled,
  resolveCompanyExpenseKind,
  resolveCompanyExpenseFlow,
  resolveFixedPaymentCategory,
  type CompanyExpense,
  type FixedExpense,
  type FixedExpensePayment,
} from "./companyLedger";
import type { BankTransaction } from "./bankTransactions";

export type LedgerCalendarEntryKind = "variable" | "fixed";

export type LedgerCalendarEntrySource = "expense" | "fixedPayment";

export type LedgerCalendarEntry = {
  id: string;
  kind: LedgerCalendarEntryKind;
  source: LedgerCalendarEntrySource;
  flow: "expense" | "income";
  label: string;
  category: string;
  amount: number;
  bankLinked: boolean;
};

export type LedgerCalendarDayStats = {
  variableTotal: number;
  fixedTotal: number;
  incomeTotal: number;
  grandTotal: number;
  variableCount: number;
  fixedCount: number;
  incomeCount: number;
  count: number;
  unpaidFixedTotal: number;
  unpaidFixedCount: number;
  paidFixedTotal: number;
  paidFixedCount: number;
  entries: LedgerCalendarEntry[];
};

export type LedgerCalendarCell = {
  date: string;
  day: number;
  stats: LedgerCalendarDayStats;
};

const LEDGER_CATEGORY_PALETTE = [
  { bg: "#ecfdf5", text: "#065f46", border: "#10b981" },
  { bg: "#ede9fe", text: "#5b21b6", border: "#8b5cf6" },
  { bg: "#fff1f2", text: "#9f1239", border: "#fb7185" },
  { bg: "#fff7ed", text: "#c2410c", border: "#fb923c" },
  { bg: "#eff6ff", text: "#1d4ed8", border: "#60a5fa" },
  { bg: "#fdf2f8", text: "#9d174d", border: "#f472b6" },
  { bg: "#ecfccb", text: "#3f6212", border: "#84cc16" },
  { bg: "#fef9c3", text: "#854d0e", border: "#eab308" },
  { bg: "#f0fdfa", text: "#115e59", border: "#2dd4bf" },
  { bg: "#f5f3ff", text: "#6d28d9", border: "#a78bfa" },
  { bg: "#fef2f2", text: "#991b1b", border: "#f87171" },
  { bg: "#f0f9ff", text: "#0369a1", border: "#38bdf8" },
] as const;

export type LedgerCategoryColor = (typeof LEDGER_CATEGORY_PALETTE)[number];

function hashLedgerCategoryName(category: string) {
  const name = String(category || "").trim() || "-";
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getLedgerCategoryColor(category: string): LedgerCategoryColor {
  return LEDGER_CATEGORY_PALETTE[hashLedgerCategoryName(category) % LEDGER_CATEGORY_PALETTE.length];
}

export function getLedgerCategoryColorStyle(category: string): Record<string, string> {
  const colors = getLedgerCategoryColor(category);
  return {
    "--ledger-category-bg": colors.bg,
    "--ledger-category-text": colors.text,
    "--ledger-category-border": colors.border,
  };
}

export const LEDGER_CALENDAR_WEEKDAYS = [
  { label: "\uC77C", tone: "sun" },
  { label: "\uC6D4", tone: "default" },
  { label: "\uD654", tone: "default" },
  { label: "\uC218", tone: "default" },
  { label: "\uBAA9", tone: "default" },
  { label: "\uAE08", tone: "default" },
  { label: "\uD1A0", tone: "sat" },
] as const;

const EMPTY_DAY_STATS = (): LedgerCalendarDayStats => ({
  variableTotal: 0,
  fixedTotal: 0,
  incomeTotal: 0,
  grandTotal: 0,
  variableCount: 0,
  fixedCount: 0,
  incomeCount: 0,
  count: 0,
  unpaidFixedTotal: 0,
  unpaidFixedCount: 0,
  paidFixedTotal: 0,
  paidFixedCount: 0,
  entries: [],
});

function resolveFixedExpenseName(fixedExpenseId: string, fixedExpenses: FixedExpense[]) {
  return fixedExpenses.find((row) => row.id === fixedExpenseId)?.name || fixedExpenseId;
}

function resolveFixedExpenseCategory(fixedExpenseId: string, fixedExpenses: FixedExpense[]) {
  return fixedExpenses.find((row) => row.id === fixedExpenseId)?.category || "\uAE30\uD0C0";
}

function addEntry(stats: LedgerCalendarDayStats, entry: LedgerCalendarEntry) {
  stats.entries.push(entry);
  stats.count += 1;
  if (entry.flow === "income") {
    stats.incomeCount += 1;
    stats.incomeTotal += entry.amount;
    return;
  }
  stats.grandTotal += entry.amount;
  if (entry.kind === "variable") {
    stats.variableCount += 1;
    stats.variableTotal += entry.amount;
    return;
  }
  stats.fixedCount += 1;
  stats.fixedTotal += entry.amount;
  if (!entry.bankLinked) {
    stats.unpaidFixedTotal += entry.amount;
    stats.unpaidFixedCount += 1;
  } else {
    stats.paidFixedTotal += entry.amount;
    stats.paidFixedCount += 1;
  }
}

export function buildLedgerCalendarDays(
  monthKey: string,
  companyExpenses: CompanyExpense[] = [],
  fixedExpensePayments: FixedExpensePayment[] = [],
  fixedExpenses: FixedExpense[] = [],
  bankTransactions: BankTransaction[] = [],
) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startOffset = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const statsByDate: Record<string, LedgerCalendarDayStats> = {};

  for (const expense of companyExpenses) {
    if (getMonthKey(expense.date) !== monthKey) continue;
    const kind = resolveCompanyExpenseKind(expense);
    const stats = statsByDate[expense.date] || (statsByDate[expense.date] = EMPTY_DAY_STATS());
    addEntry(stats, {
      id: expense.id,
      kind: kind === "fixed" ? "fixed" : "variable",
      source: "expense",
      flow: resolveCompanyExpenseFlow(expense),
      label: String(expense.description || expense.category || "-").trim() || "-",
      category: String(expense.category || "-").trim() || "-",
      amount: Number(expense.amount) || 0,
      bankLinked: Boolean(expense.bankTransactionId?.trim()),
    });
  }

  for (const payment of fixedExpensePayments) {
    if (getMonthKey(payment.date) !== monthKey) continue;
    const stats = statsByDate[payment.date] || (statsByDate[payment.date] = EMPTY_DAY_STATS());
    const settled = isFixedExpensePaymentSettled(
      payment,
      fixedExpensePayments,
      bankTransactions,
      fixedExpenses,
    );
    addEntry(stats, {
      id: payment.id,
      kind: "fixed",
      source: "fixedPayment",
      flow: "expense",
      label: resolveFixedExpenseName(payment.fixedExpenseId, fixedExpenses),
      category: resolveFixedPaymentCategory(payment, fixedExpenses),
      amount: Number(payment.amount) || 0,
      bankLinked: settled,
    });
  }

  Object.values(statsByDate).forEach((day) => {
    day.entries.sort((left, right) => {
      const kindOrder = left.kind === right.kind ? 0 : left.kind === "variable" ? -1 : 1;
      if (kindOrder !== 0) return kindOrder;
      return right.amount - left.amount;
    });
  });

  const cells: Array<LedgerCalendarCell | null> = [];
  for (let index = 0; index < startOffset; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    cells.push({ date, day, stats: statsByDate[date] || EMPTY_DAY_STATS() });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return { cells, monthLabel: formatMonthLabel(monthKey) };
}

export function summarizeLedgerCalendarMonth(cells: Array<LedgerCalendarCell | null>) {
  return cells.filter(Boolean).reduce(
    (acc, cell) => {
      if (!cell) return acc;
      acc.variableTotal += cell.stats.variableTotal;
      acc.fixedTotal += cell.stats.fixedTotal;
      acc.incomeTotal += cell.stats.incomeTotal;
      acc.grandTotal += cell.stats.grandTotal;
      acc.variableCount += cell.stats.variableCount;
      acc.fixedCount += cell.stats.fixedCount;
      acc.incomeCount += cell.stats.incomeCount;
      acc.count += cell.stats.count;
      acc.unpaidFixedTotal += cell.stats.unpaidFixedTotal;
      acc.unpaidFixedCount += cell.stats.unpaidFixedCount;
      acc.paidFixedTotal += cell.stats.paidFixedTotal;
      acc.paidFixedCount += cell.stats.paidFixedCount;
      if (cell.stats.grandTotal > acc.busiestAmount) {
        acc.busiestAmount = cell.stats.grandTotal;
        acc.busiestDay = cell.day;
        acc.busiestDate = cell.date;
      }
      return acc;
    },
    {
      variableTotal: 0,
      fixedTotal: 0,
      incomeTotal: 0,
      grandTotal: 0,
      variableCount: 0,
      fixedCount: 0,
      incomeCount: 0,
      count: 0,
      unpaidFixedTotal: 0,
      unpaidFixedCount: 0,
      paidFixedTotal: 0,
      paidFixedCount: 0,
      busiestAmount: 0,
      busiestDay: 0,
      busiestDate: "",
    },
  );
}

export function formatLedgerCalendarDayLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const weekday = ["\uC77C", "\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08", "\uD1A0"][parsed.getDay()];
  const [, monthText, dayText] = date.split("-");
  return `${Number(monthText)}\uC6D4 ${Number(dayText)}\uC77C (${weekday})`;
}

export { formatKRW };
