import type { BankTransaction } from "./bankTransactions";

export function isCancellationOrCorrectionTransaction(tx: BankTransaction) {
  const haystack = [tx.transactionType, tx.description, tx.memo]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, "");
  return haystack.includes("\uCDE8\uC18C") || haystack.includes("\uC815\uC815");
}

/** Card cancel/refund deposits that should offset expense when classified (e.g. fuel preauth cancel). */
export function isBankTxExpenseReversal(tx: BankTransaction) {
  if (!(Number(tx.deposit || 0) > 0) || Number(tx.withdrawal || 0) > 0) return false;
  if (tx.netGroupRole === "preauth_refund") return true;
  return isCancellationOrCorrectionTransaction(tx);
}
