#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const txIds = ["c384afde-5f83-4d3c-8452-f142b96a43fa", "f020d261-0355-4aaf-9aeb-448c54110324"];

for (const id of txIds) {
  const tx = (d.bankTransactions || []).find((t) => t.id === id);
  console.log("\n=== TX", id, "===");
  console.log(JSON.stringify(tx, null, 2));
  const pay = (d.fixedExpensePayments || []).find((p) => p.id === tx?.linkedFixedExpensePaymentId || p.bankTransactionId === id);
  console.log("payment", pay);
  const exp = (d.companyExpenses || []).find((e) => e.id === tx?.linkedCompanyExpenseId || e.bankTransactionId === id);
  console.log("expense", exp);
}

const exps = (d.companyExpenses || []).filter((e) => JSON.stringify(e).includes("배종원") || e.bankTransactionId === "c384afde-5f83-4d3c-8452-f142b96a43fa");
console.log("\n=== company expenses 배종원 ===", exps.length);
for (const e of exps) console.log(JSON.stringify({ id: e.id, date: e.date, amount: e.amount, category: e.category, kind: e.kind, bankTx: e.bankTransactionId, desc: e.description }));

const pays = (d.fixedExpensePayments || []).filter((p) => {
  const tx = (d.bankTransactions || []).find((t) => t.linkedFixedExpensePaymentId === p.id || t.id === p.bankTransactionId);
  return tx && String(tx.counterpartyName || "").includes("배종원");
});
console.log("\n=== fixed payments linked to 배종원 tx ===", pays.length);
for (const p of pays) {
  const fe = (d.fixedExpenses || []).find((f) => f.id === p.fixedExpenseId);
  console.log(JSON.stringify({ id: p.id, date: p.date, amount: p.amount, fixed: fe?.name, bankTx: p.bankTransactionId }));
}

console.log("\nversion", db.prepare("SELECT version FROM erp_state WHERE id=1").get().version);
