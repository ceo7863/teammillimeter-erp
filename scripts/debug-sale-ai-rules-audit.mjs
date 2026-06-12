#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "/home/ubuntu/teammillimeter-erp/data/erp.sqlite";
const db = new DatabaseSync(dbPath, { readOnly: true });
const row = db.prepare("SELECT payload FROM erp_domain_state WHERE domain = 'auditLogs'").get();
const logs = row ? JSON.parse(String(row.payload)).auditLogs || [] : [];
const hits = logs.filter((entry) => {
  const text = JSON.stringify(entry);
  return text.includes("saleAiRules") || /AI\s*??/i.test(text) || String(entry.fieldLabel || "").includes("AI");
});
console.log(JSON.stringify({ total: hits.length, recent: hits.slice(-15) }, null, 2));
db.close();
