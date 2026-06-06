import { buildBankAccountSummaries, type BankTransaction } from "./bankTransactions";
import { getMonthKey } from "./companyLedger";
import {
  findAccountCodeByCode,
  resolveAccountCodeLabel,
  type AccountCode,
  type LedgerEntry,
} from "./ledgerSystem";

export const UNCLASSIFIED_INCOME_LABEL = "\uACC4\uC815 \uC5C6\uB294 \uC785\uAE08";
export const UNCLASSIFIED_EXPENSE_LABEL = "\uACC4\uC815 \uC5C6\uB294 \uCD9C\uAE08";

export type PeriodBankTotals = {
  openingBalance: number;
  totalDeposit: number;
  totalWithdrawal: number;
  closingBalance: number;
  netChange: number;
  unclassifiedCount: number;
};

function txDate(tx: BankTransaction) {
  return String(tx.transactionAt || "").slice(0, 10);
}

function inDateRange(dateStr: string, dateFrom: string, dateTo: string) {
  const date = String(dateStr || "").slice(0, 10);
  if (!date) return false;
  if (dateFrom && date < dateFrom) return false;
  if (dateTo && date > dateTo) return false;
  return true;
}

function isUncategorizedEntry(row: LedgerEntry) {
  const code = String(row.accountCode || "").trim();
  return !code || code === "900";
}

export function buildPeriodBankTotals(
  bankTransactions: BankTransaction[],
  dateFrom: string,
  dateTo: string,
): PeriodBankTotals {
  const accounts = new Set<string>();
  for (const tx of bankTransactions) {
    const account = String(tx.accountNumber || "").trim();
    if (account) accounts.add(account);
  }

  let openingBalance = 0;
  let closingBalance = 0;
  let totalDeposit = 0;
  let totalWithdrawal = 0;
  let unclassifiedCount = 0;

  for (const accountNumber of accounts) {
    const rows = bankTransactions
      .filter((tx) => String(tx.accountNumber || "").trim() === accountNumber)
      .sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)));

    const beforePeriod = rows.filter((tx) => txDate(tx) < dateFrom);
    const inPeriod = rows.filter((tx) => inDateRange(txDate(tx), dateFrom, dateTo));
    const upToEnd = rows.filter((tx) => !dateTo || txDate(tx) <= dateTo);

    const openingRow = beforePeriod[beforePeriod.length - 1];
    const closingRow = upToEnd[upToEnd.length - 1];
    if (openingRow) openingBalance += Number(openingRow.balanceAfter) || 0;
    else if (inPeriod[0]) {
      const first = inPeriod[0];
      openingBalance += (Number(first.balanceAfter) || 0) - (Number(first.deposit) || 0) + (Number(first.withdrawal) || 0);
    }
    if (closingRow) closingBalance += Number(closingRow.balanceAfter) || 0;

    for (const tx of inPeriod) {
      totalDeposit += Number(tx.deposit) || 0;
      totalWithdrawal += Number(tx.withdrawal) || 0;
      const status = tx.ledgerStatus || "none";
      if (status === "none" || status === "pending") unclassifiedCount += 1;
    }
  }

  return {
    openingBalance,
    totalDeposit,
    totalWithdrawal,
    closingBalance,
    netChange: totalDeposit - totalWithdrawal,
    unclassifiedCount,
  };
}

export type AccountFlowBreakdownRow = {
  label: string;
  accountCode?: string;
  count: number;
  amount: number;
  isUncategorized: boolean;
};

export function buildAccountFlowBreakdown(
  entries: LedgerEntry[],
  accountCodes: AccountCode[],
  flow: "income" | "expense",
  dateFrom?: string,
  dateTo?: string,
): AccountFlowBreakdownRow[] {
  const bucket = new Map<string, AccountFlowBreakdownRow>();
  const uncategorizedLabel = flow === "income" ? UNCLASSIFIED_INCOME_LABEL : UNCLASSIFIED_EXPENSE_LABEL;

  for (const row of entries.filter((item) => item.status === "confirmed" && item.flow === flow)) {
    if (dateFrom || dateTo) {
      if (!inDateRange(row.date, dateFrom || "", dateTo || "")) continue;
    }

    const uncategorized = isUncategorizedEntry(row);
    const label = uncategorized
      ? uncategorizedLabel
      : resolveAccountCodeLabel(accountCodes, row.accountCode) || row.accountName || row.accountCode;
    const key = uncategorized ? "__uncategorized__" : row.accountCode || label;
    const current = bucket.get(key) || {
      label,
      accountCode: uncategorized ? undefined : row.accountCode,
      count: 0,
      amount: 0,
      isUncategorized: uncategorized,
    };
    current.count += 1;
    current.amount += row.amount;
    bucket.set(key, current);
  }

  return [...bucket.values()].sort((a, b) => b.amount - a.amount);
}

export type MonthlyAccountTreeNode = {
  key: string;
  label: string;
  parentGroup: string;
  level: "group" | "account";
  accountCode?: string;
  monthlyAmounts: Record<string, number>;
  total: number;
};

function resolveParentGroup(accountCodes: AccountCode[], code: string) {
  const row = findAccountCodeByCode(accountCodes, code);
  return row?.parentGroup || "\uAE30\uD0C0";
}

export function buildMonthlyAccountTree(
  entries: LedgerEntry[],
  accountCodes: AccountCode[],
  monthKeys: string[],
  flow?: "income" | "expense",
): MonthlyAccountTreeNode[] {
  const monthSet = new Set(monthKeys);
  const accountBuckets = new Map<
    string,
    { parentGroup: string; label: string; accountCode: string; monthlyAmounts: Record<string, number>; total: number }
  >();

  for (const row of entries.filter((item) => item.status === "confirmed")) {
    if (flow && row.flow !== flow) continue;
    const monthKey = getMonthKey(row.date);
    if (!monthKey || !monthSet.has(monthKey)) continue;
    if (isUncategorizedEntry(row)) continue;

    const accountCode = row.accountCode || "900";
    const label = resolveAccountCodeLabel(accountCodes, accountCode) || row.accountName || accountCode;
    const parentGroup = resolveParentGroup(accountCodes, accountCode);
    const key = accountCode;
    const current = accountBuckets.get(key) || {
      parentGroup,
      label,
      accountCode,
      monthlyAmounts: Object.fromEntries(monthKeys.map((mk) => [mk, 0])),
      total: 0,
    };
    current.monthlyAmounts[monthKey] = (current.monthlyAmounts[monthKey] || 0) + row.amount;
    current.total += row.amount;
    accountBuckets.set(key, current);
  }

  const groupBuckets = new Map<string, MonthlyAccountTreeNode>();
  const accountNodes: MonthlyAccountTreeNode[] = [];

  for (const item of accountBuckets.values()) {
    accountNodes.push({
      key: `account-${item.accountCode}`,
      label: item.label,
      parentGroup: item.parentGroup,
      level: "account",
      accountCode: item.accountCode,
      monthlyAmounts: { ...item.monthlyAmounts },
      total: item.total,
    });

    const groupKey = `group-${item.parentGroup}`;
    const group = groupBuckets.get(groupKey) || {
      key: groupKey,
      label: item.parentGroup,
      parentGroup: item.parentGroup,
      level: "group" as const,
      monthlyAmounts: Object.fromEntries(monthKeys.map((mk) => [mk, 0])),
      total: 0,
    };
    for (const mk of monthKeys) {
      group.monthlyAmounts[mk] = (group.monthlyAmounts[mk] || 0) + (item.monthlyAmounts[mk] || 0);
    }
    group.total += item.total;
    groupBuckets.set(groupKey, group);
  }

  const groups = [...groupBuckets.values()].sort((a, b) => b.total - a.total);
  const result: MonthlyAccountTreeNode[] = [];
  for (const group of groups) {
    result.push(group);
    const children = accountNodes
      .filter((row) => row.parentGroup === group.parentGroup)
      .sort((a, b) => b.total - a.total);
    result.push(...children);
  }
  return result;
}

export type CashFlowGroupRow = {
  parentGroup: string;
  monthlyIncome: Record<string, number>;
  monthlyExpense: Record<string, number>;
  monthlyNet: Record<string, number>;
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
};

export function buildCashFlowSummary(
  entries: LedgerEntry[],
  accountCodes: AccountCode[],
  monthKeys: string[],
): CashFlowGroupRow[] {
  const monthSet = new Set(monthKeys);
  const bucket = new Map<string, CashFlowGroupRow>();

  for (const row of entries.filter((item) => item.status === "confirmed")) {
    const monthKey = getMonthKey(row.date);
    if (!monthKey || !monthSet.has(monthKey)) continue;

    const parentGroup = isUncategorizedEntry(row)
      ? "\uBBF8\uBD84\uB958"
      : resolveParentGroup(accountCodes, row.accountCode);

    const current = bucket.get(parentGroup) || {
      parentGroup,
      monthlyIncome: Object.fromEntries(monthKeys.map((mk) => [mk, 0])),
      monthlyExpense: Object.fromEntries(monthKeys.map((mk) => [mk, 0])),
      monthlyNet: Object.fromEntries(monthKeys.map((mk) => [mk, 0])),
      totalIncome: 0,
      totalExpense: 0,
      totalNet: 0,
    };

    if (row.flow === "income") {
      current.monthlyIncome[monthKey] = (current.monthlyIncome[monthKey] || 0) + row.amount;
      current.totalIncome += row.amount;
    } else {
      current.monthlyExpense[monthKey] = (current.monthlyExpense[monthKey] || 0) + row.amount;
      current.totalExpense += row.amount;
    }
    current.monthlyNet[monthKey] = (current.monthlyIncome[monthKey] || 0) - (current.monthlyExpense[monthKey] || 0);
    current.totalNet = current.totalIncome - current.totalExpense;
    bucket.set(parentGroup, current);
  }

  return [...bucket.values()].sort((a, b) => Math.abs(b.totalNet) - Math.abs(a.totalNet));
}

export type BankAccountPeriodSummary = {
  accountNumber: string;
  bankName: string;
  latestBalance: number;
  periodDeposit: number;
  periodWithdrawal: number;
  periodCount: number;
  count: number;
};

export function buildBankAccountPeriodSummaries(
  bankTransactions: BankTransaction[],
  dateFrom: string,
  dateTo: string,
): BankAccountPeriodSummary[] {
  const base = buildBankAccountSummaries(bankTransactions);
  const periodMap = new Map<string, { deposit: number; withdrawal: number; count: number }>();

  for (const tx of bankTransactions) {
    if (!inDateRange(txDate(tx), dateFrom, dateTo)) continue;
    const accountNumber = String(tx.accountNumber || "").trim();
    if (!accountNumber) continue;
    const current = periodMap.get(accountNumber) || { deposit: 0, withdrawal: 0, count: 0 };
    current.deposit += Number(tx.deposit) || 0;
    current.withdrawal += Number(tx.withdrawal) || 0;
    current.count += 1;
    periodMap.set(accountNumber, current);
  }

  return base.map((row) => {
    const period = periodMap.get(row.accountNumber) || { deposit: 0, withdrawal: 0, count: 0 };
    return {
      ...row,
      periodDeposit: period.deposit,
      periodWithdrawal: period.withdrawal,
      periodCount: period.count,
    };
  });
}

export function collectMonthKeysFromEntries(entries: LedgerEntry[], limit = 12): string[] {
  const keys = new Set<string>();
  for (const row of entries.filter((item) => item.status === "confirmed")) {
    const mk = getMonthKey(row.date);
    if (mk) keys.add(mk);
  }
  return [...keys].sort((a, b) => b.localeCompare(a)).slice(0, limit).reverse();
}

export type CustomAnalysisGroupMode = "category" | "account" | "parentGroup";

export type CustomAnalysisRow = {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  count: number;
};

export function buildCustomAnalysisBreakdown(
  entries: LedgerEntry[],
  accountCodes: AccountCode[],
  dateFrom: string,
  dateTo: string,
  groupBy: CustomAnalysisGroupMode,
): CustomAnalysisRow[] {
  const bucket = new Map<string, CustomAnalysisRow>();

  for (const row of entries.filter((item) => item.status === "confirmed")) {
    if (!inDateRange(row.date, dateFrom, dateTo)) continue;

    let key: string;
    let label: string;
    if (groupBy === "category") {
      key = row.categoryId || row.categoryName;
      label = row.categoryName || "\uBBF8\uBD84\uB958";
    } else if (groupBy === "account") {
      if (isUncategorizedEntry(row)) {
        key = "__uncategorized__";
        label = "\uBBF8\uBD84\uB958";
      } else {
        key = row.accountCode;
        label = resolveAccountCodeLabel(accountCodes, row.accountCode) || row.accountName || row.accountCode;
      }
    } else {
      label = isUncategorizedEntry(row)
        ? "\uBBF8\uBD84\uB958"
        : resolveParentGroup(accountCodes, row.accountCode);
      key = label;
    }

    const current = bucket.get(key) || { key, label, income: 0, expense: 0, net: 0, count: 0 };
    if (row.flow === "income") current.income += row.amount;
    else current.expense += row.amount;
    current.net = current.income - current.expense;
    current.count += 1;
    bucket.set(key, current);
  }

  return [...bucket.values()].sort((a, b) => b.expense + b.income - (a.expense + a.income));
}
