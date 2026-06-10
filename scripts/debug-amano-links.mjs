import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const ids = [
  "ff007e8d-eac1-48d5-b94e-6c4867f9f1df",
  "bfa7efa8-c4ce-4c47-a009-b317cd55419f",
];

for (const id of ids) {
  const tx = (d.bankTransactions || []).find((r) => r.id === id);
  const p =
    (d.fixedExpensePayments || []).find((r) => r.id === tx?.linkedFixedExpensePaymentId) ||
    (d.fixedExpensePayments || []).find((r) => r.bankTransactionId === id);
  const fixed = (d.fixedExpenses || []).find((f) => f.id === p?.fixedExpenseId);
  console.log({
    tx: id.slice(0, 8),
    linkedPaymentId: tx?.linkedFixedExpensePaymentId?.slice(0, 8),
    paymentId: p?.id?.slice(0, 8),
    bankTxOnPayment: p?.bankTransactionId?.slice(0, 8),
    fixedName: fixed?.name,
  });
}

const amanoRules = (d.bankLedgerRules || []).filter((r) =>
  String(r.counterpartyName || "").includes("???") || (r.descriptionTokens || []).join(" ").includes("???"),
);
console.log(
  "rules",
  amanoRules.map((r) => ({
    id: r.id.slice(0, 8),
    kind: r.kind,
    fixed: (d.fixedExpenses || []).find((f) => f.id === r.fixedExpenseId)?.name,
    amount: r.amount,
    source: r.sourceBankTransactionId?.slice(0, 8),
  })),
);
