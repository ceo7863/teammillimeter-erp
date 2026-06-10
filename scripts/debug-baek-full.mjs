import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const expenses = (d.companyExpenses || []).filter((row) => {
  const hay = [row.description, row.memo, row.category].join(" ");
  return hay.includes("\uBC30\uC885\uC6D0") || hay.includes("\uB300\uD45C\uC774\uC0AC");
});
console.log("expenses", expenses.length);
for (const e of expenses) {
  console.log(e.id?.slice(0, 8), e.date, e.category, e.amount, "bankTx", e.bankTransactionId?.slice(0, 8));
}

const txs = (d.bankTransactions || []).filter((tx) => {
  const hay = [tx.counterpartyName, tx.description].join(" ");
  return String(tx.transactionAt || "").startsWith("2026-05-11") && hay.includes("\uBC30\uC885\uC6D0");
});
for (const tx of txs) {
  console.log("tx", tx.id.slice(0, 8), "folderId", tx.folderId || "-", "linkedCo", tx.linkedCompanyExpenseId?.slice(0, 8));
}
