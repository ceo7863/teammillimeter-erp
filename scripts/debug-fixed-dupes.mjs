import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const raw = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

const fixedExpenses = raw.fixedExpenses || [];
const payments = raw.fixedExpensePayments || [];
const txs = raw.bankTransactions || [];

function monthKey(date) {
  return String(date || "").slice(0, 7);
}

const byKey = new Map();
for (const p of payments) {
  const key = `${p.fixedExpenseId}:${monthKey(p.date)}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(p);
}

const dupes = [...byKey.entries()].filter(([, rows]) => rows.length > 1);
console.log(`Duplicate month groups: ${dupes.length}`);

for (const [key, rows] of dupes.sort((a, b) => b[1].length - a[1].length).slice(0, 20)) {
  const expense = fixedExpenses.find((e) => e.id === rows[0].fixedExpenseId);
  console.log(`\n=== ${expense?.name || key} (${rows.length}) ===`);
  for (const p of rows.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const tx = txs.find((t) => t.id === p.bankTransactionId || t.linkedFixedExpensePaymentId === p.id);
    console.log(
      [
        p.date,
        p.amount,
        p.memo?.slice(0, 40),
        p.bankTransactionId ? `bank:${p.bankTransactionId.slice(0, 8)}` : "no-bank",
        tx ? `tx:${String(tx.description || tx.counterpartyName).slice(0, 20)}` : "",
        p.id.slice(0, 8),
      ].join(" | "),
    );
  }
}

// Recent payments (last 7 days import)
const recent = payments
  .filter((p) => String(p.date || "") >= "2026-05-01")
  .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)))
  .slice(0, 30);
console.log("\n=== RECENT MAY PAYMENTS ===");
for (const p of recent) {
  const expense = fixedExpenses.find((e) => e.id === p.fixedExpenseId);
  const linked = txs.some((t) => t.linkedFixedExpensePaymentId === p.id || t.id === p.bankTransactionId);
  console.log(`${p.date} | ${expense?.name} | ${p.amount} | ${p.memo?.slice(0, 30)} | linked:${linked} | ${p.id.slice(0, 8)}`);
}
