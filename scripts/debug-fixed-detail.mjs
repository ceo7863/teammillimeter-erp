#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const query = process.argv[3] || "";
const db = new DatabaseSync(dbPath);
const data = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

function linked(payment) {
  if (String(payment.bankTransactionId || "").trim()) return true;
  return (data.bankTransactions || []).some((tx) => tx.linkedFixedExpensePaymentId === payment.id);
}

const items = (data.fixedExpenses || []).filter((row) => {
  const hay = `${row.name} ${row.category}`;
  return !query || hay.includes(query);
});

for (const item of items) {
  console.log("\n===", item.name, item.id, item.category, item.amount, "===");
  for (const p of (data.fixedExpensePayments || []).filter((row) => row.fixedExpenseId === item.id)) {
    const tx = (data.bankTransactions || []).find(
      (row) => row.linkedFixedExpensePaymentId === p.id || row.id === p.bankTransactionId,
    );
    console.log({
      date: p.date,
      amount: p.amount,
      memo: p.memo,
      linked: linked(p),
      txDesc: tx ? [tx.counterpartyName, tx.description, tx.memo].filter(Boolean).join(" | ") : "",
    });
  }
  const rules = (data.bankLedgerRules || []).filter((r) => r.kind === "fixed" && r.fixedExpenseId === item.id);
  if (rules.length) console.log("rules:", rules.length);
}
