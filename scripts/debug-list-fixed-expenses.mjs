#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const data = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

function linked(payment) {
  if (String(payment.bankTransactionId || "").trim()) return true;
  return (data.bankTransactions || []).some((tx) => tx.linkedFixedExpensePaymentId === payment.id);
}

for (const item of data.fixedExpenses || []) {
  const pays = (data.fixedExpensePayments || []).filter((p) => p.fixedExpenseId === item.id);
  console.log(
    JSON.stringify({
      id: item.id.slice(0, 8),
      name: item.name,
      category: item.category,
      amount: item.amount,
      active: item.isActive,
      payments: pays.length,
      linked: pays.filter(linked).length,
    }),
  );
}
