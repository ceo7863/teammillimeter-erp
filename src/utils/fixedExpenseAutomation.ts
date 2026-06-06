import { isCheckCardBankTransaction, type BankTransaction } from "./bankTransactions";
import type { BankTransactionFolder } from "./bankTransactionFolders";
import type { BankLearnRule } from "./bankCompanyLedger";
import {
  findMatchingBankLedgerRule,
  getLinkedCompanyExpenseForBankTx,
  isBankTransactionLinkedToCompanyLedger,
  syncBankTransactionLedgerLinkFields,
} from "./bankCompanyLedger";
import { runSmartAutoLedgerSync } from "./bankSmartLedger";
import type { ClientDepositMatchSource, WorkerDepositMatchSource } from "./clientDepositAliases";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "./companyLedger";
import {
  bankTransactionMatchesFixedPayment,
  buildFixedExpensePaymentDate,
  findLinkableFixedExpensePayment,
  getMonthKey,
  isFixedActiveInMonth,
  isFixedExpensePaymentBankLinked,
  linkFixedExpensePaymentToBankTx,
  makeLedgerId,
  pruneSettledDuplicateFixedExpensePayments,
  resolveFixedExpenseIdForBankTransaction,
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
  const fallbackId = matchedRule?.fixedExpenseId || null;
  return resolveFixedExpenseIdForBankTransaction(tx, fixedExpenses, fallbackId);
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

function normalizeLedgerLinkText(text: string) {
  return String(text || "").toLowerCase().replace(/\s+/g, "");
}

function fixedExpenseNameMatchesBankTx(expense: FixedExpense, tx: BankTransaction) {
  const haystack = normalizeLedgerLinkText(
    [tx.counterpartyName, tx.description, tx.memo].filter(Boolean).join(" "),
  );
  const fullName = normalizeLedgerLinkText(expense.name);
  if (fullName.length >= 2 && haystack.includes(fullName)) return true;

  const tokens = String(expense.name || "")
    .split(/[\s/·]+/)
    .map(normalizeLedgerLinkText)
    .filter((token) => token.length >= 2);
  if (!tokens.length) return true;
  return tokens.some((token) => haystack.includes(token));
}

function isFixedPaymentBankLinked(
  payment: FixedExpensePayment,
  transactions: BankTransaction[] = [],
) {
  return isFixedExpensePaymentBankLinked(payment, transactions);
}

/** Repair broken / split bank ↔ fixed-payment links after kind switches or auto-generated duplicates. */
export function reconcileLedgerBankLinks(input: {
  bankTransactions: BankTransaction[];
  fixedExpensePayments: FixedExpensePayment[];
  companyExpenses: CompanyExpense[];
  fixedExpenses: FixedExpense[];
}) {
  let payments = [...input.fixedExpensePayments];
  const companyExpenses = [...input.companyExpenses];
  let transactions = syncBankTransactionLedgerLinkFields(
    input.bankTransactions,
    companyExpenses,
    payments,
  );
  let linkedCount = 0;
  let removedDuplicateCount = 0;

  transactions = transactions.map((tx) => {
    if (!tx.linkedCompanyExpenseId) return tx;
    const exists = companyExpenses.some((row) => row.id === tx.linkedCompanyExpenseId);
    if (exists) return tx;
    return { ...tx, linkedCompanyExpenseId: undefined };
  });

  payments = payments.map((payment) => {
    if (String(payment.bankTransactionId || "").trim()) return payment;
    const tx = transactions.find((row) => row.linkedFixedExpensePaymentId === payment.id);
    if (!tx) return payment;
    return linkFixedExpensePaymentToBankTx([payment], payment.id, tx.id, tx)[0];
  });

  transactions = syncBankTransactionLedgerLinkFields(transactions, companyExpenses, payments);

  const tryLinkPaymentToTx = (payment: FixedExpensePayment, tx: BankTransaction) => {
    payments = linkFixedExpensePaymentToBankTx(payments, payment.id, tx.id, tx);
    transactions = transactions.map((row) =>
      row.id === tx.id
        ? { ...row, linkedFixedExpensePaymentId: payment.id, linkedCompanyExpenseId: undefined }
        : row,
    );
    linkedCount += 1;
  };

  for (const payment of payments) {
    if (isFixedPaymentBankLinked(payment, transactions)) continue;
    const expense = input.fixedExpenses.find((row) => row.id === payment.fixedExpenseId);
    if (!expense) continue;

    const monthKey = getMonthKey(payment.date);
    const candidates = transactions.filter((tx) => {
      if (tx.folderId || !(Number(tx.withdrawal) > 0)) return false;
      if (getMonthKey(String(tx.transactionAt || "").slice(0, 10)) !== monthKey) return false;
      if (getLinkedCompanyExpenseForBankTx(tx, companyExpenses)) return false;
      if (payments.some((row) => row.bankTransactionId === tx.id)) return false;
      if (
        tx.linkedFixedExpensePaymentId &&
        payments.some((row) => row.id === tx.linkedFixedExpensePaymentId && row.id !== payment.id)
      ) {
        return false;
      }
      if (!bankTransactionMatchesFixedPayment(tx, payment, input.fixedExpenses)) return false;
      return fixedExpenseNameMatchesBankTx(expense, tx);
    });

    if (candidates.length !== 1) continue;
    tryLinkPaymentToTx(payment, candidates[0]);
  }

  const removeIds = new Set<string>();
  const byMonth = new Map<string, FixedExpensePayment[]>();
  for (const payment of payments) {
    const key = `${payment.fixedExpenseId}:${getMonthKey(payment.date)}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(payment);
  }
  for (const group of byMonth.values()) {
    if (group.length <= 1) continue;
    const linked = group.filter((row) => isFixedPaymentBankLinked(row, transactions));
    if (!linked.length) continue;
    for (const row of group) {
      if (isFixedPaymentBankLinked(row, transactions)) continue;
      if (String(row.memo || "").includes("\uC790\uB3D9 \uB4F1\uB85D")) {
        removeIds.add(row.id);
      }
    }
  }
  if (removeIds.size) {
    payments = payments.filter((row) => !removeIds.has(row.id));
    removedDuplicateCount = removeIds.size;
  }

  const pruned = pruneSettledDuplicateFixedExpensePayments({
    fixedExpensePayments: payments,
    bankTransactions: transactions,
    fixedExpenses: input.fixedExpenses,
  });
  if (pruned.removedCount) {
    payments = pruned.payments;
    removedDuplicateCount += pruned.removedCount;
  }

  transactions = syncBankTransactionLedgerLinkFields(transactions, companyExpenses, payments);

  return {
    bankTransactions: transactions,
    fixedExpensePayments: payments,
    companyExpenses,
    linkedCount,
    removedDuplicateCount,
  };
}

export function collectFixedExpenseGenerationMonthKeys(
  fixedExpenses: FixedExpense[],
  bankTransactions: BankTransaction[],
) {
  const todayMonth = todayISO().slice(0, 7);
  const keys = new Set<string>([todayMonth]);

  for (const tx of bankTransactions) {
    const monthKey = getMonthKey(String(tx.transactionAt || "").slice(0, 10));
    if (monthKey) keys.add(monthKey);
  }

  for (const expense of fixedExpenses) {
    if (!expense.isActive) continue;
    const startMonth = getMonthKey(expense.startDate || "") || todayMonth;
    let cursor = startMonth < todayMonth ? startMonth : todayMonth;
    const endMonth = todayMonth;
    while (cursor <= endMonth) {
      keys.add(cursor);
      if (cursor === endMonth) break;
      const [year, month] = cursor.split("-").map(Number);
      const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
      cursor = next;
    }
  }

  return [...keys].sort();
}

export function syncFixedExpenseAutomation(input: {
  fixedExpenses: FixedExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  bankTransactions: BankTransaction[];
  bankLedgerRules?: BankLearnRule[];
  companyExpenses?: CompanyExpense[];
  monthKey?: string;
  monthKeys?: string[];
  createdBy?: string;
}) {
  const monthKeys = input.monthKeys?.length
    ? input.monthKeys
    : input.monthKey
      ? [input.monthKey]
      : collectFixedExpenseGenerationMonthKeys(input.fixedExpenses, input.bankTransactions);

  let payments = input.fixedExpensePayments;
  let generatedCount = 0;

  for (const monthKey of monthKeys) {
    const generated = buildMonthlyFixedExpensePayments(
      input.fixedExpenses,
      payments,
      monthKey,
      input.createdBy,
    );
    if (!generated.length) continue;
    payments = [...generated, ...payments];
    generatedCount += generated.length;
  }

  const linkResult = autoLinkBankTransactionsToFixedPayments(
    input.bankTransactions,
    payments,
    input.fixedExpenses,
    input.bankLedgerRules || [],
    { companyExpenses: input.companyExpenses },
  );

  const reconciled = reconcileLedgerBankLinks({
    bankTransactions: linkResult.transactions,
    fixedExpensePayments: linkResult.payments,
    companyExpenses: input.companyExpenses || [],
    fixedExpenses: input.fixedExpenses,
  });

  return {
    fixedExpensePayments: reconciled.fixedExpensePayments,
    bankTransactions: reconciled.bankTransactions,
    generatedCount,
    linkedCount: linkResult.linkedCount + reconciled.linkedCount,
    removedDuplicateCount: reconciled.removedDuplicateCount,
  };
}

export type RefreshCompanyLedgerFromBankResult = {
  bankTransactions: BankTransaction[];
  fixedExpensePayments: FixedExpensePayment[];
  companyExpenses: CompanyExpense[];
  generatedPaymentCount: number;
  linkedPaymentCount: number;
  reconciledLinkCount: number;
  removedDuplicatePaymentCount: number;
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
  const reconciled = reconcileLedgerBankLinks({
    bankTransactions: smart.bankTransactions,
    fixedExpensePayments: smart.fixedExpensePayments,
    companyExpenses,
    fixedExpenses: input.fixedExpenses,
  });

  return {
    bankTransactions: reconciled.bankTransactions,
    fixedExpensePayments: reconciled.fixedExpensePayments,
    companyExpenses: reconciled.companyExpenses,
    generatedPaymentCount,
    linkedPaymentCount: linkedPaymentCount + reconciled.linkedCount,
    reconciledLinkCount: reconciled.linkedCount,
    removedDuplicatePaymentCount: reconciled.removedDuplicateCount,
    learnedFixedCount: smart.learnFixed + smart.heuristicRegistered,
    learnedManualCount: smart.learnManual,
    learnedFolderCount: smart.learnFolder + smart.classifiedFolders,
  };
}
