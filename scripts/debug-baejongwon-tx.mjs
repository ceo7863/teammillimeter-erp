#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const datePrefix = process.argv[3] || "2026-04-10";
const nameHint = process.argv[4] || "";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

function norm(s) {
  return String(s || "").toLowerCase();
}

const txs = (d.bankTransactions || []).filter((tx) => {
  const date = String(tx.transactionAt || "").slice(0, 10);
  if (!date.startsWith(datePrefix)) return false;
  if (!nameHint) return true;
  const hay = norm([tx.counterpartyName, tx.description, tx.memo].join(" "));
  return hay.includes(norm(nameHint));
});

console.log("matches", txs.length, "date", datePrefix, "hint", nameHint || "(all)");

for (const tx of txs.sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))) {
  const pay = (d.fixedExpensePayments || []).find((p) => p.id === tx.linkedFixedExpensePaymentId);
  const fe = pay ? (d.fixedExpenses || []).find((f) => f.id === pay.fixedExpenseId) : null;
  const exp = tx.linkedCompanyExpenseId
    ? (d.companyExpenses || []).find((e) => e.id === tx.linkedCompanyExpenseId)
    : null;
  const folder = tx.folderId
    ? (d.bankTransactionFolders || []).find((f) => f.id === tx.folderId)
    : null;
  console.log(
    JSON.stringify({
      date: String(tx.transactionAt).slice(0, 10),
      id: tx.id,
      counterparty: tx.counterpartyName,
      description: tx.description,
      withdrawal: tx.withdrawal,
      deposit: tx.deposit,
      folderId: tx.folderId,
      folderName: folder?.folderName,
      linkedFixedPaymentId: tx.linkedFixedExpensePaymentId,
      fixedName: fe?.name,
      paymentDate: pay?.date,
      paymentAmount: pay?.amount,
      paymentMemo: pay?.memo,
      linkedCompanyExpenseId: tx.linkedCompanyExpenseId,
      expenseCategory: exp?.category,
      expenseKind: exp?.kind,
    }),
  );
}

// also search fixed payments / expenses mentioning hint
if (nameHint) {
  const pays = (d.fixedExpensePayments || []).filter((p) => {
    const fe = (d.fixedExpenses || []).find((f) => f.id === p.fixedExpenseId);
    return norm(p.memo).includes(norm(nameHint)) || norm(fe?.name).includes(norm(nameHint));
  });
  console.log("\nfixed payments with hint:", pays.length);
  for (const p of pays.slice(0, 10)) {
    const fe = (d.fixedExpenses || []).find((f) => f.id === p.fixedExpenseId);
    const tx = (d.bankTransactions || []).find((t) => t.linkedFixedExpensePaymentId === p.id || t.id === p.bankTransactionId);
    console.log(JSON.stringify({ paymentDate: p.date, amount: p.amount, fixed: fe?.name, bankTx: tx?.id, cp: tx?.counterpartyName }));
  }
}
