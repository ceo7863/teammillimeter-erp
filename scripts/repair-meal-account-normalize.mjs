#!/usr/bin/env node
/**
 * Normalize meal bank txs from legacy account 505 -> preferred 1063 (??).
 * Usage: node scripts/repair-meal-account-normalize.mjs [dbPath] [--dry-run|--audit-only]
 */
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv.find((arg) => !arg.startsWith("-") && arg.endsWith(".sqlite")) || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");
const auditOnly = process.argv.includes("--audit-only");
const MEAL_CAT = "\uC811\uB300/\uC2DD\uBE44";
const LEGACY_MEAL_CODE = "505";
const PREFERRED_MEAL_CODE = "1063";

function normalizeCategory(raw) {
  const trimmed = String(raw || "").trim();
  const aliases = {
    "\uC2DD": MEAL_CAT,
    "\uC2DD\uB300": MEAL_CAT,
    "\uC2DD\uBE44": MEAL_CAT,
    "\uC811\uB300": MEAL_CAT,
    "\uC811\uB300/\uC2DD\uB300": MEAL_CAT,
  };
  return aliases[trimmed] || trimmed;
}

const MEAL_MEMO_KEYWORDS = [
  "\uC2DD\uB300",
  "\uC911\uC2DD\uB300",
  "\uC800\uC2DD\uB300",
  "\uC544\uC2DD\uB300",
  "\uC810\uC2EC",
  "\uC911\uC2DD",
  "\uC800\uB141",
  "\uD68C\uC2DD",
  "\uC2DD\uBE44",
  "\uC811\uB300",
];

function isMealMemo(memo) {
  const hay = String(memo || "").toLowerCase();
  return MEAL_MEMO_KEYWORDS.some((kw) => hay.includes(kw.toLowerCase()));
}

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));
const hasPreferred = (data.accountCodes || []).some((row) => row.code === PREFERRED_MEAL_CODE);
if (!hasPreferred) {
  console.log(JSON.stringify({ error: "missing_preferred_meal_account", code: PREFERRED_MEAL_CODE }, null, 2));
  process.exit(1);
}

const expenseByBankTxId = new Map(
  (data.companyExpenses || [])
    .filter((row) => row.bankTransactionId)
    .map((row) => [row.bankTransactionId, row]),
);

const fixes = [];
for (const tx of data.bankTransactions || []) {
  if (Number(tx.withdrawal || 0) <= 0) continue;
  const code = String(tx.ledgerAccountCode || "").trim();
  if (code !== LEGACY_MEAL_CODE || tx.ledgerStatus !== "confirmed") continue;

  const expense = expenseByBankTxId.get(tx.id);
  const expenseCat = expense?.category ? normalizeCategory(expense.category) : null;
  const mealByCategory = expenseCat === MEAL_CAT;
  const mealByMemo = isMealMemo([tx.memo, tx.ledgerMemo, expense?.memo].filter(Boolean).join(" "));
  const mealByDesc = isMealMemo(tx.description);

  if (!mealByCategory && !mealByMemo && !mealByDesc) continue;

  fixes.push({
    txId: tx.id,
    date: String(tx.transactionAt || "").slice(0, 10),
    description: tx.description,
    counterparty: tx.counterpartyName,
    memo: tx.memo,
    withdrawal: tx.withdrawal,
    fromCode: code,
    toCode: PREFERRED_MEAL_CODE,
    expenseCategory: expenseCat,
  });
}

console.log(
  JSON.stringify(
    {
      dryRun: dryRun || auditOnly,
      auditOnly,
      version: state.version,
      fixCount: fixes.length,
      fixes,
    },
    null,
    2,
  ),
);

if (auditOnly || !fixes.length || dryRun) process.exit(0);

const fixIds = new Set(fixes.map((row) => row.txId));
const mealCat = (data.ledgerCategories || []).find((row) => row.name === MEAL_CAT && row.isActive !== false);

const bankTransactions = (data.bankTransactions || []).map((tx) => {
  if (!fixIds.has(tx.id)) return tx;
  return {
    ...tx,
    ledgerAccountCode: PREFERRED_MEAL_CODE,
    ledgerCategoryId: mealCat?.id || tx.ledgerCategoryId,
  };
});

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify({ ...data, bankTransactions }),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-meal-account-normalize",
);
console.log("saved version", Number(state.version || 0) + 1, "fixed", fixes.length);
