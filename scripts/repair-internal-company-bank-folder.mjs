#!/usr/bin/env node
/**
 * Unfile internal company transfers wrongly assigned to worker folders, then reconcile ledger links.
 *
 * Usage:
 *   npx tsx scripts/repair-internal-company-bank-folder.mjs [dbPath] [--dry-run]
 */
import { DatabaseSync } from "node:sqlite";
import { isInternalCompanyBankTransfer } from "../src/utils/clientDepositAliases.ts";
import { isWorkerBankTransactionFolder } from "../src/utils/bankTransactionFolders.ts";
import { reconcileLedgerBankLinks } from "../src/utils/fixedExpenseAutomation.ts";
import { syncLedgerLinkedBankTransactionFolders } from "../src/utils/bankTransactionFolders.ts";

const dbPath = process.argv.find((arg) => !arg.startsWith("-") && arg.endsWith(".sqlite")) || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

const folders = data.bankTransactionFolders || [];
const clearedIds = [];

let bankTransactions = (data.bankTransactions || []).map((tx) => {
  if (!tx.folderId || !isWorkerBankTransactionFolder(folders, tx.folderId)) return tx;
  if (!isInternalCompanyBankTransfer(tx)) return tx;
  clearedIds.push(tx.id);
  return { ...tx, folderId: undefined, linkedSubject: undefined, classifiedAt: undefined };
});

const reconciled = reconcileLedgerBankLinks({
  bankTransactions,
  fixedExpensePayments: data.fixedExpensePayments || [],
  companyExpenses: data.companyExpenses || [],
  fixedExpenses: data.fixedExpenses || [],
});

const folderSync = syncLedgerLinkedBankTransactionFolders(
  reconciled.bankTransactions,
  folders,
  {
    companyExpenses: reconciled.companyExpenses,
    fixedExpensePayments: reconciled.fixedExpensePayments,
  },
);

const summary = {
  dryRun,
  clearedWorkerFolderCount: clearedIds.length,
  clearedTransactionIds: clearedIds,
  linkedCount: reconciled.linkedCount,
  ledgerFolderUpdated: folderSync.updated,
};

console.log(JSON.stringify(summary, null, 2));

if (dryRun || (!clearedIds.length && !reconciled.linkedCount && !folderSync.updated)) {
  process.exit(0);
}

const nextPayload = {
  ...data,
  bankTransactions: folderSync.transactions,
  fixedExpensePayments: reconciled.fixedExpensePayments,
  companyExpenses: reconciled.companyExpenses,
  bankTransactionFolders: folderSync.folders,
};

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify(nextPayload),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-internal-company-bank-folder",
);
