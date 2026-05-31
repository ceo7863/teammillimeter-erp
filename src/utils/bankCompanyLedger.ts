import { isCheckCardBankTransaction, type BankTransaction } from "./bankTransactions";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "./companyLedger";
import { canAssignBankTransactionToFolder, syncLedgerLinkedBankTransactionFolders, type BankTransactionFolder } from "./bankTransactionFolders";
import type { WorkerDepositMatchSource } from "./clientDepositAliases";
import { isNetGroupSuppressed } from "./bankPreauthNetting";
import { filterBankLearnDescriptionTokens, isBankLearnStopToken } from "./bankLearnTokens";
import {
  EXPENSE_CATEGORY_OPTIONS,
  bankTransactionMatchesFixedPayment,
  findLinkableFixedExpensePayment,
  getMonthKey,
  linkFixedExpensePaymentToBankTx,
  makeLedgerId,
  normalizeExpenseCategoryName,
  parseLedgerAmount,
  areRecurringAmountsCompatible,
  resolveCompanyExpenseKind,
  resolveCompanyExpenseFlow,
  resolveFixedExpenseIdForBankTransaction,
} from "./companyLedger";

export type LedgerTargetKind = "manual" | "fixed";

export type ParsedLedgerTarget = {
  kind: LedgerTargetKind;
  category?: string;
  fixedExpenseId?: string;
};

export type BankLearnRuleKind = "fixed" | "manual" | "folder" | "preauth_net";

export type BankLearnRule = {
  id: string;
  kind: BankLearnRuleKind;
  fixedExpenseId?: string;
  category?: string;
  folderId?: string;
  counterpartyName?: string;
  descriptionTokens: string[];
  /** ??? ?? ? ?? ???. ?? ?? ??? ?? ?? */
  amount?: number;
  createdAt: string;
  createdBy?: string;
  sourceBankTransactionId?: string;
};

/** @deprecated Use BankLearnRule with kind "fixed" */
export type BankLedgerMatchRule = BankLearnRule & { kind: "fixed"; fixedExpenseId: string };

export const AUTO_LEARN_MIN_SCORE = 5;
export const FIXED_AUTO_LEARN_MIN_SCORE = 12;
export const AUTO_LEARN_HIGH_CONFIDENCE_SCORE = 16;
/** Minimum match confidence (percent) required to register a bank withdrawal to company ledger. */
export const LEDGER_REGISTRATION_MIN_CONFIDENCE_PERCENT = 90;

export type BankLedgerRegistrationContext = {
  companyExpenses?: CompanyExpense[];
  fixedExpensePayments?: FixedExpensePayment[];
};

export function getLinkedCompanyExpenseForBankTx(
  tx: BankTransaction,
  expenses: CompanyExpense[] = [],
) {
  if (tx.linkedCompanyExpenseId) {
    const linked = expenses.find((row) => row.id === tx.linkedCompanyExpenseId);
    if (linked) return linked;
  }
  return expenses.find((row) => row.bankTransactionId === tx.id);
}

export function getLinkedFixedPaymentForBankTx(
  tx: BankTransaction,
  payments: FixedExpensePayment[] = [],
) {
  if (tx.linkedFixedExpensePaymentId) {
    const linked = payments.find((row) => row.id === tx.linkedFixedExpensePaymentId);
    if (linked) return linked;
  }
  return payments.find((row) => row.bankTransactionId === tx.id);
}

export function releaseFixedExpensePaymentBankLink(
  payments: FixedExpensePayment[],
  paymentId: string,
  bankTransactionId: string,
) {
  return payments.map((row) => {
    if (row.id !== paymentId) return row;
    if (String(row.bankTransactionId || "") !== bankTransactionId) return row;
    return { ...row, bankTransactionId: undefined };
  });
}

function hasConflictingSiblingFixedExpenseLink(
  tx: BankTransaction,
  fixedExpenseId: string,
  transactions: BankTransaction[],
  payments: FixedExpensePayment[],
  expenses: CompanyExpense[] = [],
) {
  const monthKey = getMonthKey(String(tx.transactionAt || "").slice(0, 10));
  const counterpartyKey = normalizeMatchText(tx.counterpartyName || "");
  const amount = Number(tx.withdrawal || 0);
  if (!monthKey || !counterpartyKey || amount <= 0) return false;

  return transactions.some((other) => {
    if (other.id === tx.id) return false;
    if (getMonthKey(String(other.transactionAt || "").slice(0, 10)) !== monthKey) return false;
    if (normalizeMatchText(other.counterpartyName || "") !== counterpartyKey) return false;
    if (Number(other.withdrawal || 0) !== amount) return false;
    const otherPayment = getLinkedFixedPaymentForBankTx(other, payments);
    if (!otherPayment) return false;
    return otherPayment.fixedExpenseId !== fixedExpenseId;
  });
}

/** Assign one bank tx to a fixed expense payment without mutating another tx's link. */
export function assignBankTxToFixedExpensePayment(input: {
  tx: BankTransaction;
  resolvedFixedExpenseId: string;
  fixedItem: FixedExpense;
  payments: FixedExpensePayment[];
  fixedExpenses: FixedExpense[];
  resolvedCategory: string;
  memo?: string;
  savedBy?: string;
}) {
  const currentPayment = getLinkedFixedPaymentForBankTx(input.tx, input.payments);
  let payments = input.payments;
  const changedFixedItem = Boolean(
    currentPayment && currentPayment.fixedExpenseId !== input.resolvedFixedExpenseId,
  );

  if (currentPayment && !changedFixedItem) {
    const afterPayment = {
      ...currentPayment,
      category: input.resolvedCategory || input.fixedItem.category || currentPayment.category,
      bankTransactionId: input.tx.id,
    };
    return {
      payments: payments.map((row) => (row.id === currentPayment.id ? afterPayment : row)),
      paymentId: currentPayment.id,
      beforePayment: currentPayment,
      afterPayment,
      created: false,
      changedFixedItem: false,
    };
  }

  if (currentPayment && changedFixedItem) {
    payments = releaseFixedExpensePaymentBankLink(payments, currentPayment.id, input.tx.id);
  }

  if (Number(input.tx.withdrawal || 0) <= 0) {
    return {
      payments,
      paymentId: "",
      beforePayment: currentPayment || null,
      afterPayment: null,
      created: false,
      changedFixedItem,
    };
  }

  const targetLinkable = findLinkableFixedExpensePayment(
    input.tx,
    input.resolvedFixedExpenseId,
    payments,
    input.fixedExpenses,
  );
  if (targetLinkable) {
    const afterPayment = {
      ...targetLinkable,
      fixedExpenseId: input.resolvedFixedExpenseId,
      category: input.resolvedCategory || input.fixedItem.category || targetLinkable.category,
    };
    payments = linkFixedExpensePaymentToBankTx(
      payments.map((row) => (row.id === targetLinkable.id ? afterPayment : row)),
      targetLinkable.id,
      input.tx.id,
      input.tx,
    );
    return {
      payments,
      paymentId: targetLinkable.id,
      beforePayment: currentPayment || null,
      afterPayment: payments.find((row) => row.id === targetLinkable.id) || afterPayment,
      created: false,
      changedFixedItem,
    };
  }

  const paymentId = makeLedgerId();
  const prefill = buildCompanyExpensePrefillFromBankTransaction(input.tx);
  const createdPayment: FixedExpensePayment = {
    id: paymentId,
    fixedExpenseId: input.resolvedFixedExpenseId,
    date: prefill.date,
    amount: parseLedgerAmount(prefill.amount),
    memo: input.memo || prefill.memo || input.fixedItem.name || prefill.description,
    category: input.resolvedCategory || undefined,
    bankTransactionId: input.tx.id,
    createdBy: input.savedBy,
    createdAt: new Date().toISOString(),
  };
  return {
    payments: [createdPayment, ...payments],
    paymentId,
    beforePayment: currentPayment || null,
    afterPayment: createdPayment,
    created: true,
    changedFixedItem,
  };
}

export function isBankTransactionLinkedToCompanyLedger(
  tx: BankTransaction,
  context: BankLedgerRegistrationContext = {},
) {
  return Boolean(
    getLinkedCompanyExpenseForBankTx(tx, context.companyExpenses) ||
      getLinkedFixedPaymentForBankTx(tx, context.fixedExpensePayments),
  );
}

/** 미분류 목록·집계용 — folderId 없고 가계부·고정비 연결도 없을 때만 true */
export function isBankTransactionUnfiled(
  tx: BankTransaction,
  context: BankLedgerRegistrationContext = {},
) {
  if (tx.folderId) return false;
  return !isBankTransactionLinkedToCompanyLedger(tx, context);
}

export function isBankTransactionLinkedToVariableExpenseOnly(
  tx: BankTransaction,
  context: BankLedgerRegistrationContext = {},
) {
  if (getLinkedFixedPaymentForBankTx(tx, context.fixedExpensePayments)) return false;
  const expense = getLinkedCompanyExpenseForBankTx(tx, context.companyExpenses);
  if (!expense) return false;
  return resolveCompanyExpenseKind(expense) === "variable";
}

export function clearVariableExpenseLinkForBankTx(
  txId: string,
  expenses: CompanyExpense[],
  transactions: BankTransaction[],
) {
  const tx = transactions.find((row) => row.id === txId);
  const linkedExpense =
    (tx?.linkedCompanyExpenseId
      ? expenses.find((row) => row.id === tx.linkedCompanyExpenseId)
      : undefined) || expenses.find((row) => row.bankTransactionId === txId);

  if (!linkedExpense || resolveCompanyExpenseKind(linkedExpense) !== "variable") {
    return { expenses, transactions, removedExpense: null as CompanyExpense | null };
  }

  const nextExpenses = expenses.filter((row) => row.id !== linkedExpense.id);
  const nextTransactions = transactions.map((row) =>
    row.id === txId || row.linkedCompanyExpenseId === linkedExpense.id
      ? { ...row, linkedCompanyExpenseId: undefined }
      : row,
  );

  return { expenses: nextExpenses, transactions: nextTransactions, removedExpense: linkedExpense };
}

/** Align tx.linked* fields with ledger rows matched by bankTransactionId. */
export function syncBankTransactionLedgerLinkFields(
  transactions: BankTransaction[],
  expenses: CompanyExpense[] = [],
  payments: FixedExpensePayment[] = [],
) {
  return transactions.map((tx) => {
    const expense = expenses.find((row) => row.bankTransactionId === tx.id);
    const payment = payments.find((row) => row.bankTransactionId === tx.id);

    if (payment) {
      return {
        ...tx,
        linkedFixedExpensePaymentId: payment.id,
        linkedCompanyExpenseId: undefined,
      };
    }

    if (expense) {
      return {
        ...tx,
        linkedCompanyExpenseId: expense.id,
        linkedFixedExpensePaymentId: undefined,
      };
    }

    const linkedExpense = tx.linkedCompanyExpenseId
      ? expenses.find((row) => row.id === tx.linkedCompanyExpenseId)
      : undefined;
    const linkedPayment = tx.linkedFixedExpensePaymentId
      ? payments.find((row) => row.id === tx.linkedFixedExpensePaymentId)
      : undefined;

    return {
      ...tx,
      linkedCompanyExpenseId: linkedExpense?.id,
      linkedFixedExpensePaymentId: linkedPayment?.id,
    };
  });
}

export function canRegisterBankTxToCompanyLedger(
  tx: BankTransaction,
  context: BankLedgerRegistrationContext = {},
  options: { allowVariableLinked?: boolean } = {},
) {
  if (isNetGroupSuppressed(tx)) return false;
  if (tx.folderId || resolveBankTxLedgerAmount(tx) <= 0) return false;
  if (options.allowVariableLinked && isBankTransactionLinkedToVariableExpenseOnly(tx, context)) {
    return true;
  }
  return !isBankTransactionLinkedToCompanyLedger(tx, context);
}

export function listBankTransactionsForLedgerLink(
  transactions: BankTransaction[],
  context: BankLedgerRegistrationContext = {},
  options: { excludePaymentId?: string; includeVariableLinked?: boolean } = {},
) {
  const payments = (context.fixedExpensePayments || []).filter(
    (row) => !options.excludePaymentId || row.id !== options.excludePaymentId,
  );
  const registrationOptions = options.includeVariableLinked ? { allowVariableLinked: true } : {};

  return transactions
    .filter((tx) =>
      canRegisterBankTxToCompanyLedger(
        tx,
        { ...context, fixedExpensePayments: payments },
        registrationOptions,
      ),
    )
    .sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt)));
}

export function buildBankTransactionLinkSearchHaystack(tx: BankTransaction) {
  return [tx.counterpartyName, tx.description, tx.memo, String(tx.withdrawal || tx.deposit || "")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function extractBankTransactionLinkFingerprints(tx: BankTransaction) {
  const fingerprints = new Set(extractBankTransactionMerchantFingerprints(tx));
  for (const part of [tx.memo]) {
    const text = String(part || "").trim();
    if (!text) continue;
    const normalized = normalizeMerchantFingerprint(text);
    if (normalized.length >= 2 && !isBankLearnStopToken(normalized)) {
      fingerprints.add(normalized);
    }
    for (const token of text.split(/[\s/.,\-_()·]+/)) {
      const key = normalizeMerchantFingerprint(token);
      if (key.length >= 2 && !isBankLearnStopToken(key)) fingerprints.add(key);
    }
  }
  return [...fingerprints];
}

export function mergeBankTransactionsById(...lists: BankTransaction[][]) {
  const seen = new Set<string>();
  const merged: BankTransaction[] = [];
  for (const list of lists) {
    for (const tx of list) {
      if (seen.has(tx.id)) continue;
      seen.add(tx.id);
      merged.push(tx);
    }
  }
  return merged;
}

export function searchBankTransactionsForLedgerLink(
  transactions: BankTransaction[],
  context: BankLedgerRegistrationContext = {},
  options: {
    excludePaymentId?: string;
    includeVariableLinked?: boolean;
    monthKey?: string;
    keyword: string;
  },
) {
  const keyword = String(options.keyword || "").trim().toLowerCase();
  if (!keyword) return [];

  const { excludePaymentId, includeVariableLinked, monthKey } = options;
  return listBankTransactionsForLedgerLink(transactions, context, {
    excludePaymentId,
    includeVariableLinked,
  })
    .filter((tx) => {
      if (monthKey && getMonthKey(String(tx.transactionAt || "").slice(0, 10)) !== monthKey) {
        return false;
      }
      const haystacks = [buildBankTransactionLinkSearchHaystack(tx)];
      const linkedExpense = getLinkedCompanyExpenseForBankTx(tx, context.companyExpenses);
      if (linkedExpense) {
        haystacks.push(buildCompanyExpenseLinkSearchHaystack(linkedExpense));
      }
      return haystacks.some((haystack) => haystack.includes(keyword));
    })
    .sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt)));
}

export function bankTransactionMatchesLedgerLinkName(referenceLabel: string, tx: BankTransaction) {
  const label = String(referenceLabel || "").trim();
  if (label.length < 2) return true;
  const referenceLike = { counterpartyName: label, description: label } as BankTransaction;
  return merchantFingerprintsOverlap(
    extractBankTransactionMerchantFingerprints(referenceLike),
    extractBankTransactionLinkFingerprints(tx),
  );
}

export function buildCompanyExpenseLinkSearchHaystack(expense: CompanyExpense) {
  return [expense.description, expense.category, expense.memo, String(expense.amount || "")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function bankTransactionMatchesFixedPaymentCategoryOrMemo(
  tx: BankTransaction,
  fixedItem: FixedExpense | undefined,
  linkedExpense: CompanyExpense | undefined,
) {
  const txHaystack = buildBankTransactionLinkSearchHaystack(tx);
  const tokens = [fixedItem?.category, fixedItem?.name, linkedExpense?.category]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter((value) => value.length >= 2);
  return tokens.some((token) => txHaystack.includes(token));
}

export function bankTransactionMatchesFixedPaymentForLink(
  tx: BankTransaction,
  payment: FixedExpensePayment,
  fixedExpenses: FixedExpense[] = [],
  context: BankLedgerRegistrationContext = {},
) {
  const txMonth = getMonthKey(String(tx.transactionAt || "").slice(0, 10));
  const paymentMonth = getMonthKey(payment.date);
  if (!txMonth || txMonth !== paymentMonth) return false;
  if (!(Number(tx.withdrawal) > 0)) return false;

  const fixedItem = fixedExpenses.find((row) => row.id === payment.fixedExpenseId);
  const linkedExpense = getLinkedCompanyExpenseForBankTx(tx, context.companyExpenses);

  if (
    linkedExpense &&
    resolveCompanyExpenseKind(linkedExpense) === "variable" &&
    fixedItem?.category &&
    linkedExpense.category === fixedItem.category
  ) {
    return true;
  }

  if (bankTransactionMatchesFixedPaymentCategoryOrMemo(tx, fixedItem, linkedExpense)) {
    return true;
  }

  if (
    linkedExpense &&
    resolveCompanyExpenseKind(linkedExpense) === "variable" &&
    Number(linkedExpense.amount) === Number(tx.withdrawal || 0) &&
    getMonthKey(linkedExpense.date) === txMonth
  ) {
    return true;
  }

  if (!bankTransactionMatchesFixedPayment(tx, payment, fixedExpenses)) return false;

  const labels = [fixedItem?.name || "", fixedItem?.category || "", payment.memo || ""];
  if (linkedExpense) {
    labels.push(
      linkedExpense.description || "",
      linkedExpense.category || "",
      linkedExpense.memo || "",
    );
  }
  return labels.some((label) => bankTransactionMatchesLedgerLinkName(label, tx));
}

function bankTransactionMatchesCompanyExpenseAmount(
  tx: BankTransaction,
  expense: CompanyExpense,
) {
  const monthKey = getMonthKey(String(tx.transactionAt || "").slice(0, 10));
  if (!monthKey || getMonthKey(expense.date) !== monthKey) return false;
  const txAmount = resolveBankTxLedgerAmount(tx);
  const amount = Number(expense.amount || 0);
  if (txAmount <= 0 || amount <= 0) return false;
  if (resolveCompanyExpenseFlow(expense) === "income" && Number(tx.deposit || 0) <= 0) return false;
  if (resolveCompanyExpenseFlow(expense) === "expense" && Number(tx.withdrawal || 0) <= 0) return false;
  if (txAmount === amount) return true;
  return areRecurringAmountsCompatible(amount, txAmount);
}

export function bankTransactionMatchesCompanyExpenseForLink(
  tx: BankTransaction,
  expense: CompanyExpense,
) {
  if (!bankTransactionMatchesCompanyExpenseAmount(tx, expense)) return false;
  const labels = [expense.description || "", expense.category || "", expense.memo || ""];
  return labels.some((label) => bankTransactionMatchesLedgerLinkName(label, tx));
}

/** Bank withdrawals that match a fixed payment (same month, similar amount, similar name). */
export function listBankTransactionsForFixedPaymentLink(
  payment: FixedExpensePayment,
  transactions: BankTransaction[],
  context: BankLedgerRegistrationContext = {},
  fixedExpenses: FixedExpense[] = [],
  options: { excludePaymentId?: string; includeVariableLinked?: boolean } = {},
) {
  const { excludePaymentId, includeVariableLinked } = options;
  return listBankTransactionsForLedgerLink(
    transactions,
    context,
    {
      excludePaymentId,
      includeVariableLinked,
    },
  )
    .filter((tx) => bankTransactionMatchesFixedPaymentForLink(tx, payment, fixedExpenses, context))
    .sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt)));
}

/** Bank withdrawals that match a company expense (same month, similar amount, similar name). */
export function listBankTransactionsForCompanyExpenseLink(
  expense: CompanyExpense,
  transactions: BankTransaction[],
  context: BankLedgerRegistrationContext = {},
  options: { excludeExpenseId?: string } = {},
) {
  const expenses = (context.companyExpenses || []).filter(
    (row) => !options.excludeExpenseId || row.id !== options.excludeExpenseId,
  );

  return listBankTransactionsForLedgerLink(transactions, { ...context, companyExpenses: expenses })
    .filter((tx) => bankTransactionMatchesCompanyExpenseForLink(tx, expense))
    .sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt)));
}

export function manualLedgerTargetKey(category: string) {
  return `manual:${category}`;
}

export function fixedLedgerTargetKey(fixedExpenseId: string) {
  return `fixed:${fixedExpenseId}`;
}

export function parseLedgerTargetKey(key: string): ParsedLedgerTarget | null {
  const text = String(key || "").trim();
  if (text.startsWith("manual:")) {
    const category = text.slice("manual:".length);
    if (!category) return null;
    return { kind: "manual", category };
  }
  if (text.startsWith("fixed:")) {
    const fixedExpenseId = text.slice("fixed:".length);
    if (!fixedExpenseId) return null;
    return { kind: "fixed", fixedExpenseId };
  }
  return null;
}

export function buildLedgerTargetOptions(
  fixedExpenses: FixedExpense[] = [],
  expenseCategories: string[] = EXPENSE_CATEGORY_OPTIONS,
) {
  const manualOptions = expenseCategories.map((category) => ({
    value: manualLedgerTargetKey(category),
    label: `[\uC9C0\uCD9C] ${category}`,
    raw: { kind: "manual" as const, category },
  }));
  const fixedOptions = fixedExpenses
    .filter((row) => row.isActive)
    .map((row) => ({
      value: fixedLedgerTargetKey(row.id),
      label: `[\uACE0\uC815\uBE44] ${row.name} \u00B7 ${row.category}`,
      raw: { kind: "fixed" as const, fixedExpense: row },
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));
  return [...manualOptions, ...fixedOptions];
}

export function getLedgerTargetLabel(key: string, fixedExpenses: FixedExpense[] = []) {
  const parsed = parseLedgerTargetKey(key);
  if (!parsed) return String(key || "");
  if (parsed.kind === "manual" && parsed.category) {
    return `[\uC9C0\uCD9C] ${parsed.category}`;
  }
  if (parsed.kind === "fixed" && parsed.fixedExpenseId) {
    const item = fixedExpenses.find((row) => row.id === parsed.fixedExpenseId);
    if (item) return `[\uACE0\uC815\uBE44] ${item.name} \u00B7 ${item.category}`;
    return `[\uACE0\uC815\uBE44] ${parsed.fixedExpenseId}`;
  }
  return String(key || "");
}

export function guessExpenseCategory(text: string) {
  const haystack = String(text || "").toLowerCase();
  const rules: Array<[string, string[]]> = [
    ["\uAD50\uD86D/\uC8FC\uCC28", ["\uC8FC\uCC28", "\uD86D", "\uACE0\uC18D", "\uD0DD\uC2DC", "\uC8FC\uC720", "\uAE30\uB984", "\uAE30\uC0B0"]],
    ["\uC811\uB300/\uC2DD\uBE44", ["\uC2DD", "\uC2DD\uB300", "\uC2DD\uBE44", "\uC74C\uC2DD", "\uCE74\uD398", "\uCEE4\uD53C", "\uC811\uB300", "\uC2DD\uC0AC"]],
    ["\uD1B5\uC2E0\uBE44", ["\uD1B5\uC2E0", "kt", "skt", "lgu", "\uC778\uD130\uB137", "\uD578\uB4DC\uD3F0"]],
    ["\uC18C\uBAA8\uD488", ["\uC18C\uBAA8", "\uC815\uAE30", "\uBE44\uC2DD", "\uACF5\uACFC"]],
    ["\uC0AC\uBB34\uC6A9\uD488", ["\uC0AC\uBB34", "\uBB38\uAD6C", "\uC6A9\uC9C0", "\uD504\uB9B0\uD130"]],
    ["\uB9C8\uCF00\uD305", ["\uAD11\uACE0", "\uB9C8\uCF00\uD305", "\uD658\uC601"]],
    ["\uBC29\uBB38/\uC678\uBD80", ["\uBC29\uBB38", "\uC678\uBD80", "\uCD9C\uC7A5"]],
  ];

  for (const [category, keywords] of rules) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return category;
  }
  return "\uAE30\uD0C0";
}

export function normalizeBankLedgerMatchText(text: string) {
  return String(text || "").toLowerCase().replace(/\s+/g, "");
}

function normalizeMatchText(text: string) {
  return normalizeBankLedgerMatchText(text);
}

function tokenizeBankLedgerText(...parts: Array<string | undefined>) {
  const tokens = new Set<string>();
  for (const part of parts) {
    for (const token of String(part || "")
      .split(/[\s/.,\-_]+/)
      .map((item) => normalizeMatchText(item))
      .filter((item) => item.length >= 2)) {
      if (!isBankLearnStopToken(token)) tokens.add(token);
    }
  }
  return filterBankLearnDescriptionTokens([...tokens]);
}

function sanitizeLearnRuleRow(rule: BankLearnRule): BankLearnRule {
  return {
    ...rule,
    descriptionTokens: filterBankLearnDescriptionTokens(rule.descriptionTokens || []),
  };
}

function inferLearnRuleKind(raw: Partial<BankLearnRule>): BankLearnRuleKind {
  if (raw.kind === "fixed" || raw.kind === "manual" || raw.kind === "folder" || raw.kind === "preauth_net") {
    return raw.kind;
  }
  if (raw.folderId) return "folder";
  if (raw.category && !raw.fixedExpenseId) return "manual";
  return "fixed";
}

export function normalizeBankLearnRules(rows: unknown[]): BankLearnRule[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === "object" && "id" in row)
    .map((row) => {
      const raw = row as Partial<BankLearnRule> & { fixedExpenseId?: string };
      const kind = inferLearnRuleKind(raw);
      const counterpartyName = String(raw.counterpartyName || "").trim();
      const category =
        kind === "manual"
          ? normalizeExpenseCategoryName(String(raw.category || "").trim())
          : String(raw.category || "").trim();
      const fixedExpenseId = String(raw.fixedExpenseId || "").trim();
      const folderId = String(raw.folderId || "").trim();
      const amount = Number(raw.amount);

      return {
        id: String(raw.id),
        kind,
        fixedExpenseId: kind === "fixed" && fixedExpenseId ? fixedExpenseId : undefined,
        category: kind === "manual" && category ? category : undefined,
        folderId: kind === "folder" && folderId ? folderId : undefined,
        counterpartyName: counterpartyName || undefined,
        descriptionTokens: Array.isArray(raw.descriptionTokens)
          ? raw.descriptionTokens.map((token) => String(token)).filter(Boolean)
          : [],
        amount:
          Number.isFinite(amount) && amount > 0
            ? kind === "fixed" || kind === "manual"
              ? amount
              : undefined
            : undefined,
        createdAt: String(raw.createdAt || new Date().toISOString()),
        createdBy: raw.createdBy ? String(raw.createdBy) : undefined,
        sourceBankTransactionId: raw.sourceBankTransactionId ? String(raw.sourceBankTransactionId) : undefined,
      };
    })
    .map(sanitizeLearnRuleRow)
    .filter((rule) => {
      if (rule.kind === "fixed") return Boolean(rule.fixedExpenseId);
      if (rule.kind === "manual") return Boolean(rule.category);
      if (rule.kind === "folder") return Boolean(rule.folderId);
      if (rule.kind === "preauth_net") {
        return Boolean(rule.counterpartyName) || rule.descriptionTokens.length > 0;
      }
      return false;
    });
}

/** @deprecated Use normalizeBankLearnRules */
export function normalizeBankLedgerMatchRules(rows: unknown[]): BankLearnRule[] {
  return normalizeBankLearnRules(rows);
}

function buildLearnRuleBase(tx: BankTransaction, createdBy?: string): Pick<BankLearnRule, "counterpartyName" | "descriptionTokens" | "createdAt" | "createdBy" | "sourceBankTransactionId"> {
  const counterpartyName = String(tx.counterpartyName || "").trim();
  const descriptionTokens = tokenizeBankLedgerText(tx.description, tx.memo, counterpartyName);

  return {
    counterpartyName: counterpartyName || undefined,
    descriptionTokens,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || undefined,
    sourceBankTransactionId: tx.id,
  };
}

export function buildBankLedgerMatchRuleFromRegistration(
  tx: BankTransaction,
  fixedExpenseId: string,
  createdBy?: string,
  amount?: number | null,
): BankLearnRule {
  const resolvedAmount = amount === null ? 0 : Number(amount ?? tx.withdrawal ?? 0);
  return {
    id: makeLedgerId(),
    kind: "fixed",
    fixedExpenseId,
    amount: resolvedAmount > 0 ? resolvedAmount : undefined,
    ...buildLearnRuleBase(tx, createdBy),
  };
}

export function buildBankLearnRuleFromFixedRegistration(
  tx: BankTransaction,
  category: string,
  createdBy?: string,
): BankLearnRule {
  return {
    id: makeLedgerId(),
    kind: "fixed",
    category,
    ...buildLearnRuleBase(tx, createdBy),
  };
}
export function buildBankLearnRuleFromManualRegistration(
  tx: BankTransaction,
  category: string,
  createdBy?: string,
): BankLearnRule {
  return {
    id: makeLedgerId(),
    kind: "manual",
    category,
    ...buildLearnRuleBase(tx, createdBy),
  };
}

/** 메모에 적은 카테고리 힌트(예: 식대)로 같은 거래처·거래내용 출금에 적용할 학습 규칙 */
export function buildBankLearnRuleFromMemoCategory(
  tx: BankTransaction,
  category: string,
  createdBy?: string,
): BankLearnRule {
  const normalizedCategory = normalizeExpenseCategoryName(category);
  const counterpartyName = String(tx.counterpartyName || "").trim() || undefined;
  const merchantLabel = String(tx.counterpartyName || tx.description || "").trim();
  const withdrawal = Number(tx.withdrawal || 0);
  return {
    id: makeLedgerId(),
    kind: "manual",
    category: normalizedCategory,
    counterpartyName,
    amount:
      isMemoLearnAmountFlexibleCategory(normalizedCategory) || withdrawal <= 0
        ? undefined
        : withdrawal,
    descriptionTokens: filterBankLearnDescriptionTokens([
      merchantLabel,
      ...extractBankTransactionMerchantFingerprints(tx),
      ...extractMemoLearnDomainTokens(tx, category),
      ...tokenizeBankLedgerText(tx.description, undefined, counterpartyName),
    ]),
    createdAt: new Date().toISOString(),
    createdBy: createdBy || undefined,
    sourceBankTransactionId: tx.id,
  };
}

export function resolveBankTransactionMerchantKey(tx: BankTransaction) {
  const counterparty = normalizeMatchText(tx.counterpartyName || "");
  if (counterparty.length >= 2) return counterparty;
  return normalizeMatchText(tx.description || "");
}

const MERCHANT_CORPORATE_SUFFIX_PATTERN = /(\(주\)|\(유\)|주식회사|㈜|유한회사|co\.?ltd|corp|inc)/gi;

function normalizeMerchantFingerprint(text: string) {
  let normalized = normalizeMatchText(text).replace(MERCHANT_CORPORATE_SUFFIX_PATTERN, "");
  return normalized.trim();
}

export function extractBankTransactionMerchantFingerprints(tx: BankTransaction) {
  const fingerprints = new Set<string>();
  for (const part of [tx.counterpartyName, tx.description]) {
    const text = String(part || "").trim();
    if (!text) continue;
    const normalized = normalizeMerchantFingerprint(text);
    if (normalized.length >= 2 && !isBankLearnStopToken(normalized)) {
      fingerprints.add(normalized);
    }
    for (const token of text.split(/[\s/.,\-_()·]+/)) {
      const key = normalizeMerchantFingerprint(token);
      if (key.length >= 2 && !isBankLearnStopToken(key)) fingerprints.add(key);
    }
  }
  return [...fingerprints];
}

export function merchantFingerprintsOverlap(left: string[], right: string[]) {
  for (const a of left) {
    for (const b of right) {
      if (a === b) return true;
      const minLen = Math.min(a.length, b.length);
      if (minLen >= 3 && (a.includes(b) || b.includes(a))) return true;
    }
  }
  return false;
}

export function bankTransactionsShareMerchantFingerprint(left: BankTransaction, right: BankTransaction) {
  return merchantFingerprintsOverlap(
    extractBankTransactionMerchantFingerprints(left),
    extractBankTransactionMerchantFingerprints(right),
  );
}

const MEMO_LEARN_TAX_TEXT_PATTERN =
  /소득세|지방소득세|지방세|법인세|부가세|원천세|국세|세금|종합소득|사업소득|근로소득/i;

const MEMO_LEARN_TAX_DOMAIN_TOKENS = [
  "소득세",
  "지방소득세",
  "지방세",
  "법인세",
  "부가세",
  "원천세",
];

function buildBankTransactionMemoLearnText(tx: BankTransaction) {
  return [tx.counterpartyName, tx.description].filter(Boolean).join(" ");
}

export function isMemoLearnTaxCategory(category: string) {
  const normalized = String(category || "").trim();
  return normalized === "세금" || normalized.includes("세금") || normalized === "세액";
}

/** 식비·식대·접대 등 금액이 매번 달라도 같은 거래처면 자동 등록 */
export function isMemoLearnAmountFlexibleCategory(category: string) {
  return normalizeExpenseCategoryName(category) === "\uC811\uB300/\uC2DD\uBE44";
}

function extractMemoLearnDomainTokens(tx: BankTransaction, category: string) {
  if (!isMemoLearnTaxCategory(category)) return [] as string[];
  const haystack = normalizeMatchText(buildBankTransactionMemoLearnText(tx));
  return MEMO_LEARN_TAX_DOMAIN_TOKENS.filter((token) => haystack.includes(normalizeMatchText(token)));
}

export function isTaxRelatedBankTransaction(tx: BankTransaction) {
  return MEMO_LEARN_TAX_TEXT_PATTERN.test(buildBankTransactionMemoLearnText(tx));
}

export function sharesMemoLearnDomain(
  sourceCategory: string,
  source: BankTransaction,
  target: BankTransaction,
) {
  if (!isMemoLearnTaxCategory(sourceCategory)) return false;
  return isTaxRelatedBankTransaction(source) && isTaxRelatedBankTransaction(target);
}

export function memoLearnWithdrawalsMatch(source: BankTransaction, target: BankTransaction) {
  const left = Number(source.withdrawal || 0);
  const right = Number(target.withdrawal || 0);
  if (left <= 0 || right <= 0) return false;
  return left === right;
}

export function bankTransactionsShareMemoLearnPattern(
  source: BankTransaction,
  target: BankTransaction,
  options: { requireAmountMatch?: boolean } = {},
) {
  if (!bankTransactionsShareMerchantFingerprint(source, target)) return false;
  if (options.requireAmountMatch === false) return true;
  return memoLearnWithdrawalsMatch(source, target);
}

/**
 * 메모 키워드 → 가계부 카테고리 (긴/구체적 키워드 우선 매칭).
 * - 접대/식비: 식대, 회식, 점심, 저녁, 카페, 커피 …
 * - 교통/주차: 주유, 기름, 유류, 택시, 주차, 톨비, 하이패스 …
 * - 통신비: 통신, 인터넷, 핸드폰, kt/skt/lgu …
 * - 인건비: 급여, 상여, 퇴직금, 4대보험 …
 * - 세금: 소득세, 법인세, 부가세, 원천세 …
 * - 사무용품·소모품·마케팅·방문/외부·대표이사 가지급/가수금·보험·구독/서비스
 */
const MEMO_CATEGORY_KEYWORD_RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["\uC811\uB300/\uC2DD\uBE44", ["\uD68C\uC2DD\uBE44", "\uC811\uB300\uBE44", "\uC2DD\uC0AC\uBE44", "\uC810\uC2EC\uC2DD\uC0AC", "\uC800\uB141\uC2DD\uC0AC", "\uC544\uCE68\uC2DD\uC0AC", "\uC2DD\uB300", "\uD68C\uC2DD", "\uC810\uC2EC", "\uC800\uB141", "\uC544\uCE68", "\uC2DD\uBE44", "\uC74C\uC2DD", "\uCE74\uD398", "\uCEE4\uD53C", "\uC811\uB300", "\uC2DD\uC0AC", "\uC21F\uAC12", "\uAC04\uC2DD", "\uB2E4\uACFC", "\uC2DD\uC74C\uB8CC"]],
  ["\uAD50\uD86D/\uC8FC\uCC28", ["\uD1A0\uB864\uAC8C\uC774\uD2B8", "\uD558\uC774\uD328\uC2A4", "\uC720\uB958\uBE44", "\uC8FC\uCC28\uBE44", "\uC8FC\uC720\uBE44", "\uAE30\uB984\uAC12", "\uD1A0\uB864\uBE44", "\uC8FC\uC720", "\uAE30\uB984", "\uC720\uB958", "\uC8FC\uCC28", "\uD0DD\uC2DC", "\uB300\uB9AC\uC6B4\uC804", "\uACE0\uC18D\uB3C4\uB85C", "\uD1A0\uB864", "\uC8FC\uCC28\uC7A5", "\uD734\uAC8C\uC18C", "\uD3B8\uB3C4", "\uD56D\uACF5", "ktx", "KTX", "\uC9C0\uD558\uCCA0", "\uBC84\uC2A4", "\uCCA0\uB3C4", "\uACE0\uC18D"]],
  ["\uD1B5\uC2E0\uBE44", ["\uC778\uD130\uB137", "\uD578\uB4DC\uD3F0", "\uD1B5\uC2E0\uBE44", "\uD1B5\uC2E0", "\uD734\uB300\uD3F0", "\uB370\uC774\uD130", "\uC720\uC2EC", "\uB85C\uBBC0", "kt", "skt", "lgu", "u+"]],
  ["\uC778\uAC74\uBE44", ["4\uB300\uBCF4\uD5D8", "\uAD6D\uBBFC\uC5F0\uAE08", "\uAC74\uAC15\uBCF4\uD5D8", "\uACE0\uC6A9\uBCF4\uD5D8", "\uC0B0\uC7AC\uBCF4\uD5D8", "\uC778\uAC74\uBE44", "\uAE09\uC5EC", "\uC0C1\uC5EC\uAE08", "\uC0C1\uC5EC", "\uD1F4\uC9C1\uAE08", "\uD1F4\uC9C1", "\uBCF4\uB108\uC2A4", "\uAE09\uC5EC\uC9C0\uAE09", "\uC6D4\uAE09", "\uC218\uB2F9", "\uC77C\uB2F9", "\uC6A9\uC5ED\uBE44", "\uC678\uC8FC\uC778\uAC74\uBE44", "\uC784\uAE08"]],
  ["\uC138\uAE08", ["\uC9C0\uBC29\uC18C\uB355\uC138", "\uC9C0\uBC29\uC18C\uB355", "\uC9C0\uBC29\uC138", "\uC18C\uB355\uC138", "\uBC95\uC778\uC138", "\uBD80\uAC00\uC138", "\uC6D0\uCC9C\uC138", "\uC885\uD569\uC18C\uB355", "\uC0AC\uC5C5\uC18C\uB355", "\uADE0\uB85C\uC18C\uB355", "\uC6D0\uCC9C\uC9D1\uC218", "\uAD6D\uC138", "\uC138\uAE08", "\uC138\uC561"]],
  ["\uB300\uD45C\uC774\uC0AC \uAC00\uC9C0\uAE09\uAE08", ["\uAC00\uC9C0\uAE09\uAE08", "\uAC00\uC9C0\uAE09", "\uB300\uD45C\uAC00\uC9C0\uAE09"]],
  ["\uB300\uD45C\uC774\uC0AC \uAC00\uC218\uAE08", ["\uAC00\uC218\uAE08", "\uB300\uD45C\uAC00\uC218"]],
  ["\uC0AC\uBB34\uC6A9\uD488", ["\uC0AC\uBB34\uC6A9\uD488", "\uD1A0\uB108", "\uD504\uB9B0\uD130", "\uBCF5\uC0AC", "\uBB38\uAD6C", "\uC6A9\uC9C0", "\uC0AC\uBB34"]],
  ["\uC18C\uBAA8\uD488", ["\uC18C\uBAA8\uD488", "\uC815\uAE30", "\uBE44\uC2DD", "\uACF5\uACFC", "\uCCAD\uC18C", "\uC704\uC0DD"]],
  ["\uB9C8\uCF00\uD305", ["\uB124\uC774\uBC84\uAD11\uACE0", "\uAD6C\uAE00\uAD11\uACE0", "\uAD11\uACE0", "\uB9C8\uCF00\uD305", "\uD658\uC601", "\uCD2C\uC601", "\uC601\uC0C1"]],
  ["\uBC29\uBB38/\uC678\uBD80", ["\uCD9C\uC7A5\uBE44", "\uCD9C\uC7A5", "\uBC29\uBB38", "\uC678\uBD80", "\uBBF8\uD305", "\uD604\uC7A5"]],
  ["\uBCF4\uD5D8", ["\uBCF4\uD5D8\uB8CC", "\uD654\uC7AC\uBCF4\uD5D8", "\uBC30\uC0C1\uCC45\uC784", "\uBCF4\uD5D8"]],
  ["\uAD6C\uB3C5/\uC11C\uBE44\uC2A4", ["\uAD6C\uB3C5", "\uD074\uB77C\uC6B0\uB4DC", "\uD638\uC2A4\uD305", "\uB3C4\uBA54\uC778", "\uC11C\uBC84", "saas", "aws"]],
];

type MemoKeywordMatch = { keyword: string; category: string };

function buildMemoKeywordMatches(): MemoKeywordMatch[] {
  const rows: MemoKeywordMatch[] = [];
  for (const [category, keywords] of MEMO_CATEGORY_KEYWORD_RULES) {
    const canonical = normalizeExpenseCategoryName(category);
    for (const keyword of keywords) {
      rows.push({ keyword, category: canonical });
    }
  }
  return rows.sort(
    (left, right) =>
      normalizeBankLedgerMatchText(right.keyword).length - normalizeBankLedgerMatchText(left.keyword).length,
  );
}

const MEMO_KEYWORD_MATCHES = buildMemoKeywordMatches();

/** 메모 텍스트에서 키워드 규칙으로 가계부 카테고리를 추론. 매칭 없으면 null. */
export function resolveCategoryFromMemo(memo: string | undefined): string | null {
  const haystack = normalizeBankLedgerMatchText(memo);
  if (!haystack) return null;
  for (const { keyword, category } of MEMO_KEYWORD_MATCHES) {
    const needle = normalizeBankLedgerMatchText(keyword);
    if (needle.length >= 2 && haystack.includes(needle)) return category;
  }
  return null;
}

/** @deprecated resolveCategoryFromMemo 사용. 접대/식비만 필요할 때 */
export function resolveMealCategoryFromMemo(memo: string | undefined): string | null {
  const category = resolveCategoryFromMemo(memo);
  return category === "\uC811\uB300/\uC2DD\uBE44" ? category : null;
}

export type MemoLedgerCategoryDraft = {
  ledgerKind: LedgerTargetKind;
  ledgerCategory: string;
};

/** Drawer/save: memo 키워드가 있으면 카테고리(및 기타→명시 카테고리)를 덮어쓰고, 고정비 모드면 지출로 전환 */
export function applyMemoCategoryToLedgerDraft(
  memo: string | undefined,
  draft: MemoLedgerCategoryDraft,
  categories: string[] = EXPENSE_CATEGORY_OPTIONS,
): MemoLedgerCategoryDraft {
  const memoCategory = resolveMemoLearnCategory(memo, categories);
  const trimmedCategory = String(draft.ledgerCategory || "").trim();

  if (memoCategory) {
    const ledgerKind = draft.ledgerKind === "fixed" ? "manual" : draft.ledgerKind;
    const ledgerCategory =
      !trimmedCategory || trimmedCategory === "\uAE30\uD0C0" || memoCategory !== trimmedCategory
        ? memoCategory
        : trimmedCategory;

    return { ledgerKind, ledgerCategory };
  }

  if (draft.ledgerKind === "fixed" && trimmedCategory && trimmedCategory !== "\uAE30\uD0C0") {
    return {
      ledgerKind: "manual",
      ledgerCategory: normalizeExpenseCategoryName(trimmedCategory),
    };
  }

  return draft;
}

export function resolveMemoLearnCategory(memo: string | undefined, categories?: string[] | null) {
  const trimmed = String(memo || "").trim();
  if (!trimmed) return null;

  const memoKeywordCategory = resolveCategoryFromMemo(trimmed);
  if (memoKeywordCategory) return memoKeywordCategory;

  const canonical = normalizeExpenseCategoryName(trimmed);
  const categoryList = Array.isArray(categories) ? categories : [];
  if (categoryList.some((item) => normalizeExpenseCategoryName(item) === canonical)) return canonical;
  if (/^[\uAC00-\uD7A3a-zA-Z0-9/+\-().\s]{1,24}$/.test(trimmed)) {
    return canonical !== trimmed ? canonical : trimmed;
  }

  const guessed = guessExpenseCategory(trimmed);
  if (guessed !== "\uAE30\uD0C0" && categoryList.some((item) => normalizeExpenseCategoryName(item) === guessed)) {
    return guessed;
  }
  return null;
}

export function buildMemoLearnRulesFromTransactions(
  transactions: BankTransaction[],
  categories: string[] = [],
  createdBy?: string,
) {
  const byMerchant = new Map<string, BankLearnRule>();
  const ordered = [...transactions]
    .filter((tx) => Number(tx.withdrawal || 0) > 0)
    .sort((left, right) => String(right.transactionAt || "").localeCompare(String(left.transactionAt || "")));

  for (const tx of ordered) {
    const category = resolveMemoLearnCategory(tx.memo, categories);
    if (!category) continue;
    const merchantKey = resolveBankTransactionMerchantKey(tx);
    if (!merchantKey) continue;
    const amount = Number(tx.withdrawal || 0);
    const ruleKey = isMemoLearnTaxCategory(category)
      ? `tax:${category}`
      : isMemoLearnAmountFlexibleCategory(category)
        ? `meal:${merchantKey}:${category}`
        : `${merchantKey}:${amount}:${category}`;
    byMerchant.set(ruleKey, buildBankLearnRuleFromMemoCategory(tx, category, createdBy));
  }

  return [...byMerchant.values()];
}

export function mergeMemoLearnRules(rules: BankLearnRule[], memoRules: BankLearnRule[]) {
  let merged = rules;
  for (const rule of memoRules) {
    merged = upsertBankLearnRule(merged, rule);
  }
  return merged;
}

export function scoreMemoLearnCategoryRule(tx: BankTransaction, rule: BankLearnRule) {
  if (rule.kind !== "manual" || !String(rule.category || "").trim()) return 0;

  const baseScore = scoreBankLearnRule(tx, rule, []);
  if (baseScore > 0) return baseScore;

  const ruleFingerprints = new Set<string>();
  const ruleMerchant = normalizeMerchantFingerprint(rule.counterpartyName || "");
  if (ruleMerchant.length >= 2) ruleFingerprints.add(ruleMerchant);
  for (const token of rule.descriptionTokens || []) {
    const key = normalizeMerchantFingerprint(token);
    if (key.length >= 2) ruleFingerprints.add(key);
  }
  if (
    merchantFingerprintsOverlap([...ruleFingerprints], extractBankTransactionMerchantFingerprints(tx))
  ) {
    return 16;
  }

  const haystack = buildBankLedgerMatchHaystack(tx);
  for (const fingerprint of ruleFingerprints) {
    if (fingerprint.length >= 2 && haystack.includes(fingerprint)) return 12;
  }

  if (isMemoLearnTaxCategory(String(rule.category || "")) && isTaxRelatedBankTransaction(tx)) {
    return 12;
  }
  return 0;
}

export type MemoCategorySuggestion = {
  category: string;
  confidence: number;
  label: string;
};

export function buildMemoCategorySuggestionMap(
  transactions: BankTransaction[],
  memoRules: BankLearnRule[],
  categories: string[] = [],
) {
  const map = new Map<string, MemoCategorySuggestion>();
  const withdrawalTxs = transactions.filter(
    (tx) => Number(tx.withdrawal || 0) > 0 && !isNetGroupSuppressed(tx),
  );

  const memoSources = withdrawalTxs.flatMap((tx) => {
    const category = resolveMemoLearnCategory(tx.memo, categories);
    return category
      ? [{ tx, category, fingerprints: extractBankTransactionMerchantFingerprints(tx) }]
      : [];
  });

  if (!memoSources.length && !memoRules.length) return map;

  for (const target of withdrawalTxs) {
    let bestScore = 0;
    let bestCategory = "";

    const ownCategory = resolveMemoLearnCategory(target.memo, categories);
    if (ownCategory) {
      bestScore = 18;
      bestCategory = ownCategory;
    }

    const targetFingerprints = bestScore >= 18 ? [] : extractBankTransactionMerchantFingerprints(target);

    for (const source of memoSources) {
      if (source.tx.id === target.id) continue;
      if (merchantFingerprintsOverlap(source.fingerprints, targetFingerprints)) {
        const merchantScore = memoLearnWithdrawalsMatch(source.tx, target) ? 17 : 16;
        if (merchantScore > bestScore) {
          bestScore = merchantScore;
          bestCategory = source.category;
        }
        continue;
      }
      if (sharesMemoLearnDomain(source.category, source.tx, target)) {
        if (15 > bestScore) {
          bestScore = 15;
          bestCategory = source.category;
        }
      }
    }

    if (bestScore < 15) {
      for (const rule of memoRules) {
        const score = scoreMemoLearnCategoryRule(target, rule);
        if (score > bestScore) {
          bestScore = score;
          bestCategory = String(rule.category || "").trim();
        }
      }
    }

    if (bestCategory && bestScore >= 8) {
      map.set(target.id, {
        category: bestCategory,
        confidence: formatLearnRuleConfidencePercent(bestScore),
        label: `[\uC9C0\uCD9C] ${bestCategory}`,
      });
    }
  }

  return map;
}

export function buildBankLearnRuleFromFolderAssignment(
  tx: BankTransaction,
  folderId: string,
  createdBy?: string,
): BankLearnRule {
  return {
    id: makeLedgerId(),
    kind: "folder",
    folderId,
    ...buildLearnRuleBase(tx, createdBy),
  };
}

export { buildPreauthNetLearnRule } from "./bankPreauthNetting";

function learnRuleUpsertKey(rule: BankLearnRule) {
  const counterpartyKey = normalizeMatchText(rule.counterpartyName || "");
  if (rule.kind === "fixed") return `fixed:${rule.fixedExpenseId || rule.category}:${counterpartyKey}`;
  if (rule.kind === "manual") {
    if (isMemoLearnTaxCategory(String(rule.category || ""))) {
      return `manual:tax-domain:${normalizeMatchText(String(rule.category || ""))}`;
    }
    if (isMemoLearnAmountFlexibleCategory(String(rule.category || ""))) {
      return `manual:meal:${counterpartyKey}:${normalizeExpenseCategoryName(String(rule.category || ""))}`;
    }
    if (rule.amount != null && rule.amount > 0) {
      return `manual:${rule.category}:${counterpartyKey}:${rule.amount}`;
    }
    return `manual:${rule.category}:${counterpartyKey}`;
  }
  if (rule.kind === "preauth_net") return `preauth_net:${counterpartyKey}`;
  return `folder:${rule.folderId}:${counterpartyKey}`;
}

export function upsertBankLearnRule(rules: BankLearnRule[], incoming: BankLearnRule): BankLearnRule[] {
  const incomingKey = learnRuleUpsertKey(incoming);
  const index = rules.findIndex((rule) => learnRuleUpsertKey(rule) === incomingKey);

  if (index < 0) return [incoming, ...rules];

  const existing = rules[index];
  const mergedTokens = filterBankLearnDescriptionTokens([...existing.descriptionTokens, ...incoming.descriptionTokens]);
  const updated: BankLearnRule = {
    ...existing,
    descriptionTokens: mergedTokens,
    amount:
      incoming.kind === "fixed" || incoming.kind === "manual"
        ? incoming.amount ?? existing.amount
        : existing.amount,
    sourceBankTransactionId: incoming.sourceBankTransactionId || existing.sourceBankTransactionId,
    createdBy: incoming.createdBy || existing.createdBy,
  };
  return [updated, ...rules.filter((_, idx) => idx !== index)];
}

/** @deprecated Use upsertBankLearnRule */
export function upsertBankLedgerMatchRule(rules: BankLearnRule[], incoming: BankLearnRule): BankLearnRule[] {
  return upsertBankLearnRule(rules, incoming);
}

function resolveFixedLearnRuleAmount(rule: BankLearnRule, fixedExpenses: FixedExpense[] = []) {
  if (rule.kind !== "fixed") return null;
  if (rule.amount != null && rule.amount > 0) return rule.amount;
  const fixedExpense = fixedExpenses.find((row) => row.id === rule.fixedExpenseId);
  if (fixedExpense?.amount != null && fixedExpense.amount > 0) return fixedExpense.amount;
  return null;
}

export function fixedLearnRuleAmountMatches(
  tx: BankTransaction,
  rule: BankLearnRule,
  fixedExpenses: FixedExpense[] = [],
) {
  if (rule.kind !== "fixed") return true;
  const withdrawal = Number(tx.withdrawal || 0);
  if (withdrawal <= 0) return false;

  if (rule.amount != null && rule.amount > 0) {
    if (withdrawal === rule.amount) return true;
    return areRecurringAmountsCompatible(rule.amount, withdrawal);
  }

  const fixedExpense = fixedExpenses.find((row) => row.id === rule.fixedExpenseId);
  if (fixedExpense?.amount != null && fixedExpense.amount > 0) {
    if (withdrawal === fixedExpense.amount) return true;
    return areRecurringAmountsCompatible(fixedExpense.amount, withdrawal);
  }

  return true;
}

export function buildBankLedgerMatchHaystack(tx: BankTransaction) {
  // Match only 거래내용·상대예금주·메모. 거래구분·상대은행은 제외.
  return normalizeMatchText([tx.description, tx.counterpartyName, tx.memo].filter(Boolean).join(" "));
}

function isLearnRuleActive(rule: BankLearnRule, fixedExpenses: FixedExpense[] = []) {
  if (rule.kind === "preauth_net") {
    return Boolean(rule.counterpartyName) || rule.descriptionTokens.length > 0;
  }
  if (rule.kind === "fixed") {
    const fixedExpense = fixedExpenses.find((row) => row.id === rule.fixedExpenseId);
    return Boolean(fixedExpense?.isActive);
  }
  if (rule.kind === "manual") {
    return Boolean(String(rule.category || "").trim());
  }
  return Boolean(rule.folderId);
}

export function scoreBankLearnRule(
  tx: BankTransaction,
  rule: BankLearnRule,
  fixedExpenses: FixedExpense[] = [],
) {
  if (!isLearnRuleActive(rule, fixedExpenses)) return 0;
  if (rule.kind === "fixed" && isCheckCardBankTransaction(tx)) return 0;
  if (rule.kind === "fixed" && !fixedLearnRuleAmountMatches(tx, rule, fixedExpenses)) return 0;
  if (
    rule.kind === "manual" &&
    rule.amount != null &&
    rule.amount > 0 &&
    !isMemoLearnAmountFlexibleCategory(String(rule.category || "")) &&
    !memoLearnWithdrawalsMatch({ withdrawal: rule.amount } as BankTransaction, tx)
  ) {
    return 0;
  }

  const haystack = buildBankLedgerMatchHaystack(tx);
  const counterpartyKey = normalizeMatchText(rule.counterpartyName || "");
  const txCounterpartyKey = normalizeMatchText(tx.counterpartyName || "");

  if (rule.kind === "fixed" && counterpartyKey && !txCounterpartyKey) return 0;

  let score = 0;
  if (counterpartyKey) {
    if (!txCounterpartyKey) {
      if (rule.kind === "fixed") return 0;
      if (haystack.includes(counterpartyKey)) score += 12;
      else return 0;
    } else if (txCounterpartyKey === counterpartyKey) score += 20;
    else if (txCounterpartyKey.includes(counterpartyKey) || counterpartyKey.includes(txCounterpartyKey)) {
      score += 12;
    } else if (rule.kind !== "fixed" && haystack.includes(counterpartyKey)) {
      score += 8;
    } else {
      return 0;
    }
  }

  if (rule.kind === "fixed" && !counterpartyKey) return 0;

  const tokens = filterBankLearnDescriptionTokens(rule.descriptionTokens || [])
    .map((token) => normalizeMatchText(token))
    .filter((token) => token.length >= 2);
  if (tokens.length) {
    const matchedTokens = tokens.filter((token) => haystack.includes(token));
    if (!matchedTokens.length && !counterpartyKey) return 0;
    score += matchedTokens.length * 4;
  } else if (!counterpartyKey) {
    return 0;
  }

  return score;
}

/** @deprecated Use scoreBankLearnRule */
export function scoreBankLedgerMatchRule(
  tx: BankTransaction,
  rule: BankLearnRule,
  fixedExpenses: FixedExpense[] = [],
) {
  return scoreBankLearnRule(tx, rule, fixedExpenses);
}

export function findBestBankLearnRuleWithScore(
  tx: BankTransaction,
  rules: BankLearnRule[] = [],
  fixedExpenses: FixedExpense[] = [],
  kinds?: BankLearnRuleKind[],
) {
  let best: { rule: BankLearnRule; score: number } | null = null;
  for (const rule of rules) {
    if (kinds && !kinds.includes(rule.kind)) continue;
    const score = scoreBankLearnRule(tx, rule, fixedExpenses);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { rule, score };
  }
  if (!best) return null;
  const minScore = best.rule.kind === "fixed" ? FIXED_AUTO_LEARN_MIN_SCORE : AUTO_LEARN_MIN_SCORE;
  if (best.score < minScore) return null;
  return best;
}

export function formatLearnRuleConfidencePercent(score: number) {
  if (score >= AUTO_LEARN_HIGH_CONFIDENCE_SCORE) return 95;
  if (score >= 12) return 85;
  if (score >= AUTO_LEARN_MIN_SCORE) return 72;
  return Math.max(0, Math.min(99, Math.round((score / AUTO_LEARN_HIGH_CONFIDENCE_SCORE) * 100)));
}

export function meetsLedgerRegistrationConfidenceThreshold(confidence: number | null | undefined) {
  return confidence != null && confidence >= LEDGER_REGISTRATION_MIN_CONFIDENCE_PERCENT;
}

export function hasManualLedgerCategoryMemoOverride(
  tx: BankTransaction,
  categories: string[] = EXPENSE_CATEGORY_OPTIONS,
) {
  return Boolean(resolveMemoLearnCategory(tx.memo, categories));
}

function findBestBankLearnRule(
  tx: BankTransaction,
  rules: BankLearnRule[] = [],
  fixedExpenses: FixedExpense[] = [],
  kinds?: BankLearnRuleKind[],
) {
  return findBestBankLearnRuleWithScore(tx, rules, fixedExpenses, kinds)?.rule ?? null;
}

export function findMatchingBankLedgerRule(
  tx: BankTransaction,
  rules: BankLearnRule[] = [],
  fixedExpenses: FixedExpense[] = [],
) {
  return findBestBankLearnRule(tx, rules, fixedExpenses, ["fixed"]);
}

export function buildBankLedgerPromptKey(tx: BankTransaction) {
  const counterparty = normalizeMatchText(tx.counterpartyName || "");
  if (counterparty) return counterparty;
  const description = normalizeMatchText(tx.description || "");
  if (description.length >= 4) return description.slice(0, 24);
  return `tx:${tx.id}`;
}

export function transactionNeedsLedgerCategoryPrompt(
  tx: BankTransaction,
  rules: BankLearnRule[],
  fixedExpenses: FixedExpense[],
  context: BankLedgerRegistrationContext = {},
) {
  if (!canRegisterBankTxToCompanyLedger(tx, context)) return false;
  return !findBestBankLearnRule(tx, rules, fixedExpenses, ["fixed", "manual"]);
}

export type LedgerCategoryPromptGroup = {
  key: string;
  label: string;
  transactions: BankTransaction[];
};

export type LedgerReviewPromptGroup = LedgerCategoryPromptGroup;

export function buildLedgerCategoryPromptGroups(
  transactions: BankTransaction[],
  rules: BankLearnRule[],
  fixedExpenses: FixedExpense[],
  context: BankLedgerRegistrationContext = {},
  options: { onlyTransactionIds?: Set<string> } = {},
): LedgerCategoryPromptGroup[] {
  const groups = new Map<string, BankTransaction[]>();

  for (const tx of transactions) {
    if (options.onlyTransactionIds && !options.onlyTransactionIds.has(tx.id)) continue;
    if (!transactionNeedsLedgerCategoryPrompt(tx, rules, fixedExpenses, context)) continue;
    const key = buildBankLedgerPromptKey(tx);
    const bucket = groups.get(key) || [];
    bucket.push(tx);
    groups.set(key, bucket);
  }

  return [...groups.entries()]
    .map(([key, txs]) => ({
      key,
      label: String(txs[0]?.counterpartyName || txs[0]?.description || key).trim() || key,
      transactions: txs.sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt))),
    }))
    .sort((a, b) => b.transactions.length - a.transactions.length || a.label.localeCompare(b.label, "ko"));
}

/** All unlinked ledger-eligible txs (including learn-rule matches) for interactive review. */
export function buildLedgerReviewPromptGroups(
  transactions: BankTransaction[],
  context: BankLedgerRegistrationContext = {},
  options: { onlyTransactionIds?: Set<string> } = {},
): LedgerReviewPromptGroup[] {
  const groups = new Map<string, BankTransaction[]>();

  for (const tx of transactions) {
    if (options.onlyTransactionIds && !options.onlyTransactionIds.has(tx.id)) continue;
    if (!canRegisterBankTxToCompanyLedger(tx, context)) continue;
    const key = buildBankLedgerPromptKey(tx);
    const bucket = groups.get(key) || [];
    bucket.push(tx);
    groups.set(key, bucket);
  }

  return [...groups.entries()]
    .map(([key, txs]) => ({
      key,
      label: String(txs[0]?.counterpartyName || txs[0]?.description || key).trim() || key,
      transactions: txs.sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt))),
    }))
    .sort((a, b) => b.transactions.length - a.transactions.length || a.label.localeCompare(b.label, "ko"));
}

export function createCompanyExpenseFromBankTransaction(
  tx: BankTransaction,
  category: string,
  createdBy?: string,
): CompanyExpense {
  const prefill = buildCompanyExpensePrefillFromBankTransaction(tx);
  return {
    id: makeLedgerId(),
    date: prefill.date,
    category: String(category || "").trim(),
    description: prefill.description,
    amount: parseLedgerAmount(prefill.amount),
    memo: prefill.memo,
    kind: "variable",
    flow: resolveBankTxLedgerFlow(tx),
    bankTransactionId: tx.id,
    createdBy: createdBy || "",
    createdAt: new Date().toISOString(),
  };
}

export function resolveLedgerTargetFromInput(
  input: string,
  options: ReturnType<typeof buildLedgerTargetOptions>,
) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "";

  if (parseLedgerTargetKey(trimmed)) return trimmed;

  const byValue = options.find((item) => item.value === trimmed);
  if (byValue) return byValue.value;

  const byLabel = options.find((item) => item.label === trimmed);
  if (byLabel) return byLabel.value;

  const manualLabel = trimmed.replace(/^\[\uC9C0\uCD9C\]\s*/, "").trim();
  const manualMatch = options.find(
    (item) =>
      item.raw &&
      typeof item.raw === "object" &&
      "kind" in item.raw &&
      item.raw.kind === "manual" &&
      "category" in item.raw &&
      item.raw.category === manualLabel,
  );
  if (manualMatch) return manualMatch.value;

  const fixedMatch = options.find((item) => item.label === manualLabel || item.label.includes(manualLabel));
  if (fixedMatch) return fixedMatch.value;

  if (manualLabel) return manualLedgerTargetKey(manualLabel);

  return trimmed;
}

export function resolveFixedExpenseIdForAutoLedger(
  tx: BankTransaction,
  rules: BankLearnRule[] = [],
  fixedExpenses: FixedExpense[] = [],
) {
  const matchedRule = findBestBankLearnRule(tx, rules, fixedExpenses, ["fixed"]);
  return matchedRule?.fixedExpenseId || null;
}

export function resolveLedgerTargetForBankTransaction(
  tx: BankTransaction,
  rules: BankLearnRule[] = [],
  fixedExpenses: FixedExpense[] = [],
) {
  const fixedRule = findBestBankLearnRule(tx, rules, fixedExpenses, ["fixed"]);
  if (fixedRule?.fixedExpenseId) return fixedLedgerTargetKey(fixedRule.fixedExpenseId);

  const manualRule = findBestBankLearnRule(tx, rules, fixedExpenses, ["manual"]);
  if (manualRule?.category) return manualLedgerTargetKey(manualRule.category);

  return guessLedgerTargetFromBankTransaction(tx, fixedExpenses);
}

export type AutoApplyBankLearnResult = {
  transactions: BankTransaction[];
  newPayments: FixedExpensePayment[];
  newExpenses: CompanyExpense[];
  allPayments?: FixedExpensePayment[];
  bankTransactionFolders?: BankTransactionFolder[];
  fixedCount: number;
  manualCount: number;
  folderCount: number;
};

function applyLedgerCategoryFolderSync(
  transactions: BankTransaction[],
  folders: BankTransactionFolder[] | undefined,
  context: { companyExpenses: CompanyExpense[]; fixedExpensePayments: FixedExpensePayment[] },
) {
  if (!folders) {
    return { transactions, folders: undefined as BankTransactionFolder[] | undefined, syncCount: 0 };
  }
  const synced = syncLedgerLinkedBankTransactionFolders(transactions, folders, context);
  return { transactions: synced.transactions, folders: synced.folders, syncCount: synced.updated };
}

export type AutoApplyBankLedgerResult = {
  transactions: BankTransaction[];
  newPayments: FixedExpensePayment[];
  registeredCount: number;
};

export function autoApplyBankLearnRules(
  transactions: BankTransaction[],
  existingPayments: FixedExpensePayment[],
  existingExpenses: CompanyExpense[],
  rules: BankLearnRule[],
  fixedExpenses: FixedExpense[],
  options: {
    createdBy?: string;
    onlyTransactionIds?: Set<string>;
    workers?: WorkerDepositMatchSource[];
    bankTransactionFolders?: BankTransactionFolder[];
    /** Which learn-rule kinds to auto-apply. Default: fixed, manual, folder. */
    applyKinds?: BankLearnRuleKind[];
  } = {},
): AutoApplyBankLearnResult {
  const applyKinds = options.applyKinds ?? (["fixed", "manual", "folder"] as BankLearnRuleKind[]);
  const applyLedgerKinds = applyKinds.filter((kind) => kind === "fixed" || kind === "manual") as Array<
    "fixed" | "manual"
  >;
  const applyFolderRules = applyKinds.includes("folder");
  const newPayments: FixedExpensePayment[] = [];
  const newExpenses: CompanyExpense[] = [];
  const paymentLinks = new Map<string, string>();
  const expenseLinks = new Map<string, string>();
  const folderUpdates = new Map<string, { folderId: string; linkedSubject?: string }>();
  let workingPayments = [...existingPayments];
  let workingExpenses = [...existingExpenses];

  for (const tx of transactions) {
    if (options.onlyTransactionIds && !options.onlyTransactionIds.has(tx.id)) continue;

    const ledgerContext = {
      companyExpenses: workingExpenses,
      fixedExpensePayments: workingPayments,
    };

    if (canRegisterBankTxToCompanyLedger(tx, ledgerContext) && applyLedgerKinds.length) {
      let learnMatch = findBestBankLearnRuleWithScore(tx, rules, fixedExpenses, applyLedgerKinds);
      if (!learnMatch && applyLedgerKinds.includes("manual")) {
        const memoCategory = resolveMemoLearnCategory(tx.memo);
        if (memoCategory && isMemoLearnAmountFlexibleCategory(memoCategory)) {
          learnMatch = {
            rule: {
              id: makeLedgerId(),
              kind: "manual",
              category: memoCategory,
              descriptionTokens: [],
              createdAt: new Date().toISOString(),
            },
            score: AUTO_LEARN_HIGH_CONFIDENCE_SCORE,
          };
        }
      }
      if (!learnMatch) continue;

      if (
        !hasManualLedgerCategoryMemoOverride(tx) &&
        !meetsLedgerRegistrationConfidenceThreshold(formatLearnRuleConfidencePercent(learnMatch.score))
      ) {
        continue;
      }

      const ledgerRule = learnMatch.rule;
      if (ledgerRule?.kind === "fixed" && ledgerRule.fixedExpenseId && !isCheckCardBankTransaction(tx)) {
        const fixedExpenseId =
          resolveFixedExpenseIdForBankTransaction(tx, fixedExpenses, ledgerRule.fixedExpenseId) ||
          ledgerRule.fixedExpenseId;
        if (
          hasConflictingSiblingFixedExpenseLink(
            tx,
            fixedExpenseId,
            transactions,
            workingPayments,
            workingExpenses,
          )
        ) {
          continue;
        }
        const existingPayment = findLinkableFixedExpensePayment(
          tx,
          fixedExpenseId,
          workingPayments,
          fixedExpenses,
        );

        if (existingPayment) {
          workingPayments = linkFixedExpensePaymentToBankTx(workingPayments, existingPayment.id, tx.id, tx);
          paymentLinks.set(tx.id, existingPayment.id);
          continue;
        }

        const prefill = buildCompanyExpensePrefillFromBankTransaction(tx);
        const fixedRow = fixedExpenses.find((row) => row.id === fixedExpenseId);
        const paymentId = makeLedgerId();
        const payment: FixedExpensePayment = {
          id: paymentId,
          fixedExpenseId,
          date: prefill.date,
          amount: parseLedgerAmount(prefill.amount),
          memo: prefill.memo || fixedRow?.name || prefill.description,
          bankTransactionId: tx.id,
          createdBy: options.createdBy,
          createdAt: new Date().toISOString(),
        };
        newPayments.push(payment);
        workingPayments = [payment, ...workingPayments];
        paymentLinks.set(tx.id, paymentId);
        continue;
      }

      if (ledgerRule?.kind === "manual" && ledgerRule.category) {
        const prefill = buildCompanyExpensePrefillFromBankTransaction(tx);
        const expenseId = makeLedgerId();
        const expense: CompanyExpense = {
          id: expenseId,
          date: prefill.date,
          category: ledgerRule.category,
          description: prefill.description,
          amount: parseLedgerAmount(prefill.amount),
          memo: prefill.memo,
          kind: "variable",
          bankTransactionId: tx.id,
          createdBy: options.createdBy,
          createdAt: new Date().toISOString(),
        };
        newExpenses.push(expense);
        workingExpenses = [expense, ...workingExpenses];
        expenseLinks.set(tx.id, expenseId);
        continue;
      }
    }

    if (applyFolderRules && !tx.folderId) {
      const folderRule = findBestBankLearnRule(tx, rules, fixedExpenses, ["folder"]);
      if (folderRule?.folderId) {
        const folders = options.bankTransactionFolders || [];
        const workers = options.workers || [];
        if (canAssignBankTransactionToFolder(tx, folderRule.folderId, folders, workers)) {
          folderUpdates.set(tx.id, {
            folderId: folderRule.folderId,
            linkedSubject: tx.linkedSubject || tx.counterpartyName || tx.description || undefined,
          });
        }
      }
    }
  }

  const allExpenses = [...newExpenses, ...existingExpenses];
  const allPayments = workingPayments;

  if (!newPayments.length && !newExpenses.length && !folderUpdates.size) {
    const syncedOnly = syncBankTransactionLedgerLinkFields(transactions, allExpenses, allPayments);
    const linksChanged = syncedOnly.some(
      (row, index) =>
        row.linkedCompanyExpenseId !== transactions[index]?.linkedCompanyExpenseId ||
        row.linkedFixedExpensePaymentId !== transactions[index]?.linkedFixedExpensePaymentId,
    );
    if (!linksChanged) {
      const folderSync = applyLedgerCategoryFolderSync(syncedOnly, options.bankTransactionFolders, {
        companyExpenses: allExpenses,
        fixedExpensePayments: allPayments,
      });
      if (!folderSync.syncCount) {
        return {
          transactions: syncedOnly,
          newPayments,
          newExpenses,
          fixedCount: 0,
          manualCount: 0,
          folderCount: 0,
        };
      }
      return {
        transactions: folderSync.transactions,
        newPayments,
        newExpenses,
        bankTransactionFolders: folderSync.folders,
        fixedCount: 0,
        manualCount: 0,
        folderCount: folderSync.syncCount,
      };
    }
    const folderSync = applyLedgerCategoryFolderSync(syncedOnly, options.bankTransactionFolders, {
      companyExpenses: allExpenses,
      fixedExpensePayments: allPayments,
    });
    return {
      transactions: folderSync.transactions,
      newPayments,
      newExpenses,
      bankTransactionFolders: folderSync.folders,
      fixedCount: 0,
      manualCount: 0,
      folderCount: folderSync.syncCount,
    };
  }

  const allNewPayments = [...newPayments];
  let nextTransactions = transactions.map((tx) => {
    const paymentId = paymentLinks.get(tx.id);
    if (paymentId) return { ...tx, linkedFixedExpensePaymentId: paymentId, linkedCompanyExpenseId: undefined };

    const expenseId = expenseLinks.get(tx.id);
    if (expenseId) return { ...tx, linkedCompanyExpenseId: expenseId, linkedFixedExpensePaymentId: undefined };

    const folderUpdate = folderUpdates.get(tx.id);
    if (folderUpdate) {
      return {
        ...tx,
        folderId: folderUpdate.folderId,
        linkedSubject: folderUpdate.linkedSubject,
        classifiedAt: new Date().toISOString(),
      };
    }

    return tx;
  });
  nextTransactions = syncBankTransactionLedgerLinkFields(nextTransactions, allExpenses, allPayments);

  const fixedCount = newPayments.length + newExpenses.filter((row) => row.kind === "fixed").length;
  const manualCount = newExpenses.filter((row) => row.kind !== "fixed").length;
  const folderSync = applyLedgerCategoryFolderSync(nextTransactions, options.bankTransactionFolders, {
    companyExpenses: allExpenses,
    fixedExpensePayments: allPayments,
  });

  return {
    transactions: folderSync.transactions,
    newPayments: allNewPayments,
    newExpenses,
    allPayments: paymentLinks.size > 0 || allNewPayments.length > 0 ? workingPayments : undefined,
    bankTransactionFolders: folderSync.folders,
    fixedCount,
    manualCount,
    folderCount: folderUpdates.size + folderSync.syncCount,
  };
}

export function autoApplyBankLedgerRegistrations(
  transactions: BankTransaction[],
  existingPayments: FixedExpensePayment[],
  rules: BankLearnRule[],
  fixedExpenses: FixedExpense[],
  options: {
    createdBy?: string;
    onlyTransactionIds?: Set<string>;
    companyExpenses?: CompanyExpense[];
  } = {},
): AutoApplyBankLedgerResult {
  const result = autoApplyBankLearnRules(
    transactions,
    existingPayments,
    options.companyExpenses || [],
    rules,
    fixedExpenses,
    options,
  );
  return {
    transactions: result.transactions,
    newPayments: result.newPayments,
    registeredCount: result.fixedCount + result.manualCount,
  };
}

export function formatBankLearnAutoMessage(counts: { fixed: number; manual: number; folder: number }) {
  const parts: string[] = [];
  if (counts.fixed > 0) parts.push(`\uACE0\uC815\uBE44 ${counts.fixed}\uAC74`);
  if (counts.manual > 0) parts.push(`\uC9C0\uCD9C ${counts.manual}\uAC74`);
  if (counts.folder > 0) parts.push(`\uBD84\uB958 ${counts.folder}\uAC74`);
  if (!parts.length) return "";
  return `${parts.join(", ")} \uC790\uB3D9 \uCC98\uB9AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`;
}

export function guessLedgerTargetFromBankTransaction(
  tx: BankTransaction,
  _fixedExpenses: FixedExpense[] = [],
) {
  const prefill = buildCompanyExpensePrefillFromBankTransaction(tx);
  return manualLedgerTargetKey(prefill.category);
}

export function resolveBankTxLedgerAmount(tx: { withdrawal?: number; deposit?: number }) {
  const withdrawal = Number(tx.withdrawal || 0);
  const deposit = Number(tx.deposit || 0);
  return withdrawal > 0 ? withdrawal : deposit > 0 ? deposit : 0;
}

export function resolveBankTxLedgerFlow(tx: { withdrawal?: number; deposit?: number }) {
  return Number(tx.withdrawal || 0) > 0 ? "expense" : "income";
}

export function buildCompanyExpensePrefillFromBankTransaction(tx: BankTransaction) {
  const date = String(tx.transactionAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const counterparty = String(tx.counterpartyName || "").trim();
  const descriptionText = String(tx.description || "").trim();
  const description =
    [descriptionText, counterparty].filter(Boolean).join(" \u00B7 ") || "\uD1B5\uC7A5 \uAC70\uB798";

  const memoParts = [
    counterparty ? `\uC0C1\uB300: ${counterparty}` : "",
    tx.counterpartyBank ? `\uC740\uD589: ${tx.counterpartyBank}` : "",
    tx.transactionType ? `\uAD6C\uBD84: ${tx.transactionType}` : "",
    tx.memo || "",
  ].filter(Boolean);

  const category = guessExpenseCategory([description, tx.memo || ""].filter(Boolean).join(" "));
  const safeCategory = EXPENSE_CATEGORY_OPTIONS.includes(category) ? category : "\uAE30\uD0C0";
  const ledgerAmount = resolveBankTxLedgerAmount(tx);

  return {
    date,
    category: safeCategory,
    description,
    amount: String(ledgerAmount),
    memo: memoParts.join(" \u00B7 "),
    bankTransactionId: tx.id,
  };
}
