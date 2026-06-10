#!/usr/bin/env node
/**
 * Restore bank classification fields (evidence, account, memo, folder, links)
 * from a backup snapshot onto the current DB, matched by transaction id then fingerprint.
 *
 * Usage:
 *   node scripts/repair-restore-bank-classification.mjs [backup-path] [--dry-run]
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { getErpState, saveErpState } from "../server/db.mjs";
import { runTaxInvoiceEvidenceAutoLink } from "../src/utils/taxInvoiceEvidenceAutoLink.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const backupPath = args[0]
  ? path.resolve(process.cwd(), args[0])
  : path.join(rootDir, "data/erp.sqlite.corrupt-2026-06-09T11-04-56-437Z");

const CLASSIFICATION_FIELDS = [
  "ledgerStatus",
  "ledgerCategoryId",
  "ledgerAccountCode",
  "ledgerMemo",
  "ledgerFixedExpenseId",
  "ledgerConfirmedAt",
  "ledgerConfirmedBy",
  "ledgerClientName",
  "linkedTaxInvoiceIds",
  "linkedTaxInvoiceId",
  "taxInvoiceAutoLinkDisabled",
  "folderId",
  "linkedSubject",
  "linkedCompanyExpenseId",
  "linkedFixedExpensePaymentId",
  "linkedPaymentVoucherId",
  "linkedWorkerMonthlyPaymentVoucherId",
  "classifiedAt",
  "memo",
];

function loadPayloadFromDb(dbPath) {
  const tmp = path.join(os.tmpdir(), `erp-restore-cls-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.sqlite`);
  fs.copyFileSync(dbPath, tmp);
  const db = new DatabaseSync(tmp, { readOnly: true });

  let data = null;
  try {
    const rows = db.prepare("SELECT domain, payload FROM erp_domain_state").all();
    if (rows.length) {
      data = {};
      for (const row of rows) {
        try {
          Object.assign(data, JSON.parse(String(row.payload)));
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // legacy blob only
  }

  if (!data) {
    const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
    if (!row) throw new Error(`No erp_state in ${dbPath}`);
    const parsed = JSON.parse(String(row.payload));
    data = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
  }

  db.close();
  fs.unlinkSync(tmp);
  return data;
}

function bankTxDedupeKey(tx) {
  return [
    String(tx?.transactionAt || "").slice(0, 19),
    String(tx?.withdrawal ?? 0),
    String(tx?.deposit ?? 0),
    String(tx?.balanceAfter ?? ""),
    String(tx?.description || "").trim(),
    String(tx?.counterpartyName || "").trim(),
    String(tx?.accountNumber || "").trim(),
  ].join("|");
}

function hasClassificationData(tx) {
  if (!tx || typeof tx !== "object") return false;
  if (String(tx.ledgerAccountCode || "").trim()) return true;
  const ids = Array.isArray(tx.linkedTaxInvoiceIds)
    ? tx.linkedTaxInvoiceIds.filter(Boolean)
    : tx.linkedTaxInvoiceId
      ? [String(tx.linkedTaxInvoiceId)]
      : [];
  if (ids.length) return true;
  if (tx.folderId) return true;
  if (String(tx.linkedSubject || "").trim()) return true;
  if (String(tx.ledgerMemo || "").trim()) return true;
  if (tx.linkedCompanyExpenseId || tx.linkedFixedExpensePaymentId) return true;
  if (tx.linkedPaymentVoucherId || tx.linkedWorkerMonthlyPaymentVoucherId) return true;
  return false;
}

function pickClassificationFields(source) {
  const picked = {};
  for (const key of CLASSIFICATION_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = source[key];
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    picked[key] = value;
  }
  return picked;
}

function countStats(txs) {
  let evidence = 0;
  let account = 0;
  for (const t of txs) {
    const ids = Array.isArray(t.linkedTaxInvoiceIds)
      ? t.linkedTaxInvoiceIds.filter(Boolean)
      : t.linkedTaxInvoiceId
        ? [String(t.linkedTaxInvoiceId)]
        : [];
    if (ids.length) evidence += 1;
    if (String(t.ledgerAccountCode || "").trim()) account += 1;
  }
  return { evidence, account };
}

const backup = loadPayloadFromDb(backupPath);
const currentState = getErpState();
const current = currentState.data || {};

const backupById = new Map((backup.bankTransactions || []).map((row) => [String(row.id), row]));
const backupByKey = new Map(
  (backup.bankTransactions || []).map((row) => [bankTxDedupeKey(row), row]),
);

let restoredFromBackup = 0;
let keptCurrent = 0;
const nextTransactions = (current.bankTransactions || []).map((row) => {
  const backupRow = backupById.get(String(row.id)) || backupByKey.get(bankTxDedupeKey(row));
  if (!backupRow || !hasClassificationData(backupRow)) {
    keptCurrent += 1;
    return row;
  }
  const patch = pickClassificationFields(backupRow);
  if (!Object.keys(patch).length) return row;
  restoredFromBackup += 1;
  return { ...row, ...patch };
});

let bankTransactions = nextTransactions;
const before = countStats(bankTransactions);

const auto = runTaxInvoiceEvidenceAutoLink({
  bankTransactions,
  taxInvoices: current.taxInvoices || [],
  clients: current.clients || [],
  workers: current.workers || [],
});
bankTransactions = auto.transactions;

const after = countStats(bankTransactions);

console.log(
  JSON.stringify(
    {
      dryRun,
      backupPath,
      backupTx: (backup.bankTransactions || []).length,
      currentTx: (current.bankTransactions || []).length,
      restoredFromBackup,
      keptCurrent,
      autoLinked: auto.linkedCount,
      before,
      after,
      currentVersion: currentState.version,
    },
    null,
    2,
  ),
);

if (!dryRun) {
  const saved = saveErpState(
    {
      ...current,
      bankTransactions,
      clients: auto.clients ?? current.clients,
    },
    currentState.version,
    "repair-restore-bank-classification",
  );

  const verify = getErpState();
  console.log(
    JSON.stringify(
      {
        savedVersion: saved.version,
        verify: countStats(verify.data?.bankTransactions || []),
      },
      null,
      2,
    ),
  );
}
