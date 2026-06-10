#!/usr/bin/env node
/**
 * Manual ERP snapshot: SQLite + full JSON export + domain counts.
 * Usage: node --import tsx scripts/backup-erp-manual.mjs [label]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const label =
  process.argv[2] ||
  `pre-bank-ai-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
const dbPath = process.env.DATABASE_PATH || path.join(root, "data/erp.sqlite");
const target = path.join(root, "data/backups/manual", label);

if (!fs.existsSync(dbPath)) {
  console.error(`missing db: ${dbPath}`);
  process.exit(1);
}

fs.mkdirSync(target, { recursive: true });
const backupDb = path.join(target, "erp.sqlite");

try {
  execFileSync("sqlite3", [dbPath, "PRAGMA wal_checkpoint(TRUNCATE);"], { stdio: "ignore" });
  execFileSync("sqlite3", [dbPath, `.backup '${backupDb}'`], { stdio: "ignore" });
} catch {
  fs.copyFileSync(dbPath, backupDb);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const row = db.prepare("SELECT payload, version, updated_at, updated_by FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(row.payload));
let users = [];
try {
  users = db.prepare("SELECT * FROM users").all();
} catch {
  users = [];
}

const exportPayload = {
  exportedAt: new Date().toISOString(),
  label,
  version: row.version,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
  data,
  users,
};
fs.writeFileSync(path.join(target, "erp-state-export.json"), JSON.stringify(exportPayload));

const domainKeys = [
  "bankTransactions",
  "bankTransactionFolders",
  "bankLedgerRules",
  "bankSyncMeta",
  "companyExpenses",
  "fixedExpenses",
  "fixedExpensePayments",
  "expenseCategories",
  "fixedExpenseCategories",
  "ledgerCategories",
  "accountCodes",
  "taxInvoices",
  "paymentVouchers",
  "sales",
  "clients",
  "workers",
  "pdfArchives",
  "auditLogs",
];

const summary = {
  label,
  target,
  exportedAt: exportPayload.exportedAt,
  dbVersion: row.version,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
  dbBytes: fs.statSync(backupDb).size,
  counts: Object.fromEntries(
    domainKeys.map((key) => {
      const value = data[key];
      const count = Array.isArray(value)
        ? value.length
        : value && typeof value === "object"
          ? Object.keys(value).length
          : value
            ? 1
            : 0;
      return [key, count];
    }),
  ),
};

fs.writeFileSync(path.join(target, "domain-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
