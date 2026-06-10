import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const txId = process.argv[3] || "66c5da89-fbe1-4c4f-9d09-db3833f0a12f";
const category = process.argv[4] || "\uB300\uD45C\uC774\uC0AC \uAC00\uC9C0\uAE09\uAE08";
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const tx = (d.bankTransactions || []).find((row) => row.id === txId);
if (!tx) {
  console.error("tx not found", txId);
  process.exit(1);
}

const existing =
  (d.companyExpenses || []).find((row) => row.id === tx.linkedCompanyExpenseId) ||
  (d.companyExpenses || []).find((row) => row.bankTransactionId === txId);

if (existing) {
  if (existing.category !== category) {
    existing.category = category;
    console.log("updated expense", existing.id, "->", category);
  } else {
    console.log("already linked", existing.id, category);
  }
} else {
  const expenseId = crypto.randomUUID();
  const expense = {
    id: expenseId,
    date: String(tx.transactionAt || "").slice(0, 10),
    category,
    description: tx.description || tx.counterpartyName || "",
    amount: Number(tx.withdrawal || tx.deposit || 0),
    memo: tx.memo || "",
    kind: "variable",
    bankTransactionId: txId,
    createdBy: "repair",
    createdAt: new Date().toISOString(),
  };
  d.companyExpenses = [expense, ...(d.companyExpenses || [])];
  tx.linkedCompanyExpenseId = expenseId;
  tx.linkedFixedExpensePaymentId = undefined;
  console.log("created expense", expenseId, category);
}

if (!dryRun) {
  db.prepare("UPDATE erp_state SET payload = ?, updated_at = datetime('now') WHERE id = 1").run(JSON.stringify(d));
  console.log("saved");
}
