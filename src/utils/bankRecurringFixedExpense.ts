import { isNetGroupSuppressed } from "./bankPreauthNetting";
import type { BankTransaction } from "./bankTransactions";
import {
  buildBankLedgerMatchRuleFromRegistration,
  upsertBankLearnRule,
  type BankLearnRule,
} from "./bankCompanyLedger";
import type { FixedExpense, FixedExpensePayment } from "./companyLedger";
import {
  FIXED_CATEGORY_OPTIONS,
  getMonthKey,
  linkFixedExpensePaymentToBankTx,
  makeLedgerId,
  normalizeFixedExpensePaymentDay,
  areRecurringAmountsCompatible,
  RECURRING_FIXED_AMOUNT_TOLERANCE_RATIO,
} from "./companyLedger";

export type RecurringFixedExpensePattern = {
  key: string;
  name: string;
  amount: number;
  paymentDayOfMonth: number;
  daySpread: number;
  amountFlexible: boolean;
  transactions: BankTransaction[];
  monthKeys: string[];
  monthCount: number;
  existingFixedExpenseId?: string;
};

export const RECURRING_FIXED_DAY_TOLERANCE = 3;

function normalizeRecurringName(text: string) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeRecurringNameKey(text: string) {
  return normalizeRecurringName(text).toLowerCase().replace(/\s+/g, "");
}

function resolveWithdrawalName(tx: BankTransaction) {
  return normalizeRecurringName(tx.counterpartyName || tx.description || "");
}

export function extractRecurringDescriptionStem(text: string) {
  return normalizeRecurringName(text)
    .replace(/[\d]+$/g, "")
    .trim();
}

function resolvePatternDisplayName(tx: BankTransaction) {
  const descriptionStem = extractRecurringDescriptionStem(tx.description || "");
  if (descriptionStem.length >= 2) return descriptionStem;
  return resolveWithdrawalName(tx);
}

function buildFuzzyRecurrenceKey(tx: BankTransaction) {
  const counterpartyKey = normalizeRecurringNameKey(tx.counterpartyName || "");
  const stemKey = normalizeRecurringNameKey(extractRecurringDescriptionStem(tx.description || ""));
  if (stemKey.length >= 2) {
    return counterpartyKey ? `${counterpartyKey}:${stemKey}` : stemKey;
  }
  return `${counterpartyKey}:${normalizeRecurringNameKey(resolveWithdrawalName(tx))}`;
}

function getTransactionDayOfMonth(transactionAt: string) {
  const day = Number(String(transactionAt || "").slice(8, 10));
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : 0;
}

function isEligibleRecurringWithdrawal(tx: BankTransaction) {
  if (isNetGroupSuppressed(tx)) return false;
  if (!(Number(tx.withdrawal) > 0)) return false;
  if (tx.linkedFixedExpensePaymentId) return false;
  if (tx.folderId) return false;
  const name = resolveWithdrawalName(tx);
  const day = getTransactionDayOfMonth(tx.transactionAt);
  return Boolean(name && day);
}

function buildPatternKey(day: number, name: string, amount: number, fuzzy = false) {
  return `${fuzzy ? "fuzzy" : "exact"}:${day}:${normalizeRecurringNameKey(name)}:${amount}`;
}

function buildAmountNameKey(name: string, amount: number) {
  return `${normalizeRecurringNameKey(name)}:${amount}`;
}

export function areRecurringPaymentDaysCompatible(
  nominalDay: number,
  actualDay: number,
  tolerance = RECURRING_FIXED_DAY_TOLERANCE,
) {
  const base = normalizeFixedExpensePaymentDay(nominalDay);
  const actual = normalizeFixedExpensePaymentDay(actualDay);
  return Math.abs(actual - base) <= tolerance;
}

function resolveRepresentativePaymentDay(days: number[]) {
  const counts = new Map<number, number>();
  for (const day of days.map((value) => normalizeFixedExpensePaymentDay(value))) {
    counts.set(day, (counts.get(day) || 0) + 1);
  }

  let bestDay = normalizeFixedExpensePaymentDay(days[0] || 1);
  let bestCount = -1;
  for (const [day, count] of counts.entries()) {
    if (count > bestCount || (count === bestCount && day < bestDay)) {
      bestDay = day;
      bestCount = count;
    }
  }
  return bestDay;
}

function resolveMedianAmount(amounts: number[]) {
  if (!amounts.length) return 0;
  const sorted = [...amounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function computeAmountFlexible(amounts: number[], representativeAmount: number) {
  if (amounts.length < 2 || !(representativeAmount > 0)) return false;
  const uniqueAmounts = new Set(amounts);
  if (uniqueAmounts.size <= 1) return false;
  return amounts.every((amount) => areRecurringAmountsCompatible(representativeAmount, amount));
}

function pickMonthlyRecurringTransactions(txs: BankTransaction[]) {
  const byMonth = new Map<string, BankTransaction[]>();
  for (const tx of txs) {
    const monthKey = getMonthKey(String(tx.transactionAt || "").slice(0, 10));
    if (!monthKey) continue;
    const bucket = byMonth.get(monthKey) || [];
    bucket.push(tx);
    byMonth.set(monthKey, bucket);
  }

  const allDays = txs.map((tx) => getTransactionDayOfMonth(tx.transactionAt));
  const representativeDay = resolveRepresentativePaymentDay(allDays);

  const picked = [...byMonth.values()].map((monthTxs) => {
    if (monthTxs.length === 1) return monthTxs[0];
    return [...monthTxs].sort((a, b) => {
      const diffA = Math.abs(getTransactionDayOfMonth(a.transactionAt) - representativeDay);
      const diffB = Math.abs(getTransactionDayOfMonth(b.transactionAt) - representativeDay);
      return diffA - diffB || String(a.transactionAt).localeCompare(String(b.transactionAt));
    })[0];
  });

  return { picked, representativeDay };
}

function computeDaySpread(days: number[], representativeDay: number) {
  if (!days.length) return 0;
  return Math.max(...days.map((day) => Math.abs(normalizeFixedExpensePaymentDay(day) - representativeDay)));
}

function recurringNamesCompatible(a: string, b: string) {
  const keyA = normalizeRecurringNameKey(a);
  const keyB = normalizeRecurringNameKey(b);
  if (keyA === keyB) return true;
  const stemA = normalizeRecurringNameKey(extractRecurringDescriptionStem(a));
  const stemB = normalizeRecurringNameKey(extractRecurringDescriptionStem(b));
  return Boolean(stemA && stemA === stemB);
}

export function findMatchingFixedExpenseForPattern(
  fixedExpenses: FixedExpense[],
  pattern: Pick<RecurringFixedExpensePattern, "name" | "amount" | "paymentDayOfMonth" | "amountFlexible">,
  options: { dayTolerance?: number } = {},
) {
  const tolerance = options.dayTolerance ?? RECURRING_FIXED_DAY_TOLERANCE;
  const day = normalizeFixedExpensePaymentDay(pattern.paymentDayOfMonth);
  return fixedExpenses.find((row) => {
    if (!row.isActive) return false;
    if (!recurringNamesCompatible(row.name, pattern.name)) return false;
    if (!areRecurringPaymentDaysCompatible(day, row.paymentDayOfMonth, tolerance)) return false;
    if (pattern.amountFlexible || row.amount !== pattern.amount) {
      return areRecurringAmountsCompatible(row.amount, pattern.amount);
    }
    return Number(row.amount) === pattern.amount;
  });
}

function buildPatternFromTransactions(
  txs: BankTransaction[],
  fixedExpenses: FixedExpense[],
  options: { minMonths: number; dayTolerance: number; fuzzy: boolean },
): RecurringFixedExpensePattern | null {
  const { picked, representativeDay } = pickMonthlyRecurringTransactions(txs);
  const observedDays = picked.map((tx) => getTransactionDayOfMonth(tx.transactionAt));
  const daySpread = computeDaySpread(observedDays, representativeDay);
  if (daySpread > options.dayTolerance) return null;

  const monthKeys = [...new Set(picked.map((tx) => getMonthKey(String(tx.transactionAt || "").slice(0, 10))))].filter(
    Boolean,
  );
  if (monthKeys.length < options.minMonths) return null;

  const amounts = picked.map((tx) => Number(tx.withdrawal) || 0).filter((amount) => amount > 0);
  const amount = resolveMedianAmount(amounts);
  if (!(amount > 0)) return null;
  if (!amounts.every((value) => areRecurringAmountsCompatible(amount, value))) return null;

  const sorted = [...picked].sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)));
  const sample = sorted[sorted.length - 1];
  const name = resolvePatternDisplayName(sample);
  const paymentDayOfMonth = representativeDay;
  const amountFlexible = computeAmountFlexible(amounts, amount);
  const key = buildPatternKey(paymentDayOfMonth, name, amount, options.fuzzy);
  const existing = findMatchingFixedExpenseForPattern(
    fixedExpenses,
    {
      name,
      amount,
      paymentDayOfMonth,
      amountFlexible,
    },
    { dayTolerance: options.dayTolerance },
  );

  return {
    key,
    name,
    amount,
    paymentDayOfMonth,
    daySpread,
    amountFlexible,
    transactions: sorted,
    monthKeys: monthKeys.sort(),
    monthCount: monthKeys.length,
    existingFixedExpenseId: existing?.id,
  };
}

export function detectRecurringFixedExpensePatterns(
  transactions: BankTransaction[],
  fixedExpenses: FixedExpense[] = [],
  options: { minMonths?: number; dayTolerance?: number } = {},
): RecurringFixedExpensePattern[] {
  const minMonths = Math.max(2, options.minMonths ?? 2);
  const dayTolerance = options.dayTolerance ?? RECURRING_FIXED_DAY_TOLERANCE;
  const detectOptions = { minMonths, dayTolerance };
  const usedTxIds = new Set<string>();
  const patterns: RecurringFixedExpensePattern[] = [];

  const exactBuckets = new Map<string, BankTransaction[]>();
  const fuzzyBuckets = new Map<string, BankTransaction[]>();

  for (const tx of transactions) {
    if (!isEligibleRecurringWithdrawal(tx)) continue;

    const exactName = resolveWithdrawalName(tx);
    const exactKey = buildAmountNameKey(exactName, Number(tx.withdrawal) || 0);
    const exactBucket = exactBuckets.get(exactKey) || [];
    exactBucket.push(tx);
    exactBuckets.set(exactKey, exactBucket);

    const fuzzyKey = buildFuzzyRecurrenceKey(tx);
    const fuzzyBucket = fuzzyBuckets.get(fuzzyKey) || [];
    fuzzyBucket.push(tx);
    fuzzyBuckets.set(fuzzyKey, fuzzyBucket);
  }

  for (const [, txs] of exactBuckets.entries()) {
    const pattern = buildPatternFromTransactions(txs, fixedExpenses, { ...detectOptions, fuzzy: false });
    if (!pattern) continue;
    patterns.push(pattern);
    for (const tx of pattern.transactions) usedTxIds.add(tx.id);
  }

  for (const [, txs] of fuzzyBuckets.entries()) {
    const remaining = txs.filter((tx) => !usedTxIds.has(tx.id));
    if (remaining.length < minMonths) continue;
    const pattern = buildPatternFromTransactions(remaining, fixedExpenses, { ...detectOptions, fuzzy: true });
    if (!pattern) continue;
    patterns.push(pattern);
    for (const tx of pattern.transactions) usedTxIds.add(tx.id);
  }

  const deduped = new Map<string, RecurringFixedExpensePattern>();
  for (const pattern of patterns) {
    const signature = pattern.transactions.map((tx) => tx.id).sort().join("|");
    if (!deduped.has(signature)) deduped.set(signature, pattern);
  }

  return [...deduped.values()].sort(
    (a, b) => b.monthCount - a.monthCount || b.amount - a.amount || a.name.localeCompare(b.name, "ko"),
  );
}

export type ApplyRecurringFixedExpenseResult = {
  fixedExpenses: FixedExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  bankTransactions: BankTransaction[];
  bankLedgerRules: BankLearnRule[];
  createdFixedCount: number;
  linkedPaymentCount: number;
  skippedLinkedCount: number;
};

function buildPatternMemo(pattern: RecurringFixedExpensePattern) {
  const parts = [`\uD1B5\uC7A5 \uBC18\uB3D9 \uC778\uC2DD`, `${pattern.monthCount}\uAC1C\uC6D4`];
  if (pattern.daySpread > 0) parts.push(`\uB0A9\uBD80\uC77C \u00B1${pattern.daySpread}\uC77C \uD5C8\uC6A9`);
  if (pattern.amountFlexible) parts.push(`\uAE08\uC561 \u00B1${Math.round(RECURRING_FIXED_AMOUNT_TOLERANCE_RATIO * 100)}% \uD5C8\uC6A9`);
  return parts.join(" \u00B7 ");
}

export function applyRecurringFixedExpensePatterns(input: {
  patterns: RecurringFixedExpensePattern[];
  fixedExpenses: FixedExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  bankTransactions: BankTransaction[];
  bankLedgerRules: BankLearnRule[];
  createdBy?: string;
  defaultCategory?: string;
}): ApplyRecurringFixedExpenseResult {
  let fixedExpenses = [...input.fixedExpenses];
  let fixedExpensePayments = [...input.fixedExpensePayments];
  let bankTransactions = [...input.bankTransactions];
  let bankLedgerRules = [...input.bankLedgerRules];
  let createdFixedCount = 0;
  let linkedPaymentCount = 0;
  let skippedLinkedCount = 0;

  const category = String(input.defaultCategory || FIXED_CATEGORY_OPTIONS.at(-1) || "\uAE30\uD0C0").trim();
  const createdAt = new Date().toISOString();
  const linkedBankTxIds = new Set(
    fixedExpensePayments.map((row) => row.bankTransactionId).filter(Boolean) as string[],
  );

  for (const pattern of input.patterns) {
    let fixedExpenseId = pattern.existingFixedExpenseId;
    if (!fixedExpenseId) {
      const existing = findMatchingFixedExpenseForPattern(fixedExpenses, pattern);
      fixedExpenseId = existing?.id;
    }

    if (!fixedExpenseId) {
      fixedExpenseId = makeLedgerId();
      fixedExpenses = [
        {
          id: fixedExpenseId,
          name: pattern.name,
          category,
          amount: pattern.amount,
          cycle: "monthly",
          paymentDayOfMonth: pattern.paymentDayOfMonth,
          startDate: pattern.monthKeys[0] ? `${pattern.monthKeys[0]}-01` : undefined,
          memo: buildPatternMemo(pattern),
          isActive: true,
        },
        ...fixedExpenses,
      ];
      createdFixedCount += 1;
    } else if (pattern.amountFlexible) {
      fixedExpenses = fixedExpenses.map((row) =>
        row.id === fixedExpenseId ? { ...row, amount: pattern.amount, memo: row.memo || buildPatternMemo(pattern) } : row,
      );
    }

    const sampleTx = pattern.transactions.find((tx) => !linkedBankTxIds.has(tx.id)) || pattern.transactions[0];
    if (sampleTx) {
      bankLedgerRules = upsertBankLearnRule(
        bankLedgerRules,
        buildBankLedgerMatchRuleFromRegistration(
          sampleTx,
          fixedExpenseId,
          input.createdBy,
          pattern.amountFlexible ? null : pattern.amount,
        ),
      );
    }

    for (const tx of pattern.transactions) {
      if (linkedBankTxIds.has(tx.id)) {
        skippedLinkedCount += 1;
        continue;
      }

      const monthKey = getMonthKey(String(tx.transactionAt || "").slice(0, 10));
      const date = String(tx.transactionAt || "").slice(0, 10);
      const txAmount = Number(tx.withdrawal) || pattern.amount;
      const existingPayment = fixedExpensePayments.find(
        (row) =>
          row.fixedExpenseId === fixedExpenseId &&
          getMonthKey(row.date) === monthKey &&
          !row.bankTransactionId,
      );

      let paymentId = existingPayment?.id;
      if (existingPayment) {
        fixedExpensePayments = linkFixedExpensePaymentToBankTx(
          fixedExpensePayments,
          existingPayment.id,
          tx.id,
          tx,
        );
      } else {
        paymentId = makeLedgerId();
        const payment: FixedExpensePayment = {
          id: paymentId,
          fixedExpenseId,
          date,
          amount: txAmount,
          memo: pattern.name,
          bankTransactionId: tx.id,
          createdBy: input.createdBy,
          createdAt,
        };
        fixedExpensePayments = [payment, ...fixedExpensePayments];
      }

      bankTransactions = bankTransactions.map((row) =>
        row.id === tx.id
          ? {
              ...row,
              linkedFixedExpensePaymentId: paymentId,
              linkedCompanyExpenseId: undefined,
            }
          : row,
      );
      linkedBankTxIds.add(tx.id);
      linkedPaymentCount += 1;
    }
  }

  return {
    fixedExpenses,
    fixedExpensePayments,
    bankTransactions,
    bankLedgerRules,
    createdFixedCount,
    linkedPaymentCount,
    skippedLinkedCount,
  };
}
