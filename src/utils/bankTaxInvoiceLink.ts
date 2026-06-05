import type { BankTransaction } from "./bankTransactions";
import { formatKRW } from "./companyLedger";
import type { TaxInvoice } from "./taxInvoices";
import { getTaxInvoiceKindLabel } from "./taxInvoices";

export function getBankTxClassifiedAmount(tx: BankTransaction) {
  return Math.max(Number(tx.deposit || 0), Number(tx.withdrawal || 0));
}

export function resolveBankTxClientName(tx: BankTransaction) {
  return String(tx.ledgerClientName || tx.linkedSubject || "").trim() || null;
}

export function formatTaxInvoiceEvidenceLabel(invoice: TaxInvoice) {
  const date = String(invoice.issueDate || "").slice(2).replace(/-/g, "-");
  const kind = getTaxInvoiceKindLabel(invoice).slice(0, 1);
  return `${kind} [${date}] ${invoice.client} ${formatKRW(invoice.totalAmount)}`;
}

export function scoreTaxInvoiceMatch(tx: BankTransaction, invoice: TaxInvoice) {
  if (invoice.status === "cancelled") return -1;
  const txAmount = getBankTxClassifiedAmount(tx);
  const amountDiff = Math.abs(txAmount - Number(invoice.totalAmount || 0));
  if (txAmount > 0 && amountDiff > Math.max(1000, txAmount * 0.02)) return 0;

  let score = 10;
  const txDate = String(tx.transactionAt || "").slice(0, 10);
  const invDate = String(invoice.issueDate || "").slice(0, 10);
  if (txDate && invDate) {
    const dayDiff = Math.abs(new Date(txDate).getTime() - new Date(invDate).getTime()) / 86400000;
    if (dayDiff <= 7) score += 40;
    else if (dayDiff <= 31) score += 20;
    else if (dayDiff <= 90) score += 8;
  }

  const client = resolveBankTxClientName(tx);
  const counterparty = String(tx.counterpartyName || "").trim();
  const invClient = String(invoice.client || "").trim();
  if (client && invClient && client === invClient) score += 35;
  else if (counterparty && invClient && (counterparty.includes(invClient) || invClient.includes(counterparty))) {
    score += 25;
  }

  if (tx.deposit > 0 && invoice.flowType === "sales") score += 15;
  if (tx.withdrawal > 0 && invoice.flowType === "purchase") score += 15;

  if (txAmount > 0 && amountDiff === 0) score += 30;
  else if (txAmount > 0 && amountDiff <= 100) score += 15;

  return score;
}

export function searchTaxInvoicesForBankTx(
  tx: BankTransaction,
  invoices: TaxInvoice[],
  query = "",
) {
  const q = query.trim().toLowerCase();
  return invoices
    .map((invoice) => ({ invoice, score: scoreTaxInvoiceMatch(tx, invoice) }))
    .filter((row) => row.score > 0)
    .filter((row) => {
      if (!q) return true;
      const hay = [
        row.invoice.client,
        row.invoice.invoiceNo,
        row.invoice.issueDate,
        String(row.invoice.totalAmount),
        getTaxInvoiceKindLabel(row.invoice),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => b.score - a.score || String(b.invoice.issueDate).localeCompare(String(a.invoice.issueDate)));
}
