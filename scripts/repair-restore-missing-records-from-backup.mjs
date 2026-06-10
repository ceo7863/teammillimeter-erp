#!/usr/bin/env node
/**
 * Merge records that exist in a backup DB but not in the current DB (by id).
 * Keeps all current rows; adds missing sales, payment vouchers, tax invoices, etc.
 *
 * Usage:
 *   node scripts/repair-restore-missing-records-from-backup.mjs [backup-path] [--dry-run]
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

const MERGE_KEYS = [
  "sales",
  "paymentVouchers",
  "paymentInputLogs",
  "taxInvoices",
  "statementFolders",
];

function loadBackupPayload(dbPath) {
  const tmp = path.join(os.tmpdir(), `erp-restore-missing-${Date.now()}.sqlite`);
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
    Array.isArray(data.data.sales)
  ) {
    data = data.data;
  }
  return { version: row.version, data };
}

function mergeMissingById(currentRows, backupRows) {
  const current = Array.isArray(currentRows) ? currentRows : [];
  const backup = Array.isArray(backupRows) ? backupRows : [];
  const currentIds = new Set(current.map((row) => String(row.id)));
  const added = [];
  const merged = [...current];
  for (const row of backup) {
    const id = String(row.id);
    if (!id || currentIds.has(id)) continue;
    merged.push(row);
    added.push(id);
  }
  return { merged, added };
}

getDb();
const current = getErpState();
const backup = loadBackupPayload(backupPath);

const summary = {
  dryRun,
  backupPath,
  backupVersion: backup.version,
  currentVersion: current.version,
  added: {},
  before: {},
  after: {},
};

const nextData = { ...current.data };

for (const key of MERGE_KEYS) {
  summary.before[key] = Array.isArray(current.data[key]) ? current.data[key].length : 0;
  const { merged, added } = mergeMissingById(current.data[key], backup.data[key]);
  nextData[key] = merged;
  summary.added[key] = added.length;
  summary.after[key] = merged.length;
}

console.log(JSON.stringify(summary, null, 2));

if (dryRun) {
  process.exit(0);
}

const saved = saveErpState(nextData, current.version, "repair-restore-missing-records");
console.log(JSON.stringify({ ok: true, newVersion: saved.version }));
