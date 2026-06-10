#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { getMonthKey, isFixedActiveInMonth } from "../src/utils/companyLedger.ts";
import { isFixedExpenseDueInMonth, hasFixedPaymentForMonth } from "../src/utils/fixedExpenseAutomation.ts";

const monthKey = process.argv[3] || "2026-04";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const fixedExpenses = (d.fixedExpenses || []).filter((r) => r.isActive !== false);
const payments = d.fixedExpensePayments || [];

const missing = [];
for (const expense of fixedExpenses) {
  if (!isFixedActiveInMonth(expense, monthKey)) {
    missing.push({ name: expense.name, reason: "inactive_in_month", startDate: expense.startDate });
    continue;
  }
  if (!isFixedExpenseDueInMonth(expense, monthKey)) {
    missing.push({ name: expense.name, reason: "not_due", cycle: expense.cycle, startDate: expense.startDate });
    continue;
  }
  if (!hasFixedPaymentForMonth(payments, expense.id, monthKey)) {
    missing.push({ name: expense.name, reason: "no_payment", startDate: expense.startDate, amount: expense.amount });
  }
}

console.log(JSON.stringify({ monthKey, active: fixedExpenses.length, missing }, null, 2));
