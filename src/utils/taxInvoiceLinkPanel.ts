import type { BankTransaction } from "./bankTransactions";
import {
  buildTaxInvoiceCancellationExcludedIds,
  filterTaxInvoices,
  filterTaxInvoicesByFlow,
  filterTaxInvoicesByPeriod,
  sortTaxInvoices,
  type TaxInvoice,
  type TaxInvoiceFlowType,
} from "./taxInvoices";

export function formatTaxInvoiceBusinessNo(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return String(value || "").trim();
}

export function getTaxInvoiceLinkedPaymentSum(transactions: BankTransaction[], invoice: TaxInvoice) {
  return transactions
    .filter((row) => row.linkedTaxInvoiceId === invoice.id)
    .reduce((sum, row) => {
      if (invoice.flowType === "purchase") {
        return sum + Math.max(0, Number(row.withdrawal || 0));
      }
      return sum + Math.max(0, Number(row.deposit || 0));
    }, 0);
}

export function getTaxInvoiceUnsettledAmount(invoice: TaxInvoice, transactions: BankTransaction[]) {
  const linked = getTaxInvoiceLinkedPaymentSum(transactions, invoice);
  return Math.max(0, Number(invoice.totalAmount || 0) - linked);
}

export function buildDefaultTaxInvoiceLinkDateRange(tx: BankTransaction) {
  const txDate = String(tx.transactionAt || "").slice(0, 10);
  if (!txDate) {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }
  const base = new Date(txDate);
  const start = new Date(base.getFullYear(), base.getMonth() - 2, 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 2, 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function resolveDefaultTaxInvoiceFlowFilter(tx: BankTransaction): TaxInvoiceFlowType {
  if (Number(tx.withdrawal || 0) > 0) return "purchase";
  if (Number(tx.deposit || 0) > 0) return "sales";
  return "sales";
}

export function filterTaxInvoicesForLinkPanel(input: {
  invoices: TaxInvoice[];
  transactions: BankTransaction[];
  flowFilter: TaxInvoiceFlowType;
  startDate: string;
  endDate: string;
  search: string;
}) {
  const excludedIds = buildTaxInvoiceCancellationExcludedIds(input.invoices);
  let rows = input.invoices.filter((row) => row.status === "issued" && !excludedIds.has(row.id));
  rows = filterTaxInvoicesByFlow(rows, input.flowFilter);
  rows = filterTaxInvoicesByPeriod(rows, input.startDate, input.endDate);
  rows = filterTaxInvoices(rows, input.search);
  rows = sortTaxInvoices(rows);
  return rows.map((invoice) => ({
    invoice,
    unsettledAmount: getTaxInvoiceUnsettledAmount(invoice, input.transactions),
    linkedAmount: getTaxInvoiceLinkedPaymentSum(input.transactions, invoice),
  }));
}

export function canLinkTaxInvoiceToTransaction(
  tx: BankTransaction,
  invoice: TaxInvoice,
  unsettledAmount: number,
) {
  if (unsettledAmount <= 0) return false;
  if (invoice.flowType === "purchase" && !(Number(tx.withdrawal || 0) > 0)) return false;
  if (invoice.flowType === "sales" && !(Number(tx.deposit || 0) > 0)) return false;
  return true;
}
