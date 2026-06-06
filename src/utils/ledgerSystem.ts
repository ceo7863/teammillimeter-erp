import {
  buildStandardAccountCodes,
  STANDARD_ACCOUNT_PARENT_GROUPS,
} from "./standardAccountCodes";
import {
  CEO_ADVANCE_CATEGORY,
  CEO_RECEIVABLE_CATEGORY,
  EXPENSE_CATEGORY_OPTIONS,
  FIXED_CATEGORY_OPTIONS,
  type CompanyExpense,
  formatKRW,
  getMonthKey,
} from "./companyLedger";
import type { BankTransaction } from "./bankTransactions";

export type AccountCodeType = "asset" | "liability" | "equity" | "income" | "expense";

export type AccountCodeFlow = "income" | "expense" | "both";

export type AccountCode = {
  code: string;
  name: string;
  type: AccountCodeType;
  isActive: boolean;
  /** 1\uCC28 \uADF8\uB8F9 (\uB9E4\uCD9C, \uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44 \uB4F1) */
  parentGroup?: string;
  /** 2\uCC28 \uACC4\uC815 \uCF54\uB4DC \u2014 \uC788\uC73C\uBA74 3\uCC28 \uD558\uC704 \uACC4\uC815 */
  parentAccountCode?: string;
  flow?: AccountCodeFlow;
};

export const DEFAULT_ACCOUNT_PARENT_GROUPS = [
  ...STANDARD_ACCOUNT_PARENT_GROUPS,
  "\uC790\uC0B0",
  "\uBD80\uCC44",
] as const;

export type LedgerCategoryKind = "expense" | "income" | "fixed" | "ceo_advance" | "ceo_receivable";

export type LedgerCategory = {
  id: string;
  name: string;
  accountCode: string;
  kind: LedgerCategoryKind;
  sortOrder: number;
  isActive: boolean;
};

export type BankLedgerStatus = "none" | "pending" | "confirmed" | "exempt";

export type LedgerFlow = "expense" | "income";

export type LedgerEntry = {
  id: string;
  source: "bank" | "offline";
  bankTransactionId?: string;
  date: string;
  flow: LedgerFlow;
  amount: number;
  categoryId: string;
  categoryName: string;
  accountCode: string;
  accountName: string;
  description: string;
  memo?: string;
  fixedExpenseId?: string;
  counterpartyName?: string;
  status: BankLedgerStatus;
};

export const DEFAULT_COUNTER_ACCOUNT_CODE = "101";

export const DEFAULT_ACCOUNT_CODES: AccountCode[] = buildStandardAccountCodes() as AccountCode[];

export function normalizeAccountCodeFlow(value: unknown): AccountCodeFlow {
  return value === "income" || value === "expense" ? value : "both";
}

export function filterAccountCodesByFlow(rows: AccountCode[], flow: "all" | "income" | "expense") {
  if (flow === "all") return rows.filter((row) => row.isActive);
  return rows.filter((row) => {
    if (!row.isActive) return false;
    const rowFlow = row.flow || (row.type === "income" ? "income" : row.type === "expense" ? "expense" : "both");
    if (rowFlow === flow || rowFlow === "both") return true;
    if (row.parentAccountCode) {
      const parent = findAccountCodeByCode(rows, row.parentAccountCode);
      if (parent) {
        const parentFlow =
          parent.flow || (parent.type === "income" ? "income" : parent.type === "expense" ? "expense" : "both");
        return parentFlow === flow || parentFlow === "both";
      }
    }
    return false;
  });
}

export function findAccountCodeByCode(rows: AccountCode[], code: string) {
  return rows.find((row) => row.code === code);
}

export function resolveAccountCodeLabel(rows: AccountCode[], code: string | undefined) {
  if (!code) return null;
  const row = findAccountCodeByCode(rows, code);
  if (!row) return code;
  if (row.parentAccountCode) {
    const parent = findAccountCodeByCode(rows, row.parentAccountCode);
    if (parent) return `${parent.name} > ${row.name}`;
  }
  return row.name;
}

const CATEGORY_ACCOUNT_DEFAULTS: Record<string, string> = {
  [EXPENSE_CATEGORY_OPTIONS[0]]: "517",
  [EXPENSE_CATEGORY_OPTIONS[1]]: "504",
  [EXPENSE_CATEGORY_OPTIONS[2]]: "505",
  [EXPENSE_CATEGORY_OPTIONS[3]]: "506",
  [EXPENSE_CATEGORY_OPTIONS[4]]: "517",
  [EXPENSE_CATEGORY_OPTIONS[5]]: "519",
  [EXPENSE_CATEGORY_OPTIONS[6]]: "504",
  [CEO_ADVANCE_CATEGORY]: "108",
  [CEO_RECEIVABLE_CATEGORY]: "201",
  [EXPENSE_CATEGORY_OPTIONS[9]]: "900",
  [FIXED_CATEGORY_OPTIONS[0]]: "510",
  [FIXED_CATEGORY_OPTIONS[1]]: "518",
  [FIXED_CATEGORY_OPTIONS[2]]: "506",
  [FIXED_CATEGORY_OPTIONS[3]]: "512",
  [FIXED_CATEGORY_OPTIONS[4]]: "501",
  [FIXED_CATEGORY_OPTIONS[5]]: "900",
};

const UNCLASSIFIED_CATEGORY = "\uBBF8\uBD84\uB958";

export function makeLedgerCategoryId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `ledger-cat-${crypto.randomUUID()}`;
  return `ledger-cat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeAccountCodes(rows: unknown): AccountCode[] {
  if (!Array.isArray(rows) || !rows.length) return [...DEFAULT_ACCOUNT_CODES];
  const seen = new Set<string>();
  const result: AccountCode[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<AccountCode>;
    const code = String(row.code || "").trim();
    const name = String(row.name || "").trim();
    if (!code || !name || seen.has(code)) continue;
    seen.add(code);
    const type = row.type;
    const parentGroup = String(row.parentGroup || "").trim() || undefined;
    const parentAccountCode = String(row.parentAccountCode || "").trim() || undefined;
    result.push({
      code,
      name,
      type:
        type === "asset" || type === "liability" || type === "equity" || type === "income" || type === "expense"
          ? type
          : "expense",
      isActive: row.isActive !== false,
      parentGroup,
      parentAccountCode,
      flow: normalizeAccountCodeFlow(row.flow),
    });
  }
  return result.length ? result : [...DEFAULT_ACCOUNT_CODES];
}

export function normalizeLedgerCategories(rows: unknown): LedgerCategory[] {
  if (!Array.isArray(rows) || !rows.length) return buildDefaultLedgerCategories();
  const result: LedgerCategory[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<LedgerCategory>;
    const id = String(row.id || "").trim();
    const name = String(row.name || "").trim();
    const accountCode = String(row.accountCode || "").trim();
    if (!id || !name || !accountCode) continue;
    const kind = row.kind;
    result.push({
      id,
      name,
      accountCode,
      kind:
        kind === "income" || kind === "fixed" || kind === "ceo_advance" || kind === "ceo_receivable"
          ? kind
          : "expense",
      sortOrder: Number(row.sortOrder) || result.length,
      isActive: row.isActive !== false,
    });
  }
  return result.length ? result.sort((a, b) => a.sortOrder - b.sortOrder) : buildDefaultLedgerCategories();
}

export function buildDefaultLedgerCategories(
  expenseCategories: string[] = EXPENSE_CATEGORY_OPTIONS,
  fixedExpenseCategories: string[] = FIXED_CATEGORY_OPTIONS,
): LedgerCategory[] {
  const categories: LedgerCategory[] = [];
  let order = 0;

  const push = (name: string, kind: LedgerCategoryKind, accountCode?: string) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    categories.push({
      id: makeLedgerCategoryId(),
      name: trimmed,
      accountCode: accountCode || CATEGORY_ACCOUNT_DEFAULTS[trimmed] || "900",
      kind,
      sortOrder: order++,
      isActive: true,
    });
  };

  for (const name of expenseCategories) {
    if (name === CEO_ADVANCE_CATEGORY) push(name, "ceo_advance", "108");
    else if (name === CEO_RECEIVABLE_CATEGORY) push(name, "ceo_receivable", "201");
    else push(name, "expense");
  }
  for (const name of fixedExpenseCategories) {
    if (!categories.some((row) => row.name === name)) push(name, "fixed");
  }

  if (!categories.length) {
    for (const name of EXPENSE_CATEGORY_OPTIONS) {
      push(
        name,
        name === CEO_ADVANCE_CATEGORY ? "ceo_advance" : name === CEO_RECEIVABLE_CATEGORY ? "ceo_receivable" : "expense",
      );
    }
    for (const name of FIXED_CATEGORY_OPTIONS) push(name, "fixed");
  }

  return categories;
}

export function findAccountCode(accountCodes: AccountCode[], code: string) {
  return accountCodes.find((row) => row.code === code && row.isActive);
}

export function findLedgerCategory(categories: LedgerCategory[], id: string) {
  return categories.find((row) => row.id === id && row.isActive);
}

export function findLedgerCategoryByName(categories: LedgerCategory[], name: string) {
  const trimmed = String(name || "").trim();
  return categories.find((row) => row.name === trimmed && row.isActive);
}

export function resolveBankTxLedgerFlow(tx: Pick<BankTransaction, "withdrawal" | "deposit">): LedgerFlow | null {
  if (Number(tx.withdrawal || 0) > 0) return "expense";
  if (Number(tx.deposit || 0) > 0) return "income";
  return null;
}

export function resolveBankTxLedgerAmount(tx: Pick<BankTransaction, "withdrawal" | "deposit">) {
  const flow = resolveBankTxLedgerFlow(tx);
  if (flow === "expense") return Number(tx.withdrawal || 0);
  if (flow === "income") return Number(tx.deposit || 0);
  return 0;
}

export function isBankTxLinkedToOtherDomain(tx: BankTransaction) {
  return Boolean(
    tx.linkedSalesId ||
      tx.linkedPaymentVoucherId ||
      tx.linkedWorkerMonthlyPaymentVoucherId ||
      (tx.folderId && tx.linkedSubject),
  );
}

export function isPreauthNetSuppressed(tx: BankTransaction) {
  return tx.netGroupRole === "preauth_withdrawal" || tx.netGroupRole === "preauth_refund";
}

export function resolveBankTxLedgerStatus(tx: BankTransaction): BankLedgerStatus {
  const explicit = tx.ledgerStatus;
  if (explicit === "pending" || explicit === "confirmed" || explicit === "exempt") return explicit;
  if (tx.linkedCompanyExpenseId || tx.linkedFixedExpensePaymentId || tx.ledgerCategoryId) return "confirmed";
  if (isBankTxLinkedToOtherDomain(tx)) return "exempt";
  return "none";
}

export function isBankTxLedgerCandidate(tx: BankTransaction) {
  if (isPreauthNetSuppressed(tx)) return false;
  if (resolveBankTxLedgerAmount(tx) <= 0) return false;
  if (resolveBankTxLedgerStatus(tx) === "exempt") return false;
  return true;
}

export function buildLedgerEntryFromBankTx(
  tx: BankTransaction,
  categories: LedgerCategory[],
  accountCodes: AccountCode[],
): LedgerEntry | null {
  const status = resolveBankTxLedgerStatus(tx);
  if (status !== "confirmed" && status !== "pending") return null;
  const flow = resolveBankTxLedgerFlow(tx);
  if (!flow) return null;
  const amount = resolveBankTxLedgerAmount(tx);
  if (amount <= 0) return null;

  const category = tx.ledgerCategoryId ? findLedgerCategory(categories, tx.ledgerCategoryId) : undefined;
  if (!category && status === "pending") {
    return {
      id: `bank-${tx.id}`,
      source: "bank",
      bankTransactionId: tx.id,
      date: String(tx.transactionAt || "").slice(0, 10),
      flow,
      amount,
      categoryId: "",
      categoryName: UNCLASSIFIED_CATEGORY,
      accountCode: tx.ledgerAccountCode || "",
      accountName: "",
      description: String(tx.description || tx.counterpartyName || "").trim(),
      memo: tx.ledgerMemo || tx.memo,
      fixedExpenseId: tx.ledgerFixedExpenseId,
      counterpartyName: tx.counterpartyName,
      status,
    };
  }
  if (!category) return null;

  const accountCode = tx.ledgerAccountCode || category.accountCode;
  const account = findAccountCode(accountCodes, accountCode);

  return {
    id: `bank-${tx.id}`,
    source: "bank",
    bankTransactionId: tx.id,
    date: String(tx.transactionAt || "").slice(0, 10),
    flow,
    amount,
    categoryId: category.id,
    categoryName: category.name,
    accountCode,
    accountName: account?.name || accountCode,
    description: String(tx.description || tx.counterpartyName || "").trim(),
    memo: tx.ledgerMemo || tx.memo,
    fixedExpenseId: tx.ledgerFixedExpenseId,
    counterpartyName: tx.counterpartyName,
    status,
  };
}

export function buildOfflineLedgerEntry(
  expense: CompanyExpense,
  categories: LedgerCategory[],
  accountCodes: AccountCode[],
): LedgerEntry | null {
  if (expense.bankTransactionId) return null;
  const flow = expense.flow === "income" ? "income" : "expense";
  const amount = Number(expense.amount) || 0;
  if (amount <= 0) return null;
  const category = findLedgerCategoryByName(categories, expense.category);
  const accountCode = category?.accountCode || CATEGORY_ACCOUNT_DEFAULTS[expense.category] || "900";
  const account = findAccountCode(accountCodes, accountCode);
  return {
    id: `offline-${expense.id}`,
    source: "offline",
    date: String(expense.date || "").slice(0, 10),
    flow,
    amount,
    categoryId: category?.id || "",
    categoryName: expense.category,
    accountCode,
    accountName: account?.name || accountCode,
    description: String(expense.accountContent || expense.description || "").trim(),
    memo: expense.memo,
    status: "confirmed",
  };
}

export function buildAllLedgerEntries(input: {
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
  categories: LedgerCategory[];
  accountCodes: AccountCode[];
}) {
  const bankEntries = input.bankTransactions
    .map((tx) => buildLedgerEntryFromBankTx(tx, input.categories, input.accountCodes))
    .filter((row): row is LedgerEntry => Boolean(row));
  const offlineEntries = input.companyExpenses
    .map((row) => buildOfflineLedgerEntry(row, input.categories, input.accountCodes))
    .filter((row): row is LedgerEntry => Boolean(row));
  return [...bankEntries, ...offlineEntries].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export type MonthlyLedgerSummaryRow = {
  monthKey: string;
  label: string;
  expenseTotal: number;
  incomeTotal: number;
  netTotal: number;
  count: number;
};

export function buildMonthlyLedgerSummary(entries: LedgerEntry[]): MonthlyLedgerSummaryRow[] {
  const bucket = new Map<string, MonthlyLedgerSummaryRow>();
  for (const row of entries.filter((item) => item.status === "confirmed")) {
    const monthKey = getMonthKey(row.date);
    if (!monthKey) continue;
    const current = bucket.get(monthKey) || {
      monthKey,
      label: `${monthKey.slice(0, 4)}\uB144 ${Number(monthKey.slice(5))}\uC6D4`,
      expenseTotal: 0,
      incomeTotal: 0,
      netTotal: 0,
      count: 0,
    };
    if (row.flow === "income") current.incomeTotal += row.amount;
    else current.expenseTotal += row.amount;
    current.netTotal = current.incomeTotal - current.expenseTotal;
    current.count += 1;
    bucket.set(monthKey, current);
  }
  return [...bucket.values()].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export type AccountCodeSummaryRow = {
  accountCode: string;
  accountName: string;
  expenseTotal: number;
  incomeTotal: number;
  count: number;
};

export function buildAccountCodeSummary(
  entries: LedgerEntry[],
  accountCodes: AccountCode[],
): AccountCodeSummaryRow[] {
  const bucket = new Map<string, AccountCodeSummaryRow>();
  for (const row of entries.filter((item) => item.status === "confirmed")) {
    const code = row.accountCode || "900";
    const current = bucket.get(code) || {
      accountCode: code,
      accountName: resolveAccountCodeLabel(accountCodes, code) || row.accountName || code,
      expenseTotal: 0,
      incomeTotal: 0,
      count: 0,
    };
    if (row.flow === "income") current.incomeTotal += row.amount;
    else current.expenseTotal += row.amount;
    current.count += 1;
    bucket.set(code, current);
  }
  return [...bucket.values()].sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

export type LedgerGapSummary = {
  withdrawalTotal: number;
  depositTotal: number;
  confirmedExpenseTotal: number;
  confirmedIncomeTotal: number;
  unclassifiedWithdrawal: number;
  unclassifiedDeposit: number;
  unclassifiedCount: number;
};

export function buildLedgerGapSummary(
  bankTransactions: BankTransaction[],
  entries: LedgerEntry[],
  monthKey?: string,
): LedgerGapSummary {
  const inMonth = (tx: BankTransaction) => !monthKey || getMonthKey(String(tx.transactionAt || "").slice(0, 10)) === monthKey;
  const confirmed = entries.filter((row) => row.status === "confirmed" && (!monthKey || getMonthKey(row.date) === monthKey));

  let withdrawalTotal = 0;
  let depositTotal = 0;
  let unclassifiedWithdrawal = 0;
  let unclassifiedDeposit = 0;
  let unclassifiedCount = 0;

  for (const tx of bankTransactions.filter(inMonth)) {
    if (!isBankTxLedgerCandidate(tx)) continue;
    const status = resolveBankTxLedgerStatus(tx);
    const flow = resolveBankTxLedgerFlow(tx);
    const amount = resolveBankTxLedgerAmount(tx);
    if (flow === "expense") withdrawalTotal += amount;
    if (flow === "income") depositTotal += amount;
    if (status === "none" || status === "pending") {
      unclassifiedCount += 1;
      if (flow === "expense") unclassifiedWithdrawal += amount;
      if (flow === "income") unclassifiedDeposit += amount;
    }
  }

  return {
    withdrawalTotal,
    depositTotal,
    confirmedExpenseTotal: confirmed.filter((row) => row.flow === "expense").reduce((sum, row) => sum + row.amount, 0),
    confirmedIncomeTotal: confirmed.filter((row) => row.flow === "income").reduce((sum, row) => sum + row.amount, 0),
    unclassifiedWithdrawal,
    unclassifiedDeposit,
    unclassifiedCount,
  };
}

export function confirmBankTransactionLedger(input: {
  tx: BankTransaction;
  category: LedgerCategory;
  accountCodes: AccountCode[];
  memo?: string;
  fixedExpenseId?: string;
  confirmedBy?: string;
}): BankTransaction {
  const accountCode = input.category.accountCode || "900";
  return {
    ...input.tx,
    ledgerStatus: "confirmed",
    ledgerCategoryId: input.category.id,
    ledgerAccountCode: accountCode,
    ledgerMemo: input.memo?.trim() || input.tx.ledgerMemo,
    ledgerFixedExpenseId: input.fixedExpenseId,
    ledgerConfirmedAt: new Date().toISOString(),
    ledgerConfirmedBy: input.confirmedBy,
    linkedCompanyExpenseId: undefined,
    linkedFixedExpensePaymentId: undefined,
  };
}

export function exemptBankTransactionLedger(tx: BankTransaction): BankTransaction {
  return {
    ...tx,
    ledgerStatus: "exempt",
    ledgerCategoryId: undefined,
    ledgerAccountCode: undefined,
    ledgerMemo: undefined,
    ledgerFixedExpenseId: undefined,
    ledgerConfirmedAt: new Date().toISOString(),
  };
}

export function resetBankTransactionLedger(tx: BankTransaction): BankTransaction {
  return {
    ...tx,
    ledgerStatus: "none",
    ledgerCategoryId: undefined,
    ledgerAccountCode: undefined,
    ledgerMemo: undefined,
    ledgerFixedExpenseId: undefined,
    ledgerConfirmedAt: undefined,
    ledgerConfirmedBy: undefined,
  };
}

export function formatLedgerGapLine(summary: LedgerGapSummary) {
  if (summary.unclassifiedCount <= 0) return "\uBBF8\uBD84\uB958 \uD1B5\uC7A5 \uAC70\uB798\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
  return `\uBBF8\uBD84\uB958 ${summary.unclassifiedCount}\uAC74 \u00B7 \uCD9C\uAE08 ${formatKRW(summary.unclassifiedWithdrawal)} \u00B7 \uC785\uAE08 ${formatKRW(summary.unclassifiedDeposit)}`;
}

export { formatKRW };
