#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { getMonthKey } from "../src/utils/companyLedger.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
const fixed = (d.fixedExpenses || []).find((f) => f.name === "\uc608\uc2a4\ud3fc");
console.log("fixed id", fixed?.id);

for (const p of d.fixedExpensePayments || []) {
  if (p.fixedExpenseId !== fixed?.id) continue;
  console.log({
    date: p.date,
    month: getMonthKey(p.date),
    amt: p.amount,
    bankTx: p.bankTransactionId,
  });
}
