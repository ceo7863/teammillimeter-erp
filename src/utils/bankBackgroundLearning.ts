import type { BankTransactionFolder } from "./bankTransactionFolders";
import {
  DEFAULT_LEDGER_CATEGORY_FOLDER_ID,
  syncLedgerLinkedBankTransactionFolders,
} from "./bankTransactionFolders";
import {
  autoApplyBankLearnRules,
  buildMemoCategorySuggestionMap,
  canRegisterBankTxToCompanyLedger,
  type BankLearnRule,
} from "./bankCompanyLedger";
import { removeSuppressedPreauthLedgerEntries } from "./bankDataRepair";
import { reconcileLedgerBankLinks } from "./fixedExpenseAutomation";
import {
  applyPreauthNetGroups,
  detectPreauthNetGroups,
  filterPreauthNetGroupsNeedingApply,
} from "./bankPreauthNetting";
import { batchRegisterHighConfidenceBankTxToLedger } from "./bankSmartLedger";
import type { BankTransaction } from "./bankTransactions";
import type { ClientDepositMatchSource, WorkerDepositMatchSource } from "./clientDepositAliases";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "./companyLedger";

export type BackgroundBankLedgerLearningResult = {
  bankTransactions: BankTransaction[];
  fixedExpensePayments: FixedExpensePayment[];
  companyExpenses: CompanyExpense[];
  preauthGroups: number;
  removedExpenses: number;
  removedDuplicatePayments: number;
  reconciledLinks: number;
  learnFixed: number;
  learnManual: number;
  learnFolder: number;
  highConfidenceRegistered: number;
  ledgerFolderSync: number;
  bankTransactionFolders?: BankTransactionFolder[];
  changed: boolean;
};

function collectUnlinkedEligibleIds(
  transactions: BankTransaction[],
  payments: FixedExpensePayment[],
  expenses: CompanyExpense[],
  onlyTransactionIds?: Set<string>,
) {
  const ids = new Set<string>();
  for (const tx of transactions) {
    if (onlyTransactionIds && !onlyTransactionIds.has(tx.id)) continue;
    if (canRegisterBankTxToCompanyLedger(tx, { companyExpenses: expenses, fixedExpensePayments: payments })) {
      ids.add(tx.id);
    }
  }
  return ids;
}

/** Silent background pass: netting, duplicate cleanup, learn-rule apply, high-confidence register. */
export function runBackgroundBankLedgerLearning(input: {
  bankTransactions: BankTransaction[];
  fixedExpensePayments: FixedExpensePayment[];
  companyExpenses: CompanyExpense[];
  bankLedgerRules: BankLearnRule[];
  fixedExpenses: FixedExpense[];
  bankTransactionFolders?: BankTransactionFolder[];
  expenseCategories?: string[];
  memoLearnRules?: BankLearnRule[];
  clients?: ClientDepositMatchSource[];
  workers?: WorkerDepositMatchSource[];
  createdBy?: string;
  onlyTransactionIds?: Set<string>;
}): BackgroundBankLedgerLearningResult {
  let transactions = [...input.bankTransactions];
  let payments = [...input.fixedExpensePayments];
  let expenses = [...input.companyExpenses];

  const preauthGroups = detectPreauthNetGroups(transactions, input.bankLedgerRules);
  const preauthToApply = filterPreauthNetGroupsNeedingApply(preauthGroups, transactions);
  if (preauthToApply.length) {
    transactions = applyPreauthNetGroups(transactions, preauthToApply);
  }

  const suppressedRepair = removeSuppressedPreauthLedgerEntries(transactions, expenses, payments);
  transactions = suppressedRepair.transactions;
  expenses = suppressedRepair.expenses;
  payments = suppressedRepair.payments;

  const reconciled = reconcileLedgerBankLinks({
    bankTransactions: transactions,
    fixedExpensePayments: payments,
    companyExpenses: expenses,
    fixedExpenses: input.fixedExpenses,
  });
  transactions = reconciled.bankTransactions;
  payments = reconciled.fixedExpensePayments;
  expenses = reconciled.companyExpenses;

  const targetIds = collectUnlinkedEligibleIds(
    transactions,
    payments,
    expenses,
    input.onlyTransactionIds,
  );

  let learnFixed = 0;
  let learnManual = 0;
  let learnFolder = 0;
  if (targetIds.size) {
    const learn = autoApplyBankLearnRules(transactions, payments, expenses, input.bankLedgerRules, input.fixedExpenses, {
      createdBy: input.createdBy,
      onlyTransactionIds: targetIds,
      workers: input.workers,
      bankTransactionFolders: input.bankTransactionFolders,
    });
    learnFixed = learn.fixedCount;
    learnManual = learn.manualCount;
    learnFolder = learn.folderCount;
    if (learn.allPayments) payments = learn.allPayments;
    else if (learn.newPayments.length) payments = [...learn.newPayments, ...payments];
    if (learn.newExpenses.length) expenses = [...learn.newExpenses, ...expenses];
    transactions = learn.transactions;
  }

  const stillUnlinked = collectUnlinkedEligibleIds(transactions, payments, expenses, input.onlyTransactionIds);
  let highConfidenceRegistered = 0;
  if (stillUnlinked.size) {
    const effectiveRules = [...(input.bankLedgerRules || []), ...(input.memoLearnRules || [])];
    const memoSuggestions = buildMemoCategorySuggestionMap(
      transactions,
      input.memoLearnRules || [],
      input.expenseCategories || [],
    );
    const batch = batchRegisterHighConfidenceBankTxToLedger({
      bankTransactions: transactions,
      fixedExpensePayments: payments,
      companyExpenses: expenses,
      bankLedgerRules: effectiveRules,
      fixedExpenses: input.fixedExpenses,
      expenseCategories: input.expenseCategories || [],
      clients: input.clients || [],
      workers: input.workers || [],
      createdBy: input.createdBy,
      onlyTransactionIds: stillUnlinked,
      memoCategorySuggestions: memoSuggestions,
    });
    transactions = batch.bankTransactions;
    payments = batch.fixedExpensePayments;
    expenses = batch.companyExpenses;
    highConfidenceRegistered =
      batch.registeredFixed + batch.registeredManual + batch.linkedFixed;
  }

  let nextFolders = input.bankTransactionFolders;
  let ledgerFolderSync = 0;
  if (nextFolders) {
    const folderSync = syncLedgerLinkedBankTransactionFolders(transactions, nextFolders, {
      companyExpenses: expenses,
      fixedExpensePayments: payments,
    });
    ledgerFolderSync = folderSync.updated;
    transactions = folderSync.transactions;
    nextFolders = folderSync.folders;
  }

  const hadLedgerFolder = Boolean(
    input.bankTransactionFolders?.some((folder) => folder.id === DEFAULT_LEDGER_CATEGORY_FOLDER_ID),
  );
  const hasLedgerFolder = Boolean(
    nextFolders?.some((folder) => folder.id === DEFAULT_LEDGER_CATEGORY_FOLDER_ID),
  );

  const changed =
    preauthToApply.length > 0 ||
    suppressedRepair.removedExpenses > 0 ||
    suppressedRepair.removedPayments > 0 ||
    reconciled.removedDuplicateCount > 0 ||
    reconciled.linkedCount > 0 ||
    learnFixed + learnManual + learnFolder > 0 ||
    highConfidenceRegistered > 0 ||
    ledgerFolderSync > 0 ||
    (!hadLedgerFolder && hasLedgerFolder);

  return {
    bankTransactions: transactions,
    fixedExpensePayments: payments,
    companyExpenses: expenses,
    bankTransactionFolders: nextFolders,
    preauthGroups: preauthToApply.length,
    removedExpenses: suppressedRepair.removedExpenses,
    removedDuplicatePayments: reconciled.removedDuplicateCount,
    reconciledLinks: reconciled.linkedCount,
    learnFixed,
    learnManual,
    learnFolder,
    highConfidenceRegistered,
    ledgerFolderSync,
    changed,
  };
}
