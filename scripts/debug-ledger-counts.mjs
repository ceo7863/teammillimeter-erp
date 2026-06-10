#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

console.log("version", db.prepare("SELECT version FROM erp_state WHERE id=1").get().version);
console.log("companyExpenses", (d.companyExpenses || []).length);
console.log("fixedExpensePayments", (d.fixedExpensePayments || []).length);
console.log("fixedExpenses", (d.fixedExpenses || []).length);

const exps = d.companyExpenses || [];
const pays = d.fixedExpensePayments || [];

console.log("\nexpense sample dates", exps.slice(0, 5).map((e) => e.date));
console.log("payment sample dates", pays.slice(0, 5).map((p) => p.date));

const byMonthExp = {};
for (const e of exps) {
  const m = String(e.date || "").slice(0, 7);
  byMonthExp[m] = (byMonthExp[m] || 0) + 1;
}
const byMonthPay = {};
for (const p of pays) {
  const m = String(p.date || "").slice(0, 7);
  byMonthPay[m] = (byMonthPay[m] || 0) + 1;
}
console.log("\nexpenses by month", byMonthExp);
console.log("payments by month", byMonthPay);

const noStart = (d.fixedExpenses || []).filter((f) => !f.startDate);
console.log("\nfixed without startDate", noStart.length);
for (const f of noStart.slice(0, 10)) console.log(f.name, f.id);
