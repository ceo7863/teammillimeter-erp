import { isCheckCardBankTransaction, type BankTransaction } from "./bankTransactions";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "./companyLedger";
import { canAssignBankTransactionToFolder, type BankTransactionFolder } from "./bankTransactionFolders";
import type { WorkerDepositMatchSource } from "./clientDepositAliases";
import { isNetGroupSuppressed } from "./bankPreauthNetting";
import { filterBankLearnDescriptionTokens, isBankLearnStopToken } from "./bankLearnTokens";
import {
  EXPENSE_CATEGORY_OPTIONS,
  bankTransactionMatchesFixedPayment,
  findLinkableFixedExpensePayment,
  linkFixedExpensePaymentToBankTx,
  makeLedgerId,
  parseLedgerAmount,
  areRecurringAmountsCompatible,
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

export function isBankTransactionLinkedToCompanyLedger(
  tx: BankTransaction,
  context: BankLedgerRegistrationContext = {},
) {
  return Boolean(
    getLinkedCompanyExpenseForBankTx(tx, context.companyExpenses) ||
      getLinkedFixedPaymentForBankTx(tx, context.fixedExpensePayments),
  );
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
) {
  if (isNetGroupSuppressed(tx)) return false;
  if (tx.folderId || !(tx.withdrawal > 0)) return false;
  return !isBankTransactionLinkedToCompanyLedger(tx, context);
}

export function listBankTransactionsForLedgerLink(
  transactions: BankTransaction[],
  context: BankLedgerRegistrationContext = {},
  options: { excludePaymentId?: string } = {},
) {
  const payments = (context.fixedExpensePayments || []).filter(
    (row) => !options.excludePaymentId || row.id !== options.excludePaymentId,
  );

  return transactions
    .filter((tx) => canRegisterBankTxToCompanyLedger(tx, { ...context, fixedExpensePayments: payments }))
    .sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt)));
}

/** Unlinked bank withdrawals that match a fixed payment (same month + amount). */
export function listBankTransactionsForFixedPaymentLink(
  payment: FixedExpensePayment,
  transactions: BankTransaction[],
  context: BankLedgerRegistrationContext = {},
  fixedExpenses: FixedExpense[] = [],
  options: { excludePaymentId?: string } = {},
) {
  return listBankTransactionsForLedgerLink(transactions, context, options)
    .filter((tx) => bankTransactionMatchesFixedPayment(tx, payment, fixedExpenses))
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
    ["\uC811\uB300/\uC2DD\uBE44", ["\uC2DD\uB300", "\uC2DD\uBE44", "\uC74C\uC2DD", "\uCE74\uD398", "\uCEE4\uD53C", "\uC811\uB300", "\uC2DD\uC0AC"]],
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
      const category = String(raw.category || "").trim();
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
        amount: kind === "fixed" && Number.isFinite(amount) && amount > 0 ? amount : undefined,
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
  if (rule.kind === "manual") return `manual:${rule.category}:${counterpartyKey}`;
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
    amount: incoming.kind === "fixed" ? incoming.amount ?? existing.amount : existing.amount,
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

  const haystack = buildBankLedgerMatchHaystack(tx);
  const counterpartyKey = normalizeMatchText(rule.counterpartyName || "");
  const txCounterpartyKey = normalizeMatchText(tx.counterpartyName || "");

  if (rule.kind === "fixed" && counterpartyKey && !txCounterpartyKey) return 0;

  let score = 0;
  if (counterpartyKey) {
    if (!txCounterpartyKey) {
      return 0;
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
  fixedCount: number;
  manualCount: number;
  folderCount: number;
};

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
      const ledgerRule = findBestBankLearnRule(tx, rules, fixedExpenses, applyLedgerKinds);
      if (ledgerRule?.kind === "fixed" && ledgerRule.fixedExpenseId && !isCheckCardBankTransaction(tx)) {
        const existingPayment = findLinkableFixedExpensePayment(
          tx,
          ledgerRule.fixedExpenseId,
          workingPayments,
          fixedExpenses,
        );

        if (existingPayment) {
          workingPayments = linkFixedExpensePaymentToBankTx(workingPayments, existingPayment.id, tx.id, tx);
          paymentLinks.set(tx.id, existingPayment.id);
          continue;
        }

        const prefill = buildCompanyExpensePrefillFromBankTransaction(tx);
        const fixedRow = fixedExpenses.find((row) => row.id === ledgerRule.fixedExpenseId);
        const paymentId = makeLedgerId();
        const payment: FixedExpensePayment = {
          id: paymentId,
          fixedExpenseId: ledgerRule.fixedExpenseId,
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
      return {
        transactions,
        newPayments,
        newExpenses,
        fixedCount: 0,
        manualCount: 0,
        folderCount: 0,
      };
    }
    return {
      transactions: syncedOnly,
      newPayments,
      newExpenses,
      fixedCount: 0,
      manualCount: 0,
      folderCount: 0,
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

  return {
    transactions: nextTransactions,
    newPayments: allNewPayments,
    newExpenses,
    allPayments: paymentLinks.size > 0 || allNewPayments.length > 0 ? workingPayments : undefined,
    fixedCount,
    manualCount,
    folderCount: folderUpdates.size,
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

export function buildCompanyExpensePrefillFromBankTransaction(tx: BankTransaction) {
  const date = String(tx.transactionAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const counterparty = String(tx.counterpartyName || "").trim();
  const descriptionText = String(tx.description || "").trim();
  const description =
    [descriptionText, counterparty].filter(Boolean).join(" \u00B7 ") || "\uD1B5\uC7A5 \uCD9C\uAE08";

  const memoParts = [
    counterparty ? `\uC0C1\uB300: ${counterparty}` : "",
    tx.counterpartyBank ? `\uC740\uD589: ${tx.counterpartyBank}` : "",
    tx.transactionType ? `\uAD6C\uBD84: ${tx.transactionType}` : "",
    tx.memo || "",
  ].filter(Boolean);

  const category = guessExpenseCategory([description, tx.memo || ""].filter(Boolean).join(" "));
  const safeCategory = EXPENSE_CATEGORY_OPTIONS.includes(category) ? category : "\uAE30\uD0C0";

  return {
    date,
    category: safeCategory,
    description,
    amount: String(tx.withdrawal || 0),
    memo: memoParts.join(" \u00B7 "),
    bankTransactionId: tx.id,
  };
}
