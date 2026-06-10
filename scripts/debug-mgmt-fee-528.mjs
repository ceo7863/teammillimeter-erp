#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const data = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload));

const txs = (data.bankTransactions || []).filter((tx) => {
  const d = String(tx.transactionAt || "").slice(0, 10);
  const hay = [tx.description, tx.counterpartyName, tx.memo].join(" ");
  return d === "2026-05-28" || (hay.includes("\uAD00\uB9AC\uBE44") && hay.includes("141"));
});

console.log("=== txs ===");
for (const tx of txs) {
  console.log(JSON.stringify({
    id: tx.id,
    date: String(tx.transactionAt).slice(0, 19),
    withdrawal: tx.withdrawal,
    description: tx.description,
    counterparty: tx.counterpartyName,
    memo: tx.memo,
    linkedFixedExpensePaymentId: tx.linkedFixedExpensePaymentId,
    linkedCompanyExpenseId: tx.linkedCompanyExpenseId,
    folderId: tx.folderId,
  }, null, 2));

  if (tx.linkedFixedExpensePaymentId) {
    const pay = (data.fixedExpensePayments || []).find((p) => p.id === tx.linkedFixedExpensePaymentId);
    const fixed = pay ? (data.fixedExpenses || []).find((f) => f.id === pay.fixedExpenseId) : null;
    console.log("  linked payment:", pay);
    console.log("  linked fixed:", fixed?.name, fixed?.category, fixed?.amount);
  }
}

console.log("\n=== management fee fixed items ===");
for (const f of data.fixedExpenses || []) {
  if (String(f.name).includes("\uAD00\uB9AC\uBE44") || String(f.category).includes("\uAD00\uB9AC\uBE44")) {
    const pays = (data.fixedExpensePayments || []).filter((p) => p.fixedExpenseId === f.id);
    console.log({ name: f.name, id: f.id.slice(0, 8), amount: f.amount, payments: pays.length, pays: pays.map((p) => ({ date: p.date, amount: p.amount, linked: p.bankTransactionId || txHasLink(p.id, data.bankTransactions) })) });
  }
}

function txHasLink(paymentId, bankTransactions) {
  return bankTransactions.some((tx) => tx.linkedFixedExpensePaymentId === paymentId || false);
}
