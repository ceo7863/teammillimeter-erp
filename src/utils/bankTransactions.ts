import { compareSortValues, type SortDirection } from "./pivotSort";

function isPreauthNetTotalsSuppressed(row: BankTransaction) {
  return row.netGroupRole === "preauth_withdrawal" || row.netGroupRole === "preauth_refund";
}

export type BankTransactionFlowFilter = "all" | "deposit" | "withdrawal";

export type BankTransactionSortKey = "transactionAt" | "deposit" | "withdrawal" | "balanceAfter";

export type BankTransactionSort = {
  key: BankTransactionSortKey;
  direction: "asc" | "desc";
};

export const DEFAULT_BANK_TRANSACTION_SORT: BankTransactionSort = {
  key: "transactionAt",
  direction: "desc",
};

export type BankTransaction = {
  id: string;
  transactionAt: string;
  withdrawal: number;
  deposit: number;
  balanceAfter: number;
  description: string;
  counterpartyAccount?: string;
  counterpartyBank?: string;
  memo?: string;
  transactionType?: string;
  counterpartyName?: string;
  accountNumber: string;
  bankName: string;
  importBatchId?: string;
  sourceFile?: string;
  createdAt: string;
  folderId?: string;
  linkedSubject?: string;
  classifiedAt?: string;
  classificationNote?: string;
  linkedSalesId?: string | number;
  linkedPaymentVoucherId?: string | number;
  linkedPdfArchiveId?: string;
  linkedCompanyExpenseId?: string;
  linkedFixedExpensePaymentId?: string;
  matchConfirmedAt?: string;
  matchConfirmedBy?: string;
  matchAutoLinked?: boolean;
  netGroupId?: string;
  netGroupRole?: "preauth_withdrawal" | "preauth_refund" | "settlement";
};

export function makeBankTransactionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `bank-tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseBankAmount(value: unknown) {
  const num = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? Math.round(num) : 0;
}

export function buildImportFingerprint(row: Pick<
  BankTransaction,
  "accountNumber" | "transactionAt" | "withdrawal" | "deposit" | "balanceAfter" | "description"
>) {
  return [
    String(row.accountNumber || "").trim(),
    String(row.transactionAt || "").trim(),
    String(row.withdrawal || 0),
    String(row.deposit || 0),
    String(row.balanceAfter || 0),
    String(row.description || "").trim(),
  ].join("|");
}

export function normalizeBankTransaction(raw: Partial<BankTransaction> & { id: string }): BankTransaction {
  return {
    id: raw.id,
    transactionAt: String(raw.transactionAt || new Date().toISOString()),
    withdrawal: parseBankAmount(raw.withdrawal),
    deposit: parseBankAmount(raw.deposit),
    balanceAfter: parseBankAmount(raw.balanceAfter),
    description: String(raw.description || ""),
    counterpartyAccount: raw.counterpartyAccount ? String(raw.counterpartyAccount) : undefined,
    counterpartyBank: raw.counterpartyBank ? String(raw.counterpartyBank) : undefined,
    memo: raw.memo ? String(raw.memo) : undefined,
    transactionType: raw.transactionType ? String(raw.transactionType) : undefined,
    counterpartyName: raw.counterpartyName ? String(raw.counterpartyName) : undefined,
    accountNumber: String(raw.accountNumber || ""),
    bankName: String(raw.bankName || "IBK"),
    importBatchId: raw.importBatchId ? String(raw.importBatchId) : undefined,
    sourceFile: raw.sourceFile ? String(raw.sourceFile) : undefined,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    folderId: raw.folderId ? String(raw.folderId) : undefined,
    linkedSubject: raw.linkedSubject ? String(raw.linkedSubject) : undefined,
    classifiedAt: raw.classifiedAt ? String(raw.classifiedAt) : undefined,
    classificationNote: raw.classificationNote ? String(raw.classificationNote) : undefined,
    linkedSalesId: raw.linkedSalesId != null && raw.linkedSalesId !== "" ? raw.linkedSalesId : undefined,
    linkedPaymentVoucherId:
      raw.linkedPaymentVoucherId != null && raw.linkedPaymentVoucherId !== "" ? raw.linkedPaymentVoucherId : undefined,
    linkedPdfArchiveId: raw.linkedPdfArchiveId ? String(raw.linkedPdfArchiveId) : undefined,
    linkedCompanyExpenseId: raw.linkedCompanyExpenseId ? String(raw.linkedCompanyExpenseId) : undefined,
    linkedFixedExpensePaymentId: raw.linkedFixedExpensePaymentId
      ? String(raw.linkedFixedExpensePaymentId)
      : undefined,
    matchConfirmedAt: raw.matchConfirmedAt ? String(raw.matchConfirmedAt) : undefined,
    matchConfirmedBy: raw.matchConfirmedBy ? String(raw.matchConfirmedBy) : undefined,
    matchAutoLinked:
      raw.matchAutoLinked === true ? true : raw.matchAutoLinked === false ? false : undefined,
    netGroupId: raw.netGroupId ? String(raw.netGroupId) : undefined,
    netGroupRole:
      raw.netGroupRole === "preauth_withdrawal" ||
      raw.netGroupRole === "preauth_refund" ||
      raw.netGroupRole === "settlement"
        ? raw.netGroupRole
        : undefined,
  };
}

export function normalizeBankTransactions(rows: unknown[]) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === "object" && "id" in row)
    .map((row) => normalizeBankTransaction(row as Partial<BankTransaction> & { id: string }));
}

export function sortBankTransactions(
  rows: BankTransaction[],
  options: { key?: BankTransactionSortKey; direction?: SortDirection } = {},
) {
  const key = options.key ?? DEFAULT_BANK_TRANSACTION_SORT.key;
  const direction = options.direction ?? DEFAULT_BANK_TRANSACTION_SORT.direction;

  const getValue = (row: BankTransaction) => {
    if (key === "deposit") return row.deposit;
    if (key === "withdrawal") return row.withdrawal;
    if (key === "balanceAfter") return row.balanceAfter;
    return row.transactionAt;
  };

  return [...rows].sort((a, b) => {
    const primary = compareSortValues(getValue(a), getValue(b), direction);
    if (primary !== 0) return primary;
    if (key !== "transactionAt") {
      return compareSortValues(a.transactionAt, b.transactionAt, "desc");
    }
    return compareSortValues(a.createdAt, b.createdAt, direction);
  });
}

export function filterBankTransactions(
  rows: BankTransaction[],
  options: {
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    flowType?: BankTransactionFlowFilter;
    accountNumber?: string;
    folderId?: string;
  } = {}
) {
  const search = String(options.search || "").trim().toLowerCase();
  const dateFrom = String(options.dateFrom || "");
  const dateTo = String(options.dateTo || "");
  const flowType = options.flowType || "all";
  const accountNumber = String(options.accountNumber || "").trim();
  const folderId = String(options.folderId || "");

  return rows.filter((row) => {
    if (accountNumber && row.accountNumber !== accountNumber) return false;
    if (folderId === "__unfiled__" && row.folderId) return false;
    if (folderId && folderId !== "__unfiled__" && row.folderId !== folderId) return false;

    const txDate = String(row.transactionAt || "").slice(0, 10);
    if (dateFrom && txDate < dateFrom) return false;
    if (dateTo && txDate > dateTo) return false;

    if (flowType === "deposit" && row.deposit <= 0) return false;
    if (flowType === "withdrawal" && row.withdrawal <= 0) return false;

    if (!search) return true;

    const haystack = [
      row.description,
      row.counterpartyName || "",
      row.counterpartyBank || "",
      row.counterpartyAccount || "",
      row.memo || "",
      row.transactionType || "",
      row.accountNumber,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
}

export function sumBankTransactions(rows: BankTransaction[]) {
  return rows.reduce(
    (acc, row) => {
      acc.count += 1;
      if (!isPreauthNetTotalsSuppressed(row)) {
        acc.deposits += row.deposit;
        acc.withdrawals += row.withdrawal;
      }
      return acc;
    },
    { count: 0, deposits: 0, withdrawals: 0, net: 0 }
  );
}

export function buildBankTransactionStats(rows: BankTransaction[]) {
  const totals = sumBankTransactions(rows);
  return { ...totals, net: totals.deposits - totals.withdrawals };
}

export function listBankTransactionAccounts(rows: BankTransaction[]) {
  const accounts = new Set<string>();
  rows.forEach((row) => {
    const account = String(row.accountNumber || "").trim();
    if (account) accounts.add(account);
  });
  return [...accounts].sort((a, b) => a.localeCompare(b, "ko"));
}

export function formatBankTransactionDateTime(iso: string) {
  if (!iso) return "-";
  const text = String(iso);
  if (text.length >= 16) return text.slice(0, 16).replace("T", " ");
  return text.slice(0, 10);
}

export type BankAccountSummary = {
  accountNumber: string;
  bankName: string;
  latestBalance: number;
  latestAt: string;
  count: number;
};

export function buildBankAccountSummaries(rows: BankTransaction[]): BankAccountSummary[] {
  const map = new Map<string, BankAccountSummary>();
  for (const row of rows) {
    const accountNumber = String(row.accountNumber || "").trim();
    if (!accountNumber) continue;
    const existing = map.get(accountNumber);
    if (!existing) {
      map.set(accountNumber, {
        accountNumber,
        bankName: row.bankName || "IBK",
        latestBalance: row.balanceAfter,
        latestAt: row.transactionAt,
        count: 1,
      });
      continue;
    }
    existing.count += 1;
    if (String(row.transactionAt).localeCompare(existing.latestAt) > 0) {
      existing.latestBalance = row.balanceAfter;
      existing.latestAt = row.transactionAt;
    }
  }
  return [...map.values()].sort((a, b) => a.accountNumber.localeCompare(b.accountNumber, "ko"));
}

export type BankCounterpartySummary = {
  name: string;
  depositTotal: number;
  withdrawalTotal: number;
  count: number;
};

export function buildTopCounterpartySummaries(rows: BankTransaction[], limit = 5): BankCounterpartySummary[] {
  const map = new Map<string, BankCounterpartySummary>();
  for (const row of rows) {
    const name = String(row.counterpartyName || row.description || "").trim();
    if (!name) continue;
    const existing = map.get(name) || { name, depositTotal: 0, withdrawalTotal: 0, count: 0 };
    existing.depositTotal += row.deposit;
    existing.withdrawalTotal += row.withdrawal;
    existing.count += 1;
    map.set(name, existing);
  }
  return [...map.values()]
    .sort((a, b) => b.depositTotal + b.withdrawalTotal - (a.depositTotal + a.withdrawalTotal))
    .slice(0, limit);
}
