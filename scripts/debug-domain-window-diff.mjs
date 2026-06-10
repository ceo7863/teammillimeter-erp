#!/usr/bin/env node
/**
 * Compare bank/tax domains across snapshots within a datetime window.
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
      for (const row of rows) Object.assign(data, JSON.parse(String(row.payload)));
    }
  } catch {}
  if (!data) {
    const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
    const parsed = JSON.parse(String(row.payload));
    data = parsed.data || parsed;
  }
  const version = db.prepare("SELECT version, updated_at FROM erp_state WHERE id = 1").get();
  db.close();
  return { data, version, label: path.basename(dbPath) };
}

function dayKey(row, keys) {
  for (const k of keys) {
    const s = String(row[k] || "");
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return "";
}

function inWindow(day) {
  return day && day >= fromArg && day <= toArg;
}

function bankStats(txs) {
  let evidence = 0;
  let account = 0;
  let inWin = 0;
  let evInWin = 0;
  let acInWin = 0;
  for (const tx of txs || []) {
    const day = dayKey(tx, ["date", "transactionDate", "datetime"]);
    const hasEv = Boolean((tx.linkedTaxInvoiceIds || []).length || tx.linkedTaxInvoiceId);
    const hasAc = Boolean(tx.ledgerAccountCode);
    if (hasEv) evidence += 1;
    if (hasAc) account += 1;
    if (inWindow(day)) {
      inWin += 1;
      if (hasEv) evInWin += 1;
      if (hasAc) acInWin += 1;
    }
  }
  return { total: (txs || []).length, evidence, account, inWin, evInWin, acInWin };
}

function missingIds(currentRows, otherRows) {
  const cur = new Set((currentRows || []).map((r) => String(r.id)));
  return (otherRows || []).filter((r) => !cur.has(String(r.id))).length;
}

function weakBank(currentRows, otherRows) {
  const curById = new Map((currentRows || []).map((r) => [String(r.id), r]));
  let weak = 0;
  for (const row of otherRows || []) {
    const cur = curById.get(String(row.id));
    if (!cur) continue;
    const cEv = Boolean((cur.linkedTaxInvoiceIds || []).length || cur.linkedTaxInvoiceId);
    const oEv = Boolean((row.linkedTaxInvoiceIds || []).length || row.linkedTaxInvoiceId);
    const cAc = Boolean(cur.ledgerAccountCode);
    const oAc = Boolean(row.ledgerAccountCode);
    if ((!cEv && oEv) || (!cAc && oAc)) weak += 1;
  }
  return weak;
}

const snaps = files.map(loadPayload);
const current = snaps[0];
const curBank = current.data.bankTransactions || [];

console.log(
  JSON.stringify(
    {
      window: { from: fromArg, to: toArg },
      current: {
        file: current.label,
        version: current.version?.version,
        bank: bankStats(curBank),
        taxInvoices: (current.data.taxInvoices || []).length,
        paymentVouchers: (current.data.paymentVouchers || []).length,
        vouchersWithBank: (current.data.paymentVouchers || []).filter((v) => String(v.bankTransactionId ?? "").trim()).length,
      },
      sources: snaps.slice(1).map((s) => ({
        file: s.label,
        version: s.version?.version,
        updatedAt: s.version?.updated_at,
        bank: bankStats(s.data.bankTransactions),
        taxInvoices: (s.data.taxInvoices || []).length,
        paymentVouchers: (s.data.paymentVouchers || []).length,
        vouchersWithBank: (s.data.paymentVouchers || []).filter((v) => String(v.bankTransactionId ?? "").trim()).length,
        missingBankTxIds: missingIds(curBank, s.data.bankTransactions),
        weakBankClassification: weakBank(curBank, s.data.bankTransactions),
        missingVouchers: missingIds(current.data.paymentVouchers, s.data.paymentVouchers),
        missingTaxInvoices: missingIds(current.data.taxInvoices, s.data.taxInvoices),
      })),
    },
    null,
    2,
  ),
);
