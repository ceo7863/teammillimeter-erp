#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { getMonthKey } from "../src/utils/companyLedger.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const fixedExpenses = (d.fixedExpenses || []).filter((r) => r.isActive !== false);
const payments = d.fixedExpensePayments || [];

function monthNames(mk) {
  return payments
    .filter((p) => getMonthKey(p.date) === mk)
    .map((p) => fixedExpenses.find((f) => f.id === p.fixedExpenseId)?.name)
    .filter(Boolean);
}

const april = "2026-04";
const may = "2026-05";

const aprilSet = new Set(monthNames(april));
const maySet = new Set(monthNames(may));

const inMayNotApril = [...maySet].filter((n) => !aprilSet.has(n)).sort();
const inAprilNotMay = [...aprilSet].filter((n) => !maySet.has(n)).sort();

console.log(JSON.stringify({
  activeFixedItems: fixedExpenses.length,
  aprilPaymentCount: aprilSet.size,
  mayPaymentCount: maySet.size,
  inMayNotApril,
  inAprilNotMay,
  aprilPayments: monthNames(april).sort(),
}, null, 2));
