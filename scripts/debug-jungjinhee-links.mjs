#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
const ECOUNT = "8dcaf0af-0fc4-4836-85b8-edc7e614a2e2";

console.log("=== all txs linked to eCount payments ===");
for (const p of d.fixedExpensePayments || []) {
  if (p.fixedExpenseId !== ECOUNT) continue;
  const tx = (d.bankTransactions || []).find((t) => t.id === p.bankTransactionId || t.linkedFixedExpensePaymentId === p.id);
  console.log({ payDate: p.date, payAmt: p.amount, memo: p.memo, txDate: tx?.transactionAt?.slice(0, 10), txCp: tx?.counterpartyName, txAmt: tx?.withdrawal, txId: tx?.id });
}

console.log("\n=== May 27 2026 all withdrawals ===");
for (const t of d.bankTransactions || []) {
  if (!String(t.transactionAt || "").startsWith("2026-05-27")) continue;
  if (!(Number(t.withdrawal) > 0)) continue;
  const pay = (d.fixedExpensePayments || []).find((p) => p.id === t.linkedFixedExpensePaymentId);
  const fixed = (d.fixedExpenses || []).find((f) => f.id === pay?.fixedExpenseId);
  console.log({ cp: t.counterpartyName, amt: t.withdrawal, linked: fixed?.name || "-", id: t.id });
}

console.log("\n=== fixed expenses containing count/ecount ===");
for (const f of d.fixedExpenses || []) {
  const n = String(f.name || "").toLowerCase();
  if (n.includes("count") || n.includes("\uC774\uCE74") || n.includes("\uC6D4\uC218")) {
    console.log({ id: f.id, name: f.name, amount: f.amount, active: f.isActive });
  }
}
