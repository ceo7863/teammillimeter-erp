/**
 * Phase 3 Unified AR read model (single source of truth for billed / applied / outstanding).
 *
 * Pure and dependency-free so the same code runs on the server (`server/unifiedArReadModel.mjs`
 * imports this module through tsx) and in the browser bundle. Nothing here mutates or writes.
 *
 * Accounting rules
 * - Receipt allocations count only when effective as-of the requested date
 *   (`effectiveFrom <= asOf < reversedEffectiveDate`). Mirrors `isAllocationEffectiveAsOf`
 *   in `server/receipts.mjs`; `scripts/test-unified-ar-phase3.mjs` asserts the parity.
 * - A legacy `paymentVoucher` counts only when its bank transaction is NOT covered by an
 *   effective Receipt. The same `bankTransactionId` is never counted twice.
 * - Conflicts are reported through `reconciliationStatus` / `errors`. Nothing is auto-fixed.
 */

/** Aging horizon used for the display-only `overdueAr` metric (calendar days after sale date). */
export const UNIFIED_AR_DUE_DAYS = 30;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export type UnifiedArSaleLike = {
  id?: number | string;
  date?: string;
  client?: string;
  clientId?: number | string | null;
  amount?: number;
  /** Legacy manual paid amount stored on the sale row itself. */
  paid?: number;
  /** Legacy flag: the stored manual paid amount was cleared and must be ignored. */
  manualPaidCleared?: boolean;
  site?: string;
  memo?: string;
  voucherNo?: string;
};

export type UnifiedArClientLike = { id?: number | string; name?: string };

export type UnifiedArReceiptLike = {
  id?: string;
  receiptNo?: string;
  clientId?: number | string;
  clientName?: string;
  receiptDate?: string;
  grossAmount?: number;
  channel?: string;
  source?: string;
  status?: string;
  bankTransactionId?: string | number | null;
  sentStatementId?: string | null;
  reversalOfReceiptId?: string | null;
  reversedEffectiveDate?: string | null;
  memo?: string;
};

export type UnifiedArAllocationLike = {
  id?: string;
  receiptId?: string;
  saleId?: number | string;
  amount?: number;
  status?: string;
  effectiveFrom?: string;
  allocationEffectiveDate?: string;
  reversedEffectiveDate?: string | null;
  effectiveTo?: string | null;
  createdAt?: string;
  auditOnly?: boolean;
  site?: string;
};

export type UnifiedArLegacyVoucherLike = {
  id?: number | string;
  salesId?: number | string;
  client?: string;
  date?: string;
  amount?: number;
  finalAmount?: number;
  bankTransactionId?: string | number;
  linkedPdfArchiveId?: string;
  sourceLedger?: string;
  /** Statement-level voucher scope (no explicit salesId). */
  statementSalesIds?: Array<number | string>;
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
};

export type UnifiedArBankTransactionLike = {
  id?: string;
  linkedReceiptId?: string;
  linkedPaymentVoucherId?: string | number;
  deposit?: number;
};

export type UnifiedArData = {
  sales?: UnifiedArSaleLike[];
  clients?: UnifiedArClientLike[];
  receipts?: UnifiedArReceiptLike[];
  receiptAllocations?: UnifiedArAllocationLike[];
  paymentVouchers?: UnifiedArLegacyVoucherLike[];
  bankTransactions?: UnifiedArBankTransactionLike[];
};

export type UnifiedArPaymentStatus = "unpaid" | "partial" | "paid" | "overpaid";
export type UnifiedArSourceLedger = "receipt" | "legacy" | "mixed" | "none";
export type UnifiedArReconciliationStatus = "ok" | "error";

export type UnifiedArSaleBalance = {
  saleId: string;
  clientId: string | null;
  clientName: string;
  saleDate: string;
  site: string;
  billedAmount: number;
  /** direct + statement-FIFO + stored manual paid, i.e. everything from the frozen ledger. */
  legacyAppliedAmount: number;
  legacyDirectAppliedAmount: number;
  legacyFifoAppliedAmount: number;
  legacyStoredPaidAmount: number;
  receiptAllocatedAmount: number;
  totalAppliedAmount: number;
  outstandingAmount: number;
  receiptIds: string[];
  legacyVoucherIds: string[];
  paymentStatus: UnifiedArPaymentStatus;
  sourceLedger: UnifiedArSourceLedger;
  asOfDate: string;
};

export function unifiedArMoney(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function todaySeoulYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function normalizeYmd(value: unknown, fallback = "") {
  const text = String(value ?? "").trim().slice(0, 10);
  return YMD_RE.test(text) ? text : fallback;
}

export function shiftYmd(ymd: string, deltaDays: number) {
  const base = normalizeYmd(ymd);
  if (!base) return "";
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/* ------------------------------------------------------------ effectiveness */

export function resolveAllocationEffectiveFrom(
  allocation: UnifiedArAllocationLike | undefined,
  receipt?: UnifiedArReceiptLike,
) {
  return String(
    allocation?.effectiveFrom ||
      allocation?.allocationEffectiveDate ||
      receipt?.receiptDate ||
      String(allocation?.createdAt || "").slice(0, 10) ||
      "",
  ).slice(0, 10);
}

export function resolveAllocationReversedEffectiveDate(allocation: UnifiedArAllocationLike | undefined) {
  const value = allocation?.reversedEffectiveDate || allocation?.effectiveTo || null;
  return value ? String(value).slice(0, 10) : null;
}

/** Mirrors `isAllocationEffectiveAsOf` in server/receipts.mjs (write-side authority). */
export function isAllocationEffectiveAsOf(
  allocation: UnifiedArAllocationLike | undefined,
  receiptById: Map<string, UnifiedArReceiptLike> | null,
  asOfDate: string,
) {
  if (!allocation) return false;
  if (allocation.auditOnly) return false;
  if (unifiedArMoney(allocation.amount) <= 0) return false;
  const asOf = normalizeYmd(asOfDate, todaySeoulYmd());
  const receipt = receiptById?.get(String(allocation.receiptId));
  if (receipt?.reversalOfReceiptId) return false;
  const from = resolveAllocationEffectiveFrom(allocation, receipt);
  if (!from || asOf < from) return false;
  const until = resolveAllocationReversedEffectiveDate(allocation);
  if (until && asOf >= until) return false;
  return true;
}

/** Cash document is live on `asOf` (reversal documents are handled separately). */
export function isReceiptEffectiveAsOf(receipt: UnifiedArReceiptLike | undefined, asOfDate: string) {
  if (!receipt) return false;
  if (receipt.reversalOfReceiptId) return false;
  const asOf = normalizeYmd(asOfDate, todaySeoulYmd());
  const date = normalizeYmd(receipt.receiptDate);
  if (date && asOf < date) return false;
  const reversedAt = normalizeYmd(receipt.reversedEffectiveDate);
  if (reversedAt && asOf >= reversedAt) return false;
  return true;
}

/** Receipt-projection rows are display-only and must never be counted as legacy vouchers. */
export function isProjectedReceiptVoucherRow(voucher: UnifiedArLegacyVoucherLike | undefined) {
  if (!voucher) return false;
  if (voucher.sourceLedger === "receipt") return true;
  return String(voucher.id ?? "").startsWith("receipt-alloc:");
}

export function legacyVoucherAmount(voucher: UnifiedArLegacyVoucherLike | undefined) {
  return unifiedArMoney(voucher?.finalAmount ?? voucher?.amount ?? 0);
}

/* ------------------------------------------------------- client resolution */

type ClientNameIndex = Map<string, { id: string; count: number }>;

export function buildClientNameIndex(clients: UnifiedArClientLike[] = []): ClientNameIndex {
  const index: ClientNameIndex = new Map();
  for (const row of clients) {
    const name = String(row?.name ?? "").trim();
    if (!name) continue;
    const prev = index.get(name);
    if (prev) index.set(name, { id: prev.id, count: prev.count + 1 });
    else index.set(name, { id: String(row?.id ?? ""), count: 1 });
  }
  return index;
}

/** `sale.clientId` is authoritative; a unique client name is the only legacy fallback. */
export function resolveSaleClientId(sale: UnifiedArSaleLike, clientNameIndex: ClientNameIndex) {
  if (sale?.clientId != null && String(sale.clientId).trim() !== "") return String(sale.clientId);
  const name = String(sale?.client ?? "").trim();
  if (!name) return null;
  const hit = clientNameIndex.get(name);
  if (!hit || hit.count !== 1) return null;
  return hit.id;
}

/* --------------------------------------------------- bank reference dedupe */

export type UnifiedArBankConflict = {
  bankTransactionId: string;
  kind: "receipt_and_legacy_voucher" | "mixed_bank_link_fields" | "multiple_open_receipts";
  receiptIds: string[];
  legacyVoucherIds: string[];
  receiptAmount: number;
  legacyAmount: number;
};

/**
 * Detect bank transactions referenced by both ledgers so the same cash is never counted twice.
 * `receiptLinkedBankTransactionIds` is the suppression list applied to legacy vouchers.
 */
export function dedupeBankReferences(
  data: UnifiedArData = {},
  options: { asOfDate?: string } = {},
) {
  const asOf = normalizeYmd(options.asOfDate, todaySeoulYmd());
  const receipts = data.receipts || [];
  const vouchers = data.paymentVouchers || [];

  const receiptsByBankTx = new Map<string, UnifiedArReceiptLike[]>();
  for (const receipt of receipts) {
    const bankTxId = String(receipt?.bankTransactionId ?? "").trim();
    if (!bankTxId) continue;
    if (!isReceiptEffectiveAsOf(receipt, asOf)) continue;
    const list = receiptsByBankTx.get(bankTxId) || [];
    list.push(receipt);
    receiptsByBankTx.set(bankTxId, list);
  }

  const legacyByBankTx = new Map<string, UnifiedArLegacyVoucherLike[]>();
  for (const voucher of vouchers) {
    if (isProjectedReceiptVoucherRow(voucher)) continue;
    const bankTxId = String(voucher?.bankTransactionId ?? "").trim();
    if (!bankTxId) continue;
    const list = legacyByBankTx.get(bankTxId) || [];
    list.push(voucher);
    legacyByBankTx.set(bankTxId, list);
  }

  const conflicts: UnifiedArBankConflict[] = [];
  for (const [bankTxId, receiptRows] of receiptsByBankTx) {
    const legacyRows = legacyByBankTx.get(bankTxId) || [];
    if (legacyRows.length) {
      conflicts.push({
        bankTransactionId: bankTxId,
        kind: "receipt_and_legacy_voucher",
        receiptIds: receiptRows.map((row) => String(row.id)),
        legacyVoucherIds: legacyRows.map((row) => String(row.id)),
        receiptAmount: receiptRows.reduce((sum, row) => sum + unifiedArMoney(row.grossAmount), 0),
        legacyAmount: legacyRows.reduce((sum, row) => sum + legacyVoucherAmount(row), 0),
      });
    }
    if (receiptRows.length > 1) {
      conflicts.push({
        bankTransactionId: bankTxId,
        kind: "multiple_open_receipts",
        receiptIds: receiptRows.map((row) => String(row.id)),
        legacyVoucherIds: [],
        receiptAmount: receiptRows.reduce((sum, row) => sum + unifiedArMoney(row.grossAmount), 0),
        legacyAmount: 0,
      });
    }
  }

  for (const tx of data.bankTransactions || []) {
    const hasReceiptLink = String(tx?.linkedReceiptId ?? "").trim() !== "";
    const hasVoucherLink = tx?.linkedPaymentVoucherId != null && String(tx.linkedPaymentVoucherId) !== "";
    if (!hasReceiptLink || !hasVoucherLink) continue;
    conflicts.push({
      bankTransactionId: String(tx.id ?? ""),
      kind: "mixed_bank_link_fields",
      receiptIds: [String(tx.linkedReceiptId)],
      legacyVoucherIds: [String(tx.linkedPaymentVoucherId)],
      receiptAmount: 0,
      legacyAmount: 0,
    });
  }

  return {
    asOfDate: asOf,
    ok: conflicts.length === 0,
    reconciliationStatus: (conflicts.length ? "error" : "ok") as UnifiedArReconciliationStatus,
    receiptLinkedBankTransactionIds: [...receiptsByBankTx.keys()],
    conflicts,
  };
}

/* --------------------------------------------------------- sale AR balances */

function resolveSalePaymentStatus(billed: number, applied: number): UnifiedArPaymentStatus {
  if (billed <= 0) return applied > 0 ? "overpaid" : "paid";
  if (applied <= 0) return "unpaid";
  if (applied > billed) return "overpaid";
  if (applied === billed) return "paid";
  return "partial";
}

function resolveSourceLedger(receiptApplied: number, legacyApplied: number): UnifiedArSourceLedger {
  if (receiptApplied > 0 && legacyApplied > 0) return "mixed";
  if (receiptApplied > 0) return "receipt";
  if (legacyApplied > 0) return "legacy";
  return "none";
}

export type UnifiedArSaleBalancesResult = {
  asOfDate: string;
  sales: UnifiedArSaleBalance[];
  totals: {
    saleCount: number;
    billedAmount: number;
    legacyAppliedAmount: number;
    legacyDirectAppliedAmount: number;
    legacyFifoAppliedAmount: number;
    legacyStoredPaidAmount: number;
    receiptAllocatedAmount: number;
    totalAppliedAmount: number;
    outstandingAmount: number;
  };
  /** Statement-level legacy vouchers that FIFO could not place on any sale (client credit). */
  unattributedLegacy: Array<{ clientName: string; amount: number; voucherIds: string[] }>;
  legacyPrepaidByClientName: Record<string, number>;
  suppressedLegacyByBankReceipt: { amount: number; voucherIds: string[] };
  bankReferences: ReturnType<typeof dedupeBankReferences>;
  reconciliationStatus: UnifiedArReconciliationStatus;
  errors: Array<{ code: string; message: string; detail?: unknown }>;
  warnings: Array<{ code: string; message: string; detail?: unknown }>;
};

/**
 * Per-sale billed / applied / outstanding as-of a date, unifying the Receipt ledger and
 * the frozen legacy voucher ledger.
 */
export function buildSaleArBalances(
  data: UnifiedArData = {},
  options: { asOfDate?: string } = {},
): UnifiedArSaleBalancesResult {
  const asOfDate = normalizeYmd(options.asOfDate, todaySeoulYmd());
  const sales = data.sales || [];
  const receipts = data.receipts || [];
  const allocations = data.receiptAllocations || [];
  const clientNameIndex = buildClientNameIndex(data.clients || []);
  const receiptById = new Map(receipts.map((row) => [String(row.id), row]));
  const bankReferences = dedupeBankReferences(data, { asOfDate });
  const suppressedBankTxIds = new Set(bankReferences.receiptLinkedBankTransactionIds);

  const rows = new Map<string, UnifiedArSaleBalance>();
  const manualPaidCleared = new Set<string>();
  for (const sale of sales) {
    const saleId = String(sale?.id ?? "");
    if (!saleId) continue;
    if (sale?.manualPaidCleared) manualPaidCleared.add(saleId);
    rows.set(saleId, {
      saleId,
      clientId: resolveSaleClientId(sale, clientNameIndex),
      clientName: String(sale?.client ?? ""),
      saleDate: normalizeYmd(sale?.date),
      site: String(sale?.site || sale?.memo || ""),
      billedAmount: unifiedArMoney(sale?.amount),
      legacyAppliedAmount: 0,
      legacyDirectAppliedAmount: 0,
      legacyFifoAppliedAmount: 0,
      // Legacy manual paid stored on the sale row. `manualPaidCleared` wins over it.
      legacyStoredPaidAmount: sale?.manualPaidCleared ? 0 : unifiedArMoney(sale?.paid),
      receiptAllocatedAmount: 0,
      totalAppliedAmount: 0,
      outstandingAmount: 0,
      receiptIds: [],
      legacyVoucherIds: [],
      paymentStatus: "unpaid",
      sourceLedger: "none",
      asOfDate,
    });
  }

  const errors: UnifiedArSaleBalancesResult["errors"] = [];
  const warnings: UnifiedArSaleBalancesResult["warnings"] = [];
  const orphanAllocationIds: string[] = [];

  for (const allocation of allocations) {
    if (!isAllocationEffectiveAsOf(allocation, receiptById, asOfDate)) continue;
    const saleId = String(allocation?.saleId ?? "");
    const row = rows.get(saleId);
    if (!row) {
      orphanAllocationIds.push(String(allocation?.id ?? ""));
      continue;
    }
    row.receiptAllocatedAmount += unifiedArMoney(allocation.amount);
    const receiptId = String(allocation?.receiptId ?? "");
    if (receiptId && !row.receiptIds.includes(receiptId)) row.receiptIds.push(receiptId);
  }

  const suppressedLegacy = { amount: 0, voucherIds: [] as string[] };
  const orphanLegacyVoucherIds: string[] = [];
  const statementScopedVouchers: UnifiedArLegacyVoucherLike[] = [];
  const directVouchers: UnifiedArLegacyVoucherLike[] = [];

  for (const voucher of data.paymentVouchers || []) {
    if (isProjectedReceiptVoucherRow(voucher)) continue;
    const amount = legacyVoucherAmount(voucher);
    if (amount === 0) continue;
    const voucherDate = normalizeYmd(voucher?.date);
    if (voucherDate && voucherDate > asOfDate) continue;

    // Never count the same cash twice: this deposit already has an effective Receipt.
    const bankTxId = String(voucher?.bankTransactionId ?? "").trim();
    if (bankTxId && suppressedBankTxIds.has(bankTxId)) {
      suppressedLegacy.amount += amount;
      suppressedLegacy.voucherIds.push(String(voucher?.id ?? ""));
      continue;
    }

    const saleId = String(voucher?.salesId ?? "").trim();
    if (!saleId) {
      statementScopedVouchers.push(voucher);
      continue;
    }
    if (!rows.has(saleId) || manualPaidCleared.has(saleId)) {
      orphanLegacyVoucherIds.push(String(voucher?.id ?? ""));
      continue;
    }
    directVouchers.push(voucher);
  }

  /**
   * Legacy vouchers record VAT-inclusive cash while `sale.amount` is VAT-exclusive, so a
   * voucher routinely carries ~10% more than the sale it settles. Applying it in full would
   * report every VAT customer as overpaid, so a voucher is capped at the sale's remaining
   * VAT-exclusive capacity — the same rule the Receipt API enforces (ALLOCATION_EXCEEDS_SALE)
   * and the same rule the legacy `applyPaymentVouchers` view uses. The uncapped remainder
   * becomes a client credit rather than disappearing.
   */
  const legacyPrepaidByClientName: Record<string, number> = {};
  const unattributedByClient = new Map<string, { amount: number; voucherIds: string[] }>();
  const consumed = new Map<string, number>();
  const doubleCoverageSaleIds: string[] = [];
  let excessToPrepaid = 0;
  const capacity = (row: UnifiedArSaleBalance) =>
    Math.max(
      row.billedAmount -
        row.legacyStoredPaidAmount -
        row.receiptAllocatedAmount -
        (consumed.get(row.saleId) || 0),
      0,
    );
  const consume = (row: UnifiedArSaleBalance, applied: number) => {
    consumed.set(row.saleId, (consumed.get(row.saleId) || 0) + applied);
  };
  const creditClient = (clientName: string, amount: number) => {
    if (amount <= 0) return;
    excessToPrepaid += amount;
    legacyPrepaidByClientName[clientName] = (legacyPrepaidByClientName[clientName] || 0) + amount;
  };

  for (const voucher of directVouchers) {
    const row = rows.get(String(voucher.salesId ?? ""))!;
    const amount = legacyVoucherAmount(voucher);
    const applied = Math.min(capacity(row), amount);
    if (applied > 0) {
      row.legacyDirectAppliedAmount += applied;
      consume(row, applied);
    }
    row.legacyVoucherIds.push(String(voucher?.id ?? ""));
    // Capacity exhausted by a Receipt means the same sale is covered by both ledgers.
    if (applied < amount && row.receiptAllocatedAmount > 0) doubleCoverageSaleIds.push(row.saleId);
    creditClient(String(voucher?.client ?? row.clientName), amount - applied);
  }

  /**
   * Statement-level legacy vouchers carry no `salesId`. They are real cash, so they are
   * attributed with the documented legacy rule (FIFO by sale date inside the voucher's
   * statement scope) instead of being dropped, and the leftover becomes a client credit.
   * Every such voucher is reported as a warning because its allocation is inferred.
   */
  for (const voucher of statementScopedVouchers) {
    const clientName = String(voucher?.client ?? "");
    const voucherId = String(voucher?.id ?? "");
    let remaining = legacyVoucherAmount(voucher);

    let scoped = [...rows.values()].filter(
      (row) => row.clientName === clientName && !manualPaidCleared.has(row.saleId),
    );
    const scopeIds = (voucher?.statementSalesIds || []).map((id) => String(id ?? "")).filter(Boolean);
    if (scopeIds.length) {
      const idSet = new Set(scopeIds);
      scoped = scoped.filter((row) => idSet.has(row.saleId));
    } else if (voucher?.statementPeriodStart || voucher?.statementPeriodEnd) {
      const from = normalizeYmd(voucher.statementPeriodStart);
      const to = normalizeYmd(voucher.statementPeriodEnd);
      scoped = scoped.filter((row) => {
        if (from && row.saleDate < from) return false;
        if (to && row.saleDate > to) return false;
        return true;
      });
    }

    scoped.sort(
      (a, b) => a.saleDate.localeCompare(b.saleDate) || a.saleId.localeCompare(b.saleId),
    );

    for (const row of scoped) {
      if (remaining <= 0) break;
      const applied = Math.min(capacity(row), remaining);
      if (applied <= 0) continue;
      row.legacyFifoAppliedAmount += applied;
      row.legacyVoucherIds.push(voucherId);
      consume(row, applied);
      remaining -= applied;
    }

    const bucket = unattributedByClient.get(clientName) || { amount: 0, voucherIds: [] };
    bucket.voucherIds.push(voucherId);
    if (remaining > 0) {
      bucket.amount += remaining;
      creditClient(clientName, remaining);
    }
    unattributedByClient.set(clientName, bucket);
  }

  const totals = {
    saleCount: rows.size,
    billedAmount: 0,
    legacyAppliedAmount: 0,
    legacyDirectAppliedAmount: 0,
    legacyFifoAppliedAmount: 0,
    legacyStoredPaidAmount: 0,
    receiptAllocatedAmount: 0,
    totalAppliedAmount: 0,
    outstandingAmount: 0,
  };
  const overpaidSaleIds: string[] = [];

  for (const row of rows.values()) {
    row.legacyAppliedAmount =
      row.legacyDirectAppliedAmount + row.legacyFifoAppliedAmount + row.legacyStoredPaidAmount;
    row.totalAppliedAmount = row.legacyAppliedAmount + row.receiptAllocatedAmount;
    row.outstandingAmount = Math.max(row.billedAmount - row.totalAppliedAmount, 0);
    row.paymentStatus = resolveSalePaymentStatus(row.billedAmount, row.totalAppliedAmount);
    row.sourceLedger = resolveSourceLedger(row.receiptAllocatedAmount, row.legacyAppliedAmount);
    if (row.paymentStatus === "overpaid") overpaidSaleIds.push(row.saleId);

    totals.billedAmount += row.billedAmount;
    totals.legacyAppliedAmount += row.legacyAppliedAmount;
    totals.legacyDirectAppliedAmount += row.legacyDirectAppliedAmount;
    totals.legacyFifoAppliedAmount += row.legacyFifoAppliedAmount;
    totals.legacyStoredPaidAmount += row.legacyStoredPaidAmount;
    totals.receiptAllocatedAmount += row.receiptAllocatedAmount;
    totals.totalAppliedAmount += row.totalAppliedAmount;
    totals.outstandingAmount += row.outstandingAmount;
  }

  if (!bankReferences.ok) {
    errors.push({
      code: "BANK_REFERENCE_CONFLICT",
      message: "동일 통장거래가 입금전표와 레거시 전표에 동시 연결되어 있습니다.",
      detail: bankReferences.conflicts,
    });
  }
  if (overpaidSaleIds.length) {
    // Legacy vouchers are capacity-capped above, so this can only be receipt over-allocation.
    errors.push({
      code: "SALE_OVERPAID",
      message: "청구액을 초과 배분된 매출이 있습니다.",
      detail: overpaidSaleIds,
    });
  }
  if (doubleCoverageSaleIds.length) {
    errors.push({
      code: "LEGACY_RECEIPT_DOUBLE_COVERAGE",
      message: "동일 매출이 입금전표와 레거시 전표에 중복 반영되어 있습니다.",
      detail: [...new Set(doubleCoverageSaleIds)],
    });
  }
  if (orphanAllocationIds.length) {
    errors.push({
      code: "ALLOCATION_SALE_MISSING",
      message: "매출을 찾을 수 없는 입금 배분이 있습니다.",
      detail: orphanAllocationIds,
    });
  }
  if (orphanLegacyVoucherIds.length) {
    warnings.push({
      code: "LEGACY_VOUCHER_SALE_MISSING",
      message: "연결 매출을 찾을 수 없거나 수동입금이 해제된 레거시 입금전표가 있습니다.",
      detail: orphanLegacyVoucherIds,
    });
  }
  const unattributedLegacy = [...unattributedByClient.entries()].map(([clientName, bucket]) => ({
    clientName,
    amount: bucket.amount,
    voucherIds: bucket.voucherIds,
  }));
  if (unattributedLegacy.length) {
    warnings.push({
      code: "LEGACY_VOUCHER_STATEMENT_SCOPED",
      message: "매출 지정이 없는 레거시 입금전표는 내역서 범위 FIFO로 추정 배분되었습니다.",
      detail: unattributedLegacy,
    });
  }
  if (excessToPrepaid > 0) {
    warnings.push({
      code: "LEGACY_VOUCHER_EXCESS_TO_PREPAID",
      message: "청구 잔액을 초과한 레거시 입금액(부가세 포함분 등)은 거래처 선수금으로 처리했습니다.",
      detail: { amount: excessToPrepaid, clients: legacyPrepaidByClientName },
    });
  }

  return {
    asOfDate,
    sales: [...rows.values()],
    totals,
    unattributedLegacy,
    legacyPrepaidByClientName,
    suppressedLegacyByBankReceipt: suppressedLegacy,
    bankReferences,
    reconciliationStatus: errors.length ? "error" : "ok",
    errors,
    warnings,
  };
}

export function indexSaleArBalances(result: Pick<UnifiedArSaleBalancesResult, "sales">) {
  return new Map(result.sales.map((row) => [row.saleId, row]));
}

/* ------------------------------------------------------- client AR summary */

export type UnifiedArClientSummary = {
  clientId: string;
  clientName: string;
  startDate: string | null;
  endDate: string;
  openingAsOf: string | null;
  openingAr: number;
  openingArRaw: number;
  openingBilled: number;
  openingAppliedAllocations: number;
  openingLegacyApplied: number;
  periodSales: number;
  periodReceiptsGross: number;
  periodAppliedAllocations: number;
  periodLegacyApplied: number;
  periodAdjustments: number;
  closingAr: number;
  closingArRaw: number;
  closingBilled: number;
  closingAppliedAllocations: number;
  closingLegacyApplied: number;
  unallocatedPrepaid: number;
  overdueAr: number;
  overdueAsOf: string;
  legacyCompatibilityAmount: number;
  reconciliationStatus: UnifiedArReconciliationStatus;
  errors: Array<{ code: string; message: string; detail?: unknown }>;
  warnings: Array<{ code: string; message: string; detail?: unknown }>;
  identity: { ok: boolean; expectedClosingArRaw: number; closingArRaw: number };
  cashIdentity: { ok: boolean; grossToEnd: number; allocatedToEnd: number; unallocatedPrepaid: number };
  saleCount: number;
  receiptCount: number;
  dueDays: number;
};

function scopeSalesToClient(data: UnifiedArData, clientId: string) {
  const clientNameIndex = buildClientNameIndex(data.clients || []);
  return (data.sales || []).filter((sale) => resolveSaleClientId(sale, clientNameIndex) === clientId);
}

function sumBilledAsOf(sales: UnifiedArSaleLike[], asOf: string) {
  return sales.reduce((sum, sale) => {
    const date = normalizeYmd(sale?.date);
    if (!date || date > asOf) return sum;
    return sum + unifiedArMoney(sale?.amount);
  }, 0);
}

/**
 * As-of client AR summary. `openingAr` / `closingAr` are recomputed from effective
 * allocations on the boundary dates, so a later reverse/reallocate never rewrites a
 * closed period.
 */
export function buildClientArSummary(
  data: UnifiedArData = {},
  options: { clientId?: string | number; startDate?: string; endDate?: string } = {},
): UnifiedArClientSummary {
  const clientId = String(options.clientId ?? "").trim();
  const client = (data.clients || []).find((row) => String(row?.id ?? "") === clientId);
  if (!client) {
    const error = new Error("거래처를 찾을 수 없습니다.") as Error & { status?: number; code?: string };
    error.status = 404;
    error.code = "CLIENT_NOT_FOUND";
    throw error;
  }

  const endDate = normalizeYmd(options.endDate, todaySeoulYmd());
  const startDate = normalizeYmd(options.startDate);
  const openingAsOf = startDate ? shiftYmd(startDate, -1) : null;

  const clientSales = scopeSalesToClient(data, clientId);
  const clientSaleIds = new Set(clientSales.map((sale) => String(sale?.id ?? "")));

  const closing = buildSaleArBalances(data, { asOfDate: endDate });
  const opening = openingAsOf ? buildSaleArBalances(data, { asOfDate: openingAsOf }) : null;

  const sumScoped = (result: UnifiedArSaleBalancesResult | null, key: "receiptAllocatedAmount" | "legacyAppliedAmount") => {
    if (!result) return 0;
    return result.sales.reduce(
      (sum, row) => (clientSaleIds.has(row.saleId) ? sum + row[key] : sum),
      0,
    );
  };

  const openingBilled = openingAsOf ? sumBilledAsOf(clientSales, openingAsOf) : 0;
  const closingBilled = sumBilledAsOf(clientSales, endDate);
  const openingAppliedAllocations = sumScoped(opening, "receiptAllocatedAmount");
  const closingAppliedAllocations = sumScoped(closing, "receiptAllocatedAmount");
  const openingLegacyApplied = sumScoped(opening, "legacyAppliedAmount");
  const closingLegacyApplied = sumScoped(closing, "legacyAppliedAmount");

  const openingArRaw = openingBilled - openingAppliedAllocations - openingLegacyApplied;
  const closingArRaw = closingBilled - closingAppliedAllocations - closingLegacyApplied;
  const periodSales = closingBilled - openingBilled;
  const periodAppliedAllocations = closingAppliedAllocations - openingAppliedAllocations;
  const periodLegacyApplied = closingLegacyApplied - openingLegacyApplied;
  const periodAdjustments = 0;

  const receipts = (data.receipts || []).filter((row) => String(row?.clientId ?? "") === clientId);
  const allocations = data.receiptAllocations || [];
  const receiptById = new Map((data.receipts || []).map((row) => [String(row.id), row]));

  let periodReceiptsGross = 0;
  for (const receipt of receipts) {
    const date = normalizeYmd(receipt?.receiptDate);
    if (!date) continue;
    if (startDate && date < startDate) continue;
    if (date > endDate) continue;
    const gross = unifiedArMoney(receipt?.grossAmount);
    periodReceiptsGross += receipt?.reversalOfReceiptId ? gross : Math.abs(gross);
  }

  let unallocatedPrepaid = 0;
  let grossToEnd = 0;
  let allocatedToEnd = 0;
  for (const receipt of receipts) {
    if (!isReceiptEffectiveAsOf(receipt, endDate)) continue;
    const gross = unifiedArMoney(receipt?.grossAmount);
    const allocated = allocations.reduce((sum, row) => {
      if (String(row?.receiptId ?? "") !== String(receipt.id)) return sum;
      if (!isAllocationEffectiveAsOf(row, receiptById, endDate)) return sum;
      return sum + unifiedArMoney(row.amount);
    }, 0);
    grossToEnd += gross;
    allocatedToEnd += allocated;
    unallocatedPrepaid += Math.max(gross - allocated, 0);
  }

  const overdueAsOf = shiftYmd(endDate, -UNIFIED_AR_DUE_DAYS);
  const overdueAr = closing.sales.reduce((sum, row) => {
    if (!clientSaleIds.has(row.saleId)) return sum;
    if (!row.saleDate || row.saleDate > overdueAsOf) return sum;
    return sum + row.outstandingAmount;
  }, 0);

  const scopedConflicts = closing.bankReferences.conflicts.filter((conflict) =>
    conflict.receiptIds.some((id) => receipts.some((row) => String(row.id) === id)) ||
    conflict.legacyVoucherIds.length > 0,
  );
  const errors: UnifiedArClientSummary["errors"] = [];
  const warnings: UnifiedArClientSummary["warnings"] = [];
  if (scopedConflicts.length) {
    errors.push({
      code: "BANK_REFERENCE_CONFLICT",
      message: "동일 통장거래가 두 원장에 동시 연결되어 있습니다.",
      detail: scopedConflicts,
    });
  }
  if (grossToEnd !== allocatedToEnd + unallocatedPrepaid) {
    errors.push({
      code: "CASH_IDENTITY_BROKEN",
      message: "입금액 ≠ 배분 + 미배분 불변식 위반",
      detail: { grossToEnd, allocatedToEnd, unallocatedPrepaid },
    });
  }
  const unattributed = closing.unattributedLegacy.find(
    (row) => row.clientName === String(client.name ?? ""),
  );
  if (unattributed) {
    warnings.push({
      code: "LEGACY_VOUCHER_UNATTRIBUTED",
      message: "매출 지정이 없는 레거시 입금전표가 있어 매출별 잔액에서 제외되었습니다.",
      detail: unattributed,
    });
  }

  const expectedClosingArRaw = openingArRaw + periodSales - periodAppliedAllocations - periodLegacyApplied + periodAdjustments;

  return {
    clientId,
    clientName: String(client.name ?? ""),
    startDate: startDate || null,
    endDate,
    openingAsOf,
    openingAr: Math.max(openingArRaw, 0),
    openingArRaw,
    openingBilled,
    openingAppliedAllocations,
    openingLegacyApplied,
    periodSales,
    periodReceiptsGross,
    periodAppliedAllocations,
    periodLegacyApplied,
    periodAdjustments,
    closingAr: Math.max(closingArRaw, 0),
    closingArRaw,
    closingBilled,
    closingAppliedAllocations,
    closingLegacyApplied,
    unallocatedPrepaid,
    overdueAr,
    overdueAsOf,
    legacyCompatibilityAmount: closingLegacyApplied,
    reconciliationStatus: errors.length ? "error" : "ok",
    errors,
    warnings,
    identity: { ok: expectedClosingArRaw === closingArRaw, expectedClosingArRaw, closingArRaw },
    cashIdentity: { ok: grossToEnd === allocatedToEnd + unallocatedPrepaid, grossToEnd, allocatedToEnd, unallocatedPrepaid },
    saleCount: clientSales.length,
    receiptCount: receipts.length,
    dueDays: UNIFIED_AR_DUE_DAYS,
  };
}

/* ---------------------------------------------------- statement AR status */

export type UnifiedStatementPaymentStatus = UnifiedArPaymentStatus | "cancelled";

export type UnifiedArStatementArchiveLike = {
  id?: string;
  subjectName?: string;
  category?: string;
  sentViaLink?: boolean;
  periodStart?: string;
  periodEnd?: string;
  statementTotalAmount?: number;
  statementSalesIds?: Array<number | string>;
  statementSalesSnapshot?: Array<{ saleId?: number | string; billedAmount?: number }>;
  paymentStatus?: string;
  cancelled?: boolean;
  linkedReceiptId?: string;
};

export type UnifiedArStatementPaymentStatus = {
  archiveId: string;
  clientName: string;
  asOfDate: string;
  status: UnifiedStatementPaymentStatus;
  manualReview: boolean;
  manualReviewReason: string | null;
  bulkAllocateAllowed: boolean;
  statementSalesIds: string[];
  resolvedSaleIds: string[];
  missingSaleIds: string[];
  billedAmount: number;
  snapshotBilledAmount: number;
  statementTotalAmount: number;
  appliedAmount: number;
  receiptAllocatedAmount: number;
  legacyAppliedAmount: number;
  outstandingAmount: number;
  coveredSaleCount: number;
  saleCount: number;
  /** Cash received against this statement that no effective allocation claims. */
  unallocatedPrepaid: number;
  statementLinkedReceiptIds: string[];
  sales: Array<
    Pick<
      UnifiedArSaleBalance,
      | "saleId"
      | "billedAmount"
      | "receiptAllocatedAmount"
      | "legacyAppliedAmount"
      | "totalAppliedAmount"
      | "outstandingAmount"
      | "paymentStatus"
    > & { snapshotBilledAmount: number | null }
  >;
  storedPaymentStatus: string | null;
  storedStatusMatchesDerived: boolean;
};

function isStatementCancelled(archive: UnifiedArStatementArchiveLike) {
  return Boolean(archive?.cancelled) || archive?.paymentStatus === "cancelled";
}

/**
 * Statement payment status derived from `statementSalesIds` + ledger allocations.
 * `pdfArchive.paymentStatus` is a display cache and is never the authority here.
 * Missing / unresolvable statement sale ids block bulk allocation (`manualReview`).
 */
export function buildStatementPaymentStatus(
  archive: UnifiedArStatementArchiveLike = {},
  data: UnifiedArData = {},
  options: { asOfDate?: string; balances?: UnifiedArSaleBalancesResult } = {},
): UnifiedArStatementPaymentStatus {
  const asOfDate = normalizeYmd(options.asOfDate, todaySeoulYmd());
  const balances = options.balances || buildSaleArBalances(data, { asOfDate });
  const byId = indexSaleArBalances(balances);

  const snapshotById = new Map<string, number>();
  for (const row of archive.statementSalesSnapshot || []) {
    const saleId = String(row?.saleId ?? "").trim();
    if (!saleId) continue;
    snapshotById.set(saleId, unifiedArMoney(row?.billedAmount));
  }

  const declaredIds = [
    ...new Set(
      (archive.statementSalesIds || [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const snapshotIds = [...snapshotById.keys()];
  const statementSalesIds = declaredIds.length ? declaredIds : snapshotIds;

  const resolvedSaleIds: string[] = [];
  const missingSaleIds: string[] = [];
  for (const saleId of statementSalesIds) {
    if (byId.has(saleId)) resolvedSaleIds.push(saleId);
    else missingSaleIds.push(saleId);
  }

  const sales = resolvedSaleIds.map((saleId) => {
    const row = byId.get(saleId)!;
    return {
      saleId: row.saleId,
      billedAmount: row.billedAmount,
      receiptAllocatedAmount: row.receiptAllocatedAmount,
      legacyAppliedAmount: row.legacyAppliedAmount,
      totalAppliedAmount: row.totalAppliedAmount,
      outstandingAmount: row.outstandingAmount,
      paymentStatus: row.paymentStatus,
      snapshotBilledAmount: snapshotById.has(saleId) ? snapshotById.get(saleId)! : null,
    };
  });

  const billedAmount = sales.reduce((sum, row) => sum + row.billedAmount, 0);
  const snapshotBilledAmount = statementSalesIds.reduce(
    (sum, saleId) => sum + (snapshotById.get(saleId) ?? 0),
    0,
  );
  const receiptAllocatedAmount = sales.reduce((sum, row) => sum + row.receiptAllocatedAmount, 0);
  const legacyAppliedAmount = sales.reduce((sum, row) => sum + row.legacyAppliedAmount, 0);
  const appliedAmount = receiptAllocatedAmount + legacyAppliedAmount;
  const outstandingAmount = sales.reduce((sum, row) => sum + row.outstandingAmount, 0);
  const coveredSaleCount = sales.filter((row) => row.outstandingAmount <= 0 && row.billedAmount > 0).length;

  let manualReviewReason: string | null = null;
  if (!statementSalesIds.length) manualReviewReason = "statementSalesIds가 없어 매출 배분을 확정할 수 없습니다.";
  else if (missingSaleIds.length) manualReviewReason = "statementSalesIds 중 존재하지 않는 매출이 있습니다.";
  const manualReview = manualReviewReason != null;

  const archiveId = String(archive.id ?? "");
  const statementReceipts = (data.receipts || []).filter(
    (row) => String(row?.sentStatementId ?? "") === archiveId && isReceiptEffectiveAsOf(row, asOfDate),
  );
  const statementLinkedReceiptIds = statementReceipts.map((row) => String(row.id));

  /**
   * Cash received against this statement that no allocation claims. Since allocations can
   * never exceed a sale's billed amount, this — not `appliedAmount > billedAmount` — is what
   * makes a statement over-paid.
   */
  const allocations = data.receiptAllocations || [];
  const receiptById = new Map((data.receipts || []).map((row) => [String(row.id), row]));
  const unallocatedPrepaid = statementReceipts.reduce((sum, receipt) => {
    const gross = unifiedArMoney(receipt?.grossAmount);
    const allocated = allocations.reduce((inner, row) => {
      if (String(row?.receiptId ?? "") !== String(receipt.id)) return inner;
      if (!isAllocationEffectiveAsOf(row, receiptById, asOfDate)) return inner;
      return inner + unifiedArMoney(row.amount);
    }, 0);
    return sum + Math.max(gross - allocated, 0);
  }, 0);

  let status: UnifiedStatementPaymentStatus;
  if (isStatementCancelled(archive)) {
    status = "cancelled";
  } else if (manualReview) {
    status = appliedAmount > 0 ? "partial" : "unpaid";
  } else if (appliedAmount <= 0) {
    status = "unpaid";
  } else if (!sales.every((row) => row.outstandingAmount <= 0)) {
    status = "partial";
  } else if (appliedAmount > billedAmount || unallocatedPrepaid > 0) {
    status = "overpaid";
  } else {
    status = "paid";
  }

  const storedPaymentStatus = archive.paymentStatus != null ? String(archive.paymentStatus) : null;

  return {
    archiveId,
    clientName: String(archive.subjectName ?? ""),
    asOfDate,
    status,
    manualReview,
    manualReviewReason,
    bulkAllocateAllowed: !manualReview && status !== "cancelled",
    statementSalesIds,
    resolvedSaleIds,
    missingSaleIds,
    billedAmount,
    snapshotBilledAmount,
    statementTotalAmount: unifiedArMoney(archive.statementTotalAmount),
    appliedAmount,
    receiptAllocatedAmount,
    legacyAppliedAmount,
    outstandingAmount,
    coveredSaleCount,
    saleCount: sales.length,
    unallocatedPrepaid,
    statementLinkedReceiptIds,
    sales,
    storedPaymentStatus,
    storedStatusMatchesDerived: storedPaymentStatus === statementPaymentStatusToArchiveCache(status),
  };
}

/** Map the derived status onto the legacy archive display cache vocabulary. */
export function statementPaymentStatusToArchiveCache(status: UnifiedStatementPaymentStatus) {
  if (status === "cancelled") return "cancelled";
  if (status === "paid" || status === "overpaid") return "confirmed";
  if (status === "partial") return "partial";
  return "pending";
}

/**
 * Regeneration policy: a statement PDF may be re-rendered many times, so the same saleId
 * appears on several archive versions. Client totals must count each saleId once.
 */
export function dedupeStatementSaleIdsAcrossVersions(
  archives: UnifiedArStatementArchiveLike[] = [],
): { saleIds: string[]; duplicates: Array<{ saleId: string; archiveIds: string[] }> } {
  const archiveIdsBySaleId = new Map<string, string[]>();
  for (const archive of archives) {
    const ids = [
      ...new Set(
        [
          ...(archive.statementSalesIds || []),
          ...(archive.statementSalesSnapshot || []).map((row) => row?.saleId),
        ]
          .map((id) => String(id ?? "").trim())
          .filter(Boolean),
      ),
    ];
    for (const saleId of ids) {
      const list = archiveIdsBySaleId.get(saleId) || [];
      list.push(String(archive.id ?? ""));
      archiveIdsBySaleId.set(saleId, list);
    }
  }
  const duplicates = [...archiveIdsBySaleId.entries()]
    .filter(([, archiveIds]) => archiveIds.length > 1)
    .map(([saleId, archiveIds]) => ({ saleId, archiveIds }));
  return { saleIds: [...archiveIdsBySaleId.keys()], duplicates };
}

/* --------------------------------------------- legacy view / applied sales */

/**
 * Overlay unified balances onto normalized sales rows so every screen reads the same
 * billed / applied / outstanding numbers. `prepaidBalance` stays a client-level credit.
 */
export function applyUnifiedArBalancesToSales<T extends UnifiedArSaleLike & Record<string, unknown>>(
  sales: T[],
  balances: Pick<UnifiedArSaleBalancesResult, "sales">,
  options: { prepaidByClientName?: Record<string, number> } = {},
) {
  const byId = new Map(balances.sales.map((row) => [row.saleId, row]));
  const prepaid = options.prepaidByClientName || {};
  return sales.map((sale) => {
    const row = byId.get(String(sale?.id ?? ""));
    if (!row) {
      return {
        ...sale,
        basePaid: unifiedArMoney((sale as { paid?: number }).paid),
        voucherPaid: 0,
        arSourceLedger: "none" as UnifiedArSourceLedger,
        prepaidBalance: prepaid[String(sale?.client ?? "")] || 0,
      };
    }
    return {
      ...sale,
      amount: row.billedAmount,
      // `paid` stays capped at billed so legacy status helpers keep working unchanged.
      paid: Math.min(row.totalAppliedAmount, row.billedAmount),
      appliedAmount: row.totalAppliedAmount,
      basePaid: row.legacyStoredPaidAmount,
      voucherPaid: row.legacyDirectAppliedAmount + row.legacyFifoAppliedAmount + row.receiptAllocatedAmount,
      outstandingAmount: row.outstandingAmount,
      arBilledAmount: row.billedAmount,
      arReceiptAllocatedAmount: row.receiptAllocatedAmount,
      arLegacyAppliedAmount: row.legacyAppliedAmount,
      arPaymentStatus: row.paymentStatus,
      arSourceLedger: row.sourceLedger,
      arReceiptIds: row.receiptIds,
      arLegacyVoucherIds: row.legacyVoucherIds,
      prepaidBalance: prepaid[String(sale?.client ?? "")] || 0,
    };
  });
}

/** Receipt-unallocated cash plus legacy statement leftovers, per client name. */
export function mergePrepaidByClientName(
  ...maps: Array<Record<string, number> | undefined>
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const map of maps) {
    for (const [name, amount] of Object.entries(map || {})) {
      merged[name] = (merged[name] || 0) + amount;
    }
  }
  return merged;
}

/** Unallocated receipt cash per client name (prepaid credit), as-of a date. */
export function buildPrepaidByClientName(data: UnifiedArData = {}, options: { asOfDate?: string } = {}) {
  const asOf = normalizeYmd(options.asOfDate, todaySeoulYmd());
  const allocations = data.receiptAllocations || [];
  const receiptById = new Map((data.receipts || []).map((row) => [String(row.id), row]));
  const clientsById = new Map((data.clients || []).map((row) => [String(row?.id ?? ""), row]));
  const prepaid: Record<string, number> = {};

  for (const receipt of data.receipts || []) {
    if (!isReceiptEffectiveAsOf(receipt, asOf)) continue;
    const gross = unifiedArMoney(receipt?.grossAmount);
    const allocated = allocations.reduce((sum, row) => {
      if (String(row?.receiptId ?? "") !== String(receipt.id)) return sum;
      if (!isAllocationEffectiveAsOf(row, receiptById, asOf)) return sum;
      return sum + unifiedArMoney(row.amount);
    }, 0);
    const unallocated = Math.max(gross - allocated, 0);
    if (unallocated <= 0) continue;
    const name = String(receipt?.clientName || clientsById.get(String(receipt?.clientId ?? ""))?.name || "");
    prepaid[name] = (prepaid[name] || 0) + unallocated;
  }
  return prepaid;
}
