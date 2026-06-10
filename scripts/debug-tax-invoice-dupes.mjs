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

function scoreKeeper(row, linkedIds) {
  let score = 0;
  if (linkedIds.has(row.id)) score += 1000;
  if (String(row.invoiceNo || "").includes("-")) score += 5;
  score += new Date(row.createdAt || 0).getTime() / 1_000_000_000_000;
  return score;
}

getDb();
const { data } = getErpState();
const invoices = data.taxInvoices || [];

const groups = new Map();
for (const row of invoices) {
  const key = normalizeTaxInvoiceNoKey(row.invoiceNo);
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const dupGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
let extraRows = 0;
for (const [, rows] of dupGroups) extraRows += rows.length - 1;

const noInvoiceNo = invoices.filter((row) => !normalizeTaxInvoiceNoKey(row.invoiceNo)).length;

const linkedIds = new Set();
for (const tx of data.bankTransactions || []) {
  for (const id of getLinkedIds(tx)) linkedIds.add(id);
}

const removeIds = new Set();
const wouldRemoveLinked = [];
for (const [key, rows] of dupGroups) {
  const sorted = [...rows].sort((a, b) => scoreKeeper(b, linkedIds) - scoreKeeper(a, linkedIds));
  const keep = sorted[0];
  for (const row of sorted.slice(1)) {
    removeIds.add(row.id);
    if (linkedIds.has(row.id)) {
      wouldRemoveLinked.push({
        key,
        keepId: keep.id,
        removeId: row.id,
        client: row.client,
        issueDate: row.issueDate,
        invoiceNo: row.invoiceNo,
      });
    }
  }
}

const contentDupes = new Map();
for (const row of invoices) {
  if (row.status === "cancelled") continue;
  const key = [
    row.flowType,
    String(row.issueDate || "").slice(0, 10),
    String(row.client || "").trim(),
    row.totalAmount,
    row.supplyAmount,
  ].join("|");
  if (!contentDupes.has(key)) contentDupes.set(key, []);
  contentDupes.get(key).push(row);
}
const contentDupGroups = [...contentDupes.values()].filter((rows) => rows.length > 1);
const contentDupDetails = contentDupGroups.map((rows) => ({
  client: rows[0].client,
  issueDate: rows[0].issueDate,
  totalAmount: rows[0].totalAmount,
  flowType: rows[0].flowType,
  count: rows.length,
  invoiceNos: rows.map((row) => row.invoiceNo),
  ids: rows.map((row) => row.id),
}));

console.log(
  JSON.stringify(
    {
      totalInvoices: invoices.length,
      duplicateGroupsByInvoiceNo: dupGroups.length,
      duplicateExtraRows: extraRows,
      wouldRemoveCount: removeIds.size,
      noInvoiceNo,
      bankLinkedInvoiceIds: linkedIds.size,
      wouldRemoveLinkedCount: wouldRemoveLinked.length,
      wouldRemoveLinked,
      contentDuplicateGroups: contentDupDetails.length,
      contentDuplicateDetails: contentDupDetails,
      sampleDuplicateGroups: dupGroups.slice(0, 5).map(([key, rows]) => ({
        key,
        count: rows.length,
        rows: rows.map((row) => ({
          id: row.id,
          invoiceNo: row.invoiceNo,
          client: row.client,
          issueDate: row.issueDate,
          totalAmount: row.totalAmount,
          linked: linkedIds.has(row.id),
          createdAt: row.createdAt,
        })),
      })),
    },
    null,
    2,
  ),
);
