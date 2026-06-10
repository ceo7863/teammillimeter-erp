import { isTertiaryAccountCode } from "./accountCodeTree";
import { buildBankAccountSummaries, type BankTransaction } from "./bankTransactions";
import {
  getMonthKey,
  monthRangeForKey,
  shiftMonthKey,
  todayISO,
  type FixedExpense,
  type FixedExpensePayment,
} from "./companyLedger";
import {
  findAccountCodeByCode,
  resolveAccountCodeLabel,
  resolveFixedExpenseAccountCode,
  type AccountCode,
  type LedgerCategory,
  type LedgerEntry,
} from "./ledgerSystem";
import {
  getTaxInvoiceDocumentTypeLabel,
  getTaxInvoiceFlowLabel,
  type TaxInvoice,
} from "./taxInvoices";

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

export function computePeriodChangePct(opening: number, closing: number): number | null {
  if (opening === 0) return closing === 0 ? 0 : null;
  return ((closing - opening) / Math.abs(opening)) * 100;
}

export type CounterpartyFlowBreakdownRow = {
  label: string;
  count: number;
  amount: number;
  isUncategorized: boolean;
};

export function buildCounterpartyFlowBreakdown(
  bankTransactions: BankTransaction[],
  flow: "income" | "expense",
  dateFrom?: string,
  dateTo?: string,
): CounterpartyFlowBreakdownRow[] {
  const uncategorizedLabel = flow === "income" ? UNCLASSIFIED_INCOME_LABEL : UNCLASSIFIED_EXPENSE_LABEL;
  const bucket = new Map<string, CounterpartyFlowBreakdownRow>();

  for (const tx of bankTransactions) {
    if (dateFrom || dateTo) {
      if (!inDateRange(txDate(tx), dateFrom || "", dateTo || "")) continue;
    }

    const amount = flow === "income" ? Number(tx.deposit) || 0 : Number(tx.withdrawal) || 0;
    if (amount <= 0) continue;

    const status = tx.ledgerStatus || "none";
    const isUncategorized = status === "none" || status === "pending";
    const counterparty = String(tx.counterpartyName || tx.description || "").trim();
    const label = isUncategorized && !counterparty ? uncategorizedLabel : counterparty || uncategorizedLabel;
    const key = isUncategorized && !counterparty ? "__uncategorized__" : label;

    const current = bucket.get(key) || { label, count: 0, amount: 0, isUncategorized };
    current.count += 1;
    current.amount += amount;
    if (isUncategorized) current.isUncategorized = true;
    bucket.set(key, current);
  }

  return [...bucket.values()].sort((a, b) => b.amount - a.amount);
}

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
  parentSecondaryKey?: string;
  level: "group" | "secondary" | "tertiary";
  accountCode?: string;
  monthlyAmounts: Record<string, number>;
  total: number;
};

export type AccrualProfitLossTreeNode = {
  key: string;
  label: string;
  flowType: "sales" | "purchase";
  level: "group" | "documentType";
  documentType?: TaxInvoice["documentType"];
  monthlyAmounts: Record<string, number>;
  total: number;
};

function resolveParentGroup(accountCodes: AccountCode[], code: string) {
  const row = findAccountCodeByCode(accountCodes, code);
  return row?.parentGroup || "\uAE30\uD0C0";
}

function emptyMonthlyAmounts(monthKeys: string[]) {
  return Object.fromEntries(monthKeys.map((mk) => [mk, 0]));
}

function addMonthlyAmounts(
  target: Record<string, number>,
  source: Record<string, number>,
  monthKeys: string[],
) {
  for (const mk of monthKeys) {
    target[mk] = (target[mk] || 0) + (source[mk] || 0);
  }
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

    const accountCode = row.accountCode || "900";
    const accountRow = findAccountCodeByCode(accountCodes, accountCode);
    const label = resolveAccountCodeLabel(accountCodes, accountCode) || row.accountName || accountCode;
    const parentGroup = isUncategorizedEntry(row)
      ? "\uBBF8\uBD84\uB958"
      : resolveParentGroup(accountCodes, accountCode);
    const current = accountBuckets.get(accountCode) || {
      parentGroup,
      label: accountRow?.name || label,
      accountCode,
      monthlyAmounts: emptyMonthlyAmounts(monthKeys),
      total: 0,
    };
    current.monthlyAmounts[monthKey] = (current.monthlyAmounts[monthKey] || 0) + row.amount;
    current.total += row.amount;
    accountBuckets.set(accountCode, current);
  }

  const tertiaryNodes: MonthlyAccountTreeNode[] = [];
  const secondaryBuckets = new Map<
    string,
    {
      parentGroup: string;
      label: string;
      accountCode: string;
      monthlyAmounts: Record<string, number>;
      total: number;
    }
  >();

  for (const item of accountBuckets.values()) {
    const accountRow = findAccountCodeByCode(accountCodes, item.accountCode);
    if (accountRow && isTertiaryAccountCode(accountRow)) {
      const parentCode = String(accountRow.parentAccountCode || "").trim();
      const parentRow = parentCode ? findAccountCodeByCode(accountCodes, parentCode) : undefined;
      const parentGroup = parentRow?.parentGroup || item.parentGroup;
      tertiaryNodes.push({
        key: `tertiary-${item.accountCode}`,
        label: item.label,
        parentGroup,
        parentSecondaryKey: parentCode ? `secondary-${parentCode}` : undefined,
        level: "tertiary",
        accountCode: item.accountCode,
        monthlyAmounts: { ...item.monthlyAmounts },
        total: item.total,
      });

      const secondaryKey = parentCode || item.accountCode;
      const secondary = secondaryBuckets.get(secondaryKey) || {
        parentGroup,
        label: parentRow?.name || resolveAccountCodeLabel(accountCodes, secondaryKey) || secondaryKey,
        accountCode: secondaryKey,
        monthlyAmounts: emptyMonthlyAmounts(monthKeys),
        total: 0,
      };
      addMonthlyAmounts(secondary.monthlyAmounts, item.monthlyAmounts, monthKeys);
      secondary.total += item.total;
      secondaryBuckets.set(secondaryKey, secondary);
      continue;
    }

    const secondary = secondaryBuckets.get(item.accountCode) || {
      parentGroup: item.parentGroup,
      label: item.label,
      accountCode: item.accountCode,
      monthlyAmounts: emptyMonthlyAmounts(monthKeys),
      total: 0,
    };
    addMonthlyAmounts(secondary.monthlyAmounts, item.monthlyAmounts, monthKeys);
    secondary.total += item.total;
    secondaryBuckets.set(item.accountCode, secondary);
  }

  const secondaryNodes: MonthlyAccountTreeNode[] = [...secondaryBuckets.values()].map((item) => ({
    key: `secondary-${item.accountCode}`,
    label: item.label,
    parentGroup: item.parentGroup,
    level: "secondary" as const,
    accountCode: item.accountCode,
    monthlyAmounts: { ...item.monthlyAmounts },
    total: item.total,
  }));

  const groupBuckets = new Map<string, MonthlyAccountTreeNode>();
  for (const secondary of secondaryNodes) {
    const groupKey = `group-${secondary.parentGroup}`;
    const group = groupBuckets.get(groupKey) || {
      key: groupKey,
      label: secondary.parentGroup,
      parentGroup: secondary.parentGroup,
      level: "group" as const,
      monthlyAmounts: emptyMonthlyAmounts(monthKeys),
      total: 0,
    };
    addMonthlyAmounts(group.monthlyAmounts, secondary.monthlyAmounts, monthKeys);
    group.total += secondary.total;
    groupBuckets.set(groupKey, group);
  }

  const groups = [...groupBuckets.values()].sort((a, b) => b.total - a.total);
  const result: MonthlyAccountTreeNode[] = [];
  for (const group of groups) {
    result.push(group);
    const secondaries = secondaryNodes
      .filter((row) => row.parentGroup === group.parentGroup)
      .sort((a, b) => b.total - a.total);
    for (const secondary of secondaries) {
      result.push(secondary);
      const tertiaries = tertiaryNodes
        .filter((row) => row.parentSecondaryKey === secondary.key)
        .sort((a, b) => b.total - a.total);
      result.push(...tertiaries);
    }
  }
  return result;
}

export function buildAccrualProfitLossTree(
  taxInvoices: TaxInvoice[],
  monthKeys: string[],
): { sales: AccrualProfitLossTreeNode[]; purchase: AccrualProfitLossTreeNode[] } {
  const monthSet = new Set(monthKeys);
  const bucket = new Map<
    string,
    {
      flowType: "sales" | "purchase";
      documentType: TaxInvoice["documentType"];
      monthlyAmounts: Record<string, number>;
      total: number;
    }
  >();

  for (const row of taxInvoices.filter((item) => item.status === "issued")) {
    const monthKey = getMonthKey(row.issueDate);
    if (!monthKey || !monthSet.has(monthKey)) continue;
    const key = `${row.flowType}:${row.documentType}`;
    const current = bucket.get(key) || {
      flowType: row.flowType,
      documentType: row.documentType,
      monthlyAmounts: emptyMonthlyAmounts(monthKeys),
      total: 0,
    };
    current.monthlyAmounts[monthKey] = (current.monthlyAmounts[monthKey] || 0) + row.totalAmount;
    current.total += row.totalAmount;
    bucket.set(key, current);
  }

  const buildFlowTree = (flowType: "sales" | "purchase"): AccrualProfitLossTreeNode[] => {
    const flowLabel = getTaxInvoiceFlowLabel(flowType);
    const groupKey = `group-${flowType}`;
    const group: AccrualProfitLossTreeNode = {
      key: groupKey,
      label: flowLabel,
      flowType,
      level: "group",
      monthlyAmounts: emptyMonthlyAmounts(monthKeys),
      total: 0,
    };

    const children = [...bucket.values()]
      .filter((item) => item.flowType === flowType)
      .sort((a, b) => b.total - a.total)
      .map((item) => {
        addMonthlyAmounts(group.monthlyAmounts, item.monthlyAmounts, monthKeys);
        group.total += item.total;
        return {
          key: `doc-${flowType}-${item.documentType}`,
          label: getTaxInvoiceDocumentTypeLabel(item.documentType),
          flowType,
          level: "documentType" as const,
          documentType: item.documentType,
          monthlyAmounts: { ...item.monthlyAmounts },
          total: item.total,
        };
      });

    return group.total > 0 || children.length > 0 ? [group, ...children] : [];
  };

  return {
    sales: buildFlowTree("sales"),
    purchase: buildFlowTree("purchase"),
  };
}

export type CashFlowAnalysisMonthSummary = {
  monthKey: string;
  openingBalance: number;
  operatingNet: number;
  unclassifiedNet: number;
  closingBalance: number;
};

export function buildCashFlowAnalysisSummary(
  bankTransactions: BankTransaction[],
  entries: LedgerEntry[],
  monthKeys: string[],
): CashFlowAnalysisMonthSummary[] {
  return monthKeys.map((monthKey) => {
    const { startDate, endDate } = monthRangeForKey(monthKey);
    const periodTotals = buildPeriodBankTotals(bankTransactions, startDate, endDate);

    let operatingIncome = 0;
    let operatingExpense = 0;
    let unclassifiedNet = 0;

    for (const row of entries.filter((item) => item.status === "confirmed")) {
      const entryMonth = getMonthKey(row.date);
      if (entryMonth !== monthKey) continue;
      if (row.flow === "income") operatingIncome += row.amount;
      else operatingExpense += row.amount;
    }

    for (const tx of bankTransactions) {
      if (!inDateRange(txDate(tx), startDate, endDate)) continue;
      const status = tx.ledgerStatus || "none";
      if (status !== "none" && status !== "pending") continue;
      unclassifiedNet += (Number(tx.deposit) || 0) - (Number(tx.withdrawal) || 0);
    }

    return {
      monthKey,
      openingBalance: periodTotals.openingBalance,
      operatingNet: operatingIncome - operatingExpense,
      unclassifiedNet,
      closingBalance: periodTotals.closingBalance,
    };
  });
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

export function collectAnalysisMonthKeys(
  entries: LedgerEntry[],
  bankTransactions: BankTransaction[],
  taxInvoices: TaxInvoice[] = [],
  limit = 12,
): string[] {
  const keys = new Set<string>();
  for (const row of entries.filter((item) => item.status === "confirmed")) {
    const mk = getMonthKey(row.date);
    if (mk) keys.add(mk);
  }
  for (const tx of bankTransactions) {
    const mk = getMonthKey(txDate(tx));
    if (mk) keys.add(mk);
  }
  for (const row of taxInvoices.filter((item) => item.status === "issued")) {
    const mk = getMonthKey(row.issueDate);
    if (mk) keys.add(mk);
  }
  if (keys.size === 0) {
    const current = getMonthKey(todayISO()) || todayISO().slice(0, 7);
    for (let offset = limit - 1; offset >= 0; offset -= 1) {
      keys.add(shiftMonthKey(current, -offset));
    }
  }
  return [...keys].sort((a, b) => b.localeCompare(a)).slice(0, limit).reverse();
}

export type CustomAnalysisGroupMode =
  | "account"
  | "classificationAccount"
  | "fixedItem"
  | "parentGroup"
  | "counterparty"
  | "category";

export type PeriodAccountSummaryRow = {
  accountCode: string;
  accountName: string;
  parentGroup: string;
  income: number;
  expense: number;
  net: number;
  count: number;
  isUncategorized: boolean;
};

export type LedgerSourceBreakdownRow = {
  key: string;
  label: string;
  income: number;
  expense: number;
  count: number;
};

export type FixedExpenseAnalysisRow = {
  key: string;
  itemId: string;
  itemName: string;
  classificationAccount: string;
  accountCode: string;
  accountLabel: string;
  amount: number;
  paymentCount: number;
  bankLinkedCount: number;
};

function filterConfirmedEntriesInRange(entries: LedgerEntry[], dateFrom: string, dateTo: string) {
  return entries.filter(
    (row) => row.status === "confirmed" && inDateRange(row.date, dateFrom || "", dateTo || ""),
  );
}

export function buildPeriodAccountSummary(
  entries: LedgerEntry[],
  accountCodes: AccountCode[],
  dateFrom: string,
  dateTo: string,
): PeriodAccountSummaryRow[] {
  const bucket = new Map<string, PeriodAccountSummaryRow>();

  for (const row of filterConfirmedEntriesInRange(entries, dateFrom, dateTo)) {
    const uncategorized = isUncategorizedEntry(row);
    const accountCode = uncategorized ? "900" : String(row.accountCode || "900").trim();
    const accountName = uncategorized
      ? row.flow === "income"
        ? UNCLASSIFIED_INCOME_LABEL
        : UNCLASSIFIED_EXPENSE_LABEL
      : resolveAccountCodeLabel(accountCodes, accountCode) || row.accountName || accountCode;
    const parentGroup = uncategorized ? "\uBBF8\uBD84\uB958" : resolveParentGroup(accountCodes, accountCode);
    const current = bucket.get(accountCode) || {
      accountCode,
      accountName,
      parentGroup,
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
      isUncategorized: uncategorized,
    };
    if (row.flow === "income") current.income += row.amount;
    else current.expense += row.amount;
    current.net = current.income - current.expense;
    current.count += 1;
    bucket.set(accountCode, current);
  }

  return [...bucket.values()].sort((a, b) => b.expense + b.income - (a.expense + a.income));
}

export function buildLedgerSourceBreakdown(
  entries: LedgerEntry[],
  dateFrom: string,
  dateTo: string,
): LedgerSourceBreakdownRow[] {
  const bucket = new Map<string, LedgerSourceBreakdownRow>();

  for (const row of filterConfirmedEntriesInRange(entries, dateFrom, dateTo)) {
    const key = row.fixedExpenseId ? "fixed" : row.source === "bank" ? "bank" : "manual";
    const label = row.fixedExpenseId
      ? "\uACE0\uC815\uBE44"
      : row.source === "bank"
        ? "\uD1B5\uC7A5 \uC5F0\uB3D9"
        : "\uC218\uAE30 \uBCC0\uB3D9";
    const current = bucket.get(key) || { key, label, income: 0, expense: 0, count: 0 };
    if (row.flow === "income") current.income += row.amount;
    else current.expense += row.amount;
    current.count += 1;
    bucket.set(key, current);
  }

  return [...bucket.values()].sort((a, b) => b.expense + b.income - (a.expense + a.income));
}

export function buildFixedExpenseAnalysisRows(
  fixedExpenses: FixedExpense[],
  fixedExpensePayments: FixedExpensePayment[],
  ledgerCategories: LedgerCategory[],
  accountCodes: AccountCode[],
  dateFrom: string,
  dateTo: string,
): FixedExpenseAnalysisRow[] {
  const itemById = new Map(fixedExpenses.map((row) => [row.id, row]));
  const bucket = new Map<string, FixedExpenseAnalysisRow>();

  for (const payment of fixedExpensePayments) {
    if (!inDateRange(String(payment.date || "").slice(0, 10), dateFrom, dateTo)) continue;
    const item = itemById.get(payment.fixedExpenseId);
    if (!item) continue;

    const accountCode = resolveFixedExpenseAccountCode(item, ledgerCategories);
    const accountLabel = resolveAccountCodeLabel(accountCodes, accountCode) || accountCode;
    const classificationAccount = String(item.category || payment.category || "").trim() || "-";
    const key = item.id;
    const current = bucket.get(key) || {
      key,
      itemId: item.id,
      itemName: item.name,
      classificationAccount,
      accountCode,
      accountLabel,
      amount: 0,
      paymentCount: 0,
      bankLinkedCount: 0,
    };
    current.amount += Number(payment.amount) || 0;
    current.paymentCount += 1;
    if (payment.bankTransactionId) current.bankLinkedCount += 1;
    bucket.set(key, current);
  }

  return [...bucket.values()].sort((a, b) => b.amount - a.amount);
}

export type AccountTrendSeries = {
  accountCode: string;
  label: string;
  monthlyAmounts: Record<string, number>;
  total: number;
};

export function buildAccountTrendSeries(
  entries: LedgerEntry[],
  accountCodes: AccountCode[],
  monthKeys: string[],
  selectedAccountCodes: string[],
  flow?: "income" | "expense",
): AccountTrendSeries[] {
  const selected = new Set(selectedAccountCodes);
  if (!selected.size || !monthKeys.length) return [];

  const monthSet = new Set(monthKeys);
  const buckets = new Map<string, AccountTrendSeries>();

  for (const code of selected) {
    const accountRow = findAccountCodeByCode(accountCodes, code);
    buckets.set(code, {
      accountCode: code,
      label: accountRow?.name || resolveAccountCodeLabel(accountCodes, code) || code,
      monthlyAmounts: emptyMonthlyAmounts(monthKeys),
      total: 0,
    });
  }

  for (const row of entries.filter((item) => item.status === "confirmed")) {
    if (flow && row.flow !== flow) continue;
    const monthKey = getMonthKey(row.date);
    if (!monthKey || !monthSet.has(monthKey)) continue;

    const accountCode = String(row.accountCode || "900").trim();
    const current = buckets.get(accountCode);
    if (!current) continue;

    current.monthlyAmounts[monthKey] = (current.monthlyAmounts[monthKey] || 0) + row.amount;
    current.total += row.amount;
  }

  return [...buckets.values()].sort((a, b) => a.accountCode.localeCompare(b.accountCode, "ko"));
}

export type MonthlyAccountTrendRow = {
  monthKey: string;
  label: string;
  expense: number;
  income: number;
  net: number;
};

export function buildMonthlyAccountTrendRows(
  entries: LedgerEntry[],
  monthKeys: string[],
  selectedAccountCodes: string[],
): MonthlyAccountTrendRow[] {
  const selected = new Set(selectedAccountCodes);
  if (!selected.size || !monthKeys.length) return [];

  const monthSet = new Set(monthKeys);
  const buckets = new Map<string, MonthlyAccountTrendRow>();

  for (const mk of monthKeys) {
    buckets.set(mk, {
      monthKey: mk,
      label: `${Number(mk.slice(5))}\uC6D4`,
      expense: 0,
      income: 0,
      net: 0,
    });
  }

  for (const row of entries.filter((item) => item.status === "confirmed")) {
    const monthKey = getMonthKey(row.date);
    if (!monthKey || !monthSet.has(monthKey)) continue;
    const accountCode = String(row.accountCode || "900").trim();
    if (!selected.has(accountCode)) continue;

    const bucket = buckets.get(monthKey);
    if (!bucket) continue;

    if (row.flow === "income") bucket.income += row.amount;
    else bucket.expense += row.amount;
    bucket.net = bucket.income - bucket.expense;
  }

  return monthKeys.map((mk) => buckets.get(mk)!);
}

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
  fixedExpenses: FixedExpense[] = [],
): CustomAnalysisRow[] {
  const bucket = new Map<string, CustomAnalysisRow>();
  const fixedById = new Map(fixedExpenses.map((row) => [row.id, row]));

  for (const row of filterConfirmedEntriesInRange(entries, dateFrom, dateTo)) {
    let key: string;
    let label: string;
    if (groupBy === "category") {
      key = row.categoryId || row.categoryName;
      label = row.categoryName || "\uBBF8\uBD84\uB958";
    } else if (groupBy === "classificationAccount") {
      const fixedItem = row.fixedExpenseId ? fixedById.get(row.fixedExpenseId) : undefined;
      label = fixedItem?.category?.trim() || row.categoryName || "\uBBF8\uBD84\uB958";
      key = label;
    } else if (groupBy === "fixedItem") {
      const fixedItem = row.fixedExpenseId ? fixedById.get(row.fixedExpenseId) : undefined;
      if (fixedItem) {
        key = fixedItem.id;
        label = fixedItem.name;
      } else {
        key = row.id;
        label = row.description || row.categoryName || "\uBCC0\uB3D9 \uC9C0\uCD9C";
      }
    } else if (groupBy === "account") {
      if (isUncategorizedEntry(row)) {
        key = "__uncategorized__";
        label = "\uBBF8\uBD84\uB958";
      } else {
        key = row.accountCode;
        label = resolveAccountCodeLabel(accountCodes, row.accountCode) || row.accountName || row.accountCode;
      }
    } else if (groupBy === "counterparty") {
      const counterparty = String(row.counterpartyName || row.description || "").trim();
      key = counterparty || "__unknown__";
      label = counterparty || "\uBBF8\uBD84\uB958";
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
