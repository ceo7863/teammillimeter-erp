import { DatabaseSync } from "node:sqlite";

const LEDGER_FOLDER_ID = "bank-folder-ledger-default";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const state = JSON.parse(row.payload);

const expenses = state.companyExpenses || [];
const payments = state.fixedExpensePayments || [];
let txs = state.bankTransactions || [];
let folders = state.bankTransactionFolders || [];

const expenseById = new Map(expenses.map((e) => [e.id, e]));
const paymentById = new Map(payments.map((p) => [p.id, p]));

function isLinked(tx) {
  if (tx.linkedCompanyExpenseId && expenseById.has(tx.linkedCompanyExpenseId)) return true;
  if (tx.linkedFixedExpensePaymentId && paymentById.has(tx.linkedFixedExpensePaymentId)) return true;
  return expenses.some((e) => e.bankTransactionId === tx.id) || payments.some((p) => p.bankTransactionId === tx.id);
}

let updated = 0;
txs = txs.map((tx) => {
  if (!isLinked(tx)) return tx;
  if (tx.folderId === LEDGER_FOLDER_ID) return tx;
  updated += 1;
  return {
    ...tx,
    folderId: LEDGER_FOLDER_ID,
    classifiedAt: new Date().toISOString(),
  };
});

if (!folders.some((f) => f.id === LEDGER_FOLDER_ID)) {
  folders = [
    {
      id: LEDGER_FOLDER_ID,
      folderName: "\uAC00\uACC4\uBD80",
      folderType: "custom",
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    ...folders,
  ];
}

console.log("repaired folder links", updated);
state.bankTransactions = txs;
state.bankTransactionFolders = folders;
db.prepare("UPDATE erp_state SET payload = ?, version = version + 1, updated_at = datetime('now') WHERE id = 1").run(
  JSON.stringify(state),
);
