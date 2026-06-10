#!/usr/bin/env node
/**
 * Remove duplicate tax invoices that share the same normalized invoiceNo key.
 * Keeps the row with bank links, else hyphenated invoiceNo, else newest createdAt.
 * Remaps bank transaction linkedTaxInvoiceId(s) from removed rows to the keeper.
 *
 * Usage: node --import tsx scripts/repair-tax-invoice-dedupe-invoice-no.mjs [--dry-run]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { normalizeTaxInvoiceNoKey } from "../src/utils/taxInvoices.ts";

const dryRun = process.argv.includes("--dry-run");

function getLinkedTaxInvoiceIds(tx) {
  if (Array.isArray(tx.linkedTaxInvoiceIds) && tx.linkedTaxInvoiceIds.length) {
    return [...new Set(tx.linkedTaxInvoiceIds.map((id) => String(id || "").trim()).filter(Boolean))];
  }
  if (tx.linkedTaxInvoiceId) return [String(tx.linkedTaxInvoiceId)];
  return [];
}

function syncLinkedTaxInvoiceFields(tx, ids) {
  const linkedTaxInvoiceIds = ids.length ? [...new Set(ids)] : undefined;
  return {
    ...tx,
    linkedTaxInvoiceIds,
    linkedTaxInvoiceId: linkedTaxInvoiceIds?.[0],
  };
}

function scoreKeeper(row, linkedIds) {
  let score = 0;
  if (linkedIds.has(row.id)) score += 1000;
  if (String(row.invoiceNo || "").includes("-")) score += 5;
  score += new Date(row.createdAt || 0).getTime() / 1_000_000_000_000;
  return score;
}

getDb();
const state = getErpState();
const { data, version } = state;

const linkedIds = new Set();
for (const tx of data.bankTransactions || []) {
  for (const id of getLinkedTaxInvoiceIds(tx)) linkedIds.add(id);
}

const groups = new Map();
for (const row of data.taxInvoices || []) {
  const key = normalizeTaxInvoiceNoKey(row.invoiceNo);
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const removeIds = new Set();
const remapToKeep = new Map();
const decisions = [];

for (const [key, rows] of groups) {
  if (rows.length < 2) continue;
  const sorted = [...rows].sort((a, b) => scoreKeeper(b, linkedIds) - scoreKeeper(a, linkedIds));
  const keep = sorted[0];
  for (const row of sorted.slice(1)) {
    removeIds.add(row.id);
    remapToKeep.set(row.id, keep.id);
    decisions.push({
      key,
      keep: { id: keep.id, invoiceNo: keep.invoiceNo, client: keep.client, issueDate: keep.issueDate },
      remove: { id: row.id, invoiceNo: row.invoiceNo, client: row.client, issueDate: row.issueDate },
    });
  }
}

let remappedBankTransactions = 0;
const bankTransactions = (data.bankTransactions || []).map((tx) => {
  const prevIds = getLinkedTaxInvoiceIds(tx);
  if (!prevIds.length) return tx;

  let changed = false;
  const nextIds = [];
  for (const id of prevIds) {
    const mapped = remapToKeep.get(id);
    if (mapped) {
      changed = true;
      if (!nextIds.includes(mapped)) nextIds.push(mapped);
      continue;
    }
    if (!nextIds.includes(id)) nextIds.push(id);
  }

  if (!changed) return tx;
  remappedBankTransactions += 1;
  return syncLinkedTaxInvoiceFields(tx, nextIds);
});

const taxInvoices = (data.taxInvoices || []).filter((row) => !removeIds.has(row.id));

console.log(
  JSON.stringify(
    {
      dryRun,
      duplicateGroups: decisions.length,
      removedCount: removeIds.size,
      remappedBankTransactions,
      removed: decisions,
    },
    null,
    2,
  ),
);

if (dryRun || !removeIds.size) process.exit(0);

saveErpState(
  {
    ...data,
    taxInvoices,
    bankTransactions,
  },
  version,
  "repair-tax-invoice-dedupe-invoice-no",
);
console.log(JSON.stringify({ ok: true, removedCount: removeIds.size, remappedBankTransactions }));
