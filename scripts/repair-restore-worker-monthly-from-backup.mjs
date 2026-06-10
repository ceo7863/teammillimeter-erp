#!/usr/bin/env node
/**
 * Restore workerMonthlyActualVouchers + bank linkedWorkerMonthlyPaymentVoucherId from a backup DB.
 * Usage:
 *   node scripts/repair-restore-worker-monthly-from-backup.mjs data/erp.sqlite data/erp.sqlite.bak [--dry-run]
 */
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dbPaths = args.filter((arg) => arg.endsWith(".sqlite") || arg.endsWith(".db"));

if (dbPaths.length < 2) {
  console.error(
    "Usage: node scripts/repair-restore-worker-monthly-from-backup.mjs <target-db> <backup-db> [--dry-run]",
  );
  process.exit(1);
}

const [targetPath, backupPath] = dbPaths;

function readState(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db.prepare("SELECT payload, version, updated_at FROM erp_state WHERE id = 1").get();
  db.close();
  if (!row) throw new Error(`No erp_state in ${dbPath}`);
  return {
    data: JSON.parse(String(row.payload)),
    version: row.version,
    updatedAt: row.updated_at,
  };
}

if (!existsSync(targetPath)) throw new Error(`Target missing: ${targetPath}`);
if (!existsSync(backupPath)) throw new Error(`Backup missing: ${backupPath}`);

const target = readState(targetPath);
const backup = readState(backupPath);

const backupVouchers = Array.isArray(backup.data.workerMonthlyActualVouchers)
  ? backup.data.workerMonthlyActualVouchers
  : [];
const backupBank = Array.isArray(backup.data.bankTransactions) ? backup.data.bankTransactions : [];
const backupVoucherIds = new Set(backupVouchers.map((row) => row.id));
const backupBankLinkById = new Map(
  backupBank
    .filter((row) => String(row.linkedWorkerMonthlyPaymentVoucherId || "").trim())
    .map((row) => [row.id, row.linkedWorkerMonthlyPaymentVoucherId]),
);

const nextVouchers = backupVouchers;
const nextBank = (target.data.bankTransactions || []).map((row) => {
  const linkedId = backupBankLinkById.get(row.id);
  if (!linkedId || !backupVoucherIds.has(linkedId)) return row;
  return { ...row, linkedWorkerMonthlyPaymentVoucherId: linkedId };
});

const report = {
  dryRun,
  targetPath,
  backupPath,
  targetVersion: target.version,
  backupVersion: backup.version,
  restoredVouchers: nextVouchers.length,
  vouchersWithEntries: nextVouchers.filter((row) => (row.entries || []).length > 0).length,
  restoredBankLinks: nextBank.filter((row) => row.linkedWorkerMonthlyPaymentVoucherId).length,
};

console.log(JSON.stringify(report, null, 2));

if (dryRun) process.exit(0);

const nextPayload = {
  ...target.data,
  workerMonthlyActualVouchers: nextVouchers,
  bankTransactions: nextBank,
};

const db = new DatabaseSync(targetPath);
db.prepare("UPDATE erp_state SET payload = ?, version = version + 1, updated_at = ? WHERE id = 1").run(
  JSON.stringify(nextPayload),
  new Date().toISOString(),
);
db.close();
console.log("Restored worker monthly links from backup.");
