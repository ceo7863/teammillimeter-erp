#!/usr/bin/env node
/** Remove duplicate auto-generated fixed payments when a bank-linked row exists for the same month. */
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

function monthKey(date) {
  return String(date || "").slice(0, 7);
}

function isBankLinked(payment, transactions) {
  if (String(payment.bankTransactionId || "").trim()) return true;
  return transactions.some((tx) => tx.linkedFixedExpensePaymentId === payment.id);
}

let payments = [...(data.fixedExpensePayments || [])];
const transactions = data.bankTransactions || [];
const before = payments.length;

const byMonth = new Map();
for (const payment of payments) {
  const key = `${payment.fixedExpenseId}:${monthKey(payment.date)}`;
  if (!byMonth.has(key)) byMonth.set(key, []);
  byMonth.get(key).push(payment);
}

const removeIds = new Set();
for (const group of byMonth.values()) {
  if (group.length <= 1) continue;
  const linked = group.filter((row) => isBankLinked(row, transactions));
  if (!linked.length) continue;
  for (const row of group) {
    if (isBankLinked(row, transactions)) continue;
    if (String(row.memo || "").includes("\uC790\uB3D9 \uB4F1\uB85D")) {
      removeIds.add(row.id);
    }
  }
}

if (removeIds.size) {
  payments = payments.filter((row) => !removeIds.has(row.id));
}

const nextPayload = { ...data, fixedExpensePayments: payments };
const nextVersion = Number(state.version || 0) + 1;
db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify(nextPayload),
  nextVersion,
  new Date().toISOString(),
  "repair-fixed-dupes",
);

console.log(
  JSON.stringify(
    {
      version: nextVersion,
      removed: before - payments.length,
      removedIds: [...removeIds],
    },
    null,
    2,
  ),
);
