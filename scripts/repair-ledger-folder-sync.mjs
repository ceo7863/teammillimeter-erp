import { DatabaseSync } from "node:sqlite";
import { syncLedgerLinkedBankTransactionFolders } from "../src/utils/bankTransactionFolders.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const state = JSON.parse(row.payload);

let folders = state.bankTransactionFolders || [];
const expenses = state.companyExpenses || [];
const payments = state.fixedExpensePayments || [];
let txs = state.bankTransactions || [];

const sync = syncLedgerLinkedBankTransactionFolders(txs, folders, {
  companyExpenses: expenses,
  fixedExpensePayments: payments,
});
txs = sync.transactions;
folders = sync.folders;

const unfiledLinked = txs.filter((t) => !t.folderId && t.linkedCompanyExpenseId);
console.log("sync updated", sync.updated, "unfiledLinked after", unfiledLinked.length);

state.bankTransactions = txs;
state.bankTransactionFolders = folders;
db.prepare("UPDATE erp_state SET payload = ?, version = version + 1, updated_at = datetime('now') WHERE id = 1").run(
  JSON.stringify(state),
);
console.log("saved");
