import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const fixedRules = (d.bankLedgerRules || []).filter((r) => r.kind === "fixed" && r.fixedExpenseId);
console.log("fixed rules count", fixedRules.length);

const linkedTxIds = new Set(
  (d.bankTransactions || [])
    .filter((t) => t.linkedFixedExpensePaymentId || t.linkedCompanyExpenseId)
    .map((t) => t.id),
);

const mayLinked = (d.bankTransactions || []).filter(
  (t) =>
    String(t.transactionAt || "").startsWith("2026-05") &&
    t.linkedFixedExpensePaymentId &&
    Number(t.withdrawal) > 0,
);
console.log("\n=== May linked fixed txs ===");
for (const t of mayLinked) {
  const pay = (d.fixedExpensePayments || []).find((p) => p.id === t.linkedFixedExpensePaymentId);
  const fixed = pay ? (d.fixedExpenses || []).find((f) => f.id === pay.fixedExpenseId) : null;
  console.log({
    date: t.transactionAt?.slice(0, 10),
    cp: t.counterpartyName || t.description,
    amount: t.withdrawal,
    fixed: fixed?.name,
    fixedId: pay?.fixedExpenseId,
  });
}

console.log("\n=== fixed rules summary ===");
for (const r of fixedRules) {
  const fixed = (d.fixedExpenses || []).find((f) => f.id === r.fixedExpenseId);
  console.log({
    fixed: fixed?.name,
    cp: r.counterpartyName,
    amount: r.amount,
    tokens: (r.descriptionTokens || []).slice(0, 4),
  });
}

const unlinkedWithdrawals = (d.bankTransactions || []).filter(
  (t) => Number(t.withdrawal) > 0 && !t.linkedFixedExpensePaymentId && !t.linkedCompanyExpenseId,
);
console.log("\nunlinked withdrawals total", unlinkedWithdrawals.length);
