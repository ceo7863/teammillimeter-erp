#!/usr/bin/env node
/**
 * Rebuild corrupted fixedExpensePayment.memo from linked bank transactions.
 * Usage: npx tsx scripts/repair-corrupt-fixed-payment-memos.mjs [dbPath] [--dry-run]
 */
import { DatabaseSync } from "node:sqlite";
import { buildFixedExpensePaymentMemoFromBankTx } from "../src/utils/bankCompanyLedger.ts";

const dbPath = process.argv.find((arg) => !arg.startsWith("-") && arg.endsWith(".sqlite")) || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");

function isCorruptText(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/\?{2,}/.test(t)) return true;
  if (/\uFFFD/.test(t)) return true;
  return false;
}

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

const fixedById = new Map((data.fixedExpenses || []).map((row) => [row.id, row]));
const txById = new Map((data.bankTransactions || []).map((row) => [row.id, row]));

const fixes = [];
let fixedExpensePayments = [...(data.fixedExpensePayments || [])];

for (let i = 0; i < fixedExpensePayments.length; i++) {
  const payment = fixedExpensePayments[i];
  if (!isCorruptText(payment.memo)) continue;

  const fixedItem = fixedById.get(payment.fixedExpenseId);
  const tx = payment.bankTransactionId ? txById.get(payment.bankTransactionId) : null;
  let nextMemo = fixedItem?.name || payment.memo;

  if (tx && fixedItem) {
    nextMemo = buildFixedExpensePaymentMemoFromBankTx(tx, fixedItem);
  } else if (fixedItem?.name) {
    nextMemo = fixedItem.name;
  }

  if (!nextMemo || nextMemo === payment.memo || isCorruptText(nextMemo)) continue;

  fixes.push({
    id: payment.id,
    date: payment.date,
    from: payment.memo,
    to: nextMemo,
    fixedName: fixedItem?.name,
    createdBy: payment.createdBy,
  });

  fixedExpensePayments[i] = { ...payment, memo: nextMemo };
}

console.log(
  JSON.stringify(
    {
      dryRun,
      version: state.version,
      fixCount: fixes.length,
      fixes,
    },
    null,
    2,
  ),
);

if (dryRun || !fixes.length) process.exit(0);

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify({ ...data, fixedExpensePayments }),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-corrupt-fixed-payment-memos",
);
console.log("saved version", Number(state.version || 0) + 1);
