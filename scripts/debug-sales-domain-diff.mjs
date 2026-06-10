#!/usr/bin/env node
/**
 * Compare sales domain across DB snapshots, optionally filtered by record date window.
 *
 * Usage:
 *   node scripts/debug-sales-domain-diff.mjs --from 2026-06-06 --to 2026-06-09 \
 *     data/erp.sqlite data/erp.sqlite.bak-pre-restore- data/erp.sqlite.corrupt-...
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const args = process.argv.slice(2);
const fromArg = args.find((a) => a.startsWith("--from="))?.slice(7) || "2026-06-06";
const toArg = args.find((a) => a.startsWith("--to="))?.slice(5) || "2026-06-09";
const files = args.filter((a) => !a.startsWith("--"));

function loadPayload(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
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
    const parsed = JSON.parse(String(row.payload));
    data = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
  }
  const version = db.prepare("SELECT version, updated_at FROM erp_state WHERE id = 1").get();
  db.close();
  return { data, version, label: path.basename(dbPath) };
}

function dayKey(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function inWindow(day, from, to) {
  if (!day) return false;
  return day >= from && day <= to;
}

function rowDay(row, keys) {
  for (const key of keys) {
    const d = dayKey(row[key]);
    if (d) return d;
  }
  return "";
}

function indexRows(rows, dateKeys) {
  const all = new Map();
  const inRange = new Map();
  for (const row of rows || []) {
    const id = String(row.id ?? "");
    if (!id) continue;
    all.set(id, row);
    const day = rowDay(row, dateKeys);
    if (inWindow(day, fromArg, toArg)) inRange.set(id, row);
  }
  return { all, inRange };
}

function diffSets(baseMap, otherMap) {
  const missingInBase = [];
  const onlyInBase = [];
  const shared = [];
  for (const [id, row] of otherMap) {
    if (!baseMap.has(id)) missingInBase.push({ id, row });
    else shared.push({ id, base: baseMap.get(id), other: row });
  }
  for (const id of baseMap.keys()) {
    if (!otherMap.has(id)) onlyInBase.push(id);
  }
  return { missingInBase, onlyInBase, shared };
}

function voucherWeakness(current, other) {
  const issues = [];
  const cb = String(current.bankTransactionId ?? "").trim();
  const ob = String(other.bankTransactionId ?? "").trim();
  if (!cb && ob) issues.push("bankTransactionId");
  const ca = Number(current.amount) || 0;
  const oa = Number(other.amount) || 0;
  if (ca <= 0 && oa > 0) issues.push("amount");
  const cp = Number(current.paidAmount) || 0;
  const op = Number(other.paidAmount) || 0;
  if (cp <= 0 && op > 0) issues.push("paidAmount");
  if (!String(current.date || "").trim() && String(other.date || "").trim()) issues.push("date");
  if (!String(current.salesId ?? "").trim() && String(other.salesId ?? "").trim()) issues.push("salesId");
  return issues;
}

if (!files.length) {
  console.error("Usage: node scripts/debug-sales-domain-diff.mjs [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] <db...>");
  process.exit(1);
}

const snapshots = files.map(loadPayload);
const current = snapshots[0];

const saleDateKeys = ["date", "saleDate", "createdAt", "updatedAt"];
const voucherDateKeys = ["date", "createdAt", "updatedAt"];

const currentSales = indexRows(current.data.sales, saleDateKeys);
const currentVouchers = indexRows(current.data.paymentVouchers, voucherDateKeys);

console.log(
  JSON.stringify(
    {
      window: { from: fromArg, to: toArg },
      current: {
        file: current.label,
        version: current.version?.version,
        updatedAt: current.version?.updated_at,
        salesTotal: (current.data.sales || []).length,
        salesInWindow: currentSales.inRange.size,
        vouchersTotal: (current.data.paymentVouchers || []).length,
        vouchersInWindow: currentVouchers.inRange.size,
      },
      comparisons: [],
    },
    null,
    0,
  ).slice(0, -2),
);

for (let i = 1; i < snapshots.length; i += 1) {
  const snap = snapshots[i];
  const sales = indexRows(snap.data.sales, saleDateKeys);
  const vouchers = indexRows(snap.data.paymentVouchers, voucherDateKeys);

  const salesDiffAll = diffSets(currentSales.all, sales.all);
  const salesDiffWindow = diffSets(currentSales.inRange, sales.inRange);
  const voucherDiffAll = diffSets(currentVouchers.all, vouchers.all);
  const voucherDiffWindow = diffSets(currentVouchers.inRange, vouchers.inRange);

  const weakVouchers = [];
  for (const { id, base, other } of voucherDiffAll.shared) {
    const issues = voucherWeakness(base, other);
    if (issues.length) weakVouchers.push({ id, issues, date: other.date, amount: other.amount, bank: other.bankTransactionId });
  }

  const block = {
    file: snap.label,
    version: snap.version?.version,
    updatedAt: snap.version?.updated_at,
    salesTotal: (snap.data.sales || []).length,
    salesInWindow: sales.inRange.size,
    vouchersTotal: (snap.data.paymentVouchers || []).length,
    vouchersInWindow: vouchers.inRange.size,
    missingFromCurrent: {
      salesAll: salesDiffAll.missingInBase.length,
      salesInWindow: salesDiffWindow.missingInBase.length,
      vouchersAll: voucherDiffAll.missingInBase.length,
      vouchersInWindow: voucherDiffWindow.missingInBase.length,
      paymentInputLogs: Math.max(
        0,
        (snap.data.paymentInputLogs || []).filter(
          (log) => !new Set((current.data.paymentInputLogs || []).map((x) => String(x.id))).has(String(log.id)),
        ).length,
      ),
    },
    onlyInCurrent: {
      salesAll: salesDiffAll.onlyInBase.length,
      vouchersAll: voucherDiffAll.onlyInBase.length,
    },
    weakVouchersInCurrent: weakVouchers.length,
    sampleMissingVouchersInWindow: voucherDiffWindow.missingInBase.slice(0, 5).map(({ id, row }) => ({
      id,
      date: row.date,
      amount: row.amount,
      salesId: row.salesId,
      bankTransactionId: row.bankTransactionId,
    })),
    sampleWeakVouchers: weakVouchers.slice(0, 5),
  };
  console.log("," + JSON.stringify(block, null, 2).slice(1, -1));
}

console.log("]}");
