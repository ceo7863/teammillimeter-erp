import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const d = JSON.parse(row.payload);

const needle = process.argv[3] || "\uC544\uB9C8\uB178";
const amount = Number(process.argv[4] || 33000);

const txs = (d.bankTransactions || []).filter((tx) => {
  const hay = [tx.description, tx.counterpartyName, tx.memo, tx.transactionAt].join(" ");
  const date = String(tx.transactionAt || "");
  return hay.includes(needle) || (date.includes("-05-28") && Number(tx.withdrawal) === amount);
});

const parking = (d.fixedExpenses || []).filter((r) => {
  const name = String(r.name || "");
  return name.includes("\uC720\uB8CC\uC8FC\uCC28") || /st1/i.test(name);
});

console.log("=== matching txs:", txs.length, "===");
for (const tx of txs) {
  const expense = (d.companyExpenses || []).find(
    (e) => e.id === tx.linkedCompanyExpenseId || e.bankTransactionId === tx.id,
  );
  const payment = (d.fixedExpensePayments || []).find(
    (p) => p.id === tx.linkedFixedExpensePaymentId || p.bankTransactionId === tx.id,
  );
  const fe = payment ? (d.fixedExpenses || []).find((x) => x.id === payment.fixedExpenseId) : null;
  const rules = (d.bankLedgerRules || []).filter(
    (r) =>
      r.sourceBankTransactionId === tx.id ||
      String(r.counterpartyName || "").includes(needle) ||
      (Array.isArray(r.descriptionTokens) ? r.descriptionTokens : []).some((t) => String(t).includes(needle)),
  );
  console.log(
    JSON.stringify(
      {
        id: tx.id,
        at: tx.transactionAt,
        withdrawal: tx.withdrawal,
        description: tx.description,
        counterpartyName: tx.counterpartyName,
        memo: tx.memo,
        linkedCompanyExpenseId: tx.linkedCompanyExpenseId,
        linkedFixedExpensePaymentId: tx.linkedFixedExpensePaymentId,
        expense: expense
          ? { id: expense.id, category: expense.category, description: expense.description, kind: expense.kind }
          : null,
        payment: payment
          ? { id: payment.id, fixedExpenseId: payment.fixedExpenseId, fixedName: fe?.name, memo: payment.memo }
          : null,
        rules: rules.slice(0, 5).map((r) => ({
          id: r.id,
          kind: r.kind,
          fixedExpenseId: r.fixedExpenseId,
          category: r.category,
        })),
      },
      null,
      2,
    ),
  );
}

console.log("\n=== parking fixed items ===");
console.log(JSON.stringify(parking.map((r) => ({ id: r.id, name: r.name, category: r.category, isActive: r.isActive })), null, 2));
