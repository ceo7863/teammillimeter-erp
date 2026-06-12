#!/usr/bin/env node
/**
 * Standalone unpaid list query against erp.sqlite (no erpChatTools import).
 * Usage: node scripts/query-unpaid-list.mjs [startDate] [endDate]
 * Default: current month (KST-ish via server local date).
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthRangeISO(offset = 0) {
  const today = todayISO();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match) return { startDate: today, endDate: today };
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const date = new Date(year, month + offset, 1);
  const startDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  const endDateObj = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, "0")}-${String(endDateObj.getDate()).padStart(2, "0")}`;
  return { startDate, endDate };
}

function formatKRW(n) {
  return Number(n || 0).toLocaleString("ko-KR");
}

function getUnpaid(sale) {
  const amount = Number(sale.amount) || 0;
  const paid = Number(sale.paid ?? sale.basePaid ?? 0) || 0;
  return Math.max(amount - paid, 0);
}

function resolveDbPath() {
  const candidates = [
    process.env.ERP_SQLITE_PATH,
    path.resolve("data/erp.sqlite"),
    path.resolve("../data/erp.sqlite"),
    "/home/ubuntu/teammillimeter-erp/data/erp.sqlite",
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`erp.sqlite not found. Tried: ${candidates.join(", ")}`);
}

function loadSales(db) {
  const row = db.prepare("SELECT payload FROM erp_domain_state WHERE domain = 'sales'").get();
  if (!row?.payload) return [];
  try {
    const parsed = JSON.parse(row.payload);
    return Array.isArray(parsed.sales) ? parsed.sales : Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const args = process.argv.slice(2);
let startDate = args[0];
let endDate = args[1];
if (!startDate || !endDate) {
  const range = monthRangeISO(0);
  startDate = range.startDate;
  endDate = range.endDate;
}

const dbPath = resolveDbPath();
const db = new Database(dbPath, { readonly: true });
const sales = loadSales(db);

const unpaidRows = sales
  .map((sale) => ({
    id: sale.id,
    date: String(sale.date || "").slice(0, 10),
    client: String(sale.client || ""),
    site: String(sale.site || ""),
    amount: Number(sale.amount) || 0,
    paid: Number(sale.paid ?? sale.basePaid ?? 0) || 0,
    unpaid: getUnpaid(sale),
  }))
  .filter((row) => {
    if (row.unpaid <= 0) return false;
    if (startDate && row.date < startDate) return false;
    if (endDate && row.date > endDate) return false;
    return true;
  })
  .sort((a, b) => b.unpaid - a.unpaid || String(b.date).localeCompare(String(a.date)));

const totalUnpaid = unpaidRows.reduce((sum, row) => sum + row.unpaid, 0);
const maxRows = 20;

console.log(`DB: ${dbPath}`);
console.log(`Period: ${startDate}~${endDate}`);
console.log(`Total unpaid: ${formatKRW(totalUnpaid)}? (${unpaidRows.length}?)`);
for (const row of unpaidRows.slice(0, maxRows)) {
  const site = row.site ? ` / ${row.site}` : "";
  console.log(`- ${row.client}${site} (${row.date}): ${formatKRW(row.unpaid)}?`);
}
if (unpaidRows.length > maxRows) {
  console.log(`… ? ${unpaidRows.length - maxRows}?`);
}

db.close();
