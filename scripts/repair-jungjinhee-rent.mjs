#!/usr/bin/env node
/** Unlink ??? 880k from eCount if mislinked; register as ??? variable expense. */
import { DatabaseSync } from "node:sqlite";
import { syncBankTransactionLedgerLinkFields } from "../src/utils/bankCompanyLedger.ts";
import { makeLedgerId } from "../src/utils/companyLedger.ts";

const dbPath = process.argv[2] || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");
const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

const RENT_CATEGORY = "\uC784\uB300\uB8CC";
const CP = "\uC815\uC9C4\uD76C";
const TARGET_DATE = "2026-05-27";
const TARGET_AMOUNT = 880000;

let transactions = [...(data.bankTransactions || [])];
let payments = [...(data.fixedExpensePayments || [])];
let expenses = [...(data.companyExpenses || [])];

const tx =
  transactions.find((row) => row.id === process.env.TX_ID) ||
  transactions.find((row) => {
    const date = String(row.transactionAt || "").slice(0, 10);
    const cp = String(row.counterpartyName || "");
    return date === TARGET_DATE && cp.includes(CP) && Number(row.withdrawal) === TARGET_AMOUNT;
  });
if (!tx) {
  console.error("tx not found");
  process.exit(1);
}
const TX_ID = tx.id;
const ECOUNT_ID =
  (data.fixedExpenses || []).find((row) => /ecount|\uC774\uCE74/i.test(String(row.name || "")))?.id || "";

const linkedPay = payments.find((p) => p.id === tx.linkedFixedExpensePaymentId);
if (linkedPay && ECOUNT_ID && linkedPay.fixedExpenseId === ECOUNT_ID) {
  payments = payments.map((p) =>
    p.id === linkedPay.id ? { ...p, bankTransactionId: undefined } : p,
  );
  transactions = transactions.map((row) =>
    row.id === TX_ID ? { ...row, linkedFixedExpensePaymentId: undefined } : row,
  );
  console.log("unlinked eCount payment", linkedPay.id);
}

const existingExpense = expenses.find((row) => row.bankTransactionId === TX_ID);
if (!existingExpense) {
  const expenseId = makeLedgerId();
  const date = String(tx.transactionAt || "").slice(0, 10);
  expenses.unshift({
    id: expenseId,
    date,
    category: RENT_CATEGORY,
    description: "\uC815\uC9C4\uD76C \u00B7 \uC815\uC9C4\uD76C",
    amount: Number(tx.withdrawal || 0),
    memo: RENT_CATEGORY,
    kind: "variable",
    flow: "expense",
    bankTransactionId: TX_ID,
    createdBy: "repair-jungjinhee-rent",
    createdAt: new Date().toISOString(),
  });
  transactions = transactions.map((row) =>
    row.id === TX_ID
      ? { ...row, linkedCompanyExpenseId: expenseId, linkedFixedExpensePaymentId: undefined, memo: RENT_CATEGORY }
      : row,
  );
  console.log("created rent expense", expenseId);
} else {
  transactions = transactions.map((row) =>
    row.id === TX_ID ? { ...row, memo: row.memo || RENT_CATEGORY } : row,
  );
  console.log("rent expense already exists", existingExpense.id);
}

transactions = syncBankTransactionLedgerLinkFields(transactions, expenses, payments);

const nextPayload = {
  ...data,
  bankTransactions: transactions,
  fixedExpensePayments: payments,
  companyExpenses: expenses,
  expenseCategories: [...new Set([...(data.expenseCategories || []), RENT_CATEGORY])],
};

if (dryRun) {
  console.log(JSON.stringify({ tx: nextPayload.bankTransactions.find((r) => r.id === TX_ID) }, null, 2));
  process.exit(0);
}

const nextVersion = Number(state.version || 0) + 1;
db.prepare("UPDATE erp_state SET payload = ?, version = ? WHERE id = 1").run(
  JSON.stringify(nextPayload),
  nextVersion,
);
console.log("saved version", nextVersion);
