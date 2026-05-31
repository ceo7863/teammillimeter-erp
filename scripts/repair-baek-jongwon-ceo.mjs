#!/usr/bin/env node
/**
 * Repair ??? (CEO) bank txs: ledger folder + ???? ???? + correct flow.
 * Usage: npx tsx scripts/repair-baek-jongwon-ceo.mjs [dbPath] [--dry-run]
 */
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { isCeoBankTransaction } from "../src/utils/clientDepositAliases.ts";
import { syncLedgerLinkedBankTransactionFolders, DEFAULT_WORKER_FOLDER_ID } from "../src/utils/bankTransactionFolders.ts";
import {
  buildBankLearnRuleFromManualRegistration,
  upsertBankLearnRule,
} from "../src/utils/bankCompanyLedger.ts";

const dbPath = process.argv.find((arg) => !arg.startsWith("-") && arg.endsWith(".sqlite")) || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");

const OLD_CATEGORY = "\uB300\uD45C\uC774\uC0AC \uAC00\uC218\uAE08";
const CATEGORY = "\uB300\uD45C\uC774\uC0AC \uAC00\uC9C0\uAE09\uAE08";

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const d = JSON.parse(String(state.payload));

let categoryRenamed = 0;
let expensesUpdated = 0;
let expensesCreated = 0;
let txsRepaired = 0;
let rulesUpdated = 0;

function renameCategory(value) {
  if (value === OLD_CATEGORY) return CATEGORY;
  return value;
}

d.expenseCategories = (d.expenseCategories || []).map((c) => {
  const next = renameCategory(String(c || "").trim());
  if (next !== c) categoryRenamed += 1;
  return next;
});
if (!d.expenseCategories.includes(CATEGORY)) {
  d.expenseCategories = [CATEGORY, ...d.expenseCategories];
  categoryRenamed += 1;
}

for (const row of d.companyExpenses || []) {
  if (row.category === OLD_CATEGORY) {
    row.category = CATEGORY;
    categoryRenamed += 1;
  }
}

for (const rule of d.bankLedgerRules || []) {
  if (rule.category === OLD_CATEGORY) {
    rule.category = CATEGORY;
    rulesUpdated += 1;
  }
}

const changes = [];

for (const tx of d.bankTransactions || []) {
  if (!isCeoBankTransaction(tx)) continue;

  const withdrawal = Number(tx.withdrawal || 0);
  const deposit = Number(tx.deposit || 0);
  const amount = withdrawal > 0 ? withdrawal : deposit;
  if (amount <= 0) continue;

  const beforeFolder = tx.folderId || "-";
  const expectedFlow = withdrawal > 0 ? "expense" : "income";

  let expense =
    (d.companyExpenses || []).find((row) => row.id === tx.linkedCompanyExpenseId) ||
    (d.companyExpenses || []).find((row) => row.bankTransactionId === tx.id);

  if (expense) {
    let changed = false;
    if (expense.category !== CATEGORY) {
      expense.category = CATEGORY;
      changed = true;
    }
    if (expense.flow !== expectedFlow) {
      expense.flow = expectedFlow;
      changed = true;
    }
    if (expense.bankTransactionId !== tx.id) {
      expense.bankTransactionId = tx.id;
      changed = true;
    }
    if (changed) expensesUpdated += 1;
  } else {
    const expenseId = randomUUID();
    expense = {
      id: expenseId,
      date: String(tx.transactionAt || "").slice(0, 10),
      category: CATEGORY,
      description: [tx.description, tx.counterpartyName].filter(Boolean).join(" \u00B7 ") || "\uD1B5\uC7A5 \uAC70\uB798",
      amount,
      memo: tx.memo || "",
      kind: "variable",
      flow: expectedFlow,
      bankTransactionId: tx.id,
      createdBy: "repair-baek-jongwon-ceo",
      createdAt: new Date().toISOString(),
    };
    d.companyExpenses = [expense, ...(d.companyExpenses || [])];
    expensesCreated += 1;
  }

  const txChanged =
    tx.linkedCompanyExpenseId !== expense.id ||
    tx.linkedFixedExpensePaymentId ||
    tx.folderId === DEFAULT_WORKER_FOLDER_ID ||
    tx.linkedSubject;

  if (tx.linkedCompanyExpenseId !== expense.id) tx.linkedCompanyExpenseId = expense.id;
  if (tx.linkedFixedExpensePaymentId) tx.linkedFixedExpensePaymentId = undefined;
  if (tx.folderId === DEFAULT_WORKER_FOLDER_ID || tx.linkedSubject) {
    tx.linkedSubject = undefined;
  }

  if (txChanged) txsRepaired += 1;

  if (withdrawal > 0 && tx.counterpartyName?.trim() === "\uBC30\uC885\uC6D0") {
    const rule = buildBankLearnRuleFromManualRegistration(tx, CATEGORY, "repair-baek-jongwon-ceo");
    const before = (d.bankLedgerRules || []).length;
    d.bankLedgerRules = upsertBankLearnRule(d.bankLedgerRules || [], rule);
    if ((d.bankLedgerRules || []).length >= before) rulesUpdated += 1;
  }

  changes.push({
    id: tx.id.slice(0, 8),
    date: String(tx.transactionAt).slice(0, 10),
    folderBefore: beforeFolder,
    category: CATEGORY,
    flow: expectedFlow,
    amount,
  });
}

const folderSync = syncLedgerLinkedBankTransactionFolders(d.bankTransactions || [], d.bankTransactionFolders || [], {
  companyExpenses: d.companyExpenses || [],
  fixedExpensePayments: d.fixedExpensePayments || [],
});

d.bankTransactions = folderSync.transactions;
d.bankTransactionFolders = folderSync.folders;

console.log(
  JSON.stringify(
    {
      dryRun,
      category: CATEGORY,
      categoryRenamed,
      expensesCreated,
      expensesUpdated,
      txsRepaired,
      rulesUpdated,
      ledgerFolderUpdated: folderSync.updated,
      changes,
    },
    null,
    2,
  ),
);

if (dryRun) process.exit(0);

const touched =
  categoryRenamed > 0 ||
  expensesCreated > 0 ||
  expensesUpdated > 0 ||
  txsRepaired > 0 ||
  rulesUpdated > 0 ||
  folderSync.updated > 0;

if (!touched) {
  console.log("No changes needed.");
  process.exit(0);
}

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify(d),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-baek-jongwon-ceo",
);
console.log("saved");
