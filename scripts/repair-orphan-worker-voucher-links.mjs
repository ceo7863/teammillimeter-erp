#!/usr/bin/env node
/**
 * Clear linkedWorkerMonthlyPaymentVoucherId when the voucher no longer exists.
 * Usage: npx tsx scripts/repair-orphan-worker-voucher-links.mjs [dbPath] [--dry-run]
 */
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv.find((arg) => !arg.startsWith("-") && arg.endsWith(".sqlite")) || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));
const voucherIds = new Set((data.workerMonthlyActualVouchers || []).map((row) => row.id));

const fixes = [];
const bankTransactions = (data.bankTransactions || []).map((tx) => {
  const linkedId = String(tx.linkedWorkerMonthlyPaymentVoucherId || "").trim();
  if (!linkedId || voucherIds.has(linkedId)) return tx;
  fixes.push({
    id: tx.id,
    date: String(tx.transactionAt || "").slice(0, 10),
    amount: Math.round(Number(tx.withdrawal) || 0),
    counterparty: tx.counterpartyName,
    linkedSubject: tx.linkedSubject,
    orphanVoucherId: linkedId,
  });
  const { linkedWorkerMonthlyPaymentVoucherId: _removed, ...rest } = tx;
  return rest;
});

console.log(JSON.stringify({ dryRun, fixCount: fixes.length, fixes }, null, 2));

if (!dryRun && fixes.length) {
  const next = { ...data, bankTransactions };
  db.prepare("UPDATE erp_state SET payload = ?, version = version + 1 WHERE id = 1").run(
    JSON.stringify(next),
  );
  console.log("Saved", fixes.length, "orphan worker voucher link cleanup(s).");
}
