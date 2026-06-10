#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const FIXED_ID = "376448c9-2d77-48e1-90f5-7661d5ee188c";

const pays = (d.fixedExpensePayments || []).filter((p) => p.fixedExpenseId === FIXED_ID);
console.log("법인신용카드 payments", pays.length);
for (const p of pays.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
  const tx = (d.bankTransactions || []).find(
    (t) => t.id === p.bankTransactionId || t.linkedFixedExpensePaymentId === p.id,
  );
  console.log({
    id: p.id,
    date: p.date,
    amount: p.amount,
    bankTx: p.bankTransactionId,
    txLinked: tx?.linkedFixedExpensePaymentId === p.id,
    createdBy: p.createdBy,
  });
}

const fixed = (d.fixedExpenses || []).find((f) => f.id === FIXED_ID);
console.log("\nfixed item", fixed);
