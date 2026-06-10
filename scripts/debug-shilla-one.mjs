#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const txId = process.argv[2] || "d110807d-53bf-4233-b5a7-21f3ac9e51c7";
const db = new DatabaseSync(process.argv[3] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const tx = (d.bankTransactions || []).find((t) => t.id === txId);
const expense = (d.companyExpenses || []).find((e) => e.bankTransactionId === txId);
const audits = (d.auditLogs || []).filter((a) => {
  const s = JSON.stringify(a);
  return s.includes(txId) || (tx && s.includes(String(tx.description || "")));
});
console.log(JSON.stringify({ tx, expense, audits: audits.slice(0, 20) }, null, 2));
