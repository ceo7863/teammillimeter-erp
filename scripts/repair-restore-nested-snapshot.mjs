#!/usr/bin/env node
/** Restore flat ERP payload from a nested snapshot ({ data: {...}, version }). */
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
const dbPath = args[0]
  ? path.resolve(process.cwd(), args[0])
  : path.join(rootDir, "data/erp.sqlite.bak-pre-restore-");

function loadPayload(dbPath) {
  const tmp = path.join(os.tmpdir(), `erp-nested-restore-${Date.now()}.sqlite`);
  fs.copyFileSync(dbPath, tmp);
  const db = new DatabaseSync(tmp, { readOnly: true });
  const row = db.prepare("SELECT version, payload FROM erp_state WHERE id = 1").get();
  db.close();
  fs.unlinkSync(tmp);
  if (!row) throw new Error(`No erp_state in ${dbPath}`);
  const parsed = JSON.parse(row.payload);
  if (parsed?.data && typeof parsed.data === "object" && Array.isArray(parsed.data.bankTransactions)) {
    return { fileVersion: row.version, data: parsed.data };
  }
  if (Array.isArray(parsed.bankTransactions)) {
    return { fileVersion: row.version, data: parsed };
  }
  throw new Error("Unrecognized ERP payload shape");
}

getDb();
const current = getErpState();
const source = loadPayload(dbPath);

const summary = {
  dryRun,
  dbPath,
  sourceFileVersion: source.fileVersion,
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
  "workerMonthlyActualVouchers",
  "clientSiteRequests",
]) {
  summary.before[key] = Array.isArray(current.data[key]) ? current.data[key].length : 0;
  summary.after[key] = Array.isArray(source.data[key]) ? source.data[key].length : 0;
}

const restored = {
  ...source.data,
  clientSiteRequests: current.data.clientSiteRequests?.length
    ? current.data.clientSiteRequests
    : source.data.clientSiteRequests || [],
  clientContracts: current.data.clientContracts?.length
    ? current.data.clientContracts
    : source.data.clientContracts || [],
};

summary.after.clientSiteRequests = Array.isArray(restored.clientSiteRequests)
  ? restored.clientSiteRequests.length
  : 0;

console.log(JSON.stringify(summary, null, 2));

if (dryRun) process.exit(0);

const saved = saveErpState(restored, current.version, "repair-restore-nested-snapshot");
console.log(JSON.stringify({ ok: true, newVersion: saved.version }));
