#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

for (const day of ["2026-05-31", "2026-05-30", "2026-05-01"]) {
  const c = (d.companyExpenses || []).filter((e) => e.date === day).length;
  const p = (d.fixedExpensePayments || []).filter((e) => e.date === day).length;
  console.log(day, "expenses", c, "payments", p);
}

function resolveKind(r) {
  return r.kind || "variable";
}
const apr = (d.companyExpenses || []).filter((e) => String(e.date).startsWith("2026-04"));
console.log(
  "Apr variable",
  apr.filter((e) => resolveKind(e) === "variable").length,
  "fixed expense rows",
  apr.filter((e) => resolveKind(e) === "fixed").length,
);
