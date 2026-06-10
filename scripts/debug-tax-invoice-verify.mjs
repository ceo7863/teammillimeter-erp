#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";
import { normalizeTaxInvoiceNoKey } from "../src/utils/taxInvoices.ts";

function getLinkedIds(tx) {
  if (Array.isArray(tx.linkedTaxInvoiceIds) && tx.linkedTaxInvoiceIds.length) {
    return tx.linkedTaxInvoiceIds.map(String);
  }
  if (tx.linkedTaxInvoiceId) return [String(tx.linkedTaxInvoiceId)];
  return [];
}

getDb();
const { data, version } = getErpState();
const invoices = data.taxInvoices || [];
const invoiceById = new Map(invoices.map((row) => [row.id, row]));
const txs = data.bankTransactions || [];

const brokenLinks = [];
for (const tx of txs) {
  for (const id of getLinkedIds(tx)) {
    if (!invoiceById.has(id)) {
      brokenLinks.push({
        txId: tx.id,
        transactionAt: tx.transactionAt,
        counterpartyName: tx.counterpartyName,
        missingInvoiceId: id,
      });
    }
  }
}

const duplicateKeys = new Map();
for (const row of invoices) {
  const key = normalizeTaxInvoiceNoKey(row.invoiceNo);
  if (!key) continue;
  if (!duplicateKeys.has(key)) duplicateKeys.set(key, []);
  duplicateKeys.get(key).push(row.id);
}
const invoiceNoDupes = [...duplicateKeys.entries()].filter(([, ids]) => ids.length > 1);

const multiLinkTxs = txs
  .map((tx) => ({ tx, ids: getLinkedIds(tx) }))
  .filter((row) => row.ids.length > 1)
  .slice(0, 5)
  .map((row) => ({
    txId: row.tx.id,
    transactionAt: row.tx.transactionAt,
    amount: Math.max(row.tx.deposit || 0, row.tx.withdrawal || 0),
    linkedCount: row.ids.length,
    invoices: row.ids.map((id) => {
      const inv = invoiceById.get(id);
      return inv
        ? { id, client: inv.client, issueDate: inv.issueDate, totalAmount: inv.totalAmount, invoiceNo: inv.invoiceNo }
        : { id, missing: true };
    }),
  }));

const splitInvoiceCounts = new Map();
for (const tx of txs) {
  for (const id of getLinkedIds(tx)) {
    splitInvoiceCounts.set(id, (splitInvoiceCounts.get(id) || 0) + 1);
  }
}
const multiTxInvoices = [...splitInvoiceCounts.entries()]
  .filter(([, count]) => count > 1)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .map(([id, count]) => {
    const inv = invoiceById.get(id);
    return {
      id,
      linkedTxCount: count,
      client: inv?.client,
      issueDate: inv?.issueDate,
      totalAmount: inv?.totalAmount,
      invoiceNo: inv?.invoiceNo,
    };
  });

const removedIdsToCheck = [
  "9bffea3a-d31a-481e-a178-5c03a66a70f7",
  "61d38bb5-5732-4be3-a301-bb5f098e61e6",
  "a715b895-b8bf-4fe5-aa85-9a8317977be2",
];
const remapCheck = removedIdsToCheck.map((oldId) => ({
  oldId,
  stillLinked: txs.some(
    (tx) => getLinkedIds(tx).includes(oldId),
  ),
}));

console.log(
  JSON.stringify(
    {
      dbVersion: version,
      totalInvoices: invoices.length,
      invoiceNoDuplicateGroups: invoiceNoDupes.length,
      brokenBankLinks: brokenLinks.length,
      brokenBankLinkSample: brokenLinks.slice(0, 10),
      remappedOldIdsStillLinked: remapCheck.filter((row) => row.stillLinked),
      linkedInvoiceIds: new Set(txs.flatMap(getLinkedIds)).size,
      multiInvoiceBankTxSample: multiLinkTxs,
      multiTxInvoiceSample: multiTxInvoices,
    },
    null,
    2,
  ),
);
