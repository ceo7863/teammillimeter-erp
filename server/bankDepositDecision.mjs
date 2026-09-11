/**
 * Bank deposit decision: Stage A client resolve, Stage B allocate to sales.
 * Receipt creation is gated by client certainty, never by statement amount match alone.
 */
import {
  resolveBankDepositMatchSubject,
  depositSubjectMatchesClient,
  isInternalCompanyBankTransfer,
} from "../src/utils/clientDepositAliases.ts";
import { isCardCompanyDeposit } from "../src/utils/bankTransactionFolders.ts";
import { isBankDepositLinked } from "../src/utils/bankDepositLink.ts";
import {
  classifyCashBankTransfer,
  loadSentStatementSaleIdsForClient,
  proposeFifoAllocationsScoped,
} from "./canonicalCollection.mjs";

export const BANK_DEPOSIT_PROCESSING_STATUSES = [
  "detected",
  "receipt_posted",
  "allocated",
  "partially_allocated",
  "unapplied",
  "needs_review",
  "ignored",
  "failed",
];

export const BANK_DEPOSIT_REASON_CODES = [
  "PRE_CUTOVER",
  "CLIENT_NOT_FOUND",
  "CLIENT_AMBIGUOUS",
  "MANUAL_OVERRIDE_REQUIRED",
  "CASH_TRANSFER",
  "CARD_SETTLEMENT",
  "NO_SENT_SALES",
  "STATEMENT_SALE_IDS_MISSING",
  "STATEMENT_FULLY_PAID",
  "MULTIPLE_CANDIDATES",
  "DATE_OUT_OF_RANGE",
  "RECEIPT_POSTED_UNAPPLIED",
  "RECEIPT_PARTIALLY_ALLOCATED",
  "DUPLICATE_BANK_RECEIPT",
  "IDEMPOTENCY_CONFLICT",
  "VERSION_CONFLICT",
  "INTERNAL_ERROR",
];

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function ymd(value) {
  return String(value || "").slice(0, 10);
}

function hasManualClientClassificationOverride(tx) {
  return Boolean(
    tx?.manualClientOverride ||
      tx?.manualClassification ||
      tx?.requireManualClientReview ||
      tx?.depositClientOverrideRequired,
  );
}

/**
 * Find clients that uniquely match a deposit subject. Amount is never used.
 */
export function resolveBankDepositClient(tx, clients = [], options = {}) {
  if (isCardCompanyDeposit(tx)) {
    return { status: "needs_review", reasonCode: "CARD_SETTLEMENT", clients: [] };
  }
  if (isInternalCompanyBankTransfer(tx) || options.cashTransfer === true) {
    return { status: "ignored", reasonCode: "CASH_TRANSFER", clients: [] };
  }
  if (hasManualClientClassificationOverride(tx)) {
    return { status: "needs_review", reasonCode: "MANUAL_OVERRIDE_REQUIRED", clients: [] };
  }

  const explicitId = String(tx?.linkedClientId || tx?.clientId || "").trim();
  if (explicitId) {
    const hit = (clients || []).find((row) => String(row?.id) === explicitId);
    if (hit) return { status: "resolved", reasonCode: null, client: hit, clients: [hit], evidence: "linkedClientId" };
  }

  const subject = resolveBankDepositMatchSubject(tx);
  const matches = (clients || []).filter((client) => depositSubjectMatchesClient(subject, client));

  if (!matches.length) {
    return { status: "needs_review", reasonCode: "CLIENT_NOT_FOUND", clients: [], subject };
  }
  if (matches.length > 1) {
    return {
      status: "needs_review",
      reasonCode: "CLIENT_AMBIGUOUS",
      clients: matches,
      subject,
    };
  }
  return {
    status: "resolved",
    reasonCode: null,
    client: matches[0],
    clients: matches,
    subject,
    evidence: "unique_subject_match",
  };
}

/**
 * Plan receipt for a resolved client: full gross always; FIFO on sent-statement sale union.
 */
export function planBankDepositReceiptAllocation({
  client,
  grossAmount,
  sales = [],
  receipts = [],
  allocations = [],
  clients = [],
  asOfDate = null,
  archives = null,
  proposeFifoAllocations,
}) {
  const amount = money(grossAmount);
  if (amount <= 0) {
    return {
      allocations: [],
      unallocatedAmount: 0,
      processingStatus: "failed",
      reasonCode: "INTERNAL_ERROR",
      scope: { saleIds: [] },
    };
  }

  const scope = loadSentStatementSaleIdsForClient(client, {
    archives: archives ?? undefined,
    requireSent: true,
  });

  if (!scope.saleIds.length) {
    return {
      allocations: [],
      unallocatedAmount: amount,
      processingStatus: "unapplied",
      reasonCode: "NO_SENT_SALES",
      scope,
    };
  }

  const fifo = proposeFifoAllocationsScoped(proposeFifoAllocations, {
    sales,
    client,
    grossAmount: amount,
    allocations,
    receipts,
    clients,
    asOfDate,
    saleIdAllowlist: scope.saleIdSet,
    requireAllowlist: true,
  });

  const allocated = (fifo.allocations || []).reduce((sum, row) => sum + money(row.amount), 0);
  const unallocated = money(fifo.unallocatedAmount ?? Math.max(amount - allocated, 0));

  let processingStatus = "allocated";
  let reasonCode = null;
  if (allocated <= 0) {
    processingStatus = "unapplied";
    reasonCode = "RECEIPT_POSTED_UNAPPLIED";
  } else if (unallocated > 0) {
    processingStatus = "partially_allocated";
    reasonCode = "RECEIPT_PARTIALLY_ALLOCATED";
  }

  return {
    allocations: fifo.allocations || [],
    unallocatedAmount: unallocated,
    processingStatus,
    reasonCode,
    scope,
  };
}

/**
 * Persistent unresolved queue: never drop solely because lookback days elapsed.
 */
export function upsertUnresolvedDepositQueue(existingQueue = [], entry) {
  const queue = Array.isArray(existingQueue) ? [...existingQueue] : [];
  const txId = String(entry?.bankTransactionId || "").trim();
  if (!txId) return queue;
  const idx = queue.findIndex((row) => String(row.bankTransactionId) === txId);
  const next = {
    bankTransactionId: txId,
    status: entry.status || "needs_review",
    reasonCode: entry.reasonCode || null,
    subject: entry.subject || null,
    clientId: entry.clientId || null,
    receiptId: entry.receiptId || null,
    firstSeenAt: entry.firstSeenAt || new Date().toISOString(),
    lastCheckedAt: entry.lastCheckedAt || new Date().toISOString(),
    transactionDate: ymd(entry.transactionDate),
    depositAmount: money(entry.depositAmount),
  };
  if (idx >= 0) {
    next.firstSeenAt = queue[idx].firstSeenAt || next.firstSeenAt;
    queue[idx] = { ...queue[idx], ...next };
  } else {
    queue.push(next);
  }
  return queue;
}

export function removeResolvedFromQueue(existingQueue = [], txId) {
  const id = String(txId || "").trim();
  return (existingQueue || []).filter((row) => String(row.bankTransactionId) !== id);
}

/**
 * All post-cutover unmatched deposits, regardless of age (persistent).
 * Optionally merge with recent lookback for diagnostics.
 */
export function selectPersistentUnresolvedDepositIds(
  bankTransactions = [],
  options = {},
) {
  const cutoverYmd = ymd(options.cutoverAt);
  const linkContext = { receipts: options.receipts, paymentVouchers: options.paymentVouchers };
  const ids = [];
  for (const tx of bankTransactions) {
    if (money(tx?.deposit) <= 0) continue;
    if (isBankDepositLinked(tx, linkContext)) continue;
    if (isCardCompanyDeposit(tx)) continue;
    const txDate = ymd(tx?.transactionAt);
    if (cutoverYmd && txDate && txDate < cutoverYmd) continue;
    ids.push(String(tx.id));
  }
  return ids;
}

export function decideBankDepositAction(tx, context = {}) {
  const {
    clients = [],
    sales = [],
    receipts = [],
    allocations = [],
    paymentVouchers = [],
    cutoverAt = null,
    cashReceipts = [],
    proposeFifoAllocations,
    archives = null,
  } = context;

  const txId = String(tx?.id || "");
  const depositAmount = money(tx?.deposit);
  const transactionDate = ymd(tx?.transactionAt);

  if (cutoverAt && transactionDate && transactionDate < ymd(cutoverAt) && !context.forcePostCutover) {
    return {
      action: "skip",
      status: "ignored",
      reasonCode: "PRE_CUTOVER",
      bankTransactionId: txId,
    };
  }

  if (isBankDepositLinked(tx, { receipts, paymentVouchers })) {
    return {
      action: "skip",
      status: "receipt_posted",
      reasonCode: "DUPLICATE_BANK_RECEIPT",
      bankTransactionId: txId,
    };
  }

  const cashTransfer = classifyCashBankTransfer({
    bankTx: tx,
    receipts: cashReceipts.length ? cashReceipts : receipts,
    linkedCashReceiptId: tx?.linkedCashReceiptId || null,
  });
  if (cashTransfer?.allowCustomerReceipt === false) {
    return {
      action: "skip",
      status: "ignored",
      reasonCode: "CASH_TRANSFER",
      bankTransactionId: txId,
      cashTransfer,
    };
  }

  const clientDecision = resolveBankDepositClient(tx, clients, {});
  if (clientDecision.status !== "resolved") {
    return {
      action: "queue",
      status: clientDecision.status === "ignored" ? "ignored" : "needs_review",
      reasonCode: clientDecision.reasonCode,
      bankTransactionId: txId,
      subject: clientDecision.subject,
      candidateClientIds: (clientDecision.clients || []).map((row) => row.id),
      depositAmount,
      transactionDate,
    };
  }

  const plan = planBankDepositReceiptAllocation({
    client: clientDecision.client,
    grossAmount: depositAmount,
    sales,
    receipts,
    allocations,
    clients,
    asOfDate: transactionDate,
    archives,
    proposeFifoAllocations,
  });

  return {
    action: "post_receipt",
    status: plan.processingStatus === "failed" ? "failed" : "detected",
    reasonCode: plan.reasonCode,
    bankTransactionId: txId,
    clientId: clientDecision.client.id,
    clientName: clientDecision.client.name,
    evidence: clientDecision.evidence,
    depositAmount,
    transactionDate,
    allocations: plan.allocations,
    unallocatedAmount: plan.unallocatedAmount,
    processingStatus: plan.processingStatus,
    scope: plan.scope,
  };
}
