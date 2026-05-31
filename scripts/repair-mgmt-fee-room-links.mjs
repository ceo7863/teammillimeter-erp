#!/usr/bin/env node
/**
 * Reassign mis-linked management-fee payments using room number in bank description.
 *
 * Usage:
 *   npx tsx scripts/repair-mgmt-fee-room-links.mjs [dbPath] [--dry-run]
 */
import { DatabaseSync } from "node:sqlite";
import { resolveFixedExpenseIdForBankTransaction } from "../src/utils/companyLedger.ts";

const dbPath = process.argv.find((arg) => !arg.startsWith("-") && arg.endsWith(".sqlite")) || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

const fixedExpenses = data.fixedExpenses || [];
const bankTransactions = data.bankTransactions || [];
const txById = new Map(bankTransactions.map((tx) => [tx.id, tx]));

const actions = [];
let payments = [...(data.fixedExpensePayments || [])];

payments = payments.map((payment) => {
  const txId = String(payment.bankTransactionId || "").trim();
  if (!txId) {
    const tx = bankTransactions.find((row) => row.linkedFixedExpensePaymentId === payment.id);
    if (!tx) return payment;
    return reassign(payment, tx);
  }
  const tx = txById.get(txId);
  if (!tx) return payment;
  return reassign(payment, tx);
});

function reassign(payment, tx) {
  const current = fixedExpenses.find((row) => row.id === payment.fixedExpenseId);
  const nextId = resolveFixedExpenseIdForBankTransaction(tx, fixedExpenses, payment.fixedExpenseId);
  if (!nextId || nextId === payment.fixedExpenseId) return payment;
  const next = fixedExpenses.find((row) => row.id === nextId);
  actions.push({
    paymentId: payment.id,
    txDescription: tx.description,
    from: current?.name,
    to: next?.name,
    amount: payment.amount,
    date: payment.date,
  });
  return { ...payment, fixedExpenseId: nextId };
}

const summary = { dryRun, reassignedCount: actions.length, actions };
console.log(JSON.stringify(summary, null, 2));

if (dryRun || !actions.length) process.exit(0);

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify({ ...data, fixedExpensePayments: payments }),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-mgmt-fee-room-links",
);
