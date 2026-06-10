#!/usr/bin/env node
/**
 * Merge sales domain from multiple backup DBs within a date window.
 * Adds missing rows; upgrades current rows when backup has stronger payment fields.
 *
 * Usage:
 *   node scripts/repair-restore-sales-window.mjs --from=2026-06-06 --to=2026-06-09 \
 *     data/erp.sqlite.corrupt-2026-06-09T11-04-56-437Z data/backups/erp-2026-06-09.sqlite \
 *     [--dry-run]
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
const fromArg = argv.find((a) => a.startsWith("--from="))?.slice(7) || "2026-06-06";
const toArg = argv.find((a) => a.startsWith("--to="))?.slice(5) || "2026-06-09";
const backupPaths = argv.filter((a) => !a.startsWith("--")).map((p) => path.resolve(process.cwd(), p));

const SALES_KEYS = ["sales", "paymentVouchers", "paymentInputLogs", "saleComments"];

function loadBackupPayload(dbPath) {
  const tmp = path.join(os.tmpdir(), `erp-restore-window-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
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
    // legacy
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
  return { version, data, label: path.basename(dbPath) };
}

function dayKey(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function inWindow(row, keys) {
  for (const key of keys) {
    const day = dayKey(row[key]);
    if (day && day >= fromArg && day <= toArg) return true;
  }
  return false;
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
  if (!String(current.date || "").trim() && String(backup.date || "").trim()) return true;
  if (!String(current.salesId ?? "").trim() && String(backup.salesId ?? "").trim()) return true;
  return false;
}

function isSaleWeaker(current, backup) {
  if (!backup) return false;
  if (!current) return true;
  const curPaid = Number(current.paidAmount) || 0;
  const bakPaid = Number(backup.paidAmount) || 0;
  if (curPaid <= 0 && bakPaid > 0) return true;
  if (!String(current.date || "").trim() && String(backup.date || "").trim()) return true;
  return false;
}

function mergeFromBackup(currentRows, backupRows, options) {
  const current = Array.isArray(currentRows) ? [...currentRows] : [];
  const byId = new Map(current.map((row) => [String(row.id), row]));
  let added = 0;
  let upgraded = 0;

  for (const row of backupRows || []) {
    const id = String(row.id ?? "");
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      if (options.allowAdd(row)) {
        current.push(row);
        byId.set(id, row);
        added += 1;
      }
      continue;
    }
    if (options.isWeaker(existing, row)) {
      const merged = { ...existing, ...row, id: existing.id };
      byId.set(id, merged);
      const idx = current.findIndex((x) => String(x.id) === id);
      if (idx >= 0) current[idx] = merged;
      upgraded += 1;
    }
  }

  return { merged: current, added, upgraded };
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

if (!backupPaths.length) {
  console.error("Usage: node scripts/repair-restore-sales-window.mjs [--from=] [--to=] <backup...> [--dry-run]");
  process.exit(1);
}

getDb();
const currentState = getErpState();
let nextData = { ...currentState.data };
const summary = {
  dryRun,
  window: { from: fromArg, to: toArg },
  currentVersion: currentState.version,
  before: {
    sales: (nextData.sales || []).length,
    paymentVouchers: (nextData.paymentVouchers || []).length,
    paymentInputLogs: (nextData.paymentInputLogs || []).length,
  },
  sources: [],
  after: {},
  bankRelinked: 0,
};

for (const backupPath of backupPaths) {
  const backup = loadBackupPayload(backupPath);
  const sourceSummary = { file: backup.label, backupVersion: backup.version, added: {}, upgraded: {} };

  const salesResult = mergeFromBackup(nextData.sales, backup.data.sales, {
    allowAdd: (row) => inWindow(row, ["date", "saleDate", "createdAt", "updatedAt"]),
    isWeaker: isSaleWeaker,
  });
  nextData.sales = salesResult.merged;
  sourceSummary.added.sales = salesResult.added;
  sourceSummary.upgraded.sales = salesResult.upgraded;

  const voucherResult = mergeFromBackup(nextData.paymentVouchers, backup.data.paymentVouchers, {
    allowAdd: (row) => inWindow(row, ["date", "createdAt", "updatedAt"]),
    isWeaker: isVoucherWeaker,
  });
  nextData.paymentVouchers = voucherResult.merged;
  sourceSummary.added.paymentVouchers = voucherResult.added;
  sourceSummary.upgraded.paymentVouchers = voucherResult.upgraded;

  const logResult = mergeFromBackup(nextData.paymentInputLogs, backup.data.paymentInputLogs, {
    allowAdd: () => true,
    isWeaker: () => false,
  });
  nextData.paymentInputLogs = logResult.merged;
  sourceSummary.added.paymentInputLogs = logResult.added;

  const commentResult = mergeFromBackup(nextData.saleComments, backup.data.saleComments, {
    allowAdd: () => true,
    isWeaker: () => false,
  });
  nextData.saleComments = commentResult.merged;
  sourceSummary.added.saleComments = commentResult.added;

  summary.sources.push(sourceSummary);
}

const bankRelink = relinkBankTransactions(nextData.bankTransactions, nextData.paymentVouchers || []);
nextData.bankTransactions = bankRelink.transactions;
summary.bankRelinked = bankRelink.relinked;

summary.after = {
  sales: (nextData.sales || []).length,
  paymentVouchers: (nextData.paymentVouchers || []).length,
  paymentInputLogs: (nextData.paymentInputLogs || []).length,
  saleComments: (nextData.saleComments || []).length,
  vouchersWithBank: (nextData.paymentVouchers || []).filter((v) => String(v.bankTransactionId ?? "").trim()).length,
};

console.log(JSON.stringify(summary, null, 2));

if (!dryRun) {
  const saved = saveErpState(nextData, currentState.version, "repair-restore-sales-window");
  console.log(JSON.stringify({ ok: true, newVersion: saved.version }));
}
