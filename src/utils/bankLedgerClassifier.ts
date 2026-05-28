import type { BankTransaction } from "./bankTransactions";
import {
  buildBankLedgerMatchHaystack,
  findBestBankLearnRuleWithScore,
  fixedLedgerTargetKey,
  formatLearnRuleConfidencePercent,
  guessExpenseCategory,
  guessLedgerTargetFromBankTransaction,
  hasManualLedgerCategoryMemoOverride,
  LEDGER_REGISTRATION_MIN_CONFIDENCE_PERCENT,
  manualLedgerTargetKey,
  meetsLedgerRegistrationConfidenceThreshold,
  normalizeBankLedgerMatchText,
  parseLedgerTargetKey,
  type BankLearnRule,
  type MemoCategorySuggestion,
} from "./bankCompanyLedger";
import type { CompanyExpense, FixedExpense } from "./companyLedger";
import { EXPENSE_CATEGORY_OPTIONS, normalizeExpenseCategoryName } from "./companyLedger";
import type { ClientDepositMatchSource, WorkerDepositMatchSource } from "./clientDepositAliases";
import { isNetGroupSuppressed } from "./bankPreauthNetting";

export type BankLedgerClassificationSource = "learn_rule" | "heuristic" | "llm";

export type BankLedgerClassification = {
  targetKey: string;
  kind: "manual" | "fixed";
  category?: string;
  fixedExpenseId?: string;
  confidence: number;
  source: BankLedgerClassificationSource;
  label: string;
  reasons: string[];
};

export const HEURISTIC_AUTO_REGISTER_MIN_CONFIDENCE = LEDGER_REGISTRATION_MIN_CONFIDENCE_PERCENT;

const CORPORATE_SUFFIXES = [
  "(\uC8FC)",
  "\uC8FC\uC2DD\uD68C\uC0AC",
  "\u321C",
  "(\uC720)",
  "\uC720\uD55C\uD68C\uC0AC",
  "\uC0AC\uB2E8\uBC95\uC778",
  "\uC7AC\uB2E8\uBC95\uC778",
  "co.,ltd",
  "co.ltd",
  "corp",
  "inc",
  "llc",
];

export function normalizeKoreanMerchantName(text: string) {
  let normalized = String(text || "").trim().toLowerCase();
  for (const suffix of CORPORATE_SUFFIXES) {
    normalized = normalized.split(suffix).join("");
  }
  return normalizeBankLedgerMatchText(normalized);
}

export function extractBankLedgerTokens(...parts: Array<string | undefined>) {
  const tokens = new Set<string>();
  for (const part of parts) {
    const normalized = normalizeKoreanMerchantName(part);
    if (normalized.length >= 2) tokens.add(normalized);
    for (const token of String(part || "")
      .split(/[\s/.,\-_\u00B7()??]+/)
      .map((item) => normalizeKoreanMerchantName(item))
      .filter((item) => item.length >= 2)) {
      tokens.add(token);
    }
  }
  return [...tokens];
}

function tokenOverlapScore(haystack: string, tokens: string[]) {
  if (!tokens.length) return 0;
  const matched = tokens.filter((token) => haystack.includes(token));
  return matched.length ? matched.length * 4 + Math.min(8, matched.join("").length) : 0;
}

function scoreCategoryFromHistory(
  tx: BankTransaction,
  expenses: CompanyExpense[],
  haystack: string,
  tokens: string[],
) {
  const counterpartyKey = normalizeKoreanMerchantName(tx.counterpartyName || "");
  const counts = new Map<string, { score: number; reasons: string[] }>();

  for (const row of expenses) {
    const category = normalizeExpenseCategoryName(String(row.category || "").trim());
    if (!category) continue;
    const descKey = normalizeKoreanMerchantName(row.description || "");
    const memoKey = normalizeKoreanMerchantName(row.memo || "");
    let score = 0;
    const reasons: string[] = [];

    if (counterpartyKey && (descKey.includes(counterpartyKey) || memoKey.includes(counterpartyKey))) {
      score += 14;
      reasons.push("\uACFC\uAC70 \uB3D9\uC77C \uC0C1\uB300");
    }
    score += tokenOverlapScore(`${descKey} ${memoKey}`, tokens);
    if (Number(row.amount) > 0 && Number(tx.withdrawal) > 0 && Number(row.amount) === Number(tx.withdrawal)) {
      score += 4;
      reasons.push("\uACFC\uAC70 \uB3D9\uC77C \uAE08\uC561");
    }

    if (score <= 0) continue;
    const prev = counts.get(category);
    if (!prev || score > prev.score) counts.set(category, { score, reasons });
    else counts.set(category, { score: prev.score + 2, reasons: [...new Set([...prev.reasons, ...reasons])] });
  }

  let best: { category: string; score: number; reasons: string[] } | null = null;
  for (const [category, meta] of counts) {
    if (!best || meta.score > best.score) best = { category, score: meta.score, reasons: meta.reasons };
  }
  return best;
}

function scoreWorkerClientHints(
  tx: BankTransaction,
  workers: WorkerDepositMatchSource[],
  clients: ClientDepositMatchSource[],
  haystack: string,
) {
  const reasons: string[] = [];
  let score = 0;

  for (const worker of workers) {
    const nameKey = normalizeKoreanMerchantName(worker.name || "");
    if (nameKey.length >= 2 && haystack.includes(nameKey)) {
      score += 8;
      reasons.push(`\uC2DC\uACF5\uC790 "${worker.name}"`);
      break;
    }
  }

  for (const client of clients) {
    const nameKey = normalizeKoreanMerchantName(client.name || "");
    if (nameKey.length >= 2 && haystack.includes(nameKey)) {
      score += 6;
      reasons.push(`\uAC70\uB798\uCC98 "${client.name}"`);
      break;
    }
  }

  return { score, reasons };
}

export function classifyBankTransactionForLedger(
  tx: BankTransaction,
  input: {
    rules?: BankLearnRule[];
    fixedExpenses?: FixedExpense[];
    expenseCategories?: string[];
    companyExpenses?: CompanyExpense[];
    workers?: WorkerDepositMatchSource[];
    clients?: ClientDepositMatchSource[];
  } = {},
): BankLedgerClassification | null {
  if (!(tx.withdrawal > 0) || tx.folderId || isNetGroupSuppressed(tx)) return null;

  const rules = input.rules || [];
  const fixedExpenses = input.fixedExpenses || [];
  const expenseCategories = input.expenseCategories || EXPENSE_CATEGORY_OPTIONS;
  const companyExpenses = input.companyExpenses || [];

  const learnFixed = findBestBankLearnRuleWithScore(tx, rules, fixedExpenses, ["fixed"]);
  if (learnFixed?.rule.fixedExpenseId) {
    const fixedRow = fixedExpenses.find((row) => row.id === learnFixed.rule.fixedExpenseId);
    return {
      targetKey: fixedLedgerTargetKey(learnFixed.rule.fixedExpenseId),
      kind: "fixed",
      fixedExpenseId: learnFixed.rule.fixedExpenseId,
      category: fixedRow?.category || learnFixed.rule.category,
      confidence: formatLearnRuleConfidencePercent(learnFixed.score),
      source: "learn_rule",
      label: fixedRow ? `[\uACE0\uC815\uBE44] ${fixedRow.name}` : "[\uACE0\uC815\uBE44]",
      reasons: ["\uD559\uC2B5 \uADDC\uCE59"],
    };
  }

  const learnManual = findBestBankLearnRuleWithScore(tx, rules, fixedExpenses, ["manual"]);
  if (learnManual?.rule.category) {
    const manualCategory = normalizeExpenseCategoryName(learnManual.rule.category);
    return {
      targetKey: manualLedgerTargetKey(manualCategory),
      kind: "manual",
      category: manualCategory,
      confidence: formatLearnRuleConfidencePercent(learnManual.score),
      source: "learn_rule",
      label: `[\uC9C0\uCD9C] ${learnManual.rule.category}`,
      reasons: ["\uD559\uC2B5 \uADDC\uCE59"],
    };
  }

  const haystack = buildBankLedgerMatchHaystack(tx);
  const tokens = extractBankLedgerTokens(tx.counterpartyName, tx.description, tx.memo);

  const historyMatch = scoreCategoryFromHistory(tx, companyExpenses, haystack, tokens);
  if (historyMatch && historyMatch.score >= 12) {
    const historyCategory = normalizeExpenseCategoryName(historyMatch.category);
    return {
      targetKey: manualLedgerTargetKey(historyCategory),
      kind: "manual",
      category: historyCategory,
      confidence: Math.min(92, 62 + Math.min(30, historyMatch.score)),
      source: "heuristic",
      label: `[\uC9C0\uCD9C] ${historyMatch.category}`,
      reasons: historyMatch.reasons,
    };
  }

  const hint = scoreWorkerClientHints(tx, input.workers || [], input.clients || [], haystack);
  const keywordCategory = guessExpenseCategory(
    [tx.description, tx.counterpartyName, tx.memo].filter(Boolean).join(" "),
  );
  const safeKeywordCategory = expenseCategories.includes(keywordCategory) ? keywordCategory : "\uAE30\uD0C0";

  if (hint.score >= 8) {
    return {
      targetKey: manualLedgerTargetKey(safeKeywordCategory),
      kind: "manual",
      category: safeKeywordCategory,
      confidence: Math.min(80, 55 + hint.score),
      source: "heuristic",
      label: `[\uC9C0\uCD9C] ${safeKeywordCategory}`,
      reasons: [...hint.reasons, `\uD0A4\uC6CC\uB4DC "${safeKeywordCategory}"`],
    };
  }

  const guessedKey = guessLedgerTargetFromBankTransaction(tx, fixedExpenses);
  const parsed = parseLedgerTargetKey(guessedKey);

  if (parsed?.kind === "manual" && parsed.category) {
    return {
      targetKey: guessedKey,
      kind: "manual",
      category: parsed.category,
      confidence: keywordCategory !== "\uAE30\uD0C0" ? 70 : 58,
      source: "heuristic",
      label: `[\uC9C0\uCD9C] ${parsed.category}`,
      reasons: keywordCategory !== "\uAE30\uD0C0" ? [`\uD0A4\uC6CC\uB4DC "${keywordCategory}"`] : ["\uAE30\uBCF8 \uCD94\uC815"],
    };
  }

  return null;
}

export function resolveBankTxLedgerMatchConfidence(
  tx: BankTransaction,
  input: {
    rules?: BankLearnRule[];
    fixedExpenses?: FixedExpense[];
    expenseCategories?: string[];
    companyExpenses?: CompanyExpense[];
    workers?: WorkerDepositMatchSource[];
    clients?: ClientDepositMatchSource[];
    memoCategorySuggestion?: MemoCategorySuggestion | null;
  } = {},
): number | null {
  if (input.memoCategorySuggestion) {
    return Math.round(input.memoCategorySuggestion.confidence);
  }

  const learnMatch = findBestBankLearnRuleWithScore(
    tx,
    input.rules || [],
    input.fixedExpenses || [],
    ["fixed", "manual"],
  );
  if (learnMatch) {
    return formatLearnRuleConfidencePercent(learnMatch.score);
  }

  const classification = classifyBankTransactionForLedger(tx, input);
  if (!classification) return null;
  return Math.round(classification.confidence);
}

export function evaluateBankTxLedgerRegistrationGate(
  tx: BankTransaction,
  input: Parameters<typeof resolveBankTxLedgerMatchConfidence>[1] = {},
) {
  const manualMemoOverride = hasManualLedgerCategoryMemoOverride(tx, input.expenseCategories);
  const confidence = resolveBankTxLedgerMatchConfidence(tx, input);
  if (manualMemoOverride) {
    return { allowed: true, confidence, manualMemoOverride: true as const };
  }
  return {
    allowed: meetsLedgerRegistrationConfidenceThreshold(confidence),
    confidence,
    manualMemoOverride: false as const,
  };
}

export function buildLedgerClassificationMap(
  transactions: BankTransaction[],
  input: Parameters<typeof classifyBankTransactionForLedger>[1] & {
    canRegister?: (tx: BankTransaction) => boolean;
  },
) {
  const map = new Map<string, BankLedgerClassification>();
  for (const tx of transactions) {
    if (input.canRegister && !input.canRegister(tx)) continue;
    const row = classifyBankTransactionForLedger(tx, input);
    if (row) map.set(tx.id, row);
  }
  return map;
}

export function formatClassificationConfidence(confidence: number) {
  return `${Math.round(confidence)}%`;
}
