import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { syncLedgerLinkedBankTransactionFolders } from "../src/utils/bankTransactionFolders.ts";

const dbPath = process.argv[2] || "data/erp.sqlite";
const category = process.argv[3] || "\uB300\uD45C\uC774\uC0AC \uAC00\uC218\uAE08";
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const targets = (d.bankTransactions || []).filter((tx) => {
  const date = String(tx.transactionAt || "").slice(0, 10);
  const hay = [tx.counterpartyName, tx.description, tx.memo].join(" ");
  return date === "2026-05-11" && hay.includes("\uBC30\uC885\uC6D0");
});

let created = 0;
let updated = 0;
let synced = 0;

for (const tx of targets) {
  const amount = Number(tx.withdrawal || 0) || Number(tx.deposit || 0);
  if (amount <= 0) continue;

  let expense =
    (d.companyExpenses || []).find((row) => row.id === tx.linkedCompanyExpenseId) ||
    (d.companyExpenses || []).find((row) => row.bankTransactionId === tx.id);

  if (expense) {
    let changed = false;
    if (expense.category !== category) {
      expense.category = category;
      changed = true;
    }
    if (expense.bankTransactionId !== tx.id) {
      expense.bankTransactionId = tx.id;
      changed = true;
    }
    if (expense.kind !== "variable") {
      expense.kind = "variable";
      changed = true;
    }
    if (changed) updated += 1;
  } else {
    const expenseId = randomUUID();
    expense = {
      id: expenseId,
      date: String(tx.transactionAt || "").slice(0, 10),
      category,
      description: [tx.description, tx.counterpartyName].filter(Boolean).join(" \u00B7 ") || "\uD1B5\uC7A5 \uAC70\uB798",
      amount,
      memo: tx.memo || "",
      kind: "variable",
      bankTransactionId: tx.id,
      createdBy: "repair",
      createdAt: new Date().toISOString(),
    };
    d.companyExpenses = [expense, ...(d.companyExpenses || [])];
    created += 1;
  }

  if (tx.linkedCompanyExpenseId !== expense.id || tx.linkedFixedExpensePaymentId) {
    tx.linkedCompanyExpenseId = expense.id;
    tx.linkedFixedExpensePaymentId = undefined;
    synced += 1;
  }

  console.log("linked", tx.id.slice(0, 8), tx.transactionAt, amount, category);
}

const folderSync = syncLedgerLinkedBankTransactionFolders(d.bankTransactions || [], d.bankTransactionFolders || [], {
  companyExpenses: d.companyExpenses || [],
  fixedExpensePayments: d.fixedExpensePayments || [],
});
d.bankTransactions = folderSync.transactions;
d.bankTransactionFolders = folderSync.folders;

console.log({ targets: targets.length, created, updated, synced, ledgerFolderUpdated: folderSync.updated, dryRun });
if (!dryRun && (created > 0 || updated > 0 || synced > 0 || folderSync.updated > 0)) {
  db.prepare("UPDATE erp_state SET payload = ?, updated_at = datetime('now') WHERE id = 1").run(JSON.stringify(d));
  console.log("saved");
}
