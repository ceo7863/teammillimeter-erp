import { DatabaseSync } from "node:sqlite";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dbPath = process.argv[4]
  ? path.resolve(process.argv[4])
  : path.join(root, "data/erp.sqlite");
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT version, updated_at, payload FROM erp_state WHERE id = 1").get();
const data = JSON.parse(row.payload);

function countByDate(items, field) {
  const map = new Map();
  for (const item of items) {
    const date = String(item?.[field] || "").slice(0, 10);
    if (!date) continue;
    map.set(date, (map.get(date) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

const sales = data.sales || [];
const paymentVouchers = data.paymentVouchers || [];
const taxInvoices = data.taxInvoices || [];

console.log("db", dbPath);
console.log("version", row.version, "updated", row.updated_at);
console.log("totals", { sales: sales.length, paymentVouchers: paymentVouchers.length, taxInvoices: taxInvoices.length });

const from = process.argv[2] || "2026-05-20";
const to = process.argv[3] || "2026-06-05";

console.log(`\nsales by date ${from}..${to}:`);
for (const [date, count] of countByDate(sales, "date").filter(([d]) => d >= from && d <= to)) {
  console.log(date, count);
}

console.log(`\npaymentVouchers by date ${from}..${to}:`);
for (const [date, count] of countByDate(paymentVouchers, "date").filter(([d]) => d >= from && d <= to)) {
  console.log(date, count);
}

const saleDates = sales.map((s) => String(s.date || "").slice(0, 10)).filter(Boolean).sort();
const pvDates = paymentVouchers.map((s) => String(s.date || "").slice(0, 10)).filter(Boolean).sort();
if (saleDates.length) console.log("\nsales range", saleDates[0], "~", saleDates[saleDates.length - 1]);
if (pvDates.length) console.log("pv range", pvDates[0], "~", pvDates[pvDates.length - 1]);

const afterMay25Sales = sales.filter((s) => String(s.date || "").slice(0, 10) >= "2026-05-26");
const beforeMay26Sales = sales.filter((s) => String(s.date || "").slice(0, 10) < "2026-05-26");
console.log("\nbefore 2026-05-26 sales:", beforeMay26Sales.length);
console.log("on/after 2026-05-26 sales:", afterMay25Sales.length);
