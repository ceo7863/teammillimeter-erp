#!/usr/bin/env node
/**
 * Query tax invoices for a client in a date range from erp_state payload.
 * Usage: node scripts/query-indiper-tax-invoices-may.mjs <sqlite-path> [clientName] [startDate] [endDate]
 */
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const clientQuery = String(process.argv[3] || "???").trim();
const rangeStart = String(process.argv[4] || "2026-05-01").slice(0, 10);
const rangeEnd = String(process.argv[5] || "2026-05-31").slice(0, 10);

const DOCUMENT_LABELS = { tax: "?????", bill: "???" };
const FLOW_LABELS = { sales: "??", purchase: "??" };

const db = new DatabaseSync(dbPath, { readOnly: true });
const row = db.prepare("SELECT payload, version, updated_at FROM erp_state WHERE id = 1").get();
if (!row?.payload) {
  console.error(JSON.stringify({ ok: false, error: "No erp_state payload found", dbPath }));
  process.exit(1);
}

const data = JSON.parse(String(row.payload));
const taxInvoices = Array.isArray(data.taxInvoices) ? data.taxInvoices : [];
const clients = Array.isArray(data.clients) ? data.clients : [];

const matchedClients = clients.filter((c) => String(c?.name || "").includes(clientQuery));
const clientNames = new Set(matchedClients.map((c) => String(c.name || "").trim()).filter(Boolean));
clientNames.add(clientQuery);

function clientMatches(name) {
  const value = String(name || "").trim();
  if (!value) return false;
  for (const key of clientNames) {
    if (value === key || value.includes(key) || key.includes(value)) return true;
  }
  return value.includes(clientQuery);
}

const rows = [];
for (const invoice of taxInvoices) {
  if (String(invoice?.status || "") !== "issued") continue;
  const issueDate = String(invoice?.issueDate || "").slice(0, 10);
  if (!issueDate || issueDate < rangeStart || issueDate > rangeEnd) continue;
  if (!clientMatches(invoice?.client)) continue;

  const documentType = invoice?.documentType === "bill" ? "bill" : "tax";
  const flowType = invoice?.flowType === "purchase" ? "purchase" : "sales";
  rows.push({
    id: String(invoice?.id || ""),
    issueDate,
    client: String(invoice?.client || "").trim(),
    documentType,
    documentTypeLabel: DOCUMENT_LABELS[documentType],
    flowType,
    flowTypeLabel: FLOW_LABELS[flowType],
    supplyAmount: Math.round(Number(invoice?.supplyAmount) || 0),
    vatAmount: Math.round(Number(invoice?.vatAmount) || 0),
    totalAmount: Math.round(Number(invoice?.totalAmount) || 0),
    invoiceNo: String(invoice?.invoiceNo || "").trim() || undefined,
  });
}

rows.sort((a, b) => a.issueDate.localeCompare(b.issueDate) || b.totalAmount - a.totalAmount);

const totals = rows.reduce(
  (acc, r) => {
    acc.count += 1;
    acc.supply += r.supplyAmount;
    acc.vat += r.vatAmount;
    acc.amount += r.totalAmount;
    return acc;
  },
  { count: 0, supply: 0, vat: 0, amount: 0 },
);

console.log(
  JSON.stringify(
    {
      ok: true,
      dbPath,
      dbVersion: row.version,
      dbUpdatedAt: row.updated_at,
      clientQuery,
      matchedClientNames: [...clientNames],
      period: { startDate: rangeStart, endDate: rangeEnd },
      issued: rows.length > 0,
      count: totals.count,
      totalSupply: totals.supply,
      totalVat: totals.vat,
      totalAmount: totals.amount,
      rows,
    },
    null,
    2,
  ),
);
