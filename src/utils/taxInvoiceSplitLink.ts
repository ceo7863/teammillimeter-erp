import type { BankTransaction } from "./bankTransactions";
import {
  buildBankTxTaxInvoiceLinkPatch,
  getBankTxClassifiedAmount,
  getBankTxLinkedTaxInvoiceIds,
  hasTaxInvoicePartyMatch,
  normalizeBusinessRegistrationNo,
  type TaxInvoiceMatchContext,
} from "./bankTaxInvoiceLink";
import type { TaxInvoice } from "./taxInvoices";
import { getTaxInvoiceUnsettledAmount } from "./taxInvoiceLinkPanel";

export const TAX_INVOICE_SPLIT_DAY_WINDOW = 21;
export const TAX_INVOICE_SPLIT_MAX_PICK = 6;
export const TAX_INVOICE_SPLIT_AMOUNT_TOLERANCE = 0;

export type TaxInvoiceSplitClientLike = {
  id?: number | string;
  name?: string;
  businessNo?: string;
  depositNameAliases?: string;
  taxInvoiceSplitPayments?: boolean;
};

function normalizePartyKey(value: string) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/(\u3231|\(\uC8FC\)|\uC8FC\uC2DD\uD68C\uC0AC|\(\uC720\)|\uC720\uD55C|\uC720\uD55C\uD68C\uC0AC|co\.?ltd|corp|inc)/gi, "")
    .replace(/[\uFF08\uFF09()]/g, "")
    .toLowerCase();
}

export function resolveTaxInvoicePartyBusinessNo(invoice: TaxInvoice) {
  return normalizeBusinessRegistrationNo(invoice.businessNo);
}

export function isClientTaxInvoiceSplitEnabled(
  clients: TaxInvoiceSplitClientLike[],
  invoice: TaxInvoice,
) {
  const invBiz = resolveTaxInvoicePartyBusinessNo(invoice);
  const invName = normalizePartyKey(invoice.client);
  return clients.some((client) => {
    if (!client.taxInvoiceSplitPayments) return false;
    const clientBiz = normalizeBusinessRegistrationNo(client.businessNo);
    if (invBiz && clientBiz && invBiz === clientBiz) return true;
    const clientName = normalizePartyKey(client.name);
    return Boolean(invName && clientName && (invName.includes(clientName) || clientName.includes(invName)));
  });
}

export function getTaxInvoiceLinkedDepositSum(transactions: BankTransaction[], invoiceId: string) {
  return transactions
    .filter((row) => getBankTxLinkedTaxInvoiceIds(row).includes(invoiceId) && Number(row.deposit || 0) > 0)
    .reduce((sum, row) => sum + Number(row.deposit || 0), 0);
}

export function getTaxInvoiceRemainingAmount(
  invoice: TaxInvoice,
  transactions: BankTransaction[],
  allInvoices: TaxInvoice[] = [],
) {
  return getTaxInvoiceUnsettledAmount(invoice, transactions, allInvoices.length ? allInvoices : undefined);
}

function isWithinSplitWindow(tx: BankTransaction, invoice: TaxInvoice) {
  const txDate = String(tx.transactionAt || "").slice(0, 10);
  const invDate = String(invoice.issueDate || "").slice(0, 10);
  if (!txDate || !invDate) return true;
  const dayDiff = Math.abs(new Date(txDate).getTime() - new Date(invDate).getTime()) / 86400000;
  return dayDiff <= TAX_INVOICE_SPLIT_DAY_WINDOW;
}

export function collectSplitTaxInvoiceCandidates(
  transactions: BankTransaction[],
  invoice: TaxInvoice,
  context: TaxInvoiceMatchContext,
  options: { onlyTransactionIds?: Set<string> } = {},
) {
  return transactions.filter((tx) => {
    if (options.onlyTransactionIds && !options.onlyTransactionIds.has(tx.id)) return false;
    if (getBankTxLinkedTaxInvoiceIds(tx).length || tx.taxInvoiceAutoLinkDisabled) return false;
    if (Number(tx.deposit || 0) <= 0) return false;
    if (invoice.flowType === "sales" && !(tx.deposit > 0)) return false;
    if (invoice.flowType === "purchase" && !(tx.withdrawal > 0)) return false;
    if (!hasTaxInvoicePartyMatch(tx, invoice, context)) return false;
    if (!isWithinSplitWindow(tx, invoice)) return false;
    return true;
  });
}

export function findExactDepositSubset(
  txs: BankTransaction[],
  targetAmount: number,
  maxPick = TAX_INVOICE_SPLIT_MAX_PICK,
): BankTransaction[] | null {
  const target = Math.round(targetAmount);
  if (target <= 0) return [];
  const pool = txs
    .filter((row) => getBankTxClassifiedAmount(row) > 0)
    .sort((a, b) => getBankTxClassifiedAmount(b) - getBankTxClassifiedAmount(a))
    .slice(0, 12);
  if (!pool.length) return null;

  let best: BankTransaction[] | null = null;

  const search = (index: number, picked: BankTransaction[], sum: number) => {
    if (Math.abs(sum - target) <= TAX_INVOICE_SPLIT_AMOUNT_TOLERANCE) {
      if (!best || picked.length < best.length) best = [...picked];
      return;
    }
    if (index >= pool.length || picked.length >= maxPick || sum > target + TAX_INVOICE_SPLIT_AMOUNT_TOLERANCE) return;

    search(index + 1, picked, sum);
    const next = pool[index];
    const amount = getBankTxClassifiedAmount(next);
    search(index + 1, [...picked, next], sum + amount);
  };

  search(0, [], 0);
  return best;
}

export type TaxInvoiceSplitLinkPlan = {
  invoice: TaxInvoice;
  transactions: BankTransaction[];
  remainingAmount: number;
  score: number;
};

export function dedupeTaxInvoicesForSplitMatching(invoices: TaxInvoice[]) {
  const map = new Map<string, TaxInvoice>();
  for (const invoice of invoices) {
    if (invoice.status === "cancelled") continue;
    const key = [
      invoice.flowType,
      resolveTaxInvoicePartyBusinessNo(invoice) || normalizePartyKey(invoice.client),
      invoice.issueDate,
      invoice.totalAmount,
    ].join("|");
    if (!map.has(key)) map.set(key, invoice);
  }
  return [...map.values()];
}

export function findSplitTaxInvoiceLinkPlans(
  transactions: BankTransaction[],
  invoices: TaxInvoice[],
  context: TaxInvoiceMatchContext,
  clients: TaxInvoiceSplitClientLike[] = [],
  options: { onlyTransactionIds?: Set<string> } = {},
): TaxInvoiceSplitLinkPlan[] {
  const plans: TaxInvoiceSplitLinkPlan[] = [];
  const usedTxIds = new Set(
    transactions.filter((row) => getBankTxLinkedTaxInvoiceIds(row).length).map((row) => row.id),
  );

  for (const invoice of dedupeTaxInvoicesForSplitMatching(invoices)) {
    const remaining = getTaxInvoiceRemainingAmount(invoice, transactions, invoices);
    if (remaining <= 0) continue;

    const splitEnabled = isClientTaxInvoiceSplitEnabled(clients, invoice);
    const candidates = collectSplitTaxInvoiceCandidates(transactions, invoice, context, options).filter(
      (row) => !usedTxIds.has(row.id),
    );
    if (candidates.length < 2) continue;

    const subset = findExactDepositSubset(candidates, remaining);
    if (!subset || subset.length < 2) continue;

    const subsetSum = subset.reduce((sum, row) => sum + getBankTxClassifiedAmount(row), 0);
    if (Math.abs(subsetSum - remaining) > TAX_INVOICE_SPLIT_AMOUNT_TOLERANCE) continue;

    const score = 100 + subset.length * 5 + (splitEnabled ? 20 : 0);
    plans.push({ invoice, transactions: subset, remainingAmount: remaining, score });
  }

  plans.sort(
    (a, b) =>
      b.score - a.score ||
      String(b.invoice.issueDate).localeCompare(String(a.invoice.issueDate)) ||
      b.transactions.length - a.transactions.length,
  );
  return plans;
}

export function batchAutoLinkSplitTaxInvoiceEvidence(
  transactions: BankTransaction[],
  invoices: TaxInvoice[],
  context: TaxInvoiceMatchContext,
  clients: TaxInvoiceSplitClientLike[] = [],
  options: { onlyTransactionIds?: Set<string> } = {},
) {
  const plans = findSplitTaxInvoiceLinkPlans(transactions, invoices, context, clients, options);
  const txById = new Map(transactions.map((row) => [row.id, row]));
  const linkedTxIds = new Set<string>();
  let linkedCount = 0;
  let nextTransactions = transactions;
  let nextClients = clients;

  for (const plan of plans) {
    if (plan.transactions.some((row) => linkedTxIds.has(row.id))) continue;
    const remaining = getTaxInvoiceRemainingAmount(plan.invoice, nextTransactions, invoices);
    if (remaining <= 0) continue;
    const planSum = plan.transactions.reduce((sum, row) => sum + getBankTxClassifiedAmount(row), 0);
    if (Math.abs(planSum - remaining) > TAX_INVOICE_SPLIT_AMOUNT_TOLERANCE) continue;

    for (const tx of plan.transactions) {
      const current = txById.get(tx.id);
      if (!current || getBankTxLinkedTaxInvoiceIds(current).length) continue;
      const nextRow = buildBankTxTaxInvoiceLinkPatch(current, plan.invoice, { clients: context.clients });
      nextTransactions = nextTransactions.map((row) => (row.id === tx.id ? nextRow : row));
      txById.set(tx.id, nextRow);
      linkedTxIds.add(tx.id);
      linkedCount += 1;
    }

    nextClients = learnClientTaxInvoiceSplitPayments(nextClients, plan.invoice);
  }

  return { transactions: nextTransactions, linkedCount, clients: nextClients };
}

export function learnClientTaxInvoiceSplitPayments(
  clients: TaxInvoiceSplitClientLike[],
  invoice: TaxInvoice,
): TaxInvoiceSplitClientLike[] {
  const invBiz = resolveTaxInvoicePartyBusinessNo(invoice);
  const invName = normalizePartyKey(invoice.client);
  let changed = false;

  const next = clients.map((client) => {
    if (client.taxInvoiceSplitPayments) return client;
    const clientBiz = normalizeBusinessRegistrationNo(client.businessNo);
    const clientName = normalizePartyKey(client.name);
    const bizMatch = Boolean(invBiz && clientBiz && invBiz === clientBiz);
    const nameMatch = Boolean(
      invName && clientName && (invName.includes(clientName) || clientName.includes(invName)),
    );
    if (!bizMatch && !nameMatch) return client;
    changed = true;
    return { ...client, taxInvoiceSplitPayments: true };
  });

  return changed ? next : clients;
}

export function shouldLearnTaxInvoiceSplitPayment(
  tx: BankTransaction,
  invoice: TaxInvoice,
  transactions: BankTransaction[],
) {
  const txAmount = getBankTxClassifiedAmount(tx);
  const total = Number(invoice.totalAmount || 0);
  if (txAmount > 0 && txAmount < total - TAX_INVOICE_SPLIT_AMOUNT_TOLERANCE) return true;
  const otherLinked = transactions.some(
    (row) => row.id !== tx.id && getBankTxLinkedTaxInvoiceIds(row).includes(invoice.id),
  );
  return otherLinked;
}
