#!/usr/bin/env node
import fs from "fs";
import os from "os";
import { DatabaseSync } from "node:sqlite";
import path from "path";
import { fileURLToPath } from "url";
import { getDb, getErpState, saveErpState } from "../server/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const backupPath = args[0]
  ? path.resolve(process.cwd(), args[0])
  : path.join(rootDir, "data/erp.sqlite.bak-202606010611");

function loadBackupPayload(dbPath) {
  const tmp = path.join(os.tmpdir(), `erp-restore-${Date.now()}.sqlite`);
  fs.copyFileSync(dbPath, tmp);
  const db = new DatabaseSync(tmp, { readOnly: true });
  const row = db.prepare("SELECT version, payload FROM erp_state WHERE id = 1").get();
  db.close();
  fs.unlinkSync(tmp);
  if (!row) throw new Error(`No erp_state in ${dbPath}`);
  return { version: row.version, data: JSON.parse(row.payload) };
}

function mergeById(backupRows, currentRows, prefer = "backup") {
  const backup = Array.isArray(backupRows) ? backupRows : [];
  const current = Array.isArray(currentRows) ? currentRows : [];
  const currentById = new Map(current.map((row) => [String(row.id), row]));
  const backupIds = new Set(backup.map((row) => String(row.id)));
  const merged = backup.map((row) => {
    const cur = currentById.get(String(row.id));
    if (!cur) return row;
    return prefer === "current" ? { ...row, ...cur } : { ...cur, ...row };
  });
  for (const row of current) {
    if (!backupIds.has(String(row.id))) merged.push(row);
  }
  return merged;
}

function mergeBankUnion(backupRows, currentRows) {
  const backup = Array.isArray(backupRows) ? backupRows : [];
  const current = Array.isArray(currentRows) ? currentRows : [];
  const currentById = new Map(current.map((row) => [row.id, row]));
  const backupIds = new Set(backup.map((row) => row.id));
  const merged = backup.map((row) => {
    const cur = currentById.get(row.id);
    if (!cur) return row;
    return {
      ...row,
      ...cur,
      linkedTaxInvoiceId: cur.linkedTaxInvoiceId ?? row.linkedTaxInvoiceId,
      linkedCompanyExpenseId: cur.linkedCompanyExpenseId || row.linkedCompanyExpenseId,
      linkedFixedExpensePaymentId: cur.linkedFixedExpensePaymentId || row.linkedFixedExpensePaymentId,
      folderId: cur.folderId || row.folderId,
      ledgerClientName: cur.ledgerClientName || row.ledgerClientName,
      linkedSubject: cur.linkedSubject || row.linkedSubject,
      memo: cur.memo ?? row.memo,
    };
  });
  for (const row of current) {
    if (!backupIds.has(row.id)) merged.push(row);
  }
  return merged;
}

getDb();
const current = getErpState();
const backup = loadBackupPayload(backupPath);

const summary = {
  dryRun,
  backupPath,
  backupVersion: backup.version,
  currentVersion: current.version,
  before: {},
  after: {},
};

for (const key of [
  "sales",
  "paymentVouchers",
  "bankTransactions",
  "taxInvoices",
  "workers",
  "clients",
  "companyExpenses",
  "fixedExpenses",
  "fixedExpensePayments",
]) {
  summary.before[key] = Array.isArray(current.data[key]) ? current.data[key].length : 0;
}

const restored = {
  ...backup.data,
  bankTransactions: mergeBankUnion(backup.data.bankTransactions, current.data.bankTransactions),
  clients: mergeById(backup.data.clients, current.data.clients, "current"),
  workers: mergeById(backup.data.workers, current.data.workers, "current"),
  companyProfile: {
    ...(backup.data.companyProfile || {}),
    ...(current.data.companyProfile || {}),
  },
  accountCodes: current.data.accountCodes?.length
    ? current.data.accountCodes
    : backup.data.accountCodes || [],
  ledgerCategories: current.data.ledgerCategories?.length
    ? current.data.ledgerCategories
    : backup.data.ledgerCategories || [],
  notificationSettings: current.data.notificationSettings || backup.data.notificationSettings || null,
  clientContracts: current.data.clientContracts?.length
    ? current.data.clientContracts
    : backup.data.clientContracts || [],
  clientSiteRequests: current.data.clientSiteRequests?.length
    ? current.data.clientSiteRequests
    : backup.data.clientSiteRequests || [],
};

for (const key of Object.keys(summary.before)) {
  summary.after[key] = Array.isArray(restored[key]) ? restored[key].length : 0;
}

console.log(JSON.stringify(summary, null, 2));

if (dryRun) {
  process.exit(0);
}

const saved = saveErpState(restored, current.version, "repair-restore-from-backup");
console.log(JSON.stringify({ ok: true, newVersion: saved.version }));
