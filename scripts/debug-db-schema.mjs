#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

for (const p of process.argv.slice(2)) {
  const db = new DatabaseSync(p, { readOnly: true });
  let domains = [];
  try {
    domains = db.prepare("SELECT domain, length(payload) len FROM erp_domain_state ORDER BY domain").all();
  } catch {}
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const state = db.prepare("SELECT version, updated_at FROM erp_state WHERE id=1").get();
  let blobKeys = {};
  try {
    const row = db.prepare("SELECT payload FROM erp_state WHERE id=1").get();
    const data = JSON.parse(String(row.payload));
    const d = data.data || data;
    for (const k of ["workerMonthlyActualVouchers", "workerMonthlyPayments", "boards", "boardPosts", "clientContracts"]) {
      blobKeys[k] = Array.isArray(d[k]) ? d[k].length : 0;
    }
  } catch {}
  console.log(JSON.stringify({ file: p, version: state?.version, updatedAt: state?.updated_at, domains, tables: tables.map((t) => t.name), blobKeys }, null, 2));
  db.close();
}
