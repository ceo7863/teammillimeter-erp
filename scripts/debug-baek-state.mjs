import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const CEO = "\uBC30\uC885\uC6D0";
const cats = (d.expenseCategories || []).filter((c) => String(c).includes("\uB300\uD45C"));
console.log("expenseCategories (ceo-related):", cats);

const workerFolder = "bank-folder-worker-default";
const workerTxs = (d.bankTransactions || []).filter((tx) => {
  const hay = [tx.counterpartyName, tx.description, tx.memo].join(" ");
  return hay.includes(CEO) && tx.folderId === workerFolder;
});
console.log("worker-folder ??? txs:", workerTxs.length);
for (const tx of workerTxs) {
  console.log(" ", tx.id.slice(0, 8), tx.transactionAt, tx.withdrawal, tx.deposit);
}

const all = (d.bankTransactions || []).filter((tx) => {
  const hay = [tx.counterpartyName, tx.description, tx.memo].join(" ");
  return hay.includes(CEO);
});
console.log("all ??? txs:", all.length);

for (const tx of all) {
  const exp =
    (d.companyExpenses || []).find((r) => r.id === tx.linkedCompanyExpenseId) ||
    (d.companyExpenses || []).find((r) => r.bankTransactionId === tx.id);
  const w = Number(tx.withdrawal || 0);
  const dep = Number(tx.deposit || 0);
  const expectedFlow = w > 0 ? "expense" : dep > 0 ? "income" : "?";
  console.log({
    id: tx.id.slice(0, 8),
    date: String(tx.transactionAt).slice(0, 10),
    folderId: tx.folderId || "-",
    category: exp?.category,
    flow: exp?.flow || "(missing)",
    expectedFlow,
    w,
    dep,
  });
}

const rules = (d.bankLedgerRules || []).filter((r) => JSON.stringify(r).includes(CEO));
console.log("bankLedgerRules:", rules.length);
for (const r of rules) {
  console.log(" ", r.id?.slice(0, 8), r.kind, r.category, r.counterpartyPattern, r.descriptionPattern);
}
