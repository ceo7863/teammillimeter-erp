#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import {
  filterCompanyExpenses,
  filterFixedExpensePayments,
  isFixedExpensePaymentInActivePeriod,
} from "../src/utils/companyLedger.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const fixedExpenses = d.fixedExpenses || [];

function simulate(periodKey, label) {
  let startDate = "";
  let endDate = "";
  if (periodKey === "today") {
    startDate = endDate = "2026-05-31";
  } else if (periodKey === "thisMonth") {
    startDate = "2026-05-01";
    endDate = "2026-05-31";
  } else if (periodKey === "lastMonth") {
    startDate = "2026-04-01";
    endDate = "2026-04-30";
  }
  const exps = filterCompanyExpenses(d.companyExpenses || [], startDate, endDate);
  const pays = filterFixedExpensePayments(d.fixedExpensePayments || [], startDate, endDate).filter((row) => {
    const expense = fixedExpenses.find((item) => item.id === row.fixedExpenseId);
    return isFixedExpensePaymentInActivePeriod(row, expense);
  });
  console.log(label, "expenses", exps.length, "payments", pays.length, "total", exps.length + pays.length);
}

simulate("today", "today May31");
simulate("thisMonth", "thisMonth May");
simulate("lastMonth", "lastMonth Apr");
simulate("all", "all");
