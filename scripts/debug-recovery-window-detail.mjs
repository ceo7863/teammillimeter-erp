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

const fromArg = process.argv.find((a) => a.startsWith("--from="))?.slice(7) || "2026-06-01";
const toArg = process.argv.find((a) => a.startsWith("--to="))?.slice(5) || "2026-06-08";
const curPath = process.argv.find((a) => a.endsWith(".sqlite") && !a.includes("bak")) || "data/erp.sqlite";
const bakPath = process.argv.find((a) => a.includes("bak-pre-restore")) || "data/erp.sqlite.bak-pre-restore-";

const cur = loadPayload(path.resolve(curPath));
const bak = loadPayload(path.resolve(bakPath));

function dayKey(v) {
  const m = String(v || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

const curIds = new Set((cur.taxInvoices || []).map((x) => String(x.id)));
const missingTax = (bak.taxInvoices || []).filter((x) => !curIds.has(String(x.id)));
const missingInWindow = missingTax.filter((x) => {
  const d = dayKey(x.issueDate || x.date || x.createdAt);
  return d >= fromArg && d <= toArg;
});

const curVById = new Map((cur.paymentVouchers || []).map((v) => [String(v.id), v]));
let voucherBankFix = 0;
const voucherFixSamples = [];
for (const v of bak.paymentVouchers || []) {
  const d = dayKey(v.date || v.createdAt);
  if (d < fromArg || d > toArg) continue;
  const c = curVById.get(String(v.id));
  if (!c) continue;
  const cb = String(c.bankTransactionId ?? "").trim();
  const bb = String(v.bankTransactionId ?? "").trim();
  if (!cb && bb) {
    voucherBankFix += 1;
    if (voucherFixSamples.length < 8) voucherFixSamples.push({ id: v.id, date: v.date, amount: v.amount, bank: bb });
  }
}

console.log(
  JSON.stringify(
    {
      window: { from: fromArg, to: toArg },
      missingTaxInvoicesTotal: missingTax.length,
      missingTaxInvoicesInWindow: missingInWindow.length,
      sampleMissingTaxInWindow: missingInWindow.slice(0, 5).map((x) => ({
        id: x.id,
        issueDate: x.issueDate || x.date,
        supplier: x.supplierName || x.counterparty,
        amount: x.totalAmount || x.amount,
      })),
      voucherBankLinksRestorableInWindow: voucherBankFix,
      voucherFixSamples,
    },
    null,
    2,
  ),
);
