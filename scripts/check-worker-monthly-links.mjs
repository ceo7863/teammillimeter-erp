#!/usr/bin/env node
/**
 * Compare worker monthly actual payment links between SQLite DB snapshots.
 * Usage:
 *   node scripts/check-worker-monthly-links.mjs data/erp.sqlite
 *   node scripts/check-worker-monthly-links.mjs data/erp.sqlite data/erp.sqlite.bak
 */
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const paths = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
if (!paths.length) {
  console.error("Usage: node scripts/check-worker-monthly-links.mjs <sqlite-path> [backup-path]");
  process.exit(1);
}

function loadPayload(dbPath) {
  if (!existsSync(dbPath)) return null;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db.prepare("SELECT version, updated_at, payload FROM erp_state WHERE id = 1").get();
  db.close();
  if (!row) return null;
  const data = JSON.parse(String(row.payload));
  return { dbPath, version: row.version, updatedAt: row.updated_at, data };
}

function summarizeLinks(data) {
  const vouchers = Array.isArray(data.workerMonthlyActualVouchers) ? data.workerMonthlyActualVouchers : [];
  const bank = Array.isArray(data.bankTransactions) ? data.bankTransactions : [];
  const bankEntries = vouchers.flatMap((voucher) =>
    (voucher.entries || [])
      .filter((entry) => entry?.kind === "bank")
      .map((entry) => ({
        voucherId: voucher.id,
        worker: voucher.worker,
        monthKey: voucher.monthKey,
        bankTransactionId: entry.bankTransactionId,
        amount: entry.amount,
      })),
  );
  const manualEntries = vouchers.flatMap((voucher) =>
    (voucher.entries || [])
      .filter((entry) => entry?.kind === "manual")
      .map((entry) => ({
        voucherId: voucher.id,
        worker: voucher.worker,
        monthKey: voucher.monthKey,
        method: entry.method,
        workerPayoutVoucherId: entry.workerPayoutVoucherId || null,
        amount: entry.amount,
      })),
  );
  const bankLinked = bank
    .filter((tx) => String(tx.linkedWorkerMonthlyPaymentVoucherId || "").trim())
    .map((tx) => ({
      bankTransactionId: tx.id,
      linkedWorkerMonthlyPaymentVoucherId: tx.linkedWorkerMonthlyPaymentVoucherId,
      date: String(tx.transactionAt || "").slice(0, 10),
      amount: Math.round(Number(tx.withdrawal) || 0) || Math.round(Number(tx.deposit) || 0),
      counterparty: tx.counterpartyName,
    }));

  return {
    voucherCount: vouchers.length,
    vouchersWithEntries: vouchers.filter((v) => (v.entries || []).length > 0).length,
    bankEntryCount: bankEntries.length,
    manualEntryCount: manualEntries.length,
    bankLinkedCount: bankLinked.length,
    bankEntries,
    manualEntries,
    bankLinked,
  };
}

function diffSummaries(before, after) {
  const beforeBankIds = new Set(before.bankEntries.map((row) => row.bankTransactionId));
  const afterBankIds = new Set(after.bankEntries.map((row) => row.bankTransactionId));
  const lostBankEntries = before.bankEntries.filter((row) => !afterBankIds.has(row.bankTransactionId));
  const gainedBankEntries = after.bankEntries.filter((row) => !beforeBankIds.has(row.bankTransactionId));

  const beforeVoucherIds = new Set(before.bankEntries.map((row) => row.voucherId));
  const afterVoucherIds = new Set(after.bankEntries.map((row) => row.voucherId));
  const lostVouchers = [...beforeVoucherIds].filter((id) => !afterVoucherIds.has(id));

  const beforeLinked = new Set(before.bankLinked.map((row) => row.bankTransactionId));
  const afterLinked = new Set(after.bankLinked.map((row) => row.bankTransactionId));
  const lostBankLinks = before.bankLinked.filter((row) => !afterLinked.has(row.bankTransactionId));

  return { lostBankEntries, gainedBankEntries, lostVouchers, lostBankLinks };
}

for (const dbPath of paths) {
  const loaded = loadPayload(dbPath);
  if (!loaded) {
    console.log(`=== ${dbPath} === MISSING or empty`);
    continue;
  }
  const summary = summarizeLinks(loaded.data);
  console.log(`=== ${dbPath} ===`);
  console.log(`version=${loaded.version} updated=${loaded.updatedAt}`);
  console.log(
    `vouchers=${summary.voucherCount} withEntries=${summary.vouchersWithEntries} bankEntries=${summary.bankEntryCount} manualEntries=${summary.manualEntryCount} bankTxLinked=${summary.bankLinkedCount}`,
  );
}

if (paths.length >= 2) {
  const before = loadPayload(paths[0]);
  const after = loadPayload(paths[1]);
  if (before && after) {
    const diff = diffSummaries(summarizeLinks(before.data), summarizeLinks(after.data));
    console.log("\n=== DIFF (first -> second) ===");
    console.log(`lost bank voucher entries: ${diff.lostBankEntries.length}`);
    console.log(`gained bank voucher entries: ${diff.gainedBankEntries.length}`);
    console.log(`lost voucher ids: ${diff.lostVouchers.length}`);
    console.log(`lost bankTx linkedWorkerMonthlyPaymentVoucherId: ${diff.lostBankLinks.length}`);
    if (diff.lostBankEntries.length) {
      console.log("\nSample lost bank entries (up to 10):");
      console.log(JSON.stringify(diff.lostBankEntries.slice(0, 10), null, 2));
    }
  }
}
