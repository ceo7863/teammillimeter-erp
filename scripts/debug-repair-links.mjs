#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
const fixed = d.fixedExpenses || [];

const rows = [];
for (const p of d.fixedExpensePayments || []) {
  if (p.createdBy !== "repair-backfill-fixed") continue;
  const tx = (d.bankTransactions || []).find(
    (t) => t.id === p.bankTransactionId || t.linkedFixedExpensePaymentId === p.id,
  );
  rows.push({
    date: p.date || tx?.transactionAt?.slice(0, 10),
    amount: p.amount || tx?.withdrawal,
    fixed: fixed.find((f) => f.id === p.fixedExpenseId)?.name,
    cp: tx?.counterpartyName || tx?.description,
  });
}
rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
console.log("repair-backfill-fixed count", rows.length);
console.log(JSON.stringify(rows, null, 2));
