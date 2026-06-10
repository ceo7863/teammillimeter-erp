import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const txs = (d.bankTransactions || []).filter((tx) => {
  const date = String(tx.transactionAt || "").slice(0, 10);
  const hay = [tx.counterpartyName, tx.description, tx.memo].join(" ");
  return date === "2026-05-11" && hay.includes("\uBC30\uC885\uC6D0");
});

console.log("tx count", txs.length);
for (const tx of txs) {
  const expense =
    (d.companyExpenses || []).find((row) => row.id === tx.linkedCompanyExpenseId) ||
    (d.companyExpenses || []).find((row) => row.bankTransactionId === tx.id);
  const payment =
    (d.fixedExpensePayments || []).find((row) => row.id === tx.linkedFixedExpensePaymentId) ||
    (d.fixedExpensePayments || []).find((row) => row.bankTransactionId === tx.id);
  console.log({
    id: tx.id,
    at: tx.transactionAt,
    counterparty: tx.counterpartyName,
    desc: tx.description,
    withdrawal: tx.withdrawal,
    deposit: tx.deposit,
    memo: tx.memo,
    folderId: tx.folderId || "(empty)",
    linkedExpenseId: tx.linkedCompanyExpenseId,
    expenseCategory: expense?.category,
    expenseKind: expense?.kind,
    linkedPaymentId: tx.linkedFixedExpensePaymentId,
    paymentFixed: payment ? (d.fixedExpenses || []).find((f) => f.id === payment.fixedExpenseId)?.name : null,
  });
}

console.log(
  "folders:",
  (d.bankTransactionFolders || []).map((f) => `${f.id}:${f.folderName}`).join(" | "),
);
