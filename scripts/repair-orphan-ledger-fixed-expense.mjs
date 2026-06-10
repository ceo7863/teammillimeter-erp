#!/usr/bin/env node
/**
 * Clear ledgerFixedExpenseId on bank txs pointing to deleted/missing fixed expense items.
 * Also clears auto-registration ledgerMemo when it references the missing item name.
 *
 * Usage: node scripts/repair-orphan-ledger-fixed-expense.mjs [dbPath] [--dry-run]
 */
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv.find((arg) => !arg.startsWith("-") && arg.endsWith(".sqlite")) || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

const fixedIds = new Set((data.fixedExpenses || []).map((row) => row.id));
const AUTO_MEMO_PREFIX = "\uC790\uB3D9 \uB4F1\uB85D \u00B7 ";

const fixes = [];
let bankTransactions = (data.bankTransactions || []).map((tx) => {
  const fixedId = String(tx.ledgerFixedExpenseId || "").trim();
  if (!fixedId || fixedIds.has(fixedId)) return tx;

  const next = { ...tx, ledgerFixedExpenseId: undefined };
  const ledgerMemo = String(tx.ledgerMemo || "").trim();
  if (ledgerMemo.startsWith(AUTO_MEMO_PREFIX)) {
    next.ledgerMemo = undefined;
  }

  fixes.push({
    id: tx.id,
    date: String(tx.transactionAt || "").slice(0, 10),
    counterparty: tx.counterpartyName,
    description: tx.description,
    memo: tx.memo,
    ledgerMemo: tx.ledgerMemo,
    clearedFixedExpenseId: fixedId,
    nextLedgerMemo: next.ledgerMemo,
    withdrawal: tx.withdrawal,
    ledgerAccountCode: tx.ledgerAccountCode,
  });
  return next;
});

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
  JSON.stringify({ ...data, bankTransactions }),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-orphan-ledger-fixed-expense",
);
console.log("saved version", Number(state.version || 0) + 1);
