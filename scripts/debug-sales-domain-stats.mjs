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
  return { data, version };
}

function voucherStats(vouchers = []) {
  let withBank = 0;
  let partial = 0;
  for (const v of vouchers) {
    if (v.bankTransactionId != null && String(v.bankTransactionId) !== "") withBank += 1;
    if (v.isPartialPayment) partial += 1;
  }
  return { total: vouchers.length, withBank, partial };
}

function saleStats(sales = []) {
  let billed = 0;
  let paid = 0;
  for (const s of sales) {
    if (String(s.billingStatus || "").trim()) billed += 1;
    if (String(s.paymentStatus || "").trim() === "paid" || Number(s.paidAmount) > 0) paid += 1;
  }
  return { total: sales.length, billed, paid };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node scripts/debug-sales-domain-stats.mjs <db-path>...");
  process.exit(1);
}

for (const file of files) {
  const { data, version } = loadPayload(path.resolve(file));
  console.log(
    JSON.stringify(
      {
        file,
        version: version?.version ?? null,
        updatedAt: version?.updated_at ?? null,
        sales: saleStats(data.sales || []),
        paymentVouchers: voucherStats(data.paymentVouchers || []),
        paymentInputLogs: (data.paymentInputLogs || []).length,
        saleComments: (data.saleComments || []).length,
      },
      null,
      2,
    ),
  );
}
