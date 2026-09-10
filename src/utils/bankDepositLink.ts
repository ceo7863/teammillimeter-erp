/**
 * Phase 2 unified AR: single source of truth for "is this bank deposit already
 * turned into an AR document?".
 *
 * A deposit can be linked in exactly one of two ways:
 * - "receipt": Phase 2 Receipt/Allocation (authoritative going forward)
 * - "legacy":  pre-Phase 2 paymentVoucher rows
 *
 * Auto-match, manual link, unlink and list badges must all agree, otherwise a
 * deposit can be double-posted (voucher + receipt) or silently re-linked.
 */

import type { BankTransaction } from "./bankTransactions";

export type DepositLinkReceiptLike = {
  id?: string | number;
  bankTransactionId?: string | number | null;
  status?: string;
  reversalOfReceiptId?: string | null;
  reversedEffectiveDate?: string | null;
};

export type DepositLinkVoucherLike = {
  id?: string | number;
  bankTransactionId?: string | number | null;
};

export type BankDepositLinkContext = {
  receipts?: DepositLinkReceiptLike[];
  paymentVouchers?: DepositLinkVoucherLike[];
};

export type BankDepositLinkKind = "receipt" | "legacy" | "none";

export type BankDepositLinkTx = Pick<BankTransaction, "id"> & {
  linkedReceiptId?: string;
  linkedPaymentVoucherId?: string | number;
};

/**
 * Receipt is "open" when it is a real cash document that has not been reversed.
 * Mirrors assertBankTxUnique() in server/receipts.mjs so the bank layer and the
 * receipt domain can never disagree about occupancy of a bank transaction.
 */
export function isOpenDepositReceipt(receipt: DepositLinkReceiptLike | null | undefined) {
  if (!receipt) return false;
  if (receipt.reversalOfReceiptId) return false;
  if (receipt.reversedEffectiveDate) return false;
  if (receipt.status === "reversed") return false;
  return true;
}

/** Open (non-reversed) receipt posted against this bank transaction, if any. */
export function findBankTransactionOpenReceipt(
  tx: BankDepositLinkTx,
  context: BankDepositLinkContext = {},
): DepositLinkReceiptLike | null {
  const receipts = context.receipts;
  if (!Array.isArray(receipts) || !receipts.length) return null;
  const txId = String(tx?.id ?? "");
  const linkedId = String(tx?.linkedReceiptId || "").trim();

  if (linkedId) {
    const byId = receipts.find((row) => String(row?.id ?? "") === linkedId);
    if (byId && isOpenDepositReceipt(byId)) return byId;
  }
  if (!txId) return null;
  return (
    receipts.find(
      (row) => String(row?.bankTransactionId || "") === txId && isOpenDepositReceipt(row),
    ) || null
  );
}

function hasLegacyVoucherLink(tx: BankDepositLinkTx, context: BankDepositLinkContext = {}) {
  if (tx?.linkedPaymentVoucherId != null && tx.linkedPaymentVoucherId !== "") return true;
  const vouchers = context.paymentVouchers;
  if (!Array.isArray(vouchers) || !vouchers.length) return false;
  const txId = String(tx?.id ?? "");
  if (!txId) return false;
  return vouchers.some((row) => String(row?.bankTransactionId || "") === txId);
}

/**
 * Denormalized-field-only check, for list rendering paths that must stay
 * synchronous and cheap. Equivalent to isBankDepositLinked() without context.
 */
export function hasBankDepositLinkField(tx: BankDepositLinkTx | null | undefined) {
  if (!tx) return false;
  if (String(tx.linkedReceiptId || "").trim()) return true;
  return tx.linkedPaymentVoucherId != null && tx.linkedPaymentVoucherId !== "";
}

/**
 * Which ledger currently owns this deposit.
 *
 * When no context is supplied only the denormalized tx fields are inspected, so
 * callers that cannot load receipts/vouchers still get a safe (never falsely
 * "none") answer for rows that carry a link id.
 */
export function getBankDepositLinkKind(
  tx: BankDepositLinkTx,
  context: BankDepositLinkContext = {},
): BankDepositLinkKind {
  if (!tx) return "none";

  const receipts = context.receipts;
  const linkedReceiptId = String(tx.linkedReceiptId || "").trim();
  if (linkedReceiptId) {
    // With receipts loaded a reversed receipt frees the deposit again; without
    // them we trust the denormalized field.
    if (!Array.isArray(receipts) || !receipts.length) return "receipt";
    if (findBankTransactionOpenReceipt(tx, context)) return "receipt";
  } else if (findBankTransactionOpenReceipt(tx, context)) {
    return "receipt";
  }

  if (hasLegacyVoucherLink(tx, context)) return "legacy";
  return "none";
}

/** True when the deposit already has an AR document (receipt or legacy voucher). */
export function isBankDepositLinked(tx: BankDepositLinkTx, context: BankDepositLinkContext = {}) {
  return getBankDepositLinkKind(tx, context) !== "none";
}

/** True only for Phase 2 receipt links — legacy rows keep the old unlink path. */
export function isBankDepositReceiptLinked(
  tx: BankDepositLinkTx,
  context: BankDepositLinkContext = {},
) {
  return getBankDepositLinkKind(tx, context) === "receipt";
}

/** True only for pre-Phase 2 voucher links. */
export function isBankDepositLegacyLinked(
  tx: BankDepositLinkTx,
  context: BankDepositLinkContext = {},
) {
  return getBankDepositLinkKind(tx, context) === "legacy";
}

/** Receipt id to use for reverse/unlink and detail lookups. */
export function resolveBankDepositReceiptId(
  tx: BankDepositLinkTx,
  context: BankDepositLinkContext = {},
): string {
  const open = findBankTransactionOpenReceipt(tx, context);
  if (open?.id != null) return String(open.id);
  return String(tx?.linkedReceiptId || "").trim();
}
