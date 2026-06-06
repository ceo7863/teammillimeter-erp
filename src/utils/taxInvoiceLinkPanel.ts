import type { BankTransaction } from "./bankTransactions";
import { formatKRW } from "./companyLedger";
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
  supplyLabel: string;
  vatLabel: string;
  totalLabel: string;
  unsettledLabel: string;
  supplierBizLabel: string;
  supplierName: string;
  recipientBizLabel: string;
  recipientName: string;
};

export const EMPTY_TAX_INVOICE_LINKED_INDEX: TaxInvoiceLinkedPaymentIndex = new Map();
export const EMPTY_TAX_INVOICE_EXCLUDED_IDS = new Set<string>();

let excludedIdsCache: { source: TaxInvoice[]; ids: Set<string> } | null = null;
let linkedIndexCache: { source: BankTransaction[]; index: TaxInvoiceLinkedPaymentIndex } | null = null;

export function getTaxInvoiceCancellationExcludedIdsCached(invoices: TaxInvoice[]) {
  if (excludedIdsCache?.source === invoices) return excludedIdsCache.ids;
  const ids = buildTaxInvoiceCancellationExcludedIds(invoices);
  excludedIdsCache = { source: invoices, ids };
  return ids;
}

export function getTaxInvoiceLinkedPaymentIndexCached(transactions: BankTransaction[]) {
  if (linkedIndexCache?.source === transactions) return linkedIndexCache.index;
  const index = buildTaxInvoiceLinkedPaymentIndex(transactions);
  linkedIndexCache = { source: transactions, index };
  return index;
}

export function invalidateTaxInvoiceLinkPanelCaches() {
  excludedIdsCache = null;
  linkedIndexCache = null;
}

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
  return getTaxInvoiceLinkedPaymentSumFromIndex(getTaxInvoiceLinkedPaymentIndexCached(transactions), invoice);
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

function buildCatalogDisplayRow(
  invoice: TaxInvoice,
  unsettledAmount: number,
  linkedAmount: number,
  ourCompanyName: string,
  ourBusinessNo: string,
): TaxInvoiceLinkCatalogRow {
  const supplierName = invoice.flowType === "purchase" ? invoice.client : ourCompanyName;
  const supplierBiz = invoice.flowType === "purchase" ? invoice.businessNo : ourBusinessNo;
  const recipientName = invoice.flowType === "purchase" ? ourCompanyName : invoice.client;
  const recipientBiz = invoice.flowType === "purchase" ? ourBusinessNo : invoice.businessNo;
  return {
    invoice,
    linkedAmount,
    unsettledAmount,
    searchText: buildTaxInvoiceSearchText(invoice),
    supplyLabel: formatKRW(invoice.supplyAmount),
    vatLabel: formatKRW(invoice.vatAmount),
    totalLabel: formatKRW(invoice.totalAmount),
    unsettledLabel: formatKRW(unsettledAmount),
    supplierBizLabel: formatTaxInvoiceBusinessNo(supplierBiz) || "-",
    supplierName: supplierName || "-",
    recipientBizLabel: formatTaxInvoiceBusinessNo(recipientBiz) || "-",
    recipientName: recipientName || "-",
  };
}

export function buildTaxInvoiceLinkCatalog(input: {
  invoices: TaxInvoice[];
  linkedPaymentIndex: TaxInvoiceLinkedPaymentIndex;
  excludedIds: Set<string>;
  flowFilter: TaxInvoiceFlowType;
  startDate: string;
  endDate: string;
  ourCompanyName: string;
  ourBusinessNo: string;
}): TaxInvoiceLinkCatalogRow[] {
  let rows = input.invoices.filter((row) => row.status === "issued" && !input.excludedIds.has(row.id));
  rows = filterTaxInvoicesByFlow(rows, input.flowFilter);
  rows = filterTaxInvoicesByPeriod(rows, input.startDate, input.endDate);
  rows = sortTaxInvoices(rows);
  return rows.map((invoice) => {
    const linkedAmount = getTaxInvoiceLinkedPaymentSumFromIndex(input.linkedPaymentIndex, invoice);
    const unsettledAmount = Math.max(0, Number(invoice.totalAmount || 0) - linkedAmount);
    return buildCatalogDisplayRow(
      invoice,
      unsettledAmount,
      linkedAmount,
      input.ourCompanyName,
      input.ourBusinessNo,
    );
  });
}

export function filterTaxInvoiceLinkCatalog(rows: TaxInvoiceLinkCatalogRow[], search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (!tokens.length) return rows;
  return rows.filter((row) => tokens.every((token) => row.searchText.includes(token)));
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
