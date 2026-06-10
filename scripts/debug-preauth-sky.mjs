import { DatabaseSync } from "node:sqlite";
import path from "path";

const db = new DatabaseSync(path.join(process.cwd(), "data/erp.sqlite"));
const data = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);
const txs = data.bankTransactions || [];
const expenses = data.companyExpenses || [];
const payments = data.fixedExpensePayments || [];

const SKY = /\uD558\uB298|\uC8FC\uC720/;

const hits = txs.filter((t) => {
  const h = [t.description, t.counterpartyName, t.memo].filter(Boolean).join(" ");
  return String(t.transactionAt || "").includes("05-12") && SKY.test(h);
});

console.log("=== May 12 sky/gas txs ===", hits.length);
for (const t of hits.sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))) {
  const exp = expenses.find((e) => e.bankTransactionId === t.id);
  const pay = payments.find((p) => p.bankTransactionId === t.id);
  console.log({
    id: t.id.slice(0, 8),
    at: t.transactionAt,
    withdrawal: t.withdrawal,
    deposit: t.deposit,
    description: t.description,
    counterparty: t.counterpartyName,
    netGroupRole: t.netGroupRole,
    netGroupId: t.netGroupId ? t.netGroupId.slice(0, 8) : undefined,
    linkedExpense: t.linkedCompanyExpenseId ? "yes" : undefined,
    linkedPayment: t.linkedFixedExpensePaymentId ? "yes" : undefined,
    ledgerExpense: exp ? { category: exp.category, amount: exp.amount, desc: exp.description?.slice(0, 30) } : undefined,
    ledgerPayment: pay ? { amount: pay.amount } : undefined,
  });
}
