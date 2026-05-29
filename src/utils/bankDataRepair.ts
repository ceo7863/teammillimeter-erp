import type { BankTransaction } from "./bankTransactions";
import type { BankLearnRule } from "./bankCompanyLedger";
import type { BankTransactionFolder } from "./bankTransactionFolders";
import type { CompanyExpense, FixedExpensePayment } from "./companyLedger";
import { filterBankLearnDescriptionTokens } from "./bankLearnTokens";
import {
  applyPreauthNetGroups,
  detectPreauthNetGroups,
  isNetGroupSuppressed,
} from "./bankPreauthNetting";

const BUILDING_MGMT_KEY = /\uAD00\uB9AC|140|141|932|\uACE0\uC591\uC0BC\uC1A1|\uAC74\uBB3C/i;

export function isLikelyBuildingMgmtBankTx(tx: BankTransaction) {
  const haystack = [tx.description, tx.counterpartyName, tx.memo].filter(Boolean).join(" ");
  return BUILDING_MGMT_KEY.test(haystack);
}

export function sanitizeBankLearnRules(rules: BankLearnRule[]) {
  return rules.map((rule) => ({
    ...rule,
    descriptionTokens: filterBankLearnDescriptionTokens(rule.descriptionTokens || []),
  }));
}

export function clearMisclassifiedBuildingFolders(
  transactions: BankTransaction[],
  folders: BankTransactionFolder[],
) {
  const buildingFolderIds = new Set(
    folders
      .filter((folder) => {
        const name = String(folder.folderName || "");
        return name.includes("\uAC74\uBB3C") && name.includes("\uAD00\uB9AC");
      })
      .map((folder) => folder.id),
  );

  let cleared = 0;
  const next = transactions.map((tx) => {
    if (!tx.folderId || !buildingFolderIds.has(tx.folderId)) return tx;
    if (isLikelyBuildingMgmtBankTx(tx)) return tx;
    cleared += 1;
    return {
      ...tx,
      folderId: undefined,
      linkedSubject: undefined,
      classifiedAt: undefined,
    };
  });
  return { next, cleared };
}

export function reapplyPreauthNetGroups(transactions: BankTransaction[], rules: BankLearnRule[] = []) {
  const cleared = transactions.map((tx) => ({
    ...tx,
    netGroupId: undefined,
    netGroupRole: undefined,
  }));
  const groups = detectPreauthNetGroups(cleared, rules);
  return { next: applyPreauthNetGroups(cleared, groups), groups: groups.length };
}

export function removeSuppressedPreauthLedgerEntries(
  transactions: BankTransaction[],
  expenses: CompanyExpense[],
  payments: FixedExpensePayment[],
) {
  const suppressedIds = new Set(transactions.filter((tx) => isNetGroupSuppressed(tx)).map((tx) => tx.id));
  if (!suppressedIds.size) {
    return { transactions, expenses, payments, removedExpenses: 0, removedPayments: 0 };
  }

  const nextExpenses = expenses.filter((row) => !row.bankTransactionId || !suppressedIds.has(row.bankTransactionId));
  const nextPayments = payments.filter((row) => !row.bankTransactionId || !suppressedIds.has(row.bankTransactionId));
  const nextTransactions = transactions.map((tx) => {
    if (!suppressedIds.has(tx.id)) return tx;
    return {
      ...tx,
      linkedCompanyExpenseId: undefined,
      linkedFixedExpensePaymentId: undefined,
    };
  });

  return {
    transactions: nextTransactions,
    expenses: nextExpenses,
    payments: nextPayments,
    removedExpenses: expenses.length - nextExpenses.length,
    removedPayments: payments.length - nextPayments.length,
  };
}

export function removeBankTransactionsByAccountNumber(
  transactions: BankTransaction[],
  expenses: CompanyExpense[],
  payments: FixedExpensePayment[],
  accountNumber: string,
) {
  const normalizedAccount = String(accountNumber || "").trim();
  const removedIds = new Set(
    transactions
      .filter((tx) => String(tx.accountNumber || "").trim() === normalizedAccount)
      .map((tx) => tx.id),
  );
  if (!removedIds.size) {
    return {
      transactions,
      expenses,
      payments,
      removedIds,
      removedCount: 0,
      removedExpenses: 0,
      removedPayments: 0,
    };
  }

  const nextExpenses = expenses.filter((row) => !row.bankTransactionId || !removedIds.has(row.bankTransactionId));
  const nextPayments = payments.filter((row) => !row.bankTransactionId || !removedIds.has(row.bankTransactionId));
  const nextTransactions = transactions.filter((tx) => !removedIds.has(tx.id));

  return {
    transactions: nextTransactions,
    expenses: nextExpenses,
    payments: nextPayments,
    removedIds,
    removedCount: removedIds.size,
    removedExpenses: expenses.length - nextExpenses.length,
    removedPayments: payments.length - nextPayments.length,
  };
}

export function repairBankLedgerData(payload: {
  bankTransactions?: BankTransaction[];
  bankTransactionFolders?: BankTransactionFolder[];
  bankLedgerRules?: BankLearnRule[];
  companyExpenses?: CompanyExpense[];
  fixedExpensePayments?: FixedExpensePayment[];
}) {
  let bankLedgerRules = sanitizeBankLearnRules(payload.bankLedgerRules || []);
  let bankTransactions = payload.bankTransactions || [];
  let bankTransactionFolders = payload.bankTransactionFolders || [];
  let companyExpenses = payload.companyExpenses || [];
  let fixedExpensePayments = payload.fixedExpensePayments || [];

  const folderRepair = clearMisclassifiedBuildingFolders(bankTransactions, bankTransactionFolders);
  bankTransactions = folderRepair.next;

  const preauthRepair = reapplyPreauthNetGroups(bankTransactions, bankLedgerRules);
  bankTransactions = preauthRepair.next;

  const ledgerRepair = removeSuppressedPreauthLedgerEntries(
    bankTransactions,
    companyExpenses,
    fixedExpensePayments,
  );
  bankTransactions = ledgerRepair.transactions;
  companyExpenses = ledgerRepair.expenses;
  fixedExpensePayments = ledgerRepair.payments;

  return {
    bankTransactions,
    bankTransactionFolders,
    bankLedgerRules,
    companyExpenses,
    fixedExpensePayments,
    stats: {
      clearedBuildingFolders: folderRepair.cleared,
      preauthGroups: preauthRepair.groups,
      removedExpenses: ledgerRepair.removedExpenses,
      removedPayments: ledgerRepair.removedPayments,
    },
  };
}
