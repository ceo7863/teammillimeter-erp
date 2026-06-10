import type { BankTransaction } from "./bankTransactions";
import type { FixedExpensePayment } from "./companyLedger";

export type FixedExpenseBankLinkRow = {
  bankTransactionId: string;
  transactionAt: string;
  withdrawal: number;
  deposit: number;
  description: string;
  counterpartyName: string;
  linkKind: "fixed" | "payment";
  paymentId?: string;
  paymentDate?: string;
  paymentAmount?: number;
};

export function buildFixedExpenseBankLinkRows(
  fixedExpenseId: string,
  payments: FixedExpensePayment[],
  bankTransactions: BankTransaction[],
  options: { paymentId?: string } = {},
): FixedExpenseBankLinkRow[] {
  const relatedPayments = payments.filter((row) => row.fixedExpenseId === fixedExpenseId);
  const paymentById = new Map(relatedPayments.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const rows: FixedExpenseBankLinkRow[] = [];

  for (const tx of bankTransactions) {
    let payment: FixedExpensePayment | undefined;
    let linkKind: FixedExpenseBankLinkRow["linkKind"] | null = null;

    if (tx.ledgerFixedExpenseId === fixedExpenseId) {
      linkKind = "fixed";
      if (tx.linkedFixedExpensePaymentId) {
        payment = paymentById.get(tx.linkedFixedExpensePaymentId);
      }
    } else if (tx.linkedFixedExpensePaymentId && paymentById.has(tx.linkedFixedExpensePaymentId)) {
      linkKind = "payment";
      payment = paymentById.get(tx.linkedFixedExpensePaymentId);
    } else {
      payment = relatedPayments.find((row) => row.bankTransactionId === tx.id);
      if (payment) linkKind = "payment";
    }

    if (!linkKind || seen.has(tx.id)) continue;
    seen.add(tx.id);

    rows.push({
      bankTransactionId: tx.id,
      transactionAt: String(tx.transactionAt || ""),
      withdrawal: Number(tx.withdrawal) || 0,
      deposit: Number(tx.deposit) || 0,
      description: String(tx.description || tx.memo || "").trim(),
      counterpartyName: String(tx.counterpartyName || "").trim(),
      linkKind,
      paymentId: payment?.id,
      paymentDate: payment?.date,
      paymentAmount: payment ? Number(payment.amount) || 0 : undefined,
    });
  }

  const sorted = rows.sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt)));
  if (options.paymentId) {
    return sorted.filter((row) => row.paymentId === options.paymentId);
  }
  return sorted;
}
