import type { BankTransaction } from "./bankTransactions";
import type { BankLearnRule } from "./bankCompanyLedger";
import {
  autoApplyBankLearnRules,
  findMatchingBankLedgerRule,
  guessLedgerTargetFromBankTransaction,
  parseLedgerTargetKey,
} from "./bankCompanyLedger";
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
  const matchedRule = findMatchingBankLedgerRule(tx, rules, fixedExpenses);
  if (matchedRule?.fixedExpenseId) return matchedRule.fixedExpenseId;

  const targetKey = guessLedgerTargetFromBankTransaction(tx, fixedExpenses);
  const parsed = parseLedgerTargetKey(targetKey);
  if (parsed?.kind === "fixed" && parsed.fixedExpenseId) return parsed.fixedExpenseId;

  const withdrawal = Number(tx.withdrawal || 0);
  if (withdrawal <= 0) return null;

  const haystack = [tx.description, tx.counterpartyName, tx.memo, tx.transactionType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, "");

  let best: { id: string; score: number } | null = null;
  for (const row of fixedExpenses.filter((item) => item.isActive)) {
    const nameKey = String(row.name || "").toLowerCase().replace(/\s+/g, "");
    if (nameKey.length < 2) continue;

    let score = 0;
    const nameMatched = haystack.includes(nameKey);
    if (nameMatched) score += 10 + nameKey.length;

    const tokens = String(row.name || "")
      .split(/[\s/.]+/)
      .map((token) => token.toLowerCase().replace(/\s+/g, ""))
      .filter((token) => token.length >= 2);
    for (const token of tokens) {
      if (haystack.includes(token)) score += 3;
    }

    if (!nameMatched && score < 10) continue;
    if (Number(row.amount) === withdrawal) score += 8;
    if (score >= 10 && (!best || score > best.score)) best = { id: row.id, score };
  }

  if (best && best.score >= 10) return best.id;

  return null;
}

export function autoLinkBankTransactionsToFixedPayments(
  transactions: BankTransaction[],
  payments: FixedExpensePayment[],
  fixedExpenses: FixedExpense[],
  rules: BankLearnRule[] = [],
  options: { onlyTransactionIds?: Set<string> } = {},
) {
  const linkedPaymentBankTxIds = new Set(
    payments.map((row) => row.bankTransactionId).filter(Boolean) as string[],
  );

  let nextPayments = payments;
  let linkedCount = 0;

  const nextTransactions = transactions.map((tx) => {
    if (options.onlyTransactionIds && !options.onlyTransactionIds.has(tx.id)) return tx;
    if (tx.folderId || !(tx.withdrawal > 0)) return tx;
    if (tx.linkedFixedExpensePaymentId || tx.linkedCompanyExpenseId) return tx;
    if (linkedPaymentBankTxIds.has(tx.id)) return tx;

    const fixedExpenseId = resolveFixedExpenseIdForBankTx(tx, rules, fixedExpenses);
    if (!fixedExpenseId) return tx;

    const payment = findLinkableFixedExpensePayment(tx, fixedExpenseId, nextPayments, fixedExpenses);
    if (!payment) return tx;

    nextPayments = linkFixedExpensePaymentToBankTx(nextPayments, payment.id, tx.id, tx);
    linkedPaymentBankTxIds.add(tx.id);
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
  );

  payments = linkResult.payments;
  let transactions = linkResult.transactions;
  const linkedPaymentCount = linkResult.linkedCount;

  const learnResult = autoApplyBankLearnRules(
    transactions,
    payments,
    input.companyExpenses,
    rules,
    input.fixedExpenses,
    { createdBy: input.createdBy },
  );

  if (learnResult.allPayments) {
    payments = learnResult.allPayments;
  } else if (learnResult.newPayments.length) {
    payments = [...learnResult.newPayments, ...payments];
  }

  return {
    bankTransactions: learnResult.transactions,
    fixedExpensePayments: payments,
    companyExpenses: learnResult.newExpenses.length
      ? [...learnResult.newExpenses, ...input.companyExpenses]
      : input.companyExpenses,
    generatedPaymentCount,
    linkedPaymentCount,
    learnedFixedCount: learnResult.fixedCount,
    learnedManualCount: learnResult.manualCount,
    learnedFolderCount: learnResult.folderCount,
  };
}
