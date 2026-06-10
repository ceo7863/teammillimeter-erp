#!/usr/bin/env node
/** Link 2026-04-10 배종원 4,844,650 → 급여 - 사무실 fixed, remove variable 인건비 */
import { DatabaseSync } from "node:sqlite";
import {
  assignBankTxToFixedExpensePayment,
  buildFixedExpensePaymentMemoFromBankTx,
  syncBankTransactionLedgerLinkFields,
} from "../src/utils/bankCompanyLedger.ts";
import {
  ensureDefaultBankTransactionFolders,
  syncLedgerLinkedBankTransactionFolders,
} from "../src/utils/bankTransactionFolders.ts";

const TX_ID = "c384afde-5f83-4d3c-8452-f142b96a43fa";
const VARIABLE_EXPENSE_ID = "f4d42d29-5e03-4dfe-bdb8-0640a91a4d69";
const FIXED_EXPENSE_ID = "fd39c96c-ce7b-4ad7-852b-174429f3fb3e"; // 급여 - 사무실
const LEDGER_FOLDER_ID = "bank-folder-ledger-default";

const dbPath = process.argv[2] || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

const tx = (data.bankTransactions || []).find((row) => row.id === TX_ID);
if (!tx) {
  console.log("tx not found");
  process.exit(1);
}

const fixedItem = (data.fixedExpenses || []).find((row) => row.id === FIXED_EXPENSE_ID);
if (!fixedItem) {
  console.log("fixed item not found");
  process.exit(1);
}

let companyExpenses = (data.companyExpenses || []).filter((row) => row.id !== VARIABLE_EXPENSE_ID);
let fixedExpensePayments = [...(data.fixedExpensePayments || [])];

const assignment = assignBankTxToFixedExpensePayment({
  tx,
  resolvedFixedExpenseId: FIXED_EXPENSE_ID,
  fixedItem,
  payments: fixedExpensePayments,
  fixedExpenses: data.fixedExpenses || [],
  resolvedCategory: fixedItem.category || "",
  memo: buildFixedExpensePaymentMemoFromBankTx(tx, fixedItem),,
  savedBy: "repair-baejongwon-april-salary",
});

fixedExpensePayments = assignment.payments;

let bankTransactions = (data.bankTransactions || []).map((row) =>
  row.id === TX_ID
    ? {
        ...row,
        linkedFixedExpensePaymentId: assignment.paymentId,
        linkedCompanyExpenseId: undefined,
        folderId: LEDGER_FOLDER_ID,
        classifiedAt: row.classifiedAt || new Date().toISOString(),
      }
    : row,
);

const folders = ensureDefaultBankTransactionFolders(data.bankTransactionFolders || []);
const synced = syncBankTransactionLedgerLinkFields(bankTransactions, companyExpenses, fixedExpensePayments);
const folderSync = syncLedgerLinkedBankTransactionFolders(synced, folders, {
  companyExpenses,
  fixedExpensePayments,
});

console.log(
  JSON.stringify(
    {
      dryRun,
      tx: {
        date: String(tx.transactionAt).slice(0, 10),
        amount: tx.withdrawal,
        counterparty: tx.counterpartyName,
      },
      fixed: fixedItem.name,
      paymentId: assignment.paymentId,
      created: assignment.created,
    },
    null,
    2,
  ),
);

if (dryRun) process.exit(0);

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify({
    ...data,
    bankTransactions: folderSync.transactions,
    bankTransactionFolders: folderSync.folders,
    companyExpenses,
    fixedExpensePayments,
  }),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-baejongwon-april-salary",
);
console.log("saved version", Number(state.version || 0) + 1);
