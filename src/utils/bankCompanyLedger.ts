import type { BankTransaction } from "./bankTransactions";
import type { FixedExpense } from "./companyLedger";
import { EXPENSE_CATEGORY_OPTIONS } from "./companyLedger";

export type LedgerTargetKind = "manual" | "fixed";

export type ParsedLedgerTarget = {
  kind: LedgerTargetKind;
  category?: string;
  fixedExpenseId?: string;
};

export function canRegisterBankTxToCompanyLedger(tx: BankTransaction) {
  return (
    !tx.folderId &&
    tx.withdrawal > 0 &&
    !tx.linkedCompanyExpenseId &&
    !tx.linkedFixedExpensePaymentId
  );
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

export function buildLedgerTargetOptions(fixedExpenses: FixedExpense[] = []) {
  const manualOptions = EXPENSE_CATEGORY_OPTIONS.map((category) => ({
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

function guessExpenseCategory(text: string) {
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

function normalizeMatchText(text: string) {
  return String(text || "").toLowerCase().replace(/\s+/g, "");
}

export function guessLedgerTargetFromBankTransaction(
  tx: BankTransaction,
  fixedExpenses: FixedExpense[] = [],
) {
  const haystack = normalizeMatchText(
    [tx.description, tx.counterpartyName, tx.memo, tx.transactionType]
      .filter(Boolean)
      .join(" "),
  );

  let bestFixed: { id: string; score: number } | null = null;
  for (const row of fixedExpenses.filter((item) => item.isActive)) {
    const nameKey = normalizeMatchText(row.name);
    const categoryKey = normalizeMatchText(row.category);
    let score = 0;
    if (nameKey.length >= 2 && haystack.includes(nameKey)) score += 10 + nameKey.length;
    if (categoryKey.length >= 2 && haystack.includes(categoryKey)) score += 4;
    const tokens = String(row.name || "")
      .split(/[\s/.]+/)
      .map((token) => normalizeMatchText(token))
      .filter((token) => token.length >= 2);
    for (const token of tokens) {
      if (haystack.includes(token)) score += 3;
    }
    if (score > 0 && (!bestFixed || score > bestFixed.score)) {
      bestFixed = { id: row.id, score };
    }
  }

  if (bestFixed && bestFixed.score >= 5) {
    return fixedLedgerTargetKey(bestFixed.id);
  }

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

  const category = guessExpenseCategory(`${description} ${memoParts.join(" ")}`);
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
