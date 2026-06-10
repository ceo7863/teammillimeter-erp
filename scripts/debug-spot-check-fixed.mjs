#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const d = JSON.parse(new DatabaseSync(process.argv[2] || "data/erp.sqlite").prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const checks = [
  ["2026-04-01", "338580", "?????"],
  ["2026-04-10", "157850", "????"],
  ["2026-03-23", "30860", "???"],
  ["2026-02-25", "715000", "???"],
];
for (const [date, amount, hint] of checks) {
  const tx = (d.bankTransactions || []).find(
    (t) => String(t.transactionAt || "").startsWith(date) && Number(t.withdrawal) === Number(amount),
  );
  const pay = tx ? (d.fixedExpensePayments || []).find((p) => p.bankTransactionId === tx.id) : null;
  const fixed = pay ? (d.fixedExpenses || []).find((f) => f.id === pay.fixedExpenseId) : null;
  console.log(date, amount, {
    tx: tx?.description,
    fixed: fixed?.name,
    payMemo: pay?.memo?.slice(0, 40),
  });
}
