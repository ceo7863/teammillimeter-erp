#!/usr/bin/env node
/** Count fixedExpensePayment rows with corrupted memo/category text. */
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));
const payments = data.fixedExpensePayments || [];
const fixedById = new Map((data.fixedExpenses || []).map((row) => [row.id, row]));
const txById = new Map((data.bankTransactions || []).map((row) => [row.id, row]));

function isCorruptText(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/\?{2,}/.test(t)) return true;
  if (/\uFFFD/.test(t)) return true;
  if (/\uFFFD/.test(t)) return true;
  return false;
}

const badMemo = payments.filter((p) => isCorruptText(p.memo));
const badCategory = payments.filter((p) => isCorruptText(p.category));
const byCreatedBy = {};
for (const p of badMemo) {
  const key = p.createdBy || "(none)";
  byCreatedBy[key] = (byCreatedBy[key] || 0) + 1;
}

const patterns = {};
for (const p of badMemo) {
  const key = String(p.memo || "").slice(0, 40);
  patterns[key] = (patterns[key] || 0) + 1;
}

console.log(
  JSON.stringify(
    {
      version: state.version,
      totalPayments: payments.length,
      corruptMemoCount: badMemo.length,
      corruptCategoryCount: badCategory.length,
      byCreatedBy,
      memoPatterns: Object.entries(patterns)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15),
      samples: badMemo.slice(0, 12).map((p) => {
        const tx = p.bankTransactionId ? txById.get(p.bankTransactionId) : null;
        return {
          id: p.id,
          date: p.date,
          memo: p.memo,
          createdBy: p.createdBy,
          fixedName: fixedById.get(p.fixedExpenseId)?.name,
          counterparty: tx?.counterpartyName,
          description: tx?.description,
        };
      }),
    },
    null,
    2,
  ),
);
