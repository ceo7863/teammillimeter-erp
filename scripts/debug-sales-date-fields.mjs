#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

function loadPayload(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  let data = null;
  try {
    const rows = db.prepare("SELECT domain, payload FROM erp_domain_state").all();
    if (rows.length) {
      data = {};
      for (const row of rows) Object.assign(data, JSON.parse(String(row.payload)));
    }
  } catch {}
  if (!data) {
    const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
    const parsed = JSON.parse(String(row.payload));
    data = parsed.data || parsed;
  }
  db.close();
  return data;
}

const file = process.argv[2] || "data/erp.sqlite";
const data = loadPayload(path.resolve(file));

function sampleDates(rows, n = 5) {
  return (rows || []).slice(0, n).map((r) => ({
    id: r.id,
    date: r.date,
    saleDate: r.saleDate,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    amount: r.amount,
    bankTransactionId: r.bankTransactionId,
  }));
}

function dateHistogram(rows, keys) {
  const hist = {};
  for (const row of rows || []) {
    let day = "";
    for (const k of keys) {
      const s = String(row[k] || "");
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) {
        day = m[1];
        break;
      }
    }
    if (!day) day = "(none)";
    hist[day] = (hist[day] || 0) + 1;
  }
  return Object.entries(hist)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-15);
}

console.log(
  JSON.stringify(
    {
      file,
      saleSamples: sampleDates(data.sales),
      voucherSamples: sampleDates(data.paymentVouchers),
      saleDateHist: dateHistogram(data.sales, ["date", "saleDate", "createdAt"]),
      voucherDateHist: dateHistogram(data.paymentVouchers, ["date", "createdAt"]),
      bankTxDateHist: dateHistogram(data.bankTransactions, ["date", "transactionDate", "datetime"]),
    },
    null,
    2,
  ),
);
