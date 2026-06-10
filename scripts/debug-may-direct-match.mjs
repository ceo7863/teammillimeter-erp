#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
const pays = d.fixedExpensePayments || [];
const fixed = d.fixedExpenses || [];

const may = [];
for (const t of d.bankTransactions || []) {
  if (!String(t.transactionAt || "").startsWith("2026-05")) continue;
  if (!t.linkedFixedExpensePaymentId || !(Number(t.withdrawal) > 0)) continue;
  const p = pays.find((x) => x.id === t.linkedFixedExpensePaymentId);
  if (!p) continue;
  may.push({
    cp: String(t.counterpartyName || "").trim(),
    amt: Number(t.withdrawal),
    fid: p.fixedExpenseId,
    name: fixed.find((f) => f.id === p.fixedExpenseId)?.name,
  });
}

const map = new Map(may.map((m) => [`${m.cp}|${m.amt}`, m]));
const samples = [];
let direct = 0;

for (const t of d.bankTransactions || []) {
  if (t.linkedFixedExpensePaymentId || !(Number(t.withdrawal) > 0)) continue;
  const cp = String(t.counterpartyName || "").trim();
  const m = map.get(`${cp}|${Number(t.withdrawal)}`);
  if (!m) continue;
  direct++;
  if (samples.length < 50) {
    samples.push({
      date: String(t.transactionAt || "").slice(0, 10),
      cp,
      amt: t.withdrawal,
      fixed: m.name,
      hasVar: Boolean(t.linkedCompanyExpenseId),
    });
  }
}

console.log("may map keys", map.size, "direct match unlinked", direct);
console.log(JSON.stringify(samples, null, 2));
