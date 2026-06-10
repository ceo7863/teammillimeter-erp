#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const amount = Number(process.argv[3] || 2546787);
const datePrefix = process.argv[4] || "2026-04-10";

const txs = (d.bankTransactions || []).filter((t) => {
  const at = String(t.transactionAt || t.date || "");
  const w = Number(t.withdrawal || 0);
  return at.startsWith(datePrefix) && w === amount;
});

console.log("matching txs by date+amount:", txs.length);
for (const tx of txs) {
  console.log("\n=== TX", tx.id, "===");
  console.log(JSON.stringify(tx, null, 2));
  const pay = (d.fixedExpensePayments || []).find(
    (p) => p.id === tx.linkedFixedExpensePaymentId || p.bankTransactionId === tx.id
  );
  const exp = (d.companyExpenses || []).find(
    (e) => e.id === tx.linkedCompanyExpenseId || e.bankTransactionId === tx.id
  );
  console.log("payment", pay);
  if (pay) {
    const fe = (d.fixedExpenses || []).find((f) => f.id === pay.fixedExpenseId);
    console.log("fixedExpense", fe?.name, fe?.id);
  }
  console.log("expense", exp);
}

const bcTxs = (d.bankTransactions || []).filter((t) => {
  const at = String(t.transactionAt || t.date || "");
  const text = JSON.stringify(t);
  return at.startsWith(datePrefix) && /\uBE44\uC528|BC|bc/i.test(text);
});
console.log("\n=== all 04-10 BC-related txs ===", bcTxs.length);
for (const tx of bcTxs) {
  console.log({
    id: tx.id,
    at: tx.transactionAt,
    withdrawal: tx.withdrawal,
    deposit: tx.deposit,
    desc: tx.description,
    cp: tx.counterpartyName,
    type: tx.transactionType,
    folderId: tx.folderId,
    linkedFixed: tx.linkedFixedExpensePaymentId,
    linkedExp: tx.linkedCompanyExpenseId,
  });
}

console.log("\nversion", db.prepare("SELECT version FROM erp_state WHERE id=1").get().version);
