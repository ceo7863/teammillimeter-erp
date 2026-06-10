#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2];
const db = new DatabaseSync(dbPath, { readOnly: true });

function countFromPayload(data) {
  const txs = data.bankTransactions || [];
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

const row = db.prepare("SELECT payload, version, updated_at FROM erp_state WHERE id = 1").get();
const parsed = JSON.parse(String(row.payload));
const data = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
const blob = countFromPayload(data);

let domain = null;
try {
  const rows = db.prepare("SELECT domain, payload FROM erp_domain_state").all();
  const assembled = {};
  for (const r of rows) Object.assign(assembled, JSON.parse(String(r.payload)));
  domain = countFromPayload(assembled);
} catch {
  domain = null;
}

console.log(JSON.stringify({ file: dbPath, version: row.version, updatedAt: row.updated_at, blob, domain }, null, 2));
