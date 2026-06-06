#!/usr/bin/env node
/**
 * Remove duplicate tax invoices that share the same normalized invoiceNo key.
 * Keeps the row with bank links, else Barobill-style invoiceNo, else newest createdAt.
 *
 * Usage: node --import tsx scripts/repair-tax-invoice-dedupe-invoice-no.mjs [--dry-run]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { normalizeTaxInvoiceNoKey } from "../src/utils/taxInvoices.ts";

const dryRun = process.argv.includes("--dry-run");

function scoreKeeper(row, linkedIds) {
  let score = 0;
  if (linkedIds.has(row.id)) score += 1000;
  if (String(row.invoiceNo || "").includes("-")) score -= 10;
  score += new Date(row.createdAt || 0).getTime() / 1_000_000_000_000;
  return score;
}

getDb();
const state = getErpState();
const { data, version } = state;

const linkedIds = new Set(
  (data.bankTransactions || []).map((row) => row.linkedTaxInvoiceId).filter(Boolean),
);

const groups = new Map();
for (const row of data.taxInvoices || []) {
  const key = normalizeTaxInvoiceNoKey(row.invoiceNo);
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const removeIds = new Set();
const decisions = [];

for (const [key, rows] of groups) {
  if (rows.length < 2) continue;
  const sorted = [...rows].sort((a, b) => scoreKeeper(b, linkedIds) - scoreKeeper(a, linkedIds));
  const keep = sorted[0];
  for (const row of sorted.slice(1)) {
    removeIds.add(row.id);
    decisions.push({
      key,
      keep: { id: keep.id, invoiceNo: keep.invoiceNo, client: keep.client, issueDate: keep.issueDate },
      remove: { id: row.id, invoiceNo: row.invoiceNo, client: row.client, issueDate: row.issueDate },
    });
  }
}

console.log(JSON.stringify({ dryRun, duplicateGroups: decisions.length, removed: decisions }, null, 2));

if (dryRun || !removeIds.size) process.exit(0);

const taxInvoices = (data.taxInvoices || []).filter((row) => !removeIds.has(row.id));
saveErpState({ ...data, taxInvoices }, version, "repair-tax-invoice-dedupe-invoice-no");
console.log(JSON.stringify({ ok: true, removedCount: removeIds.size }));
