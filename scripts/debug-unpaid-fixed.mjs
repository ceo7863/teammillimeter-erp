import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const query = process.argv[3] || "140";

function monthKey(date) {
  return String(date || "").slice(0, 7);
}

function isLinked(payment) {
  if (String(payment.bankTransactionId || "").trim()) return true;
  return (d.bankTransactions || []).some((tx) => tx.linkedFixedExpensePaymentId === payment.id);
}

const items = (d.fixedExpenses || []).filter(
  (r) => String(r.name || "").includes(query) || String(r.name || "").includes("????"),
);

for (const item of items) {
  console.log("\n===", item.name, item.id, "===");
  const byMonth = new Map();
  for (const p of d.fixedExpensePayments || []) {
    if (p.fixedExpenseId !== item.id) continue;
    const mk = monthKey(p.date);
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk).push(p);
  }
  for (const [mk, group] of [...byMonth.entries()].sort()) {
    const linked = group.filter(isLinked);
    const unlinked = group.filter((p) => !isLinked(p));
    if (unlinked.length && linked.length) {
      console.log("DUPLICATE MONTH", mk, { linked: linked.length, unlinked: unlinked.length });
    }
    for (const p of group) {
      console.log({
        date: p.date,
        amount: p.amount,
        memo: p.memo,
        linked: isLinked(p),
        id: p.id.slice(0, 8),
      });
    }
  }
}

const txs = (d.bankTransactions || []).filter((tx) => {
  const hay = [tx.counterpartyName, tx.description, tx.memo].join(" ");
  return hay.includes(query) || hay.includes("????") || hay.includes("140?");
});
console.log("\n=== bank txs sample ===", txs.length);
for (const tx of txs.slice(0, 8)) {
  console.log({
    date: String(tx.transactionAt).slice(0, 10),
    withdrawal: tx.withdrawal,
    counterparty: tx.counterpartyName,
    desc: tx.description,
    linkedPay: tx.linkedFixedExpensePaymentId?.slice(0, 8),
    linkedExp: tx.linkedCompanyExpenseId?.slice(0, 8),
  });
}
