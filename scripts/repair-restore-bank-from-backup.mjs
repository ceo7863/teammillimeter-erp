#!/usr/bin/env node
/**
 * Restore bank transactions from backup and remap current UUID links to backup IDs.
 *
 * Usage:
 *   node scripts/repair-restore-bank-from-backup.mjs [backup-path] [--dry-run]
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { getDb, getErpState, saveErpState } from "../server/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const backupPath = args[0]
  ? path.resolve(process.cwd(), args[0])
  : path.join(rootDir, "data/erp.sqlite.bak-202606010611");

function loadBackupPayload(dbPath) {
  const tmp = path.join(os.tmpdir(), `erp-restore-bank-${Date.now()}.sqlite`);
  fs.copyFileSync(dbPath, tmp);
  const db = new DatabaseSync(tmp, { readOnly: true });
  const row = db.prepare("SELECT version, payload FROM erp_state WHERE id = 1").get();
  db.close();
  fs.unlinkSync(tmp);
  if (!row) throw new Error(`No erp_state in ${dbPath}`);
  let data = JSON.parse(row.payload);
  if (
    data &&
    typeof data === "object" &&
    data.data &&
    typeof data.data === "object" &&
    Array.isArray(data.data.bankTransactions)
  ) {
    data = data.data;
  }
  return { version: row.version, data };
}

function bankTxDedupeKey(tx) {
  return [
    String(tx?.transactionAt || "").slice(0, 19),
    String(tx?.withdrawal ?? tx?.deposit ?? tx?.amount ?? ""),
    String(tx?.description || "").trim(),
    String(tx?.counterpartyName || "").trim(),
    String(tx?.accountNumber || "").trim(),
    String(tx?.transactionType || "").trim(),
  ].join("|");
}

function mergeMissingById(currentRows, backupRows) {
  const current = Array.isArray(currentRows) ? currentRows : [];
  const backup = Array.isArray(backupRows) ? backupRows : [];
  const currentIds = new Set(current.map((row) => String(row.id)));
  const merged = [...current];
  let added = 0;
  for (const row of backup) {
    const id = String(row.id);
    if (!id || currentIds.has(id)) continue;
    merged.push(row);
    added += 1;
  }
  return { merged, added };
}

function mergeFolders(currentRows, backupRows) {
  const current = Array.isArray(currentRows) ? currentRows : [];
  const backup = Array.isArray(backupRows) ? backupRows : [];
  const currentById = new Map(current.map((row) => [String(row.id), row]));
  const merged = backup.map((row) => ({
    ...row,
    ...(currentById.get(String(row.id)) || {}),
    id: row.id,
    folderName: row.folderName || currentById.get(String(row.id))?.folderName,
    folderType: row.folderType || currentById.get(String(row.id))?.folderType,
    parentId: row.parentId ?? currentById.get(String(row.id))?.parentId,
  }));
  const mergedIds = new Set(merged.map((row) => String(row.id)));
  for (const row of current) {
    if (!mergedIds.has(String(row.id))) merged.push(row);
  }
  return merged;
}

function buildBankIdRemap(currentTxs, backupTxs) {
  const backupByKey = new Map();
  for (const row of backupTxs) backupByKey.set(bankTxDedupeKey(row), String(row.id));
  const remap = new Map();
  for (const row of currentTxs) {
    const currentId = String(row.id);
    const backupId = backupByKey.get(bankTxDedupeKey(row));
    if (backupId && backupId !== currentId) remap.set(currentId, backupId);
  }
  return remap;
}

function remapId(value, remap) {
  if (value == null || value === "") return value;
  const key = String(value);
  return remap.get(key) || key;
}

function remapBankReferences(data, remap) {
  const next = { ...data };

  next.companyExpenses = (data.companyExpenses || []).map((row) => ({
    ...row,
    bankTransactionId: remapId(row.bankTransactionId, remap),
  }));

  next.fixedExpensePayments = (data.fixedExpensePayments || []).map((row) => ({
    ...row,
    bankTransactionId: remapId(row.bankTransactionId, remap),
  }));

  next.paymentVouchers = (data.paymentVouchers || []).map((row) => ({
    ...row,
    bankTransactionId: remapId(row.bankTransactionId, remap),
  }));

  next.taxInvoices = (data.taxInvoices || []).map((row) => ({
    ...row,
    bankTransactionId: remapId(row.bankTransactionId, remap),
  }));

  next.bankTransactions = (data.bankTransactions || []).map((row) => ({
    ...row,
    linkedTaxInvoiceId: remapId(row.linkedTaxInvoiceId, remap),
    linkedCompanyExpenseId: row.linkedCompanyExpenseId,
    linkedFixedExpensePaymentId: row.linkedFixedExpensePaymentId,
    linkedPaymentVoucherId: row.linkedPaymentVoucherId,
    linkedWorkerMonthlyPaymentVoucherId: row.linkedWorkerMonthlyPaymentVoucherId,
  }));

  return next;
}

function mergeBankTransactions(currentTxs, backupTxs) {
  const backup = Array.isArray(backupTxs) ? backupTxs : [];
  const current = Array.isArray(currentTxs) ? currentTxs : [];
  const backupKeys = new Set(backup.map(bankTxDedupeKey));
  const backupIds = new Set(backup.map((row) => String(row.id)));
  const merged = [...backup];
  let addedFromCurrent = 0;
  for (const row of current) {
    const key = bankTxDedupeKey(row);
    if (backupKeys.has(key)) continue;
    if (backupIds.has(String(row.id))) continue;
    merged.push(row);
    addedFromCurrent += 1;
  }
  return { merged, addedFromCurrent };
}

getDb();
const current = getErpState();
const backup = loadBackupPayload(backupPath);

const currentTxs = current.data.bankTransactions || [];
const backupTxs = backup.data.bankTransactions || [];
const remap = buildBankIdRemap(currentTxs, backupTxs);
const { merged: mergedBank, addedFromCurrent } = mergeBankTransactions(currentTxs, backupTxs);
const { merged: mergedRules, added: addedRules } = mergeMissingById(
  current.data.bankLedgerRules || [],
  backup.data.bankLedgerRules || [],
);

let nextData = {
  ...current.data,
  bankTransactions: mergedBank,
  bankLedgerRules: mergedRules,
  bankTransactionFolders: mergeFolders(
    current.data.bankTransactionFolders || [],
    backup.data.bankTransactionFolders || [],
  ),
  bankSyncMeta: {
    ...(backup.data.bankSyncMeta || {}),
    ...(current.data.bankSyncMeta || {}),
  },
};

nextData = remapBankReferences(
  {
    ...nextData,
    companyExpenses: current.data.companyExpenses || [],
    fixedExpensePayments: current.data.fixedExpensePayments || [],
    paymentVouchers: current.data.paymentVouchers || [],
    taxInvoices: current.data.taxInvoices || [],
  },
  remap,
);

const summary = {
  dryRun,
  backupPath,
  backupVersion: backup.version,
  currentVersion: current.version,
  bankTransactions: {
    before: currentTxs.length,
    after: nextData.bankTransactions.length,
    backupCount: backupTxs.length,
    addedFromCurrent,
    remappedIds: remap.size,
  },
  bankLedgerRules: {
    before: (current.data.bankLedgerRules || []).length,
    after: nextData.bankLedgerRules.length,
    added: addedRules,
  },
  bankTransactionFolders: {
    before: (current.data.bankTransactionFolders || []).length,
    after: nextData.bankTransactionFolders.length,
  },
};

console.log(JSON.stringify(summary, null, 2));

if (dryRun) process.exit(0);

const saved = saveErpState(nextData, current.version, "repair-restore-bank-from-backup");
console.log(JSON.stringify({ ok: true, newVersion: saved.version }));
