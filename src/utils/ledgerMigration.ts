import type { BankTransaction } from "./bankTransactions";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "./companyLedger";
import {
  buildDefaultLedgerCategories,
  findLedgerCategoryByName,
  type AccountCode,
  type LedgerCategory,
  normalizeAccountCodes,
  normalizeLedgerCategories,
  resolveBankTxLedgerStatus,
} from "./ledgerSystem";

export function migrateBankTransactionLedgerFields(
  tx: BankTransaction,
  companyExpenses: CompanyExpense[],
  fixedExpensePayments: FixedExpensePayment[],
  fixedExpenses: FixedExpense[],
  categories: LedgerCategory[],
): BankTransaction {
  if (tx.ledgerStatus === "confirmed" || tx.ledgerStatus === "exempt" || tx.ledgerStatus === "pending") {
    if (tx.ledgerCategoryId || tx.ledgerStatus === "exempt") return tx;
    if (tx.ledgerStatus === "confirmed" && tx.ledgerAccountCode?.trim()) return tx;
  }

  const status = resolveBankTxLedgerStatus(tx);
  if (status !== "confirmed") return tx;

  if (tx.linkedCompanyExpenseId) {
    const expense = companyExpenses.find((row) => row.id === tx.linkedCompanyExpenseId);
    if (expense) {
      const category = findLedgerCategoryByName(categories, expense.category);
      return {
        ...tx,
        ledgerStatus: "confirmed",
        ledgerCategoryId: category?.id,
        ledgerAccountCode: category?.accountCode,
        ledgerMemo: expense.memo || tx.ledgerMemo,
        ledgerConfirmedAt: expense.createdAt || tx.ledgerConfirmedAt,
        ledgerConfirmedBy: expense.createdBy || tx.ledgerConfirmedBy,
      };
    }
  }

  if (tx.linkedFixedExpensePaymentId) {
    const payment = fixedExpensePayments.find((row) => row.id === tx.linkedFixedExpensePaymentId);
    if (payment) {
      const fixedItem = fixedExpenses.find((row) => row.id === payment.fixedExpenseId);
      const categoryName = payment.category || fixedItem?.category || "";
      const category = findLedgerCategoryByName(categories, categoryName);
      return {
        ...tx,
        ledgerStatus: "confirmed",
        ledgerCategoryId: category?.id,
        ledgerAccountCode: category?.accountCode,
        ledgerFixedExpenseId: payment.fixedExpenseId,
        ledgerMemo: payment.memo || tx.ledgerMemo,
        ledgerConfirmedAt: payment.createdAt || tx.ledgerConfirmedAt,
        ledgerConfirmedBy: payment.createdBy || tx.ledgerConfirmedBy,
      };
    }
  }

  return tx;
}

export function migrateErpLedgerV2(input: {
  accountCodes?: unknown;
  ledgerCategories?: unknown;
  expenseCategories?: string[];
  fixedExpenseCategories?: string[];
  bankTransactions?: BankTransaction[];
  companyExpenses?: CompanyExpense[];
  fixedExpensePayments?: FixedExpensePayment[];
  fixedExpenses?: FixedExpense[];
}) {
  const accountCodes = normalizeAccountCodes(input.accountCodes);
  const ledgerCategories = normalizeLedgerCategories(input.ledgerCategories).length
    ? normalizeLedgerCategories(input.ledgerCategories)
    : buildDefaultLedgerCategories(input.expenseCategories, input.fixedExpenseCategories);

  const categoriesWithLegacy = ledgerCategories.length
    ? ledgerCategories
    : buildDefaultLedgerCategories(input.expenseCategories, input.fixedExpenseCategories);

  const bankTransactions = (input.bankTransactions || []).map((tx) =>
    migrateBankTransactionLedgerFields(
      tx,
      input.companyExpenses || [],
      input.fixedExpensePayments || [],
      input.fixedExpenses || [],
      categoriesWithLegacy,
    ),
  );

  return {
    accountCodes,
    ledgerCategories: categoriesWithLegacy,
    bankTransactions,
  };
}

export function syncLegacyExpenseCategoriesFromLedgerCategories(categories: LedgerCategory[]) {
  const expenseCategories = categories
    .filter((row) => row.kind === "expense" || row.kind === "ceo_advance" || row.kind === "ceo_receivable" || row.kind === "income")
    .map((row) => row.name);
  const fixedExpenseCategories = categories.filter((row) => row.kind === "fixed").map((row) => row.name);
  return { expenseCategories, fixedExpenseCategories };
}
