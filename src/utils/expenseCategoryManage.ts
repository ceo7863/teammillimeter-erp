import type { BankLearnRule } from "@/utils/bankCompanyLedger";
import {
  CEO_ADVANCE_CATEGORY,
  CEO_RECEIVABLE_CATEGORY,
  EXPENSE_CATEGORY_OPTIONS,
  type CompanyExpense,
  type FixedExpense,
  type FixedExpensePayment,
  mergeExpenseCategory,
  mergeFixedExpenseCategory,
  normalizeExpenseCategories,
  normalizeExpenseCategoryName,
  normalizeFixedExpenseCategories,
} from "@/utils/companyLedger";

export type ExpenseCategoryUsage = {
  expenseCount: number;
  fixedPaymentCount: number;
  fixedItemCount: number;
  manualRuleCount: number;
  total: number;
};

export function buildExpenseCategorySelectOptions(categories: string[], currentCategory = "") {
  const base = normalizeExpenseCategories(categories);
  const current = normalizeExpenseCategoryName(String(currentCategory || "").trim());
  const values = current && !base.includes(current) ? [current, ...base] : base;
  return values.map((value) => ({
    label: value,
    value,
  }));
}

export function countExpenseCategoryUsage(
  category: string,
  companyExpenses: CompanyExpense[] = [],
  fixedExpensePayments: FixedExpensePayment[] = [],
  fixedExpenses: FixedExpense[] = [],
  bankLedgerRules: BankLearnRule[] = [],
): ExpenseCategoryUsage {
  const key = normalizeExpenseCategoryName(category);
  let expenseCount = 0;
  let fixedPaymentCount = 0;
  let fixedItemCount = 0;
  let manualRuleCount = 0;

  for (const row of companyExpenses) {
    if (normalizeExpenseCategoryName(row.category) === key) expenseCount += 1;
  }
  for (const row of fixedExpensePayments) {
    const paymentCategory = normalizeExpenseCategoryName(row.category || "");
    if (paymentCategory === key) {
      fixedPaymentCount += 1;
      continue;
    }
    const master = fixedExpenses.find((item) => item.id === row.fixedExpenseId);
    if (master && normalizeExpenseCategoryName(master.category) === key && !paymentCategory) {
      fixedPaymentCount += 1;
    }
  }
  for (const row of fixedExpenses) {
    if (normalizeExpenseCategoryName(row.category) === key) fixedItemCount += 1;
  }
  for (const rule of bankLedgerRules) {
    if (rule.kind === "manual" && normalizeExpenseCategoryName(String(rule.category || "")) === key) {
      manualRuleCount += 1;
    }
  }

  return {
    expenseCount,
    fixedPaymentCount,
    fixedItemCount,
    manualRuleCount,
    total: expenseCount + fixedPaymentCount + fixedItemCount + manualRuleCount,
  };
}

export function reorderExpenseCategories(categories: string[], fromIndex: number, toIndex: number) {
  const list = [...categories];
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) return list;
  const [item] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, item);
  return list;
}

export type LedgerCategoryRenameResult = {
  expenseCategories: string[];
  fixedExpenseCategories: string[];
  companyExpenses: CompanyExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  fixedExpenses: FixedExpense[];
  bankLedgerRules: BankLearnRule[];
};

function replaceCategoryValue(value: string, from: string, to: string) {
  return normalizeExpenseCategoryName(value) === from ? to : value;
}

export function applyExpenseCategoryRename(
  fromRaw: string,
  toRaw: string,
  input: {
    expenseCategories: string[];
    fixedExpenseCategories: string[];
    companyExpenses: CompanyExpense[];
    fixedExpensePayments: FixedExpensePayment[];
    fixedExpenses: FixedExpense[];
    bankLedgerRules: BankLearnRule[];
  },
): LedgerCategoryRenameResult | null {
  const from = normalizeExpenseCategoryName(fromRaw);
  const to = normalizeExpenseCategoryName(toRaw);
  if (!from || !to || from === to) return null;
  if (from === CEO_ADVANCE_CATEGORY || from === CEO_RECEIVABLE_CATEGORY) return null;
  if (to === CEO_ADVANCE_CATEGORY || to === CEO_RECEIVABLE_CATEGORY) return null;

  const expenseCategories = mergeExpenseCategory(
    input.expenseCategories.map((row) => replaceCategoryValue(row, from, to)),
    to,
  );
  const fixedExpenseCategories = mergeFixedExpenseCategory(
    input.fixedExpenseCategories.map((row) => replaceCategoryValue(row, from, to)),
    to,
    input.fixedExpenses,
  );

  return {
    expenseCategories,
    fixedExpenseCategories,
    companyExpenses: input.companyExpenses.map((row) => ({
      ...row,
      category: replaceCategoryValue(row.category, from, to),
    })),
    fixedExpensePayments: input.fixedExpensePayments.map((row) => ({
      ...row,
      category: row.category ? replaceCategoryValue(row.category, from, to) : row.category,
    })),
    fixedExpenses: input.fixedExpenses.map((row) => ({
      ...row,
      category: replaceCategoryValue(row.category, from, to),
    })),
    bankLedgerRules: input.bankLedgerRules.map((rule) => {
      if (rule.kind !== "manual" || !rule.category) return rule;
      return {
        ...rule,
        category: replaceCategoryValue(rule.category, from, to),
      };
    }),
  };
}

export function removeExpenseCategoryFromList(categories: string[], category: string) {
  const key = normalizeExpenseCategoryName(category);
  return categories.filter((row) => normalizeExpenseCategoryName(row) !== key);
}

export function seedExpenseCategoriesIfEmpty(categories: string[], companyExpenses: CompanyExpense[] = []) {
  const normalized = normalizeExpenseCategories(categories, companyExpenses);
  if (normalized.length) return normalized;
  return [...EXPENSE_CATEGORY_OPTIONS];
}
