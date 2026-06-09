import type { BankTransaction } from "./bankTransactions";
import {
  findClientByDepositSubject,
  findWorkerByDepositSubject,
  findWorkerByMasterName,
  findWorkerForBankTransaction,
  type WorkerDepositMatchSource,
} from "./clientDepositAliases";
import { formatKRW } from "./companyLedger";
import type { TaxInvoice } from "./taxInvoices";
import { getTaxInvoiceKindLabel } from "./taxInvoices";

export type TaxInvoicePartyMaster = {
  name?: string;
  businessNo?: string;
  depositNameAliases?: string;
  manager?: string;
};

export type TaxInvoiceMatchContext = {
  clients?: TaxInvoicePartyMaster[];
  workers?: TaxInvoicePartyMaster[];
};

export function normalizeBusinessRegistrationNo(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(0, 10);
}

export function getBankTxClassifiedAmount(tx: BankTransaction) {
  return Math.max(Number(tx.deposit || 0), Number(tx.withdrawal || 0));
}

export function isBankTxClientHidden(tx: Pick<BankTransaction, "ledgerClientName">) {
  return tx.ledgerClientName === "";
}

export function resolveBankTxClientName(tx: BankTransaction) {
  if (isBankTxClientHidden(tx)) return null;
  return String(tx.ledgerClientName || tx.linkedSubject || "").trim() || null;
}

const PARTY_NAME_SUFFIX_PATTERN = /(\u3231|\(\uC8FC\)|\uC8FC\uC2DD\uD68C\uC0AC|\(\uC720\)|\uC720\uD55C|\uC720\uD55C\uD68C\uC0AC|co\.?ltd|corp|inc)/gi;

function normalizePartyName(value: string) {
  return value
    .replace(/\s+/g, "")
    .replace(PARTY_NAME_SUFFIX_PATTERN, "")
    .replace(/[\uFF08\uFF09()]/g, "")
    .toLowerCase();
}

function collectBankTxPartyNames(tx: BankTransaction) {
  return [
    resolveBankTxClientName(tx),
    tx.counterpartyName,
    tx.memo,
    tx.ledgerMemo,
    tx.description,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function collectBusinessNoFromText(value: string, bucket: Set<string>) {
  const text = String(value || "");
  if (!text) return;
  for (const match of text.matchAll(/\d{3}[-\s.]?\d{2}[-\s.]?\d{5}/g)) {
    const normalized = normalizeBusinessRegistrationNo(match[0]);
    if (normalized) bucket.add(normalized);
  }
}

function addMasterBusinessNo(value: string | undefined, bucket: Set<string>) {
  const normalized = normalizeBusinessRegistrationNo(String(value || ""));
  if (normalized) bucket.add(normalized);
}

export function collectBankTxPartyBusinessNumbers(
  tx: BankTransaction,
  context: TaxInvoiceMatchContext = {},
) {
  const numbers = new Set<string>();
  const clients = context.clients || [];
  const workers = (context.workers || []) as WorkerDepositMatchSource[];

  for (const subject of collectBankTxPartyNames(tx)) {
    addMasterBusinessNo(findClientByDepositSubject(clients, subject)?.businessNo, numbers);
    addMasterBusinessNo(findWorkerByDepositSubject(workers, subject)?.businessNo, numbers);
    addMasterBusinessNo(findWorkerByMasterName(workers, subject)?.businessNo, numbers);
    collectBusinessNoFromText(subject, numbers);
  }

  const matchedWorker = findWorkerForBankTransaction(tx, workers);
  addMasterBusinessNo(matchedWorker?.businessNo, numbers);

  for (const text of [tx.memo, tx.description, tx.ledgerMemo]) {
    collectBusinessNoFromText(String(text || ""), numbers);
  }

  return numbers;
}

export function hasTaxInvoiceNameMatch(tx: BankTransaction, invoice: TaxInvoice) {
  const invClient = String(invoice.client || "").trim();
  if (!invClient) return false;

  const txNames = collectBankTxPartyNames(tx);
  if (!txNames.length) return false;

  const normalizedInvoice = normalizePartyName(invClient);
  for (const txName of txNames) {
    if (txName === invClient) return true;
    const normalizedTx = normalizePartyName(txName);
    if (!normalizedTx || !normalizedInvoice) continue;
    if (normalizedTx === normalizedInvoice) return true;
    if (normalizedTx.includes(normalizedInvoice) || normalizedInvoice.includes(normalizedTx)) return true;
  }
  return false;
}

export function hasTaxInvoiceBusinessNoMatch(
  tx: BankTransaction,
  invoice: TaxInvoice,
  context: TaxInvoiceMatchContext = {},
) {
  const invBizNo = normalizeBusinessRegistrationNo(invoice.businessNo);
  if (!invBizNo) return false;
  return collectBankTxPartyBusinessNumbers(tx, context).has(invBizNo);
}

export function hasTaxInvoicePartyMatch(
  tx: BankTransaction,
  invoice: TaxInvoice,
  context: TaxInvoiceMatchContext = {},
) {
  const invBizNo = normalizeBusinessRegistrationNo(invoice.businessNo);
  const txBizNos = collectBankTxPartyBusinessNumbers(tx, context);

  if (invBizNo && txBizNos.size > 0) {
    return txBizNos.has(invBizNo);
  }

  return hasTaxInvoiceNameMatch(tx, invoice);
}

export function formatTaxInvoiceEvidenceLabel(invoice: TaxInvoice) {
  const date = String(invoice.issueDate || "").slice(2).replace(/-/g, "-");
  const kind = getTaxInvoiceKindLabel(invoice).slice(0, 1);
  return `${kind} [${date}] ${invoice.client} ${formatKRW(invoice.totalAmount)}`;
}

export function scoreTaxInvoiceMatch(
  tx: BankTransaction,
  invoice: TaxInvoice,
  context: TaxInvoiceMatchContext = {},
) {
  if (invoice.status === "cancelled") return -1;
  const txAmount = getBankTxClassifiedAmount(tx);
  const totalAmount = Number(invoice.totalAmount || 0);
  const supplyAmount = Number(invoice.supplyAmount || 0);
  const amountDiffTotal = Math.abs(txAmount - totalAmount);
  const amountDiffSupply = supplyAmount > 0 ? Math.abs(txAmount - supplyAmount) : amountDiffTotal;
  const amountTolerance = Math.max(1000, txAmount * 0.02);
  const matchesTotal = txAmount > 0 && amountDiffTotal <= amountTolerance;
  const matchesSupply = txAmount > 0 && supplyAmount > 0 && amountDiffSupply === 0;
  if (txAmount > 0 && !matchesTotal && !matchesSupply) return 0;

  const invBizNo = normalizeBusinessRegistrationNo(invoice.businessNo);
  const txBizNos = collectBankTxPartyBusinessNumbers(tx, context);
  const bizMatch = Boolean(invBizNo && txBizNos.has(invBizNo));
  const nameMatch = hasTaxInvoiceNameMatch(tx, invoice);
  const txNames = collectBankTxPartyNames(tx);

  if (invBizNo && txBizNos.size > 0 && !bizMatch) return 0;
  if ((txNames.length > 0 || invBizNo) && !nameMatch && !bizMatch) return 0;

  let score = 10;
  const txDate = String(tx.transactionAt || "").slice(0, 10);
  const invDate = String(invoice.issueDate || "").slice(0, 10);
  if (txDate && invDate) {
    const dayDiff = Math.abs(new Date(txDate).getTime() - new Date(invDate).getTime()) / 86400000;
    if (dayDiff <= 7) score += 40;
    else if (dayDiff <= 31) score += 20;
    else if (dayDiff <= 90) score += 8;
  }

  const invClient = String(invoice.client || "").trim();
  const client = resolveBankTxClientName(tx);
  const counterparty = String(tx.counterpartyName || "").trim();
  if (bizMatch) {
    score += 45;
  } else if (client && invClient && client === invClient) {
    score += 35;
  } else if (counterparty && invClient && (counterparty.includes(invClient) || invClient.includes(counterparty))) {
    score += 25;
  } else if (nameMatch) {
    score += 25;
  }

  if (tx.deposit > 0 && invoice.flowType === "sales") score += 15;
  if (tx.withdrawal > 0 && invoice.flowType === "purchase") score += 15;

  if (txAmount > 0 && amountDiffTotal === 0) score += 30;
  else if (txAmount > 0 && amountDiffTotal <= 100) score += 15;
  else if (matchesSupply) score += 22;

  return score;
}

export const AUTO_TAX_INVOICE_MATCH_MIN_SCORE = 55;

export function searchTaxInvoicesForBankTx(
  tx: BankTransaction,
  invoices: TaxInvoice[],
  query = "",
  context: TaxInvoiceMatchContext = {},
) {
  const q = query.trim().toLowerCase();
  return invoices
    .map((invoice) => ({ invoice, score: scoreTaxInvoiceMatch(tx, invoice, context) }))
    .filter((row) => row.score > 0)
    .filter((row) => {
      if (!q) return true;
      const hay = [
        row.invoice.client,
        row.invoice.businessNo,
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

export function pickAutoTaxInvoiceMatch(
  tx: BankTransaction,
  invoices: TaxInvoice[],
  usedInvoiceIds: Set<string> = new Set(),
  context: TaxInvoiceMatchContext = {},
) {
  const ranked = searchTaxInvoicesForBankTx(tx, invoices, "", context).filter(
    (row) =>
      !usedInvoiceIds.has(row.invoice.id) && hasTaxInvoicePartyMatch(tx, row.invoice, context),
  );
  const best = ranked[0];
  if (!best || best.score < AUTO_TAX_INVOICE_MATCH_MIN_SCORE) return null;
  return best;
}

export function getBankTxLinkedTaxInvoiceIds(tx: Pick<BankTransaction, "linkedTaxInvoiceId" | "linkedTaxInvoiceIds">) {
  if (Array.isArray(tx.linkedTaxInvoiceIds)) {
    const ids = tx.linkedTaxInvoiceIds.map((id) => String(id || "").trim()).filter(Boolean);
    if (ids.length) return [...new Set(ids)];
  }
  if (tx.linkedTaxInvoiceId) return [String(tx.linkedTaxInvoiceId)];
  return [];
}

export function bankTxHasLinkedTaxInvoice(
  tx: Pick<BankTransaction, "linkedTaxInvoiceId" | "linkedTaxInvoiceIds">,
  invoiceId?: string,
) {
  const ids = getBankTxLinkedTaxInvoiceIds(tx);
  if (!invoiceId) return ids.length > 0;
  return ids.includes(invoiceId);
}

function syncLinkedTaxInvoiceFields(
  tx: BankTransaction,
  linkedTaxInvoiceIds: string[] | undefined,
): BankTransaction {
  const ids = linkedTaxInvoiceIds?.length ? [...new Set(linkedTaxInvoiceIds)] : undefined;
  return {
    ...tx,
    linkedTaxInvoiceIds: ids,
    linkedTaxInvoiceId: ids?.[0],
  };
}

function resolveTaxInvoicesById(invoices: TaxInvoice[] | undefined, ids: string[]) {
  if (!invoices?.length || !ids.length) return [] as TaxInvoice[];
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  return ids.map((id) => byId.get(id)).filter((invoice): invoice is TaxInvoice => Boolean(invoice));
}

function applyInvoiceClientFields(
  tx: BankTransaction,
  invoice: TaxInvoice,
): BankTransaction {
  const clientName = String(invoice.client || "").trim();
  const existingSubject = String(tx.linkedSubject || tx.ledgerClientName || "").trim();
  const keepExistingClientLabel =
    tx.deposit > 0 &&
    Boolean(tx.linkedPaymentVoucherId) &&
    existingSubject &&
    clientName &&
    !hasTaxInvoiceNameMatch(
      { ...tx, linkedSubject: existingSubject, ledgerClientName: existingSubject },
      invoice,
    );
  const displayClientName = keepExistingClientLabel ? existingSubject : clientName || existingSubject;

  return {
    ...tx,
    ledgerClientName: displayClientName || tx.ledgerClientName,
    linkedSubject: tx.deposit > 0 && displayClientName ? displayClientName : tx.linkedSubject,
  };
}

function fieldMatchesRemovedInvoiceClient(
  tx: BankTransaction,
  fieldValue: string,
  removedInvoices: TaxInvoice[],
) {
  if (!fieldValue || !removedInvoices.length) return false;
  const probe = { ...tx, linkedSubject: fieldValue, ledgerClientName: fieldValue };
  return removedInvoices.some((invoice) => hasTaxInvoiceNameMatch(probe, invoice));
}

function shouldKeepClientLabelAfterUnlink(tx: BankTransaction, removedInvoices: TaxInvoice[]) {
  const existingSubject = String(tx.linkedSubject || tx.ledgerClientName || "").trim();
  if (!existingSubject || !removedInvoices.length) return false;
  return (
    tx.deposit > 0 &&
    Boolean(tx.linkedPaymentVoucherId) &&
    !fieldMatchesRemovedInvoiceClient(tx, existingSubject, removedInvoices)
  );
}

function clearInvoiceDerivedClientFields(
  tx: BankTransaction,
  removedInvoices: TaxInvoice[],
): BankTransaction {
  if (!removedInvoices.length || shouldKeepClientLabelAfterUnlink(tx, removedInvoices)) {
    return tx;
  }

  const ledgerClientName = String(tx.ledgerClientName ?? "").trim();
  const linkedSubject = String(tx.linkedSubject ?? "").trim();
  let next = tx;

  if (ledgerClientName && fieldMatchesRemovedInvoiceClient(tx, ledgerClientName, removedInvoices)) {
    next = { ...next, ledgerClientName: undefined };
  }
  if (tx.deposit > 0 && linkedSubject && fieldMatchesRemovedInvoiceClient(tx, linkedSubject, removedInvoices)) {
    next = { ...next, linkedSubject: undefined };
  }
  return next;
}

function revertInvoiceClientFieldsAfterUnlink(
  tx: BankTransaction,
  options: {
    removedInvoiceIds: string[];
    remainingInvoiceIds: string[];
    taxInvoices?: TaxInvoice[];
  },
): BankTransaction {
  const { removedInvoiceIds, remainingInvoiceIds, taxInvoices } = options;
  const removedInvoices = resolveTaxInvoicesById(taxInvoices, removedInvoiceIds);
  if (!removedInvoices.length) return tx;

  const remainingInvoices = resolveTaxInvoicesById(taxInvoices, remainingInvoiceIds);
  if (remainingInvoices.length > 0) {
    return applyInvoiceClientFields(tx, remainingInvoices[0]);
  }

  return clearInvoiceDerivedClientFields(tx, removedInvoices);
}

export type BankTxTaxInvoiceLinkOptions = {
  manual?: boolean;
  taxInvoices?: TaxInvoice[];
};

export function addBankTxTaxInvoiceLink(
  tx: BankTransaction,
  invoice: TaxInvoice,
  options: BankTxTaxInvoiceLinkOptions = {},
): BankTransaction {
  const ids = getBankTxLinkedTaxInvoiceIds(tx);
  const nextIds = ids.includes(invoice.id) ? ids : [...ids, invoice.id];
  let next = syncLinkedTaxInvoiceFields(
    {
      ...tx,
      taxInvoiceAutoLinkDisabled: options.manual ? true : tx.taxInvoiceAutoLinkDisabled,
    },
    nextIds,
  );
  if (!ids.length) {
    next = applyInvoiceClientFields(next, invoice);
  }
  return next;
}

export function removeBankTxTaxInvoiceLink(
  tx: BankTransaction,
  invoiceId: string,
  options: BankTxTaxInvoiceLinkOptions = {},
): BankTransaction {
  const prevIds = getBankTxLinkedTaxInvoiceIds(tx);
  const nextIds = prevIds.filter((id) => id !== invoiceId);
  let next = syncLinkedTaxInvoiceFields(
    {
      ...tx,
      taxInvoiceAutoLinkDisabled: options.manual ? true : tx.taxInvoiceAutoLinkDisabled,
    },
    nextIds.length ? nextIds : undefined,
  );
  next = revertInvoiceClientFieldsAfterUnlink(next, {
    removedInvoiceIds: [invoiceId],
    remainingInvoiceIds: nextIds,
    taxInvoices: options.taxInvoices,
  });
  return next;
}

export function clearBankTxTaxInvoiceLinks(
  tx: BankTransaction,
  options: BankTxTaxInvoiceLinkOptions = {},
): BankTransaction {
  const removedInvoiceIds = getBankTxLinkedTaxInvoiceIds(tx);
  let next = syncLinkedTaxInvoiceFields(
    {
      ...tx,
      taxInvoiceAutoLinkDisabled: options.manual ? true : tx.taxInvoiceAutoLinkDisabled,
    },
    undefined,
  );
  next = revertInvoiceClientFieldsAfterUnlink(next, {
    removedInvoiceIds,
    remainingInvoiceIds: [],
    taxInvoices: options.taxInvoices,
  });
  return next;
}

export function toggleBankTxTaxInvoiceLink(
  tx: BankTransaction,
  invoice: TaxInvoice | undefined,
  invoiceId?: string,
  options: BankTxTaxInvoiceLinkOptions = {},
): BankTransaction {
  if (!invoice && !invoiceId) {
    return clearBankTxTaxInvoiceLinks(tx, options);
  }
  const id = invoice?.id || invoiceId;
  if (!id) return clearBankTxTaxInvoiceLinks(tx, options);
  if (bankTxHasLinkedTaxInvoice(tx, id)) {
    return removeBankTxTaxInvoiceLink(tx, id, options);
  }
  if (!invoice) return tx;
  return addBankTxTaxInvoiceLink(tx, invoice, options);
}

export function collectUsedTaxInvoiceIds(transactions: BankTransaction[]) {
  const used = new Set<string>();
  for (const row of transactions) {
    for (const id of getBankTxLinkedTaxInvoiceIds(row)) {
      used.add(id);
    }
  }
  return used;
}

export function buildLinkedTaxInvoiceIdSet(transactions: BankTransaction[]) {
  return collectUsedTaxInvoiceIds(transactions);
}

export function batchAutoLinkTaxInvoiceEvidence(
  transactions: BankTransaction[],
  invoices: TaxInvoice[],
  options: { onlyTransactionIds?: Set<string>; context?: TaxInvoiceMatchContext } = {},
) {
  const context = options.context || {};
  const usedInvoiceIds = collectUsedTaxInvoiceIds(transactions);
  const txById = new Map(transactions.map((row) => [row.id, row]));
  const candidates: Array<{ txId: string; invoice: TaxInvoice; score: number }> = [];

  for (const tx of transactions) {
    if (options.onlyTransactionIds && !options.onlyTransactionIds.has(tx.id)) continue;
    if (bankTxHasLinkedTaxInvoice(tx) || tx.taxInvoiceAutoLinkDisabled) continue;
    for (const row of searchTaxInvoicesForBankTx(tx, invoices, "", context)) {
      if (row.score < AUTO_TAX_INVOICE_MATCH_MIN_SCORE) break;
      if (!hasTaxInvoicePartyMatch(tx, row.invoice, context)) continue;
      if (usedInvoiceIds.has(row.invoice.id)) continue;
      candidates.push({ txId: tx.id, invoice: row.invoice, score: row.score });
    }
  }

  candidates.sort((a, b) => b.score - a.score || String(b.invoice.issueDate).localeCompare(String(a.invoice.issueDate)));

  const linkedTxIds = new Set<string>();
  let linkedCount = 0;
  let nextTransactions = transactions;

  for (const candidate of candidates) {
    if (linkedTxIds.has(candidate.txId)) continue;
    if (usedInvoiceIds.has(candidate.invoice.id)) continue;
    const tx = txById.get(candidate.txId);
    if (!tx || bankTxHasLinkedTaxInvoice(tx)) continue;

    const nextRow = buildBankTxTaxInvoiceLinkPatch(tx, candidate.invoice);
    nextTransactions = nextTransactions.map((row) => (row.id === tx.id ? nextRow : row));
    txById.set(tx.id, nextRow);
    linkedTxIds.add(candidate.txId);
    usedInvoiceIds.add(candidate.invoice.id);
    linkedCount += 1;
  }

  return { transactions: nextTransactions, linkedCount };
}

export function buildBankTxTaxInvoiceLinkPatch(
  tx: BankTransaction,
  invoice: TaxInvoice | undefined,
  options: BankTxTaxInvoiceLinkOptions = {},
): BankTransaction {
  if (!invoice) {
    return clearBankTxTaxInvoiceLinks(tx, options);
  }
  return addBankTxTaxInvoiceLink(tx, invoice, options);
}
