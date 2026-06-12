#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const nameQuery = String(process.argv[3] || "").trim();
if (!nameQuery) {
  console.error("Usage: node scripts/query-person-bank-account.mjs <sqlite-path> <name>");
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
if (!row?.payload) {
  console.error("No erp_state payload found");
  process.exit(1);
}

const data = JSON.parse(String(row.payload));
const workers = Array.isArray(data.workers) ? data.workers : [];
const clients = Array.isArray(data.clients) ? data.clients : [];
const companyProfile = data.companyProfile && typeof data.companyProfile === "object" ? data.companyProfile : {};

function nameMatches(name) {
  return String(name || "").includes(nameQuery);
}

const results = [];

for (const worker of workers) {
  if (!nameMatches(worker.name)) continue;
  results.push({
    kind: "worker",
    id: worker.id,
    name: String(worker.name || ""),
    bank: String(worker.bank || "").trim(),
    account: String(worker.account || "").trim(),
    depositNameAliases: String(worker.depositNameAliases || "").trim(),
    isActive: worker.isActive !== false,
  });
}

for (const client of clients) {
  const fields = [
    client.name,
    client.manager,
    client.ceoName,
    client.taxInvoiceCorpName,
  ];
  if (!fields.some(nameMatches)) continue;
  results.push({
    kind: "client",
    id: client.id,
    name: String(client.name || ""),
    manager: String(client.manager || ""),
    ceoName: String(client.ceoName || ""),
    note: "clients have no bank/account fields in ERP payload",
  });
}

const profileHits = [];
for (const [key, value] of Object.entries(companyProfile)) {
  if (typeof value === "string" && value.includes(nameQuery)) {
    profileHits.push({ key, value });
  }
}

console.log(JSON.stringify({ query: nameQuery, results, profileHits }, null, 2));
