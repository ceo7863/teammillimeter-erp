/**
 * Set companyExpense.flow from linked bank tx deposit/withdrawal.
 * Usage: node scripts/repair-company-expense-flow.mjs [dbPath]
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dbPath = resolve(process.argv[2] || "data/erp.sqlite");
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
if (!row?.payload) {
  console.error("No erp_state payload in", dbPath);
  process.exit(1);
}

const data = JSON.parse(row.payload);
const bankById = new Map((data.bankTransactions || []).map((tx) => [tx.id, tx]));
let repaired = 0;
let alreadyOk = 0;

for (const expense of data.companyExpenses || []) {
  const txId = String(expense.bankTransactionId || "").trim();
  if (!txId) continue;
  const tx = bankById.get(txId);
  if (!tx) continue;

  const withdrawal = Number(tx.withdrawal || 0);
  const deposit = Number(tx.deposit || 0);
  const expectedFlow = withdrawal > 0 ? "expense" : deposit > 0 ? "income" : expense.flow || "expense";
  const currentFlow = expense.flow === "income" ? "income" : "expense";

  if (currentFlow === expectedFlow) {
    alreadyOk += 1;
    continue;
  }

  expense.flow = expectedFlow;
  repaired += 1;
  console.log("repaired", {
    expenseId: expense.id,
    date: expense.date,
    category: expense.category,
    amount: expense.amount,
    from: currentFlow,
    to: expectedFlow,
    txId,
    withdrawal,
    deposit,
  });
}

if (repaired > 0) {
  db.prepare("UPDATE erp_state SET payload = ? WHERE id = 1").run(JSON.stringify(data));
  console.log(`Saved ${repaired} repair(s), ${alreadyOk} already correct.`);
} else {
  console.log(`No repairs needed. ${alreadyOk} bank-linked expense(s) already correct.`);
}
