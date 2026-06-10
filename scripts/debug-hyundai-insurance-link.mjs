import { DatabaseSync } from "node:sqlite";
import path from "path";

const dbPath = process.argv[2] || path.join(process.cwd(), "data", "erp.sqlite");
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const raw = JSON.parse(row.payload);

const KEYWORDS = ["\uD604\uB300", "\uD654\uC7AC", "\uD574\uC0C1"];
const matchText = (text) => KEYWORDS.some((word) => String(text || "").includes(word));

const expenses = (raw.companyExpenses || []).filter(
  (e) => String(e.date || "").startsWith("2026-05") && matchText(`${e.description}${e.category}`),
);
const txs = (raw.bankTransactions || []).filter(
  (t) => String(t.transactionAt || "").startsWith("2026-05") && matchText(`${t.description}${t.counterpartyName}`),
);
const fixed = (raw.fixedExpenses || []).filter((f) => matchText(f.name));
const payments = (raw.fixedExpensePayments || []).filter(
  (p) => String(p.date || "").startsWith("2026-05") && fixed.some((f) => f.id === p.fixedExpenseId),
);

function getMonthKey(dateStr) {
  const match = /^(\d{4}-\d{2})/.exec(String(dateStr || "").trim());
  return match ? match[1] : "";
}

function amountMatches(withdrawal, payment, fixedItem) {
  if (withdrawal <= 0) return false;
  if (withdrawal === Number(payment.amount)) return true;
  if (fixedItem && withdrawal === Number(fixedItem.amount)) return true;
  return false;
}

for (const payment of payments) {
  const fixedItem = fixed.find((f) => f.id === payment.fixedExpenseId);
  console.log("\n=== PAYMENT ===");
  console.log(JSON.stringify({ payment, fixedItem }, null, 2));
  for (const tx of txs) {
    const monthOk = getMonthKey(tx.transactionAt) === getMonthKey(payment.date);
    const amountOk = amountMatches(Number(tx.withdrawal || 0), payment, fixedItem);
    const linkedExpense = expenses.find((e) => e.bankTransactionId === tx.id || e.id === tx.linkedCompanyExpenseId);
    console.log(
      JSON.stringify({
        txAt: tx.transactionAt,
        withdrawal: tx.withdrawal,
        desc: tx.description,
        counterparty: tx.counterpartyName,
        linkedCompanyExpenseId: tx.linkedCompanyExpenseId,
        monthOk,
        amountOk,
        linkedExpense: linkedExpense
          ? { date: linkedExpense.date, amount: linkedExpense.amount, description: linkedExpense.description }
          : null,
      }),
    );
  }
}

console.log("\n=== ALL MATCHING EXPENSES ===");
console.log(JSON.stringify(expenses, null, 2));
