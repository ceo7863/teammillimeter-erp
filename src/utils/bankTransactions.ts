import { compareSortValues, type SortDirection } from "./pivotSort";

function normalizeLinkedTaxInvoiceIds(raw: Partial<BankTransaction>) {
  if (Array.isArray(raw.linkedTaxInvoiceIds)) {
    const ids = raw.linkedTaxInvoiceIds.map((id) => String(id || "").trim()).filter(Boolean);
    return ids.length ? [...new Set(ids)] : undefined;
  }
  if (raw.linkedTaxInvoiceId) return [String(raw.linkedTaxInvoiceId)];
  return undefined;
}

function resolvePrimaryLinkedTaxInvoiceId(raw: Partial<BankTransaction>) {
  return normalizeLinkedTaxInvoiceIds(raw)?.[0];
}

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
  linkedWorkerMonthlyPaymentVoucherId?: string;
  linkedPdfArchiveId?: string;
  linkedCompanyExpenseId?: string;
  linkedFixedExpensePaymentId?: string;
  matchConfirmedAt?: string;
  matchConfirmedBy?: string;
  matchAutoLinked?: boolean;
  netGroupId?: string;
  netGroupRole?: "preauth_withdrawal" | "preauth_refund" | "settlement";
  /** 가계부 V2: none=미분류, pending=제안, confirmed=확정, exempt=가계부 제외 */
  ledgerStatus?: "none" | "pending" | "confirmed" | "exempt";
  ledgerCategoryId?: string | null;
  ledgerAccountCode?: string;
  ledgerMemo?: string;
  ledgerFixedExpenseId?: string;
  ledgerConfirmedAt?: string;
  ledgerConfirmedBy?: string;
  /** \uBD84\uB958 \uAC70\uB798\uCC98\uBA85 */
  ledgerClientName?: string;
  /** \uC5F0\uACB0\uB41C \uC138\uAE08\uACC4\uC0B0\uC11C id (\uCCAB \uBC88\uC9F8, \uD558\uC704 \uD638\uD658) */
  linkedTaxInvoiceId?: string;
  /** \uC5F0\uACB0\uB41C \uC138\uAE08\uACC4\uC0B0\uC11C id \uBAA9\uB85D (\uD55C \uAC70\uB798\uC5D0 \uBCF5\uC218 \uACC4\uC0B0\uC11C) */
  linkedTaxInvoiceIds?: string[];
  /** \uC99D\uBE59 \uCC3E\uAE30\uC5D0\uC11C \uC218\uB3D9 \uC5F0\uACB0 \uD574\uC81C \u2192 \uC790\uB3D9 \uB9E4\uCE6D \uC81C\uC678 */
  taxInvoiceAutoLinkDisabled?: boolean;
};

export function makeBankTransactionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `bank-tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeBankTransactionType(value: string | undefined) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

/** IBK 거래구분 "체크" (check card) — excluded from automatic fixed-expense linking. */
export function isCheckCardBankTransaction(tx: Pick<BankTransaction, "transactionType">) {
  const normalized = normalizeBankTransactionType(tx.transactionType);
  if (!normalized) return false;
  return normalized.includes("체크") || normalized.includes("check");
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
    id: String(raw.id),
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
    linkedWorkerMonthlyPaymentVoucherId: raw.linkedWorkerMonthlyPaymentVoucherId
      ? String(raw.linkedWorkerMonthlyPaymentVoucherId)
      : undefined,
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
    ledgerStatus:
      raw.ledgerStatus === "pending" ||
      raw.ledgerStatus === "confirmed" ||
      raw.ledgerStatus === "exempt"
        ? raw.ledgerStatus
        : raw.ledgerStatus === "none"
          ? "none"
          : undefined,
    ledgerCategoryId:
      raw.ledgerCategoryId === null
        ? null
        : raw.ledgerCategoryId
          ? String(raw.ledgerCategoryId)
          : undefined,
    ledgerAccountCode: raw.ledgerAccountCode ? String(raw.ledgerAccountCode) : undefined,
    ledgerMemo: raw.ledgerMemo ? String(raw.ledgerMemo) : undefined,
    ledgerFixedExpenseId: raw.ledgerFixedExpenseId ? String(raw.ledgerFixedExpenseId) : undefined,
    ledgerConfirmedAt: raw.ledgerConfirmedAt ? String(raw.ledgerConfirmedAt) : undefined,
    ledgerConfirmedBy: raw.ledgerConfirmedBy ? String(raw.ledgerConfirmedBy) : undefined,
    ledgerClientName:
      raw.ledgerClientName === ""
        ? ""
        : raw.ledgerClientName
          ? String(raw.ledgerClientName)
          : undefined,
    linkedTaxInvoiceIds: normalizeLinkedTaxInvoiceIds(raw),
    linkedTaxInvoiceId: resolvePrimaryLinkedTaxInvoiceId(raw),
    taxInvoiceAutoLinkDisabled: raw.taxInvoiceAutoLinkDisabled === true ? true : undefined,
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
      row.ledgerMemo || "",
      row.ledgerClientName || "",
      row.linkedSubject || "",
      row.transactionType || "",
      row.accountNumber,
      row.deposit > 0 ? String(row.deposit) : "",
      row.withdrawal > 0 ? String(row.withdrawal) : "",
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

export function parseBankClassifiedAtMs(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 수동 거래처 분류가 입금전표/자동연결보다 최신인지 (linkedSubject 되돌림 방지) */
export function hasManualClientClassificationOverride(
  tx: Pick<BankTransaction, "classifiedAt" | "matchConfirmedAt" | "linkedSubject">,
) {
  const linked = String(tx.linkedSubject || "").trim();
  if (!linked || !tx.classifiedAt || !tx.matchConfirmedAt) return false;
  return parseBankClassifiedAtMs(tx.classifiedAt) > parseBankClassifiedAtMs(tx.matchConfirmedAt);
}

/** 미분류 상태에서 거래처 입금 연결(예금주 별칭 학습)만 한 건 */
export function isUnfiledClientDepositLink(
  tx: Pick<BankTransaction, "folderId" | "deposit" | "linkedSubject" | "classifiedAt" | "matchConfirmedAt">,
) {
  if (tx.folderId) return false;
  if (Number(tx.deposit || 0) <= 0) return false;
  const linked = String(tx.linkedSubject || "").trim();
  if (!linked || !tx.classifiedAt || tx.matchConfirmedAt) return false;
  return true;
}

export function applyUnfiledClientDepositLinkToTransaction(tx: BankTransaction, clientName: string): BankTransaction {
  const now = new Date().toISOString();
  return {
    ...tx,
    folderId: undefined,
    linkedSubject: clientName.trim(),
    classifiedAt: now,
  };
}

/** 입금 연결·폴더 분류는 유지한 채 거래처 연결명만 수동 갱신 */
export function applyManualClientLinkToTransaction(tx: BankTransaction, clientName: string): BankTransaction {
  const trimmed = clientName.trim();
  if (!trimmed || String(tx.linkedSubject || "").trim() === trimmed) return tx;
  return {
    ...tx,
    linkedSubject: trimmed,
    classifiedAt: new Date().toISOString(),
  };
}

/** 거래처 모달에서 비우기 — ledgerClientName "" 로 숨김 표시, linkedSubject 제거 */
export function applyManualClientClearToTransaction(tx: BankTransaction, confirmedAt = new Date().toISOString()): BankTransaction {
  return {
    ...tx,
    ledgerClientName: "",
    linkedSubject: undefined,
    ledgerConfirmedAt: confirmedAt,
    classifiedAt: confirmedAt,
  };
}

/** 입금·증빙 연결 해제 시 거래처/시공자 표시명을 함께 비움 */
export function clearBankTransactionClientLabel(tx: BankTransaction): BankTransaction {
  const next: BankTransaction = {
    ...tx,
    linkedSubject: undefined,
  };
  if (tx.ledgerClientName === "") {
    return next;
  }
  return {
    ...next,
    ledgerClientName: undefined,
  };
}

export function clearBankTransactionPaymentMatch(tx: BankTransaction): BankTransaction {
  return {
    ...clearBankTransactionClientLabel(tx),
    linkedPaymentVoucherId: undefined,
    linkedPdfArchiveId: undefined,
    linkedSalesId: undefined,
    matchConfirmedAt: undefined,
    matchConfirmedBy: undefined,
    matchAutoLinked: undefined,
  };
}

export function syncBankTransactionsForSaleClientChange(
  transactions: BankTransaction[],
  saleId: string | number,
  next: { client: string },
  paymentVouchers: Array<{ salesId?: string | number; bankTransactionId?: string | number }> = [],
): { transactions: BankTransaction[]; updated: number } {
  const saleKey = String(saleId);
  const clientName = String(next.client || "").trim();
  if (!clientName) return { transactions, updated: 0 };

  const linkedBankIds = new Set<string>();
  for (const voucher of paymentVouchers) {
    if (String(voucher.salesId ?? "") !== saleKey) continue;
    const bankId = String(voucher.bankTransactionId || "").trim();
    if (bankId) linkedBankIds.add(bankId);
  }

  let updated = 0;
  const nextTransactions = transactions.map((tx) => {
    const linkedToSale = tx.linkedSalesId != null && String(tx.linkedSalesId) === saleKey;
    const linkedByVoucher = linkedBankIds.has(tx.id);
    if (!linkedToSale && !linkedByVoucher) return tx;
    const patched = applyManualClientLinkToTransaction(tx, clientName);
    if (patched === tx) return tx;
    updated += 1;
    return patched;
  });

  return { transactions: nextTransactions, updated };
}

export function resolveAutoLinkLinkedSubject(tx: BankTransaction, matchedClient: string) {
  if (hasManualClientClassificationOverride(tx)) {
    return String(tx.linkedSubject || "").trim() || matchedClient;
  }
  return matchedClient;
}

const LEDGER_MERGE_FIELD_KEYS = [
  "ledgerStatus",
  "ledgerCategoryId",
  "ledgerAccountCode",
  "ledgerMemo",
  "ledgerFixedExpenseId",
  "ledgerConfirmedAt",
  "ledgerConfirmedBy",
  "ledgerClientName",
] as const;

type LedgerMergeRow = Partial<Pick<BankTransaction, (typeof LEDGER_MERGE_FIELD_KEYS)[number]>>;

function parseLedgerConfirmedAtMs(value: string | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLedgerMergeValue(value: unknown, key?: (typeof LEDGER_MERGE_FIELD_KEYS)[number]) {
  if (key === "ledgerClientName" && value === "") return "";
  if (value === null || value === undefined || value === "") return undefined;
  return value;
}

function pickLedgerMergeField(
  primary: LedgerMergeRow,
  fallback: LedgerMergeRow,
  key: (typeof LEDGER_MERGE_FIELD_KEYS)[number],
) {
  if (primary && Object.prototype.hasOwnProperty.call(primary, key)) {
    return normalizeLedgerMergeValue(primary[key], key);
  }
  return normalizeLedgerMergeValue(fallback?.[key], key);
}

export function mergeBankTransactionLedgerFields(local: LedgerMergeRow, incoming: LedgerMergeRow): LedgerMergeRow {
  const localMs = parseLedgerConfirmedAtMs(local.ledgerConfirmedAt);
  const incomingMs = parseLedgerConfirmedAtMs(incoming.ledgerConfirmedAt);
  const preferIncoming = incomingMs > localMs;
  const primary = preferIncoming ? incoming : local;
  const fallback = preferIncoming ? local : incoming;

  return LEDGER_MERGE_FIELD_KEYS.reduce<LedgerMergeRow>((acc, key) => {
    acc[key] = pickLedgerMergeField(primary, fallback, key) as never;
    return acc;
  }, {});
}

export function shouldPreferLocalBankTransactionMerge(
  local: Pick<
    BankTransaction,
    | "classifiedAt"
    | "linkedSubject"
    | "folderId"
    | "linkedCompanyExpenseId"
    | "linkedFixedExpensePaymentId"
    | "linkedWorkerMonthlyPaymentVoucherId"
  >,
  incoming: Pick<
    BankTransaction,
    | "classifiedAt"
    | "linkedSubject"
    | "folderId"
    | "linkedCompanyExpenseId"
    | "linkedFixedExpensePaymentId"
    | "linkedWorkerMonthlyPaymentVoucherId"
  >,
) {
  const localMs = parseBankClassifiedAtMs(local.classifiedAt);
  const incomingMs = parseBankClassifiedAtMs(incoming.classifiedAt);
  if (localMs > incomingMs) return true;
  if (localMs < incomingMs) return false;

  const localSubject = String(local.linkedSubject || "").trim();
  const incomingSubject = String(incoming.linkedSubject || "").trim();
  if (localSubject && localSubject !== incomingSubject) return true;

  return (
    Boolean(local.linkedWorkerMonthlyPaymentVoucherId && !incoming.linkedWorkerMonthlyPaymentVoucherId) ||
    Boolean(local.folderId && !incoming.folderId) ||
    Boolean(local.linkedCompanyExpenseId && !incoming.linkedCompanyExpenseId) ||
    Boolean(local.linkedFixedExpensePaymentId && !incoming.linkedFixedExpensePaymentId)
  );
}

function mergePaymentMatchFields(local: BankTransaction, incoming: BankTransaction) {
  const linkedPaymentVoucherId = local.linkedPaymentVoucherId ?? incoming.linkedPaymentVoucherId;
  const linkedPdfArchiveId = local.linkedPdfArchiveId ?? incoming.linkedPdfArchiveId;
  const linkedSalesId = local.linkedSalesId ?? incoming.linkedSalesId;
  const linkedWorkerMonthlyPaymentVoucherId =
    local.linkedWorkerMonthlyPaymentVoucherId ?? incoming.linkedWorkerMonthlyPaymentVoucherId;
  const matchConfirmedAt = local.matchConfirmedAt || incoming.matchConfirmedAt;
  const matchConfirmedBy = local.matchConfirmedBy || incoming.matchConfirmedBy;
  const matchAutoLinked =
    local.matchAutoLinked === true || incoming.matchAutoLinked === true
      ? true
      : local.matchAutoLinked === false
        ? false
        : incoming.matchAutoLinked;

  return {
    linkedPaymentVoucherId,
    linkedPdfArchiveId,
    linkedSalesId,
    linkedWorkerMonthlyPaymentVoucherId,
    matchConfirmedAt,
    matchConfirmedBy,
    matchAutoLinked,
  };
}

/** Union-merge bank rows for save conflicts and live sync while local edits are pending. */
export function mergeBankTransactionsUnion(
  existing: BankTransaction[],
  incoming: BankTransaction[],
  options?: { preserveLocalOnly?: boolean },
): BankTransaction[] {
  const preserveLocalOnly = options?.preserveLocalOnly ?? true;
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const incomingIds = new Set(incoming.map((row) => row.id));
  const merged = incoming.map((row) => {
    const local = existingById.get(row.id);
    return local ? mergeRemoteBankTransactionRow(local, row) : row;
  });
  if (preserveLocalOnly) {
    for (const row of existing) {
      if (!incomingIds.has(row.id)) {
        merged.push(row);
      }
    }
  }
  return merged;
}

function resolveMergedLinkedSubject(
  local: BankTransaction,
  incoming: BankTransaction,
  ledgerMerge: LedgerMergeRow,
): string | undefined {
  if (ledgerMerge.ledgerClientName === "") return undefined;

  if (!shouldPreferLocalBankTransactionMerge(local, incoming)) {
    if (hasManualClientClassificationOverride(local)) {
      return local.linkedSubject ?? incoming.linkedSubject;
    }
    return incoming.linkedSubject || local.linkedSubject;
  }

  return local.linkedSubject ?? incoming.linkedSubject;
}

export function mergeRemoteBankTransactionRow(local: BankTransaction, incoming: BankTransaction): BankTransaction {
  const paymentMatch = mergePaymentMatchFields(local, incoming);

  const ledgerMerge = mergeBankTransactionLedgerFields(local, incoming);
  const linkedSubject = resolveMergedLinkedSubject(local, incoming, ledgerMerge);
  const taxInvoiceMerge = {
    linkedTaxInvoiceIds: local.taxInvoiceAutoLinkDisabled
      ? local.linkedTaxInvoiceIds
      : local.linkedTaxInvoiceIds ?? incoming.linkedTaxInvoiceIds,
    linkedTaxInvoiceId: local.taxInvoiceAutoLinkDisabled
      ? local.linkedTaxInvoiceId
      : local.linkedTaxInvoiceId ?? incoming.linkedTaxInvoiceId,
    taxInvoiceAutoLinkDisabled: local.taxInvoiceAutoLinkDisabled ?? incoming.taxInvoiceAutoLinkDisabled,
  };

  if (!shouldPreferLocalBankTransactionMerge(local, incoming)) {
    return {
      ...incoming,
      ...paymentMatch,
      linkedCompanyExpenseId: incoming.linkedCompanyExpenseId || local.linkedCompanyExpenseId,
      linkedFixedExpensePaymentId: incoming.linkedFixedExpensePaymentId || local.linkedFixedExpensePaymentId,
      folderId: incoming.folderId || local.folderId,
      memo: incoming.memo ?? local.memo,
      linkedSubject,
      classifiedAt: incoming.classifiedAt || local.classifiedAt,
      ...ledgerMerge,
      ...taxInvoiceMerge,
    };
  }

  return {
    ...incoming,
    ...paymentMatch,
    folderId: local.folderId ?? incoming.folderId,
    linkedCompanyExpenseId: local.linkedCompanyExpenseId ?? incoming.linkedCompanyExpenseId,
    linkedFixedExpensePaymentId: local.linkedFixedExpensePaymentId ?? incoming.linkedFixedExpensePaymentId,
    memo: local.memo ?? incoming.memo,
    linkedSubject,
    classifiedAt: local.classifiedAt ?? incoming.classifiedAt,
    ...ledgerMerge,
    ...taxInvoiceMerge,
  };
}

export function normalizeBankTxCounterpartyKey(value: string) {
  return String(value || "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

export function resolveBankTxCounterpartyLabel(row: BankTransaction) {
  return String(row.counterpartyName || row.description || "").trim();
}

export function matchesBankTxCounterpartyFilter(row: BankTransaction, filterKey: string) {
  if (!filterKey) return true;
  const rowKey = normalizeBankTxCounterpartyKey(resolveBankTxCounterpartyLabel(row));
  return Boolean(rowKey) && rowKey === filterKey;
}
