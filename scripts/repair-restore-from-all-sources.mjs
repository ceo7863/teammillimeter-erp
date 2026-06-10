#!/usr/bin/env node
/**
 * Merge missing ERP records from multiple sources (sqlite + json export).
 * Uses saveErpState � never raw payload UPDATE.
 *
 * Usage:
 *   node scripts/repair-restore-from-all-sources.mjs [--dry-run] <source...>
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { getDb, getErpState, saveErpState } from "../server/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const sourcePaths = argv.filter((a) => !a.startsWith("--")).map((p) => path.resolve(process.cwd(), p));

const MERGE_KEYS = [
  "sales",
  "paymentVouchers",
  "paymentInputLogs",
  "saleComments",
  "taxInvoices",
  "bankTransactions",
  "bankTransactionFolders",
  "bankLedgerRules",
  "statementFolders",
  "statementGenerationLogs",
  "clients",
  "clientContracts",
  "clientSiteRequests",
  "workers",
  "workerMonthlyActualVouchers",
  "workerMonthlyPaymentMemos",
  "workerPayoutVouchers",
  "workerPayWithVatLearnRules",
  "workerPaymentRecords",
  "workerPortalStatementAcks",
  "companyExpenses",
  "fixedExpenses",
  "fixedExpensePayments",
  "expenseCategories",
  "fixedExpenseCategories",
  "ledgerCategories",
  "accountCodes",
  "attendanceRecords",
  "companyNotices",
  "workPosts",
  "scSchedules",
  "workerMonthlyPayments",
  "workerMonthlyPaymentVouchers",
  "pdfArchives",
];

const BANK_CLASS_FIELDS = [
  "ledgerAccountCode",
  "ledgerStatus",
  "ledgerCategoryId",
  "ledgerMemo",
  "linkedTaxInvoiceIds",
  "linkedTaxInvoiceId",
  "folderId",
  "linkedSubject",
  "linkedPaymentVoucherId",
  "linkedWorkerMonthlyPaymentVoucherId",
  "memo",
];

function loadSource(sourcePath) {
  if (sourcePath.endsWith(".json")) {
    const raw = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    return { label: path.basename(sourcePath), data: raw.data || raw };
  }
  const tmp = path.join(os.tmpdir(), `erp-merge-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  fs.copyFileSync(sourcePath, tmp);
  const db = new DatabaseSync(tmp, { readOnly: true });
  let data = {};
  try {
    const rows = db.prepare("SELECT domain, payload FROM erp_domain_state").all();
    for (const row of rows) Object.assign(data, JSON.parse(String(row.payload)));
  } catch {}
  const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
  if (row) {
    const parsed = JSON.parse(String(row.payload));
    const blob = parsed.data || parsed;
    for (const [k, v] of Object.entries(blob)) {
      if (data[k] === undefined) data[k] = v;
    }
  }
  if (!Object.keys(data).length) throw new Error(`No erp_state in ${sourcePath}`);
  db.close();
  fs.unlinkSync(tmp);
  return { label: path.basename(sourcePath), data };
}

function mergeMissingByWorker(currentRows, incomingRows) {
  const incoming = Array.isArray(incomingRows) ? incomingRows : [];
  const current = Array.isArray(currentRows) ? [...currentRows] : [];
  const byWorker = new Set(current.map((row) => String(row.worker || "").trim()).filter(Boolean));
  let added = 0;
  for (const row of incoming) {
    const worker = String(row.worker || "").trim();
    if (!worker || byWorker.has(worker)) continue;
    current.push(row);
    byWorker.add(worker);
    added += 1;
  }
  return { merged: current, added };
}

function mergeMissingById(currentRows, incomingRows) {
  const incoming = Array.isArray(incomingRows) ? incomingRows : [];
  const current = Array.isArray(currentRows) ? [...currentRows] : [];
  const byId = new Map(current.map((row) => [String(row.id), row]));
  let added = 0;
  for (const row of incoming) {
    const id = String(row.id ?? "");
    if (!id || byId.has(id)) continue;
    current.push(row);
    byId.set(id, row);
    added += 1;
  }
  return { merged: current, added };
}

function mergeBankUpgrade(currentRows, incomingRows) {
  const current = Array.isArray(currentRows) ? [...currentRows] : [];
  const byId = new Map(current.map((row) => [String(row.id), row]));
  let upgraded = 0;
  for (const row of incomingRows || []) {
    const id = String(row.id ?? "");
    const existing = byId.get(id);
    if (!existing) continue;
    const patch = {};
    for (const field of BANK_CLASS_FIELDS) {
      const curVal = existing[field];
      const incVal = row[field];
      const curEmpty =
        curVal == null ||
        curVal === "" ||
        (Array.isArray(curVal) && curVal.length === 0);
      const incPresent =
        incVal != null &&
        incVal !== "" &&
        !(Array.isArray(incVal) && incVal.length === 0);
      if (curEmpty && incPresent) patch[field] = incVal;
    }
    if (Object.keys(patch).length) {
      const merged = { ...existing, ...patch };
      byId.set(id, merged);
      const idx = current.findIndex((x) => String(x.id) === id);
      if (idx >= 0) current[idx] = merged;
      upgraded += 1;
    }
  }
  return { merged: current, upgraded };
}

function mergeVoucherUpgrade(currentRows, incomingRows) {
  const current = Array.isArray(currentRows) ? [...currentRows] : [];
  const byId = new Map(current.map((row) => [String(row.id), row]));
  let upgraded = 0;
  for (const row of incomingRows || []) {
    const id = String(row.id ?? "");
    const existing = byId.get(id);
    if (!existing) continue;
    const curBank = String(existing.bankTransactionId ?? "").trim();
    const incBank = String(row.bankTransactionId ?? "").trim();
    const curAmt = Number(existing.amount) || 0;
    const incAmt = Number(row.amount) || 0;
    const patch = {};
    if (!curBank && incBank) patch.bankTransactionId = row.bankTransactionId;
    if (curAmt <= 0 && incAmt > 0) patch.amount = row.amount;
    if (!String(existing.date || "").trim() && String(row.date || "").trim()) patch.date = row.date;
    if (Object.keys(patch).length) {
      const merged = { ...existing, ...patch };
      byId.set(id, merged);
      const idx = current.findIndex((x) => String(x.id) === id);
      if (idx >= 0) current[idx] = merged;
      upgraded += 1;
    }
  }
  return { merged: current, upgraded };
}

if (!sourcePaths.length) {
  console.error("Usage: node scripts/repair-restore-from-all-sources.mjs [--dry-run] <source...>");
  process.exit(1);
}

getDb();
const currentState = getErpState();
let nextData = { ...currentState.data };
const summary = {
  dryRun,
  currentVersion: currentState.version,
  before: Object.fromEntries(MERGE_KEYS.map((k) => [k, Array.isArray(nextData[k]) ? nextData[k].length : 0])),
  sources: [],
  after: {},
};

for (const sourcePath of sourcePaths) {
  const source = loadSource(sourcePath);
  const srcSummary = { file: source.label, added: {}, upgraded: {} };

  for (const key of MERGE_KEYS) {
    if (key === "bankTransactions") continue;
    if (!Array.isArray(source.data[key]) && !Array.isArray(nextData[key])) continue;
    if (key === "paymentVouchers") {
      const missing = mergeMissingById(nextData[key], source.data[key]);
      const upgraded = mergeVoucherUpgrade(missing.merged, source.data[key]);
      nextData[key] = upgraded.merged;
      srcSummary.added[key] = missing.added;
      srcSummary.upgraded[key] = upgraded.upgraded;
      continue;
    }
    if (key === "workerPayWithVatLearnRules") {
      const { merged, added } = mergeMissingByWorker(nextData[key], source.data[key]);
      nextData[key] = merged;
      srcSummary.added[key] = added;
      continue;
    }
    const { merged, added } = mergeMissingById(nextData[key], source.data[key]);
    nextData[key] = merged;
    srcSummary.added[key] = added;
  }

  const bankMissing = mergeMissingById(nextData.bankTransactions, source.data.bankTransactions);
  const bankUpgraded = mergeBankUpgrade(bankMissing.merged, source.data.bankTransactions);
  nextData.bankTransactions = bankUpgraded.merged;
  srcSummary.added.bankTransactions = bankMissing.added;
  srcSummary.upgraded.bankTransactions = bankUpgraded.upgraded;

  summary.sources.push(srcSummary);
}

summary.after = Object.fromEntries(MERGE_KEYS.map((k) => [k, Array.isArray(nextData[k]) ? nextData[k].length : 0]));
summary.after.vouchersWithBank = (nextData.paymentVouchers || []).filter((v) => String(v.bankTransactionId ?? "").trim()).length;
summary.after.bankEvidence = (nextData.bankTransactions || []).filter(
  (tx) => (tx.linkedTaxInvoiceIds || []).length || tx.linkedTaxInvoiceId,
).length;
summary.after.bankAccount = (nextData.bankTransactions || []).filter((tx) => tx.ledgerAccountCode).length;
summary.after.workerMonthlyLinks = (nextData.bankTransactions || []).filter(
  (tx) => tx.linkedWorkerMonthlyPaymentVoucherId,
).length;
summary.after.workerMonthlyActualVouchers = (nextData.workerMonthlyActualVouchers || []).length;

console.log(JSON.stringify(summary, null, 2));

if (!dryRun) {
  const saved = saveErpState(nextData, currentState.version, "repair-restore-from-all-sources");
  console.log(JSON.stringify({ ok: true, newVersion: saved.version }));
}
