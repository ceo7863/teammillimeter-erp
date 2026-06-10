#!/usr/bin/env node
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { ERP_DOMAIN_FIELDS } from "../server/erpDomains.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFullData(sourcePath) {
  if (sourcePath.endsWith(".json")) {
    const raw = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    return { label: path.basename(sourcePath), data: raw.data || raw };
  }
  const tmp = path.join(os.tmpdir(), `erp-full-${Date.now()}.sqlite`);
  fs.copyFileSync(sourcePath, tmp);
  const db = new DatabaseSync(tmp, { readOnly: true });
  let data = {};
  try {
    for (const row of db.prepare("SELECT domain, payload FROM erp_domain_state").all()) {
      Object.assign(data, JSON.parse(String(row.payload)));
    }
  } catch {}
  const blobRow = db.prepare("SELECT payload FROM erp_state WHERE id=1").get();
  if (blobRow) {
    const parsed = JSON.parse(String(blobRow.payload));
    const blob = parsed.data || parsed;
    for (const [k, v] of Object.entries(blob)) {
      if (data[k] === undefined) data[k] = v;
    }
  }
  db.close();
  fs.unlinkSync(tmp);
  return { label: path.basename(sourcePath), data };
}

function allFields() {
  const fields = new Set();
  for (const list of Object.values(ERP_DOMAIN_FIELDS)) {
    for (const f of list) fields.add(f);
  }
  return [...fields].sort();
}

function counts(data) {
  const out = {};
  for (const key of allFields()) {
    const v = data[key];
    out[key] = Array.isArray(v) ? v.length : v && typeof v === "object" ? 1 : 0;
  }
  if (Array.isArray(data.paymentVouchers)) {
    out._vouchersWithBank = data.paymentVouchers.filter((v) => String(v.bankTransactionId ?? "").trim()).length;
  }
  if (Array.isArray(data.bankTransactions)) {
    out._bankEvidence = data.bankTransactions.filter((tx) => (tx.linkedTaxInvoiceIds || []).length || tx.linkedTaxInvoiceId).length;
    out._bankAccount = data.bankTransactions.filter((tx) => tx.ledgerAccountCode).length;
    out._workerMonthlyLinks = data.bankTransactions.filter((tx) => tx.linkedWorkerMonthlyPaymentVoucherId).length;
  }
  return out;
}

function missing(curRows, otherRows) {
  if (!Array.isArray(otherRows)) return 0;
  const s = new Set((Array.isArray(curRows) ? curRows : []).map((r) => String(r.id)));
  return otherRows.filter((r) => r.id != null && !s.has(String(r.id))).length;
}

const files = process.argv.slice(2);
const loaded = files.map((f) => loadFullData(path.resolve(f)));
const current = loaded[0];

console.log(
  JSON.stringify(
    {
      current: { file: current.label, counts: counts(current.data) },
      sources: loaded.slice(1).map((src) => {
        const miss = {};
        for (const key of allFields()) {
          const n = missing(current.data[key], src.data[key]);
          if (n) miss[key] = n;
        }
        return { file: src.label, counts: counts(src.data), missingFromCurrent: miss };
      }),
    },
    null,
    2,
  ),
);
