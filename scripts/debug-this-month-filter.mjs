#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { monthRangeISO, todayISO, filterCompanyExpenses, filterFixedExpensePayments, shouldDisplayFixedExpensePaymentInLedger } from "../src/utils/companyLedger.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

console.log("server todayISO()", todayISO());
const thisMonth = monthRangeISO(0);
const lastMonth = monthRangeISO(-1);
console.log("thisMonth range", thisMonth);
console.log("lastMonth range", lastMonth);

const fixedExpenses = d.fixedExpenses || [];
const bankTransactions = d.bankTransactions || [];

const exps = filterCompanyExpenses(d.companyExpenses || [], thisMonth.startDate, thisMonth.endDate);
const pays = filterFixedExpensePayments(d.fixedExpensePayments || [], thisMonth.startDate, thisMonth.endDate).filter((row) => {
  const expense = fixedExpenses.find((item) => item.id === row.fixedExpenseId);
  return shouldDisplayFixedExpensePaymentInLedger(row, expense, bankTransactions);
});

console.log("\nthisMonth filtered:", exps.length, "expenses,", pays.length, "payments,", exps.length + pays.length, "total");

const byDay = {};
for (const e of exps) {
  const m = String(e.date || "").slice(0, 7);
  byDay[m] = (byDay[m] || 0) + 1;
}
console.log("expense months in thisMonth filter", byDay);

const allMay = (d.companyExpenses || []).filter((e) => String(e.date).startsWith("2026-05"));
console.log("raw May 2026 expenses in DB", allMay.length);

console.log("\nversion", db.prepare("SELECT version FROM erp_state WHERE id=1").get().version);

const juneExp = (d.companyExpenses || []).filter((e) => String(e.date || "").startsWith("2026-06"));
const junePay = (d.fixedExpensePayments || []).filter((e) => String(e.date || "").startsWith("2026-06"));
console.log("\nJune 2026 raw:", juneExp.length, "expenses", junePay.length, "payments");

// simulate June thisMonth (KST user on June 1)
const juneRange = { startDate: "2026-06-01", endDate: "2026-06-30" };
const juneExps = filterCompanyExpenses(d.companyExpenses || [], juneRange.startDate, juneRange.endDate);
const junePays = filterFixedExpensePayments(d.fixedExpensePayments || [], juneRange.startDate, juneRange.endDate);
console.log("June filter total", juneExps.length + junePays.length);

