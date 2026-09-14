/**
 * Bank deposit classification coverage (post-cutover).
 * Every deposit must land in exactly one status bucket.
 */

import { isCardCompanyDeposit } from "../src/utils/bankTransactionFolders.ts";
import { isInternalCompanyBankTransfer } from "../src/utils/clientDepositAliases.ts";
import { findBankTransactionOpenReceipt } from "../src/utils/bankDepositLink.ts";
import { resolveClientByAlias } from "./depositorAliases.mjs";

export const BANK_DEPOSIT_COVERAGE_STATUSES = [
  "RECEIPT_ALLOCATED",
  "RECEIPT_PARTIALLY_ALLOCATED",
  "RECEIPT_UNAPPLIED",
  "CLIENT_REVIEW_REQUIRED",
  "ALIAS_CONFLICT",
  "CASH_TRANSFER",
  "CARD_SETTLEMENT",
  "NON_CUSTOMER_DEPOSIT",
  "IGNORED_WITH_REASON",
  "PROCESSING_FAILED",
  "RETRY_PENDING",
];

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function trim(value) {
  return String(value ?? "").trim();
}

function depositAmount(tx) {
  const deposit = money(tx?.deposit);
  if (deposit > 0) return deposit;
  const amount = money(tx?.amount);
  return amount > 0 ? amount : 0;
}

function isDepositTx(tx) {
  if (!tx) return false;
  if (money(tx.withdrawal || tx.withdraw) > 0 && depositAmount(tx) <= 0) return false;
  return depositAmount(tx) > 0;
}

function findUnresolvedEntry(queue, txId) {
  const id = trim(txId);
  if (!id) return null;
  return (queue || []).find((row) => trim(row?.bankTransactionId) === id) || null;
}

function summarizeReceipt(receipt, allocations = []) {
  if (!receipt) return null;
  const rows = (allocations || []).filter((row) => {
    if (String(row.receiptId) !== String(receipt.id)) return false;
    if (row.auditOnly) return false;
    if (row.status === "reversed") return false;
    if (row.reversedEffectiveDate) return false;
    return money(row.amount) > 0;
  });
  const allocatedAmount = rows.reduce((sum, row) => sum + money(row.amount), 0);
  const grossAmount = money(receipt.grossAmount);
  const unallocatedAmount = Math.max(grossAmount - allocatedAmount, 0);
  return { allocatedAmount, unallocatedAmount, grossAmount, allocationCount: rows.length };
}

function mapUnresolvedReasonToStatus(reasonCode, status) {
  const code = trim(reasonCode);
  const st = trim(status).toLowerCase();
  if (st === "ignored" || code === "ignored") return "IGNORED_WITH_REASON";
  if (code === "CASH_TRANSFER") return "CASH_TRANSFER";
  if (code === "CARD_SETTLEMENT") return "CARD_SETTLEMENT";
  if (code === "CLIENT_ALIAS_CONFLICT" || code === "ALIAS_CONFLICT") return "ALIAS_CONFLICT";
  if (
    code === "CLIENT_NOT_FOUND" ||
    code === "CLIENT_AMBIGUOUS" ||
    code === "MANUAL_OVERRIDE_REQUIRED" ||
    code === "needs_review" ||
    st === "needs_review"
  ) {
    return "CLIENT_REVIEW_REQUIRED";
  }
  if (code === "RECEIPT_POSTED_UNAPPLIED") return "RECEIPT_UNAPPLIED";
  if (code === "RECEIPT_PARTIALLY_ALLOCATED") return "RECEIPT_PARTIALLY_ALLOCATED";
  if (
    code === "INTERNAL_ERROR" ||
    code === "IDEMPOTENCY_CONFLICT" ||
    code === "VERSION_CONFLICT" ||
    code === "DUPLICATE_BANK_RECEIPT"
  ) {
    return "PROCESSING_FAILED";
  }
  if (st === "retry" || st === "retry_pending" || code === "RETRY_PENDING") return "RETRY_PENDING";
  if (code === "NON_CUSTOMER_DEPOSIT") return "NON_CUSTOMER_DEPOSIT";
  if (code) return "CLIENT_REVIEW_REQUIRED";
  return null;
}

/**
 * Classify a single bank deposit transaction.
 */
export function classifyBankDeposit(tx, { receipts = [], allocations = [], unresolvedQueue = [], aliases = [], clients = [] } = {}) {
  const amount = depositAmount(tx);
  const txId = trim(tx?.id);

  if (!isDepositTx(tx)) {
    return {
      status: "NON_CUSTOMER_DEPOSIT",
      amount: 0,
      bankTransactionId: txId || null,
      reasonCode: "NOT_A_DEPOSIT",
    };
  }

  if (isCardCompanyDeposit(tx)) {
    return {
      status: "CARD_SETTLEMENT",
      amount,
      bankTransactionId: txId || null,
      reasonCode: "CARD_SETTLEMENT",
    };
  }

  if (isInternalCompanyBankTransfer(tx)) {
    return {
      status: "CASH_TRANSFER",
      amount,
      bankTransactionId: txId || null,
      reasonCode: "CASH_TRANSFER",
    };
  }

  const unresolved = findUnresolvedEntry(unresolvedQueue, txId);
  if (unresolved) {
    const ignored =
      unresolved.ignored === true ||
      trim(unresolved.status) === "ignored" ||
      Boolean(unresolved.ignoredAt);
    if (ignored) {
      return {
        status: "IGNORED_WITH_REASON",
        amount,
        bankTransactionId: txId || null,
        reasonCode: trim(unresolved.reasonCode) || "ignored",
        unresolved,
      };
    }
    const mapped = mapUnresolvedReasonToStatus(unresolved.reasonCode, unresolved.status);
    if (mapped && mapped !== "RECEIPT_UNAPPLIED" && mapped !== "RECEIPT_PARTIALLY_ALLOCATED") {
      // Receipt-linked outcomes below take precedence when a receipt exists.
      const openFromUnresolved = trim(unresolved.receiptId);
      const hasReceipt =
        openFromUnresolved &&
        (receipts || []).some(
          (row) =>
            String(row.id) === openFromUnresolved &&
            !row.reversalOfReceiptId &&
            row.status !== "reversed" &&
            !row.reversedEffectiveDate,
        );
      if (!hasReceipt) {
        return {
          status: mapped,
          amount,
          bankTransactionId: txId || null,
          reasonCode: trim(unresolved.reasonCode) || mapped,
          unresolved,
        };
      }
    }
  }

  const openReceipt = findBankTransactionOpenReceipt(tx, { receipts });
  if (openReceipt) {
    const summary = summarizeReceipt(openReceipt, allocations);
    let status = "RECEIPT_UNAPPLIED";
    if (summary.allocatedAmount > 0 && summary.unallocatedAmount <= 0) status = "RECEIPT_ALLOCATED";
    else if (summary.allocatedAmount > 0 && summary.unallocatedAmount > 0) {
      status = "RECEIPT_PARTIALLY_ALLOCATED";
    } else {
      status = "RECEIPT_UNAPPLIED";
    }
    return {
      status,
      amount,
      bankTransactionId: txId || null,
      receiptId: openReceipt.id,
      receiptNo: openReceipt.receiptNo || null,
      allocatedAmount: summary.allocatedAmount,
      unallocatedAmount: summary.unallocatedAmount,
      reasonCode: null,
    };
  }

  // Alias conflict check for unresolved client matching
  const subject = trim(tx?.counterpartyName || tx?.description || tx?.memo || "");
  if (subject && Array.isArray(aliases) && aliases.length) {
    const resolved = resolveClientByAlias(aliases, clients, {
      rawName: subject,
      bankAccountId: tx?.bankAccountId || tx?.accountId || null,
    });
    if (resolved.conflict) {
      return {
        status: "ALIAS_CONFLICT",
        amount,
        bankTransactionId: txId || null,
        reasonCode: "CLIENT_ALIAS_CONFLICT",
        candidates: resolved.candidates,
      };
    }
  }

  if (unresolved) {
    const mapped = mapUnresolvedReasonToStatus(unresolved.reasonCode, unresolved.status) || "CLIENT_REVIEW_REQUIRED";
    return {
      status: mapped,
      amount,
      bankTransactionId: txId || null,
      reasonCode: trim(unresolved.reasonCode) || mapped,
      unresolved,
    };
  }

  if (tx?.processingStatus === "failed" || tx?.depositProcessingFailed) {
    return {
      status: "PROCESSING_FAILED",
      amount,
      bankTransactionId: txId || null,
      reasonCode: trim(tx?.processingReasonCode) || "INTERNAL_ERROR",
    };
  }

  if (tx?.processingStatus === "retry_pending" || tx?.retryPending) {
    return {
      status: "RETRY_PENDING",
      amount,
      bankTransactionId: txId || null,
      reasonCode: "RETRY_PENDING",
    };
  }

  if (tx?.nonCustomerDeposit || tx?.excludeFromCustomerReceipt) {
    return {
      status: "NON_CUSTOMER_DEPOSIT",
      amount,
      bankTransactionId: txId || null,
      reasonCode: "NON_CUSTOMER_DEPOSIT",
    };
  }

  // Default: needs client review (never leave unclassified)
  return {
    status: "CLIENT_REVIEW_REQUIRED",
    amount,
    bankTransactionId: txId || null,
    reasonCode: "CLIENT_NOT_FOUND",
  };
}

/**
 * Reconcile coverage across all deposit transactions.
 * Identity: totalCount/amount === sum of classified buckets.
 */
export function reconcileBankDepositCoverage(bankTransactions, context = {}) {
  const {
    receipts = [],
    allocations = [],
    receiptAllocations = null,
    unresolvedQueue = null,
    aliases = [],
    clients = [],
    bankSyncMeta = null,
  } = context;

  const allocs = Array.isArray(allocations)
    ? allocations
    : Array.isArray(receiptAllocations)
      ? receiptAllocations
      : [];
  const queue = Array.isArray(unresolvedQueue)
    ? unresolvedQueue
    : Array.isArray(bankSyncMeta?.unresolvedDepositQueue)
      ? bankSyncMeta.unresolvedDepositQueue
      : [];

  const deposits = (bankTransactions || []).filter(isDepositTx);
  const byStatus = {};
  for (const status of BANK_DEPOSIT_COVERAGE_STATUSES) {
    byStatus[status] = { count: 0, amount: 0 };
  }

  const rows = [];
  for (const tx of deposits) {
    const classified = classifyBankDeposit(tx, {
      receipts,
      allocations: allocs,
      unresolvedQueue: queue,
      aliases,
      clients,
    });
    const status = BANK_DEPOSIT_COVERAGE_STATUSES.includes(classified.status)
      ? classified.status
      : "CLIENT_REVIEW_REQUIRED";
    const amount = money(classified.amount ?? depositAmount(tx));
    byStatus[status].count += 1;
    byStatus[status].amount += amount;
    rows.push({ ...classified, status, amount });
  }

  const totalCount = deposits.length;
  const totalAmount = deposits.reduce((sum, tx) => sum + depositAmount(tx), 0);
  let classifiedCount = 0;
  let classifiedAmount = 0;
  for (const status of BANK_DEPOSIT_COVERAGE_STATUSES) {
    classifiedCount += byStatus[status].count;
    classifiedAmount += byStatus[status].amount;
  }

  // By design every deposit is classified into a bucket — unclassified should be 0.
  const unclassifiedRows = rows.filter((row) => !BANK_DEPOSIT_COVERAGE_STATUSES.includes(row.status));
  const unclassifiedCount = unclassifiedRows.length;
  const unclassifiedAmount = unclassifiedRows.reduce((sum, row) => sum + money(row.amount), 0);

  const countDiff = totalCount - classifiedCount;
  const amountDiff = totalAmount - classifiedAmount;

  return {
    totalCount,
    totalAmount,
    byStatus,
    unclassifiedCount,
    unclassifiedAmount,
    countDiff,
    amountDiff,
    identityOk: countDiff === 0 && amountDiff === 0 && unclassifiedCount === 0,
    rows,
  };
}

export { money as bankDepositClassificationMoney };
