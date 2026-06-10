#!/usr/bin/env node
/** Remove a fixed-expense master item and its payments, bank links, and learn rules. */
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const targetName = process.argv[3] || "";
const targetId = process.argv[4] || "";

if (!targetName && !targetId) {
  console.error("Usage: node repair-remove-fixed-item.mjs [dbPath] <name|id> [exact-id]");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

const fixedExpenses = [...(data.fixedExpenses || [])];
const matches = fixedExpenses.filter((row) => {
  if (targetId && row.id === targetId) return true;
  if (targetName && String(row.name || "").trim() === targetName) return true;
  return false;
});

if (matches.length !== 1) {
  console.error(
    JSON.stringify(
      {
        error: matches.length ? "multiple_matches" : "not_found",
        matches: matches.map((row) => ({ id: row.id, name: row.name })),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const item = matches[0];
const fixedExpenseId = item.id;
const paymentIds = new Set(
  (data.fixedExpensePayments || [])
    .filter((row) => row.fixedExpenseId === fixedExpenseId)
    .map((row) => row.id),
);

let bankTransactions = (data.bankTransactions || []).map((tx) => {
  if (!paymentIds.has(String(tx.linkedFixedExpensePaymentId || ""))) return tx;
  return { ...tx, linkedFixedExpensePaymentId: undefined };
});

const fixedExpensePayments = (data.fixedExpensePayments || []).filter(
  (row) => row.fixedExpenseId !== fixedExpenseId,
);

const bankLedgerRules = (data.bankLedgerRules || []).filter(
  (rule) => !(rule.kind === "fixed" && rule.fixedExpenseId === fixedExpenseId),
);

const nextFixedExpenses = fixedExpenses.filter((row) => row.id !== fixedExpenseId);

const fromFixed = nextFixedExpenses.map((row) => String(row.category || "").trim()).filter(Boolean);
const seen = new Set(fromFixed);
const fixedExpenseCategories = (data.fixedExpenseCategories || [])
  .map((item) => String(item || "").trim())
  .filter((category) => category && (seen.has(category) || fromFixed.includes(category)));
for (const category of fromFixed) {
  if (!fixedExpenseCategories.includes(category)) fixedExpenseCategories.push(category);
}

const nextPayload = {
  ...data,
  fixedExpenses: nextFixedExpenses,
  fixedExpensePayments,
  bankTransactions,
  bankLedgerRules,
  fixedExpenseCategories,
};

const nextVersion = Number(state.version || 0) + 1;
db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify(nextPayload),
  nextVersion,
  new Date().toISOString(),
  "repair-remove-fixed-item",
);

console.log(
  JSON.stringify(
    {
      version: nextVersion,
      removed: {
        id: fixedExpenseId,
        name: item.name,
        category: item.category,
        amount: item.amount,
      },
      removedPayments: paymentIds.size,
      removedRules: (data.bankLedgerRules || []).length - bankLedgerRules.length,
      remainingFixedExpenseCount: nextFixedExpenses.length,
    },
    null,
    2,
  ),
);
