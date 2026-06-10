import fs from "fs";
import { DatabaseSync } from "node:sqlite";

const query = process.argv[2] || "";
let d;

if (process.argv[3] === "--sqlite") {
  const db = new DatabaseSync(process.argv[4] || "data/erp.sqlite");
  const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
  d = JSON.parse(row.payload);
} else {
  const path = process.argv[3] || "data/erp.json";
  d = JSON.parse(fs.readFileSync(path, "utf-8"));
}

const items = (d.fixedExpenses || []).filter((r) => String(r.name || "").includes(query));
const rules = (d.bankLedgerRules || []).filter((r) => {
  const fe = (d.fixedExpenses || []).find((x) => x.id === r.fixedExpenseId);
  return String(fe?.name || "").includes(query) || String(r.counterpartyName || "").includes(query);
});
const pays = (d.fixedExpensePayments || []).filter((r) => {
  const fe = (d.fixedExpenses || []).find((x) => x.id === r.fixedExpenseId);
  return String(fe?.name || "").includes(query) || String(r.memo || "").includes(query);
});
console.log("query:", query);
console.log("fixedExpenses:", JSON.stringify(items, null, 2));
console.log("payments:", pays.length);
console.log("bank rules:", JSON.stringify(rules, null, 2));
