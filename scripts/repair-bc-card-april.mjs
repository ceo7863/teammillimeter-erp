#!/usr/bin/env node
/** Link 2026-04-10 BC card withdrawal 2,546,787 to 법인신용카드 fixed expense. */
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

const TX_ID = "453dc640-186c-4d0b-89a5-b2df081acd2c";
const FIXED_EXPENSE_ID = "376448c9-2d77-48e1-90f5-7661d5ee188c";
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

let companyExpenses = [...(data.companyExpenses || [])];
let fixedExpensePayments = [...(data.fixedExpensePayments || [])];

const assignment = assignBankTxToFixedExpensePayment({
  tx,
  resolvedFixedExpenseId: FIXED_EXPENSE_ID,
  fixedItem,
  payments: fixedExpensePayments,
  fixedExpenses: data.fixedExpenses || [],
  resolvedCategory: fixedItem.category || "",
  memo: buildFixedExpensePaymentMemoFromBankTx(tx, fixedItem),
  savedBy: "repair-bc-card-april",
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

const payment = fixedExpensePayments.find((row) => row.id === assignment.paymentId);

console.log(
  JSON.stringify(
    {
      dryRun,
      tx: {
        date: String(tx.transactionAt).slice(0, 10),
        amount: tx.withdrawal,
        description: tx.description,
      },
      fixed: fixedItem.name,
      paymentId: assignment.paymentId,
      payment: payment
        ? { date: payment.date, amount: payment.amount, memo: payment.memo }
        : null,
      created: assignment.created,
      reusedPlaceholder: !assignment.created,
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
  "repair-bc-card-april",
);
console.log("saved version", Number(state.version || 0) + 1);
