#!/usr/bin/env node
/**
 * Find/fix bank txs where ledgerAccountCode conflicts with expense category or memo hints.
 *
 * Usage:
 *   node scripts/repair-account-category-mismatch.mjs [dbPath] [--dry-run]
 *   node scripts/repair-account-category-mismatch.mjs [dbPath] --audit-only
 */
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv.find((arg) => !arg.startsWith("-") && arg.endsWith(".sqlite")) || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");
const auditOnly = process.argv.includes("--audit-only");

const MEAL_CAT = "\uC811\uB300/\uC2DD\uBE44";
const TRAFFIC_CAT = "\uAD50\uD86D/\uC8FC\uCC28";
const MEAL_ACCOUNT_PREFERRED = "1063";
const TRAFFIC_ACCOUNT_PREFERRED = "1061";

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
  "\uCE74\uD398",
  "\uCEE4\uD53C",
  "\uAC08\uBE44",
  "\uB2E4\uACFC",
  "\uCE58\uD0A8",
  "\uD53C\uC790",
  "\uB9D0\uC57C",
  "\uC21F\uAC12",
];

const TRAFFIC_MEMO_KEYWORDS = [
  "\uC8FC\uC720",
  "\uAE30\uB984",
  "\uD0DD\uC2DC",
  "\uC8FC\uCC28",
  "\uD1A0\uB864",
  "\uD558\uC774\uD328\uC2A4",
  "\uCD9C\uC7A5",
  "\uD3B8\uB3C4",
  "\uACE0\uC18D",
  "ktx",
  "KTX",
];

const CATEGORY_ACCOUNT_DEFAULTS = {
  [MEAL_CAT]: "505",
  [TRAFFIC_CAT]: "504",
  "\uC0AC\uBB34\uC6A9\uD488": "517",
  "\uD1B5\uC2E0\uBE44": "506",
  "\uC18C\uBAA8\uD988": "517",
  "\uB9C8\uCF00\uD305": "519",
  "\uBC29\uBB38/\uC678\uBD80": "504",
};

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

function accountDomain(code, name) {
  const hay = `${code} ${name}`;
  if (code === MEAL_ACCOUNT_PREFERRED || /\uC2DD\uB300|\uC811\uB300|\uC2DD\uBE44|\uC811\uB300/.test(hay)) return "meal";
  if (code === "505" || name === MEAL_CAT) return "meal";
  if (
    code === TRAFFIC_ACCOUNT_PREFERRED ||
    code === "504" ||
    /\uAD50\uD86D|\uC5EC\uBE44|\uCD9C\uC7A5|\uC8FC\uCC28|\uC8FC\uC720|\uD1A0\uB864/.test(hay)
  ) {
    return "traffic";
  }
  return "other";
}

function categoryDomain(category) {
  const c = normalizeCategory(category);
  if (c === MEAL_CAT) return "meal";
  if (c === TRAFFIC_CAT || c === "\uBC29\uBB38/\uC678\uBD80") return "traffic";
  return "other";
}

function memoDomain(memo) {
  const hay = String(memo || "").toLowerCase();
  if (!hay.trim()) return null;
  if (MEAL_MEMO_KEYWORDS.some((kw) => hay.includes(kw.toLowerCase()))) return "meal";
  if (TRAFFIC_MEMO_KEYWORDS.some((kw) => hay.includes(kw.toLowerCase()))) return "traffic";
  return null;
}

function preferredAccountForCategory(category, accountCodes) {
  const c = normalizeCategory(category);
  if (c === MEAL_CAT) {
    if (accountCodes.some((row) => row.code === MEAL_ACCOUNT_PREFERRED)) return MEAL_ACCOUNT_PREFERRED;
    return CATEGORY_ACCOUNT_DEFAULTS[MEAL_CAT];
  }
  if (c === TRAFFIC_CAT) {
    if (accountCodes.some((row) => row.code === TRAFFIC_ACCOUNT_PREFERRED)) return TRAFFIC_ACCOUNT_PREFERRED;
    return CATEGORY_ACCOUNT_DEFAULTS[TRAFFIC_CAT];
  }
  const ledgerCatDefault = CATEGORY_ACCOUNT_DEFAULTS[c];
  if (ledgerCatDefault && accountCodes.some((row) => row.code === ledgerCatDefault)) return ledgerCatDefault;
  return null;
}

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));
const accountCodes = data.accountCodes || [];
const accountByCode = new Map(accountCodes.map((row) => [String(row.code), row]));

const expenseByBankTxId = new Map(
  (data.companyExpenses || [])
    .filter((row) => row.bankTransactionId)
    .map((row) => [row.bankTransactionId, row]),
);

const issues = [];
const fixes = [];

function pushIssue(issue) {
  issues.push(issue);
  fixes.push(issue);
}

for (const tx of data.bankTransactions || []) {
  if (Number(tx.withdrawal || 0) <= 0) continue;
  const code = String(tx.ledgerAccountCode || "").trim();
  if (!code || tx.ledgerStatus !== "confirmed") continue;

  const acct = accountByCode.get(code);
  const acctDomain = accountDomain(code, acct?.name || "");
  if (acctDomain === "other") continue;

  const expense =
    expenseByBankTxId.get(tx.id) ||
    (tx.linkedCompanyExpenseId
      ? (data.companyExpenses || []).find((row) => row.id === tx.linkedCompanyExpenseId)
      : null);

  const expenseCat = expense?.category ? normalizeCategory(expense.category) : null;
  const expDomain = expenseCat ? categoryDomain(expenseCat) : null;
  const memoHint = memoDomain([tx.memo, tx.ledgerMemo, expense?.memo].filter(Boolean).join(" "));

  let expectedDomain = expDomain || memoHint;
  if (!expectedDomain || expectedDomain === "other") continue;
  if (acctDomain === expectedDomain) continue;

  const suggestedCode =
    expenseCat && categoryDomain(expenseCat) !== "other"
      ? preferredAccountForCategory(expenseCat, accountCodes)
      : expectedDomain === "meal"
        ? MEAL_ACCOUNT_PREFERRED
        : expectedDomain === "traffic"
          ? TRAFFIC_ACCOUNT_PREFERRED
          : null;

  if (!suggestedCode || suggestedCode === code) continue;

  pushIssue({
    txId: tx.id,
    date: String(tx.transactionAt || "").slice(0, 10),
    description: tx.description,
    counterparty: tx.counterpartyName,
    memo: tx.memo,
    withdrawal: tx.withdrawal,
    accountCode: code,
    accountName: acct?.name || code,
    accountDomain: acctDomain,
    expenseCategory: expenseCat,
    expenseDomain: expDomain,
    memoHint,
    expectedDomain,
    suggestedCode,
    suggestedName: accountByCode.get(suggestedCode)?.name || suggestedCode,
    reason: "account_domain_mismatch",
  });
}

for (const tx of data.bankTransactions || []) {
  if (Number(tx.withdrawal || 0) <= 0) continue;
  const code = String(tx.ledgerAccountCode || "").trim();
  if (!code || tx.ledgerStatus !== "confirmed") continue;
  if (fixes.some((row) => row.txId === tx.id)) continue;

  const acct = accountByCode.get(code);
  const acctDomain = accountDomain(code, acct?.name || "");
  if (acctDomain !== "meal" && acctDomain !== "traffic") continue;

  const expense =
    expenseByBankTxId.get(tx.id) ||
    (tx.linkedCompanyExpenseId
      ? (data.companyExpenses || []).find((row) => row.id === tx.linkedCompanyExpenseId)
      : null);
  const expenseCat = expense?.category ? normalizeCategory(expense.category) : null;
  const expDomain = expenseCat ? categoryDomain(expenseCat) : null;
  if (!expDomain || expDomain === "other" || expDomain === acctDomain) continue;

  const suggestedCode = preferredAccountForCategory(expenseCat, accountCodes);
  if (!suggestedCode || suggestedCode === code) continue;

  pushIssue({
    txId: tx.id,
    date: String(tx.transactionAt || "").slice(0, 10),
    description: tx.description,
    counterparty: tx.counterpartyName,
    memo: tx.memo,
    withdrawal: tx.withdrawal,
    accountCode: code,
    accountName: acct?.name || code,
    accountDomain: acctDomain,
    expenseCategory: expenseCat,
    expenseDomain: expDomain,
    memoHint: null,
    expectedDomain: expDomain,
    suggestedCode,
    suggestedName: accountByCode.get(suggestedCode)?.name || suggestedCode,
    reason: "expense_category_mismatch",
  });
}

console.log(
  JSON.stringify(
    {
      dryRun: dryRun || auditOnly,
      auditOnly,
      version: state.version,
      issueCount: issues.length,
      issues,
    },
    null,
    2,
  ),
);

if (auditOnly || !fixes.length || dryRun) process.exit(0);

const fixIds = new Set(fixes.map((row) => row.txId));
const fixById = new Map(fixes.map((row) => [row.txId, row.suggestedCode]));

const bankTransactions = (data.bankTransactions || []).map((tx) => {
  if (!fixIds.has(tx.id)) return tx;
  const nextCode = fixById.get(tx.id);
  const mealCat = (data.ledgerCategories || []).find(
    (row) => row.name === MEAL_CAT && row.isActive !== false,
  );
  return {
    ...tx,
    ledgerAccountCode: nextCode,
    ledgerCategoryId:
      normalizeCategory(expenseByBankTxId.get(tx.id)?.category) === MEAL_CAT && mealCat
        ? mealCat.id
        : tx.ledgerCategoryId,
  };
});

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify({ ...data, bankTransactions }),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-account-category-mismatch",
);
console.log("saved version", Number(state.version || 0) + 1, "fixed", fixes.length);
