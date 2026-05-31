import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);
const expenses = d.companyExpenses || [];
const txs = d.bankTransactions || [];

const bad = txs.filter((tx) => {
  const exp = expenses.find((e) => e.id === tx.linkedCompanyExpenseId);
  if (!exp) return false;
  const cat = String(exp.category || "");
  const isMeal = cat.includes("\uC811\uB300") || cat.includes("\uC2DD\uBE44");
  return isMeal && !tx.folderId;
});
console.log("meal linked but unfiled", bad.length);
for (const tx of bad) {
  const exp = expenses.find((e) => e.id === tx.linkedCompanyExpenseId);
  console.log(tx.id.slice(0, 8), String(tx.transactionAt).slice(0, 10), tx.counterpartyName, exp?.category);
}

const unfiledMealMemo = txs.filter((tx) => {
  if (tx.folderId) return false;
  const memo = String(tx.memo || "");
  return /(\uC2DD\uBE44|\uC2DD\uB300|\uD68C\uC2DD|\uC811\uB300)/.test(memo);
});
console.log("\nunfiled with meal memo", unfiledMealMemo.length);
for (const tx of unfiledMealMemo.slice(0, 15)) {
  const exp = expenses.find((e) => e.id === tx.linkedCompanyExpenseId);
  console.log(tx.id.slice(0, 8), String(tx.transactionAt).slice(0, 10), tx.memo, "linked", exp?.category || "-");
}

const recentUnfiledWithdrawals = txs
  .filter((tx) => !tx.folderId && tx.withdrawal > 0)
  .sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt)))
  .slice(0, 10);
console.log("\nrecent unfiled withdrawals");
for (const tx of recentUnfiledWithdrawals) {
  const exp = expenses.find((e) => e.id === tx.linkedCompanyExpenseId);
  console.log(tx.id.slice(0, 8), String(tx.transactionAt).slice(0, 10), tx.counterpartyName, exp?.category || "-");
}
