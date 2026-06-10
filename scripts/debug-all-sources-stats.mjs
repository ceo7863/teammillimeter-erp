#!/usr/bin/env node
/**
 * Compare ERP record counts across sqlite DBs and erp-state-export.json.
 * Usage: node scripts/debug-all-sources-stats.mjs [path...]
 */
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const KEYS = [
  "sales",
  "paymentVouchers",
  "paymentInputLogs",
  "saleComments",
  "taxInvoices",
  "bankTransactions",
  "statementFolders",
  "clients",
  "workers",
  "companyExpenses",
  "fixedExpenses",
  "pdfArchives",
];

function loadFromSqlite(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  let data = null;
  try {
    const rows = db.prepare("SELECT domain, payload FROM erp_domain_state").all();
    if (rows.length) {
      data = {};
      for (const row of rows) Object.assign(data, JSON.parse(String(row.payload)));
    }
  } catch {}
  if (!data) {
    const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
    if (!row) {
      db.close();
      return null;
    }
    const parsed = JSON.parse(String(row.payload));
    data = parsed.data || parsed;
  }
  const version = db.prepare("SELECT version, updated_at FROM erp_state WHERE id = 1").get();
  db.close();
  return { data, version, type: "sqlite" };
}

function loadFromJson(jsonPath) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const data = raw.data || raw;
  return {
    data,
    version: { version: raw.version, updated_at: raw.exportedAt || raw.updatedAt },
    type: "json",
  };
}

function stats(data) {
  const out = {};
  for (const key of KEYS) {
    const rows = data[key];
    out[key] = Array.isArray(rows) ? rows.length : rows ? 1 : 0;
  }
  if (Array.isArray(data.paymentVouchers)) {
    out.vouchersWithBank = data.paymentVouchers.filter((v) => String(v.bankTransactionId ?? "").trim()).length;
  }
  if (Array.isArray(data.bankTransactions)) {
    let ev = 0;
    let ac = 0;
    for (const tx of data.bankTransactions) {
      if ((tx.linkedTaxInvoiceIds || []).length || tx.linkedTaxInvoiceId) ev += 1;
      if (tx.ledgerAccountCode) ac += 1;
    }
    out.bankEvidence = ev;
    out.bankAccount = ac;
  }
  return out;
}

function missingIds(currentRows, otherRows) {
  const cur = new Set((currentRows || []).map((r) => String(r.id)));
  return (otherRows || []).filter((r) => r.id != null && !cur.has(String(r.id))).length;
}

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error("Usage: node scripts/debug-all-sources-stats.mjs <current> <source2> [source3...]");
  process.exit(1);
}

const loaded = files.map((file) => {
  const abs = path.resolve(file);
  const payload = abs.endsWith(".json") ? loadFromJson(abs) : loadFromSqlite(abs);
  if (!payload) throw new Error(`Could not load ${abs}`);
  return { file: path.basename(abs), abs, ...payload, counts: stats(payload.data) };
});

const current = loaded[0];
const report = {
  current: {
    file: current.file,
    version: current.version?.version,
    updatedAt: current.version?.updated_at,
    counts: current.counts,
  },
  sources: loaded.slice(1).map((src) => ({
    file: src.file,
    type: src.type,
    version: src.version?.version,
    updatedAt: src.version?.updated_at,
    counts: src.counts,
    missingFromCurrent: Object.fromEntries(
      KEYS.map((key) => [key, missingIds(current.data[key], src.data[key])]),
    ),
    onlyInCurrent: Object.fromEntries(
      KEYS.map((key) => [key, missingIds(src.data[key], current.data[key])]),
    ),
  })),
};

console.log(JSON.stringify(report, null, 2));
