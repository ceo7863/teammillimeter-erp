#!/usr/bin/env node
/** Compare bank evidence/account fields across SQLite snapshots (uses domain rows when present). */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const dbPath = path.resolve(process.argv[2] || "data/erp.sqlite");

function emptyPayload() {
  return { bankTransactions: [], taxInvoices: [], accountCodes: [] };
}

function assembleFromDomainRows(db) {
  try {
    const rows = db.prepare("SELECT domain, payload FROM erp_domain_state").all();
    if (!rows.length) return null;
    const payload = emptyPayload();
    for (const row of rows) {
      try {
        Object.assign(payload, JSON.parse(String(row.payload)));
      } catch {
        // ignore
      }
    }
    return payload;
  } catch {
    return null;
  }
}

function loadPayload(db) {
  const fromDomains = assembleFromDomainRows(db);
  if (fromDomains) return fromDomains;
  const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
  if (!row) return emptyPayload();
  const parsed = JSON.parse(String(row.payload));
  return parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
}

function countLinks(txs) {
  let evidence = 0;
  let account = 0;
  for (const t of txs) {
    const ids = Array.isArray(t.linkedTaxInvoiceIds)
      ? t.linkedTaxInvoiceIds.filter(Boolean)
      : t.linkedTaxInvoiceId
        ? [String(t.linkedTaxInvoiceId)]
        : [];
    if (ids.length) evidence += 1;
    if (String(t.ledgerAccountCode || "").trim()) account += 1;
  }
  return { evidence, account, total: txs.length };
}

const db = new DatabaseSync(dbPath);
const version = db.prepare("SELECT version, updated_at FROM erp_state WHERE id = 1").get();
const data = loadPayload(db);
const stats = countLinks(data.bankTransactions || []);

console.log(
  JSON.stringify(
    {
      file: dbPath,
      version: version?.version ?? null,
      updatedAt: version?.updated_at ?? null,
      ...stats,
      taxInvoices: (data.taxInvoices || []).length,
      accountCodes: (data.accountCodes || []).length,
    },
    null,
    2,
  ),
);
