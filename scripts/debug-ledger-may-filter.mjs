#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const fixed = (d.fixedExpenses || []).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
console.log("fixed expenses startDate:");
for (const f of fixed) {
  console.log(f.startDate?.slice(0, 7), f.name, f.isActive);
}

// simulate May 2026 filter
const period = { startDate: "2026-05-01", endDate: "2026-05-31" };
const exps = (d.companyExpenses || []).filter((e) => {
  const date = String(e.date || "");
  return date >= period.startDate && date <= period.endDate;
});
console.log("\nMay companyExpenses", exps.length);

function getMonthKey(dateStr) {
  const match = /^(\d{4}-\d{2})/.exec(String(dateStr || "").trim());
  return match ? match[1] : "";
}
function isFixedActiveInMonth(expense, monthKey) {
  if (!expense.isActive) return false;
  if (!monthKey) return true;
  const startKey = getMonthKey(expense.startDate || "");
  if (startKey && startKey > monthKey) return false;
  return true;
}

const pays = (d.fixedExpensePayments || []).filter((p) => {
  const date = String(p.date || "");
  if (date < period.startDate || date > period.endDate) return false;
  const expense = fixed.find((f) => f.id === p.fixedExpenseId);
  if (!expense) return true;
  return isFixedActiveInMonth(expense, getMonthKey(p.date));
});
console.log("May filtered payments", pays.length);
console.log("May unfiltered payments", (d.fixedExpensePayments || []).filter((p) => String(p.date).startsWith("2026-05")).length);

// check future start dates blocking all
const mayKey = "2026-05";
const activeInMay = fixed.filter((f) => isFixedActiveInMonth(f, mayKey));
console.log("\nfixed active in May", activeInMay.length, "/", fixed.length);
