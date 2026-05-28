import { isCheckCardBankTransaction, type BankTransaction } from "./bankTransactions";
import type { BankTransactionFolder } from "./bankTransactionFolders";
import type { BankLearnRule } from "./bankCompanyLedger";
import {
  findMatchingBankLedgerRule,
  isBankTransactionLinkedToCompanyLedger,
  syncBankTransactionLedgerLinkFields,
} from "./bankCompanyLedger";
import { runSmartAutoLedgerSync } from "./bankSmartLedger";
import type { ClientDepositMatchSource, WorkerDepositMatchSource } from "./clientDepositAliases";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "./companyLedger";
import {
  buildFixedExpensePaymentDate,
  findLinkableFixedExpensePayment,
  getMonthKey,
  isFixedActiveInMonth,
  linkFixedExpensePaymentToBankTx,
  makeLedgerId,
  todayISO,
} from "./companyLedger";

export function monthIndexFromKey(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || "").trim());
  if (!match) return null;
  return Number(match[1]) * 12 + (Number(match[2]) - 1);
}

export function isFixedExpenseDueInMonth(expense: FixedExpense, monthKey: string) {
  if (!isFixedActiveInMonth(expense, monthKey)) return false;
  if (expense.cycle === "monthly") return true;

  const targetIndex = monthIndexFromKey(monthKey);
  if (targetIndex == null) return false;

  const startKey = getMonthKey(expense.startDate || "") || monthKey;
  const startIndex = monthIndexFromKey(startKey);
  if (startIndex == null) return false;

  const diff = targetIndex - startIndex;
  if (diff < 0) return false;
  if (expense.cycle === "quarterly") return diff % 3 === 0;
  if (expense.cycle === "yearly") return diff % 12 === 0;
  return true;
}

export function hasFixedPaymentForMonth(
  payments: FixedExpensePayment[],
  fixedExpenseId: string,
  monthKey: string,
) {
  return payments.some(
    (row) => row.fixedExpenseId === fixedExpenseId && getMonthKey(row.date) === monthKey,
  );
}

export function buildMonthlyFixedExpensePayments(
  fixedExpenses: FixedExpense[],
  existingPayments: FixedExpensePayment[],
  monthKey: string,
  createdBy?: string,
): FixedExpensePayment[] {
  const createdAt = new Date().toISOString();

  return fixedExpenses
    .filter((expense) => isFixedExpenseDueInMonth(expense, monthKey))
    .filter((expense) => !hasFixedPaymentForMonth(existingPayments, expense.id, monthKey))
    .map((expense) => ({
      id: makeLedgerId(),
      fixedExpenseId: expense.id,
      date: buildFixedExpensePaymentDate(monthKey, expense.paymentDayOfMonth),
      amount: Number(expense.amount) || 0,
      memo: `\uC790\uB3D9 \uB4F1\uB85D \u00B7 ${expense.name}`,
      createdBy: createdBy || "system",
      createdAt,
    }));
}

function resolveFixedExpenseIdForBankTx(
  tx: BankTransaction,
  rules: BankLearnRule[],
  fixedExpenses: FixedExpense[],
) {
  if (isCheckCardBankTransaction(tx)) return null;

  const matchedRule = findMatchingBankLedgerRule(tx, rules, fixedExpenses);
  if (matchedRule?.fixedExpenseId) return matchedRule.fixedExpenseId;

  return null;
}

export function autoLinkBankTransactionsToFixedPayments(
  transactions: BankTransaction[],
  payments: FixedExpensePayment[],
  fixedExpenses: FixedExpense[],
  rules: BankLearnRule[] = [],
  options: {
    onlyTransactionIds?: Set<string>;
    companyExpenses?: CompanyExpense[];
  } = {},
) {
  let nextPayments = payments;
  let linkedCount = 0;

  const nextTransactions = transactions.map((tx) => {
    if (options.onlyTransactionIds && !options.onlyTransactionIds.has(tx.id)) return tx;
    if (tx.folderId || !(tx.withdrawal > 0)) return tx;
    if (
      isBankTransactionLinkedToCompanyLedger(tx, {
        companyExpenses: options.companyExpenses,
        fixedExpensePayments: nextPayments,
      })
    ) {
      return tx;
    }

    const fixedExpenseId = resolveFixedExpenseIdForBankTx(tx, rules, fixedExpenses);
    if (!fixedExpenseId) return tx;

    const payment = findLinkableFixedExpensePayment(tx, fixedExpenseId, nextPayments, fixedExpenses);
    if (!payment) return tx;

    nextPayments = linkFixedExpensePaymentToBankTx(nextPayments, payment.id, tx.id, tx);
    linkedCount += 1;

    return { ...tx, linkedFixedExpensePaymentId: payment.id, linkedCompanyExpenseId: undefined };
  });

  return {
    transactions: nextTransactions,
    payments: nextPayments,
    linkedCount,
  };
}

export function syncFixedExpenseAutomation(input: {
  fixedExpenses: FixedExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  bankTransactions: BankTransaction[];
  bankLedgerRules?: BankLearnRule[];
  monthKey?: string;
  createdBy?: string;
}) {
  const monthKey = input.monthKey || todayISO().slice(0, 7);
  const generated = buildMonthlyFixedExpensePayments(
    input.fixedExpenses,
    input.fixedExpensePayments,
    monthKey,
    input.createdBy,
  );

  let payments =
    generated.length > 0 ? [...generated, ...input.fixedExpensePayments] : input.fixedExpensePayments;

  const linkResult = autoLinkBankTransactionsToFixedPayments(
    input.bankTransactions,
    payments,
    input.fixedExpenses,
    input.bankLedgerRules || [],
    { companyExpenses: input.companyExpenses },
  );

  return {
    fixedExpensePayments: linkResult.payments,
    bankTransactions: linkResult.transactions,
    generatedCount: generated.length,
    linkedCount: linkResult.linkedCount,
  };
}

export type RefreshCompanyLedgerFromBankResult = {
  bankTransactions: BankTransaction[];
  fixedExpensePayments: FixedExpensePayment[];
  companyExpenses: CompanyExpense[];
  generatedPaymentCount: number;
  linkedPaymentCount: number;
  learnedFixedCount: number;
  learnedManualCount: number;
  learnedFolderCount: number;
};

export function refreshCompanyLedgerFromBankTransactions(input: {
  bankTransactions: BankTransaction[];
  fixedExpenses: FixedExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  companyExpenses: CompanyExpense[];
  bankLedgerRules?: BankLearnRule[];
  bankTransactionFolders?: BankTransactionFolder[];
  expenseCategories?: string[];
  clients?: ClientDepositMatchSource[];
  workers?: WorkerDepositMatchSource[];
  createdBy?: string;
}): RefreshCompanyLedgerFromBankResult {
  const rules = input.bankLedgerRules || [];
  const monthKeys = [
    ...new Set(
      input.bankTransactions
        .map((tx) => getMonthKey(String(tx.transactionAt || "").slice(0, 10)))
        .filter(Boolean),
    ),
  ].sort();

  if (!monthKeys.includes(todayISO().slice(0, 7))) {
    monthKeys.push(todayISO().slice(0, 7));
  }

  let payments = [...input.fixedExpensePayments];
  let generatedPaymentCount = 0;

  for (const monthKey of monthKeys) {
    const generated = buildMonthlyFixedExpensePayments(input.fixedExpenses, payments, monthKey, input.createdBy);
    if (!generated.length) continue;
    payments = [...generated, ...payments];
    generatedPaymentCount += generated.length;
  }

  const linkResult = autoLinkBankTransactionsToFixedPayments(
    input.bankTransactions,
    payments,
    input.fixedExpenses,
    rules,
    { companyExpenses: input.companyExpenses },
  );

  payments = linkResult.payments;
  let transactions = linkResult.transactions;
  const linkedPaymentCount = linkResult.linkedCount;

  const smart = runSmartAutoLedgerSync({
    bankTransactions: transactions,
    bankTransactionFolders: input.bankTransactionFolders || [],
    fixedExpensePayments: payments,
    companyExpenses: input.companyExpenses,
    bankLedgerRules: rules,
    fixedExpenses: input.fixedExpenses,
    expenseCategories: input.expenseCategories || [],
    clients: input.clients || [],
    workers: input.workers || [],
    createdBy: input.createdBy,
    useLlm: false,
  });

  const companyExpenses = smart.companyExpenses;
  const bankTransactions = syncBankTransactionLedgerLinkFields(
    smart.bankTransactions,
    companyExpenses,
    smart.fixedExpensePayments,
  );

  return {
    bankTransactions,
    fixedExpensePayments: smart.fixedExpensePayments,
    companyExpenses,
    generatedPaymentCount,
    linkedPaymentCount,
    learnedFixedCount: smart.learnFixed + smart.heuristicRegistered,
    learnedManualCount: smart.learnManual,
    learnedFolderCount: smart.learnFolder + smart.classifiedFolders,
  };
}
