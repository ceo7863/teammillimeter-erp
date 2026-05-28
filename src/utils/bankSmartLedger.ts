import type { BankTransaction } from "./bankTransactions";
import type { BankTransactionFolder } from "./bankTransactionFolders";
import {
  autoApplyBankLearnRules,
  buildBankLearnRuleFromManualRegistration,
  buildBankLedgerMatchRuleFromRegistration,
  canRegisterBankTxToCompanyLedger,
  isBankTransactionLinkedToCompanyLedger,
  upsertBankLearnRule,
  type BankLearnRule,
} from "./bankCompanyLedger";
import {
  classifyBankTransactionForLedger,
  HEURISTIC_AUTO_REGISTER_MIN_CONFIDENCE,
  type BankLedgerClassification,
} from "./bankLedgerClassifier";
import type { ClientDepositMatchSource, WorkerDepositMatchSource } from "./clientDepositAliases";
import { autoClassifyBankTransactions } from "./bankTransactionFolders";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "./companyLedger";
import { normalizeExpenseCategories } from "./companyLedger";
import { applyPreauthNetGroups, detectPreauthNetGroups } from "./bankPreauthNetting";
import { fetchBankLedgerClassifications } from "./bankLedgerApi";

export const SMART_LEDGER_SUMMARY_KEY = "teammillimeter-smart-ledger-summary";

export type SmartLedgerRunSummary = {
  at: string;
  classifiedFolders: number;
  learnFixed: number;
  learnManual: number;
  learnFolder: number;
  heuristicRegistered: number;
  llmRegistered: number;
  pendingSuggestions: number;
};

export function saveSmartLedgerRunSummary(summary: SmartLedgerRunSummary) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SMART_LEDGER_SUMMARY_KEY, JSON.stringify(summary));
  } catch {
    /* ignore quota */
  }
}

export function loadSmartLedgerRunSummary(): SmartLedgerRunSummary | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SMART_LEDGER_SUMMARY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SmartLedgerRunSummary>;
    if (!parsed?.at) return null;
    return {
      at: String(parsed.at),
      classifiedFolders: Number(parsed.classifiedFolders) || 0,
      learnFixed: Number(parsed.learnFixed) || 0,
      learnManual: Number(parsed.learnManual) || 0,
      learnFolder: Number(parsed.learnFolder) || 0,
      heuristicRegistered: Number(parsed.heuristicRegistered) || 0,
      llmRegistered: Number(parsed.llmRegistered) || 0,
      pendingSuggestions: Number(parsed.pendingSuggestions) || 0,
    };
  } catch {
    return null;
  }
}

export function countPendingSmartLedger(
  transactions: BankTransaction[],
  context: {
    companyExpenses?: CompanyExpense[];
    fixedExpensePayments?: FixedExpensePayment[];
    rules?: BankLearnRule[];
    fixedExpenses?: FixedExpense[];
    expenseCategories?: string[];
    workers?: WorkerDepositMatchSource[];
    clients?: ClientDepositMatchSource[];
  } = {},
) {
  let eligible = 0;
  let withSuggestion = 0;
  let highConfidence = 0;

  for (const tx of transactions) {
    if (!canRegisterBankTxToCompanyLedger(tx, context)) continue;
    eligible += 1;
    const suggestion = classifyBankTransactionForLedger(tx, {
      rules: context.rules,
      fixedExpenses: context.fixedExpenses,
      expenseCategories: context.expenseCategories,
      companyExpenses: context.companyExpenses,
      workers: context.workers,
      clients: context.clients,
    });
    if (!suggestion) continue;
    withSuggestion += 1;
    if (suggestion.confidence >= HEURISTIC_AUTO_REGISTER_MIN_CONFIDENCE) highConfidence += 1;
  }

  return { eligible, withSuggestion, highConfidence };
}

function buildLearnRuleFromClassification(tx: BankTransaction, row: BankLedgerClassification, createdBy?: string) {
  if (row.kind === "fixed" && row.fixedExpenseId) {
    return buildBankLedgerMatchRuleFromRegistration(tx, row.fixedExpenseId, createdBy, tx.withdrawal);
  }
  if (row.category) {
    return buildBankLearnRuleFromManualRegistration(tx, row.category, createdBy);
  }
  return null;
}

function mergeCategoriesFromClassifications(
  categories: string[],
  classifications: BankLedgerClassification[],
  expenses: CompanyExpense[],
) {
  const extras = classifications.map((row) => row.category).filter(Boolean) as string[];
  return normalizeExpenseCategories([...categories, ...extras], expenses);
}

export type RunSmartAutoLedgerInput = {
  bankTransactions: BankTransaction[];
  bankTransactionFolders: BankTransactionFolder[];
  fixedExpensePayments: FixedExpensePayment[];
  companyExpenses: CompanyExpense[];
  bankLedgerRules: BankLearnRule[];
  fixedExpenses: FixedExpense[];
  expenseCategories: string[];
  clients: ClientDepositMatchSource[];
  workers: WorkerDepositMatchSource[];
  createdBy?: string;
  onlyTransactionIds?: Set<string>;
  useLlm?: boolean;
  /** When true, only folder/preauth automation runs; ledger entries require user confirmation. */
  skipLedgerRegistration?: boolean;
};

export type RunSmartAutoLedgerResult = {
  bankTransactions: BankTransaction[];
  bankTransactionFolders: BankTransactionFolder[];
  fixedExpensePayments: FixedExpensePayment[];
  companyExpenses: CompanyExpense[];
  bankLedgerRules: BankLearnRule[];
  expenseCategories: string[];
  classifiedFolders: number;
  learnFixed: number;
  learnManual: number;
  learnFolder: number;
  heuristicRegistered: number;
  llmRegistered: number;
  pendingSuggestions: number;
};

function applyHeuristicLearnRules(
  transactions: BankTransaction[],
  payments: FixedExpensePayment[],
  expenses: CompanyExpense[],
  rules: BankLearnRule[],
  input: RunSmartAutoLedgerInput,
  extraClassifications: Map<string, BankLedgerClassification>,
) {
  let nextRules = [...rules];
  let heuristicRegistered = 0;
  let llmRegistered = 0;
  const candidates: Array<{ tx: BankTransaction; row: BankLedgerClassification }> = [];

  for (const tx of transactions) {
    if (input.onlyTransactionIds && !input.onlyTransactionIds.has(tx.id)) continue;
    if (
      !canRegisterBankTxToCompanyLedger(tx, {
        companyExpenses: expenses,
        fixedExpensePayments: payments,
      })
    ) {
      continue;
    }
    if (
      isBankTransactionLinkedToCompanyLedger(tx, {
        companyExpenses: expenses,
        fixedExpensePayments: payments,
      })
    ) {
      continue;
    }

    const row =
      extraClassifications.get(tx.id) ||
      classifyBankTransactionForLedger(tx, {
        rules: nextRules,
        fixedExpenses: input.fixedExpenses,
        expenseCategories: input.expenseCategories,
        companyExpenses: expenses,
        workers: input.workers,
        clients: input.clients,
      });

    if (!row || row.source === "learn_rule") continue;
    if (row.confidence < HEURISTIC_AUTO_REGISTER_MIN_CONFIDENCE) continue;

    const rule = buildLearnRuleFromClassification(tx, row, input.createdBy);
    if (rule) nextRules = upsertBankLearnRule(nextRules, rule);
    candidates.push({ tx, row });
  }

  if (!candidates.length) {
    return {
      transactions,
      payments,
      expenses,
      rules: nextRules,
      heuristicRegistered,
      llmRegistered,
    };
  }

  const onlyIds = new Set(candidates.map((item) => item.tx.id));
  const secondPass = autoApplyBankLearnRules(transactions, payments, expenses, nextRules, input.fixedExpenses, {
    createdBy: input.createdBy,
    onlyTransactionIds: onlyIds,
    workers: input.workers,
    bankTransactionFolders: input.bankTransactionFolders,
  });

  let nextPayments = secondPass.allPayments || payments;
  if (!secondPass.allPayments && secondPass.newPayments.length) {
    nextPayments = [...secondPass.newPayments, ...payments];
  }
  let nextExpenses = secondPass.newExpenses.length ? [...secondPass.newExpenses, ...expenses] : expenses;

  for (const item of candidates) {
    const updatedTx = secondPass.transactions.find((row) => row.id === item.tx.id) || item.tx;
    if (
      isBankTransactionLinkedToCompanyLedger(updatedTx, {
        companyExpenses: nextExpenses,
        fixedExpensePayments: nextPayments,
      })
    ) {
      if (item.row.source === "llm") llmRegistered += 1;
      else heuristicRegistered += 1;
    }
  }

  return {
    transactions: secondPass.transactions,
    payments: nextPayments,
    expenses: nextExpenses,
    rules: nextRules,
    heuristicRegistered,
    llmRegistered,
  };
}

function applyPreauthNettingStep(transactions: BankTransaction[], rules: BankLearnRule[]) {
  const groups = detectPreauthNetGroups(transactions, rules);
  return applyPreauthNetGroups(transactions, groups);
}

export function runSmartAutoLedgerSync(input: RunSmartAutoLedgerInput): RunSmartAutoLedgerResult {
  const classified = autoClassifyBankTransactions(
    input.bankTransactions,
    input.clients,
    input.workers,
    input.bankTransactionFolders,
  );

  let transactions = applyPreauthNettingStep(classified.next, input.bankLedgerRules);
  let folders = classified.folders;
  let rules = [...input.bankLedgerRules];
  let payments = [...input.fixedExpensePayments];
  let expenses = [...input.companyExpenses];
  let categories = [...input.expenseCategories];

  const folderOnlyKinds = input.skipLedgerRegistration ? (["folder"] as const) : undefined;
  const learnPass = autoApplyBankLearnRules(
    transactions,
    payments,
    expenses,
    rules,
    input.fixedExpenses,
    {
      createdBy: input.createdBy,
      onlyTransactionIds: input.onlyTransactionIds,
      workers: input.workers,
      bankTransactionFolders: folders,
      applyKinds: folderOnlyKinds ? [...folderOnlyKinds] : undefined,
    },
  );

  if (learnPass.allPayments) payments = learnPass.allPayments;
  else if (learnPass.newPayments.length) payments = [...learnPass.newPayments, ...payments];
  if (learnPass.newExpenses.length) expenses = [...learnPass.newExpenses, ...expenses];
  transactions = learnPass.transactions;

  let heuristicRegistered = 0;
  let llmRegistered = 0;
  if (!input.skipLedgerRegistration) {
    const heuristicPass = applyHeuristicLearnRules(
      transactions,
      payments,
      expenses,
      rules,
      { ...input, bankTransactionFolders: folders },
      new Map(),
    );
    transactions = heuristicPass.transactions;
    payments = heuristicPass.payments;
    expenses = heuristicPass.expenses;
    rules = heuristicPass.rules;
    heuristicRegistered = heuristicPass.heuristicRegistered;
    llmRegistered = heuristicPass.llmRegistered;
  }

  const pending = countPendingSmartLedger(transactions, {
    companyExpenses: expenses,
    fixedExpensePayments: payments,
    rules,
    fixedExpenses: input.fixedExpenses,
    expenseCategories: categories,
    workers: input.workers,
    clients: input.clients,
  });

  const summary: SmartLedgerRunSummary = {
    at: new Date().toISOString(),
    classifiedFolders: classified.updated,
    learnFixed: input.skipLedgerRegistration ? 0 : learnPass.fixedCount,
    learnManual: input.skipLedgerRegistration ? 0 : learnPass.manualCount,
    learnFolder: learnPass.folderCount,
    heuristicRegistered,
    llmRegistered,
    pendingSuggestions: pending.withSuggestion,
  };
  saveSmartLedgerRunSummary(summary);

  return {
    bankTransactions: transactions,
    bankTransactionFolders: folders,
    fixedExpensePayments: payments,
    companyExpenses: expenses,
    bankLedgerRules: rules,
    expenseCategories: categories,
    classifiedFolders: classified.updated,
    learnFixed: input.skipLedgerRegistration ? 0 : learnPass.fixedCount,
    learnManual: input.skipLedgerRegistration ? 0 : learnPass.manualCount,
    learnFolder: learnPass.folderCount,
    heuristicRegistered,
    llmRegistered,
    pendingSuggestions: pending.withSuggestion,
  };
}

export async function runSmartAutoLedger(input: RunSmartAutoLedgerInput): Promise<RunSmartAutoLedgerResult> {
  const classified = autoClassifyBankTransactions(
    input.bankTransactions,
    input.clients,
    input.workers,
    input.bankTransactionFolders,
  );

  let transactions = applyPreauthNettingStep(classified.next, input.bankLedgerRules);
  let folders = classified.folders;
  let rules = [...input.bankLedgerRules];
  let payments = [...input.fixedExpensePayments];
  let expenses = [...input.companyExpenses];
  let categories = [...input.expenseCategories];

  const folderOnlyKinds = input.skipLedgerRegistration ? (["folder"] as const) : undefined;
  const learnPass = autoApplyBankLearnRules(
    transactions,
    payments,
    expenses,
    rules,
    input.fixedExpenses,
    {
      createdBy: input.createdBy,
      onlyTransactionIds: input.onlyTransactionIds,
      workers: input.workers,
      bankTransactionFolders: folders,
      applyKinds: folderOnlyKinds ? [...folderOnlyKinds] : undefined,
    },
  );

  if (learnPass.allPayments) payments = learnPass.allPayments;
  else if (learnPass.newPayments.length) payments = [...learnPass.newPayments, ...payments];
  if (learnPass.newExpenses.length) expenses = [...learnPass.newExpenses, ...expenses];
  transactions = learnPass.transactions;

  let heuristicRegistered = 0;
  let llmRegistered = 0;
  if (!input.skipLedgerRegistration) {
    let llmMap = new Map<string, BankLedgerClassification>();
    if (input.useLlm !== false) {
      const eligibleTxs = transactions.filter((tx) => {
        if (input.onlyTransactionIds && !input.onlyTransactionIds.has(tx.id)) return false;
        return canRegisterBankTxToCompanyLedger(tx, {
          companyExpenses: expenses,
          fixedExpensePayments: payments,
        });
      });
      if (eligibleTxs.length) {
        llmMap = await fetchBankLedgerClassifications(eligibleTxs, {
          expenseCategories: categories,
          fixedExpenses: input.fixedExpenses,
        });
      }
    }

    const heuristicPass = applyHeuristicLearnRules(
      transactions,
      payments,
      expenses,
      rules,
      { ...input, bankTransactionFolders: folders, expenseCategories: categories },
      llmMap,
    );
    transactions = heuristicPass.transactions;
    payments = heuristicPass.payments;
    expenses = heuristicPass.expenses;
    rules = heuristicPass.rules;
    heuristicRegistered = heuristicPass.heuristicRegistered;
    llmRegistered = heuristicPass.llmRegistered;
  }

  const pending = countPendingSmartLedger(transactions, {
    companyExpenses: expenses,
    fixedExpensePayments: payments,
    rules,
    fixedExpenses: input.fixedExpenses,
    expenseCategories: categories,
    workers: input.workers,
    clients: input.clients,
  });

  const summary: SmartLedgerRunSummary = {
    at: new Date().toISOString(),
    classifiedFolders: classified.updated,
    learnFixed: input.skipLedgerRegistration ? 0 : learnPass.fixedCount,
    learnManual: input.skipLedgerRegistration ? 0 : learnPass.manualCount,
    learnFolder: learnPass.folderCount,
    heuristicRegistered,
    llmRegistered,
    pendingSuggestions: pending.withSuggestion,
  };
  saveSmartLedgerRunSummary(summary);

  return {
    bankTransactions: transactions,
    bankTransactionFolders: folders,
    fixedExpensePayments: payments,
    companyExpenses: expenses,
    bankLedgerRules: rules,
    expenseCategories: categories,
    classifiedFolders: classified.updated,
    learnFixed: input.skipLedgerRegistration ? 0 : learnPass.fixedCount,
    learnManual: input.skipLedgerRegistration ? 0 : learnPass.manualCount,
    learnFolder: learnPass.folderCount,
    heuristicRegistered,
    llmRegistered,
    pendingSuggestions: pending.withSuggestion,
  };
}

export function formatSmartLedgerRunMessage(
  result: Pick<
    RunSmartAutoLedgerResult,
    | "classifiedFolders"
    | "learnFixed"
    | "learnManual"
    | "learnFolder"
    | "heuristicRegistered"
    | "llmRegistered"
    | "pendingSuggestions"
  >,
) {
  const parts: string[] = [];
  if (result.classifiedFolders > 0) parts.push(`\uD3F4\uB354 \uBD84\uB958 ${result.classifiedFolders}\uAC74`);
  if (result.learnFixed > 0) parts.push(`\uD559\uC2B5\u00B7\uACE0\uC815\uBE44 ${result.learnFixed}\uAC74`);
  if (result.learnManual > 0) parts.push(`\uD559\uC2B5\u00B7\uC9C0\uCD9C ${result.learnManual}\uAC74`);
  if (result.learnFolder > 0) parts.push(`\uD559\uC2B5\u00B7\uD3F4\uB354 ${result.learnFolder}\uAC74`);
  if (result.heuristicRegistered > 0) parts.push(`AI \uCD94\uC815 \uB4F1\uB85D ${result.heuristicRegistered}\uAC74`);
  if (result.llmRegistered > 0) parts.push(`LLM \uB4F1\uB85D ${result.llmRegistered}\uAC74`);
  if (!parts.length) return "\uC790\uB3D9 \uCC98\uB9AC\uD560 \uC0C8 \uCD9C\uAE08 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.";
  const hint =
    result.pendingSuggestions > 0
      ? ` \u00B7 \uD655\uC778 \uD544\uC694 ${result.pendingSuggestions}\uAC74`
      : "";
  return `${parts.join(", ")} \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4.${hint}`;
}
