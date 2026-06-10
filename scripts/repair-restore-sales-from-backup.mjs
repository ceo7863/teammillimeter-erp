#!/usr/bin/env node
/**
 * Restore sales domain (sales + paymentVouchers + paymentInputLogs + saleComments)
 * from backup onto current DB. Adds missing rows by id; for overlapping ids prefers
 * backup when current row looks empty/stale on key payment fields.
 *
 * Usage:
 *   node scripts/repair-restore-sales-from-backup.mjs [backup-path] [--dry-run]
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
  : path.join(rootDir, "data/erp.sqlite.bak-pre-restore-");

const SALES_DOMAIN_KEYS = ["sales", "paymentVouchers", "paymentInputLogs", "saleComments"];

function loadBackupPayload(dbPath) {
  const tmp = path.join(os.tmpdir(), `erp-restore-sales-${Date.now()}.sqlite`);
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
    // legacy blob
  }

  if (!data) {
    const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
    if (!row) throw new Error(`No erp_state in ${dbPath}`);
    const parsed = JSON.parse(String(row.payload));
    data = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
  }

  const version = db.prepare("SELECT version FROM erp_state WHERE id = 1").get()?.version;
  db.close();
  fs.unlinkSync(tmp);
  return { version, data };
}

function isVoucherWeaker(current, backup) {
  if (!backup) return false;
  if (!current) return true;
  const curBank = String(current.bankTransactionId ?? "").trim();
  const bakBank = String(backup.bankTransactionId ?? "").trim();
  if (!curBank && bakBank) return true;
  const curAmount = Number(current.amount) || 0;
  const bakAmount = Number(backup.amount) || 0;
  if (curAmount <= 0 && bakAmount > 0) return true;
  const curPaid = Number(current.paidAmount) || 0;
  const bakPaid = Number(backup.paidAmount) || 0;
  if (curPaid <= 0 && bakPaid > 0) return true;
  return false;
}

function isSaleWeaker(current, backup) {
  if (!backup) return false;
  if (!current) return true;
  const curPaid = Number(current.paidAmount) || 0;
  const bakPaid = Number(current.paidAmount) || 0;
  if (curPaid <= 0 && bakPaid > 0) return true;
  const curBill = String(current.billingStatus || "").trim();
  const bakBill = String(backup.billingStatus || "").trim();
  if (!curBill && bakBill) return true;
  const curPay = String(current.paymentStatus || "").trim();
  const bakPay = String(backup.paymentStatus || "").trim();
  if (!curPay && bakPay) return true;
  return false;
}

function mergeRows(currentRows, backupRows, options) {
  const current = Array.isArray(currentRows) ? currentRows : [];
  const backup = Array.isArray(backupRows) ? backupRows : [];
  const currentById = new Map(current.map((row) => [String(row.id), row]));
  const backupById = new Map(backup.map((row) => [String(row.id), row]));
  const seen = new Set();
  const merged = [];
  let added = 0;
  let upgraded = 0;

  for (const row of current) {
    const id = String(row.id);
    seen.add(id);
    const backupRow = backupById.get(id);
    if (backupRow && options.isWeaker(row, backupRow)) {
      merged.push({ ...row, ...backupRow, id: row.id });
      upgraded += 1;
    } else {
      merged.push(row);
    }
  }

  for (const row of backup) {
    const id = String(row.id);
    if (!id || seen.has(id)) continue;
    merged.push(row);
    added += 1;
    seen.add(id);
  }

  return { merged, added, upgraded };
}

function relinkBankTransactions(bankTransactions, paymentVouchers) {
  const voucherByBankId = new Map(
    paymentVouchers
      .filter((v) => v.bankTransactionId != null && String(v.bankTransactionId) !== "")
      .map((v) => [String(v.bankTransactionId), v]),
  );
  let relinked = 0;
  const next = (bankTransactions || []).map((tx) => {
    if (tx.linkedPaymentVoucherId) return tx;
    const voucher = voucherByBankId.get(String(tx.id));
    if (!voucher) return tx;
    relinked += 1;
    return {
      ...tx,
      linkedPaymentVoucherId: voucher.id,
      matchAutoLinked: tx.matchAutoLinked ?? true,
      matchConfirmedAt: tx.matchConfirmedAt || voucher.createdAt || tx.classifiedAt,
    };
  });
  return { transactions: next, relinked };
}

getDb();
const currentState = getErpState();
const current = currentState.data || {};
const backup = loadBackupPayload(backupPath);

const summary = {
  dryRun,
  backupPath,
  backupVersion: backup.version,
  currentVersion: currentState.version,
  before: {},
  after: {},
  added: {},
  upgraded: {},
  bankRelinked: 0,
};

const nextData = { ...current };

for (const key of SALES_DOMAIN_KEYS) {
  summary.before[key] = Array.isArray(current[key]) ? current[key].length : 0;
  const isWeaker =
    key === "paymentVouchers"
      ? isVoucherWeaker
      : key === "sales"
        ? isSaleWeaker
        : () => false;
  const { merged, added, upgraded } = mergeRows(current[key], backup.data[key], { isWeaker });
  nextData[key] = merged;
  summary.added[key] = added;
  summary.upgraded[key] = upgraded;
  summary.after[key] = merged.length;
}

const bankRelink = relinkBankTransactions(current.bankTransactions, nextData.paymentVouchers || []);
nextData.bankTransactions = bankRelink.transactions;
summary.bankRelinked = bankRelink.relinked;

console.log(JSON.stringify(summary, null, 2));

if (!dryRun) {
  const saved = saveErpState(nextData, currentState.version, "repair-restore-sales-from-backup");
  const verify = getErpState();
  console.log(
    JSON.stringify(
      {
        ok: true,
        newVersion: saved.version,
        verify: {
          sales: (verify.data?.sales || []).length,
          paymentVouchers: (verify.data?.paymentVouchers || []).length,
          paymentInputLogs: (verify.data?.paymentInputLogs || []).length,
        },
      },
      null,
      2,
    ),
  );
}
