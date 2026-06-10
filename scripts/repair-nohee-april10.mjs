import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const dbPath = process.argv[2] || "data/erp.sqlite";
const txId = process.argv[3] || "cc1878f5-2e4b-48be-b092-3538c945aaff";
const category = process.argv[4] || "\uC778\uAC74\uBE44";
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const d = JSON.parse(row.payload);

const tx = (d.bankTransactions || []).find((r) => r.id === txId);
if (!tx) {
  console.error("tx not found", txId);
  process.exit(1);
}

console.log("BEFORE:", {
  id: tx.id,
  date: tx.transactionAt,
  counterparty: tx.counterpartyName,
  withdrawal: tx.withdrawal,
  folderId: tx.folderId || null,
  linkedCompanyExpenseId: tx.linkedCompanyExpenseId || null,
});

const existing =
  (d.companyExpenses || []).find((r) => r.id === tx.linkedCompanyExpenseId) ||
  (d.companyExpenses || []).find((r) => r.bankTransactionId === txId);

let expense;
if (existing) {
  expense = { ...existing, category };
  d.companyExpenses = (d.companyExpenses || []).map((r) => (r.id === existing.id ? expense : r));
  console.log("updated expense", existing.id);
} else {
  const expenseId = randomUUID();
  const date = String(tx.transactionAt || "").slice(0, 10);
  const counterparty = String(tx.counterpartyName || "").trim();
  const descriptionText = String(tx.description || "").trim();
  expense = {
    id: expenseId,
    date,
    category,
    description: [descriptionText, counterparty].filter(Boolean).join(" � ") || "?? ??",
    amount: Number(tx.withdrawal || tx.deposit || 0),
    memo: tx.memo || "",
    kind: "variable",
    flow: "expense",
    bankTransactionId: txId,
    createdBy: "repair",
    createdAt: new Date().toISOString(),
  };
  d.companyExpenses = [expense, ...(d.companyExpenses || [])];
  tx.linkedCompanyExpenseId = expenseId;
  tx.linkedFixedExpensePaymentId = undefined;
  console.log("created expense", expenseId);
}

if (!Array.isArray(d.expenseCategories)) d.expenseCategories = [];
if (!d.expenseCategories.includes(category)) {
  d.expenseCategories.push(category);
}

const hay = [tx.counterpartyName, tx.description, tx.memo].filter(Boolean).join(" ");
const hasRule = (d.bankLedgerRules || []).some(
  (r) => r.kind === "manual" && r.category === category && String(r.counterpartyName || "") === String(tx.counterpartyName || ""),
);
if (!hasRule) {
  d.bankLedgerRules = [
    {
      id: randomUUID(),
      kind: "manual",
      category,
      counterpartyName: tx.counterpartyName || "",
      description: tx.description || "",
      memo: tx.memo || "",
      createdBy: "repair",
      createdAt: new Date().toISOString(),
    },
    ...(d.bankLedgerRules || []),
  ];
  console.log("added learn rule for", tx.counterpartyName, "->", category);
}

console.log("AFTER:", {
  linkedCompanyExpenseId: tx.linkedCompanyExpenseId,
  expenseCategory: expense.category,
  expenseId: expense.id,
});

if (!dryRun) {
  db.prepare("UPDATE erp_state SET payload = ?, updated_at = datetime('now') WHERE id = 1").run(JSON.stringify(d));
  console.log("saved");
}
