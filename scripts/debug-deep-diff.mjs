#!/usr/bin/env node
/**
 * Deep diff: every array domain + nested counts, finds any missing IDs from sources.
 */
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const KEYS = [
  "sales", "paymentVouchers", "paymentInputLogs", "saleComments", "taxInvoices",
  "bankTransactions", "statementFolders", "clients", "workers", "companyExpenses",
  "fixedExpenses", "fixedExpensePayments", "workerMonthlyPayments",
  "workerMonthlyPaymentVouchers", "workerPaymentVouchers", "boards", "boardPosts",
  "clientContracts", "clientBusinessRegs", "notificationSettings", "accountCodes",
  "companyProfile", "scScheduleAlimtalkRecipientPrefs",
];

function load(pathOrJson) {
  const abs = path.resolve(pathOrJson);
  if (abs.endsWith(".json")) {
    const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
    return { label: path.basename(abs), data: raw.data || raw };
  }
  const db = new DatabaseSync(abs, { readOnly: true });
  let data = {};
  try {
    for (const r of db.prepare("SELECT domain, payload FROM erp_domain_state").all()) {
      Object.assign(data, JSON.parse(String(r.payload)));
    }
  } catch {}
  if (!Object.keys(data).length) {
    const row = db.prepare("SELECT payload FROM erp_state WHERE id=1").get();
    if (row) {
      const p = JSON.parse(String(row.payload));
      data = p.data || p;
    }
  }
  const blob = db.prepare("SELECT payload FROM erp_state WHERE id=1").get();
  let blobData = null;
  if (blob) {
    const p = JSON.parse(String(blob.payload));
    blobData = p.data || p;
  }
  let domains = [];
  try {
    domains = db.prepare("SELECT domain, length(payload) len FROM erp_domain_state ORDER BY domain").all();
  } catch {
    // legacy single-blob DB
  }
  db.close();
  return { label: path.basename(abs), data, blobData, domains };
}

function countRows(data, key) {
  const v = data?.[key];
  return Array.isArray(v) ? v.length : v ? 1 : 0;
}

function missingIds(cur, other) {
  const s = new Set((cur || []).map((r) => String(r.id)));
  return (other || []).filter((r) => r.id != null && !s.has(String(r.id)));
}

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error("Usage: node scripts/debug-deep-diff.mjs <current> <source...>");
  process.exit(1);
}

const loaded = files.map(load);
const current = loaded[0];

const report = {
  current: {
    file: current.label,
    domainRows: current.domains,
    counts: Object.fromEntries(KEYS.map((k) => [k, countRows(current.data, k)])),
    blobCounts: current.blobData
      ? Object.fromEntries(KEYS.map((k) => [k, countRows(current.blobData, k)]))
      : null,
  },
  gaps: [],
};

for (const src of loaded.slice(1)) {
  const gap = {
    file: src.label,
    domainRows: src.domains,
    missingFromCurrent: {},
    onlyInCurrent: {},
    samples: {},
  };
  for (const key of KEYS) {
    const miss = missingIds(current.data[key], src.data[key]);
    const only = missingIds(src.data[key], current.data[key]);
    if (miss.length) {
      gap.missingFromCurrent[key] = miss.length;
      gap.samples[key] = miss.slice(0, 2).map((r) => ({
        id: r.id,
        date: r.date || r.issueDate || r.createdAt,
        name: r.name || r.clientName || r.title || r.subject,
        amount: r.amount || r.totalAmount,
      }));
    }
    if (only.length) gap.onlyInCurrent[key] = only.length;
  }
  if (Object.keys(gap.missingFromCurrent).length) report.gaps.push(gap);
}

console.log(JSON.stringify(report, null, 2));
