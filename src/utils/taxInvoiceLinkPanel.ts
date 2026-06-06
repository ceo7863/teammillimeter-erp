import type { BankTransaction } from "./bankTransactions";
import {
  buildTaxInvoiceCancellationExcludedIds,
  filterTaxInvoicesByFlow,
  filterTaxInvoicesByPeriod,
  sortTaxInvoices,
  type TaxInvoice,
  type TaxInvoiceFlowType,
} from "./taxInvoices";

export type TaxInvoiceLinkedPaymentIndex = Map<string, { purchase: number; sales: number }>;

export type TaxInvoiceLinkCatalogRow = {
  invoice: TaxInvoice;
  unsettledAmount: number;
  linkedAmount: number;
  searchText: string;
};

export function buildTaxInvoiceLinkedPaymentIndex(transactions: BankTransaction[]): TaxInvoiceLinkedPaymentIndex {
  const index: TaxInvoiceLinkedPaymentIndex = new Map();
  for (const row of transactions) {
    const invoiceId = row.linkedTaxInvoiceId;
    if (!invoiceId) continue;
    let bucket = index.get(invoiceId);
    if (!bucket) {
      bucket = { purchase: 0, sales: 0 };
      index.set(invoiceId, bucket);
    }
    bucket.purchase += Math.max(0, Number(row.withdrawal || 0));
    bucket.sales += Math.max(0, Number(row.deposit || 0));
  }
  return index;
}

export function getTaxInvoiceLinkedPaymentSumFromIndex(
  index: TaxInvoiceLinkedPaymentIndex,
  invoice: TaxInvoice,
) {
  const bucket = index.get(invoice.id);
  if (!bucket) return 0;
  return invoice.flowType === "purchase" ? bucket.purchase : bucket.sales;
}

export function formatTaxInvoiceBusinessNo(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return String(value || "").trim();
}

export function getTaxInvoiceLinkedPaymentSum(transactions: BankTransaction[], invoice: TaxInvoice) {
  return getTaxInvoiceLinkedPaymentSumFromIndex(buildTaxInvoiceLinkedPaymentIndex(transactions), invoice);
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

function buildTaxInvoiceSearchText(invoice: TaxInvoice) {
  return [
    invoice.client,
    invoice.businessNo,
    invoice.invoiceNo || "",
    invoice.memo || "",
    invoice.issueDate,
    invoice.supplyAmount,
    invoice.vatAmount,
    invoice.totalAmount,
  ]
    .join(" ")
    .toLowerCase();
}

export function buildTaxInvoiceLinkCatalog(input: {
  invoices: TaxInvoice[];
  linkedPaymentIndex: TaxInvoiceLinkedPaymentIndex;
  excludedIds: Set<string>;
  flowFilter: TaxInvoiceFlowType;
  startDate: string;
  endDate: string;
}): TaxInvoiceLinkCatalogRow[] {
  let rows = input.invoices.filter((row) => row.status === "issued" && !input.excludedIds.has(row.id));
  rows = filterTaxInvoicesByFlow(rows, input.flowFilter);
  rows = filterTaxInvoicesByPeriod(rows, input.startDate, input.endDate);
  rows = sortTaxInvoices(rows);
  return rows.map((invoice) => {
    const linkedAmount = getTaxInvoiceLinkedPaymentSumFromIndex(input.linkedPaymentIndex, invoice);
    return {
      invoice,
      linkedAmount,
      unsettledAmount: Math.max(0, Number(invoice.totalAmount || 0) - linkedAmount),
      searchText: buildTaxInvoiceSearchText(invoice),
    };
  });
}

export function filterTaxInvoiceLinkCatalog(rows: TaxInvoiceLinkCatalogRow[], search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => row.searchText.includes(q));
}

/** @deprecated Use buildTaxInvoiceLinkCatalog + filterTaxInvoiceLinkCatalog */
export function filterTaxInvoicesForLinkPanel(input: {
  invoices: TaxInvoice[];
  linkedPaymentIndex: TaxInvoiceLinkedPaymentIndex;
  excludedIds?: Set<string>;
  flowFilter: TaxInvoiceFlowType;
  startDate: string;
  endDate: string;
  search: string;
}) {
  const excludedIds = input.excludedIds ?? buildTaxInvoiceCancellationExcludedIds(input.invoices);
  const catalog = buildTaxInvoiceLinkCatalog({
    invoices: input.invoices,
    linkedPaymentIndex: input.linkedPaymentIndex,
    excludedIds,
    flowFilter: input.flowFilter,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  return filterTaxInvoiceLinkCatalog(catalog, input.search);
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

export { buildTaxInvoiceCancellationExcludedIds };
