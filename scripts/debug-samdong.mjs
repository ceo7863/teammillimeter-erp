import { DatabaseSync } from "node:sqlite";

const SAMDONG = "\uC0BC\uB3D9\uC18C\uBC14";
const SOBA = "\uC18C\uBC14";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const raw = JSON.parse(String(row.payload));

function matchesSamdong(...parts) {
  const hay = parts.filter(Boolean).join(" ");
  return hay.includes(SAMDONG) || hay.includes(SOBA);
}

const txs = (raw.bankTransactions || [])
  .filter((t) => matchesSamdong(t.description, t.counterpartyName, t.memo))
  .sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)));

const txIds = new Set(txs.map((t) => t.id));
const linkedIds = new Set(txs.map((t) => t.linkedCompanyExpenseId).filter(Boolean));

const exps = (raw.companyExpenses || []).filter((e) => {
  if (txIds.has(e.sourceBankTransactionId)) return true;
  if (linkedIds.has(e.id)) return true;
  return matchesSamdong(e.description, e.memo, e.vendor);
});

console.log("=== ALL SAMDONG BANK TX ===");
for (const t of txs) {
  console.log(
    [
      t.transactionAt,
      t.withdrawal ? `W ${t.withdrawal}` : `D ${t.deposit}`,
      t.description,
      t.transactionType || "",
      t.memo || "",
      t.netGroupRole || "-",
      t.linkedCompanyExpenseId ? `linked:${t.linkedCompanyExpenseId.slice(0, 8)}` : "unlinked",
      t.id.slice(0, 8),
    ].join(" | "),
  );
}

console.log("\n=== LINKED EXPENSES ===");
for (const e of exps) {
  console.log(
    [
      e.date,
      e.amount,
      e.vendor || e.description,
      e.sourceBankTransactionId ? `src:${e.sourceBankTransactionId.slice(0, 8)}` : "no-src",
      e.id.slice(0, 8),
    ].join(" | "),
  );
}
