import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { buildFixedExpensePaymentMemoFromBankTx } from "../src/utils/bankCompanyLedger.ts";

const dbPath = process.argv[2] || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");

const TX_ID = "03defe60-0497-4d3d-b45f-a209f118f6ad";
const VARIABLE_EXPENSE_ID = "0e331053-fc3c-4931-a142-cf232cf3f3ef";
const FIXED_EXPENSE_ID = "236796bc-02fd-41da-be1c-f09e0072103a";
const REF_TX_ID = "565b2d6d-8c63-4851-a2b5-4ac327594784";
const LEDGER_FOLDER_ID = "bank-folder-ledger-default";

function tokenize(text) {
  return [...new Set(String(text || "").split(/[\s/.,\-_·()]+/).map((t) => t.trim()).filter((t) => t.length >= 2))];
}

function buildFixedRule(tx, fixedExpenseId, createdBy = "repair-ray-rent-april") {
  const counterpartyName = String(tx.counterpartyName || "").trim();
  return {
    id: randomUUID(),
    kind: "fixed",
    fixedExpenseId,
    amount: undefined,
    counterpartyName: counterpartyName || undefined,
    descriptionTokens: tokenize([tx.description, tx.memo, counterpartyName].filter(Boolean).join(" ")),
    createdAt: new Date().toISOString(),
    createdBy,
    sourceBankTransactionId: tx.id,
  };
}

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const d = JSON.parse(String(state.payload));

const tx = (d.bankTransactions || []).find((row) => row.id === TX_ID);
const fixedItem = (d.fixedExpenses || []).find((row) => row.id === FIXED_EXPENSE_ID);
if (!tx) {
  console.error("bank tx not found", TX_ID);
  process.exit(1);
}
if (!fixedItem) {
  console.error("fixed expense not found", FIXED_EXPENSE_ID);
  process.exit(1);
}

console.log("BEFORE tx:", {
  date: tx.transactionAt,
  withdrawal: tx.withdrawal,
  linkedCompanyExpenseId: tx.linkedCompanyExpenseId,
  linkedFixedExpensePaymentId: tx.linkedFixedExpensePaymentId,
  folderId: tx.folderId,
});

const removedExpense = (d.companyExpenses || []).find((row) => row.id === VARIABLE_EXPENSE_ID);
if (removedExpense) {
  console.log("removing variable expense:", removedExpense.id, removedExpense.category, removedExpense.amount);
}

d.companyExpenses = (d.companyExpenses || []).filter((row) => row.id !== VARIABLE_EXPENSE_ID);

const existingPayment = (d.fixedExpensePayments || []).find(
  (row) => row.bankTransactionId === TX_ID || row.id === tx.linkedFixedExpensePaymentId,
);

let payment;
if (existingPayment) {
  payment = {
    ...existingPayment,
    fixedExpenseId: FIXED_EXPENSE_ID,
    date: String(tx.transactionAt || "").slice(0, 10),
    amount: Number(tx.withdrawal || 0),
    category: fixedItem.category || undefined,
    memo: `${buildFixedExpensePaymentMemoFromBankTx(tx, fixedItem)} (4\uC6D4 \uBD84)`,,
    bankTransactionId: TX_ID,
  };
  d.fixedExpensePayments = (d.fixedExpensePayments || []).map((row) => (row.id === existingPayment.id ? payment : row));
  console.log("updated payment", payment.id);
} else {
  payment = {
    id: randomUUID(),
    fixedExpenseId: FIXED_EXPENSE_ID,
    date: String(tx.transactionAt || "").slice(0, 10),
    amount: Number(tx.withdrawal || 0),
    category: fixedItem.category || undefined,
    memo: `${buildFixedExpensePaymentMemoFromBankTx(tx, fixedItem)} (4\uC6D4 \uBD84)`,,
    bankTransactionId: TX_ID,
    createdBy: "repair-ray-rent-april",
    createdAt: new Date().toISOString(),
  };
  d.fixedExpensePayments = [payment, ...(d.fixedExpensePayments || [])];
  console.log("created payment", payment.id);
}

tx.linkedFixedExpensePaymentId = payment.id;
tx.linkedCompanyExpenseId = undefined;
tx.folderId = LEDGER_FOLDER_ID;
tx.classifiedAt = tx.classifiedAt || new Date().toISOString();

d.fixedExpenses = (d.fixedExpenses || []).map((row) =>
  row.id === FIXED_EXPENSE_ID
    ? {
        ...row,
        startDate: row.startDate && row.startDate <= "2026-04-01" ? row.startDate : "2026-04-01",
      }
    : row,
);

const refTx = (d.bankTransactions || []).find((row) => row.id === REF_TX_ID) || tx;
const hasFixedRule = (d.bankLedgerRules || []).some(
  (rule) => rule.kind === "fixed" && rule.fixedExpenseId === FIXED_EXPENSE_ID,
);
if (!hasFixedRule) {
  d.bankLedgerRules = [buildFixedRule(refTx, FIXED_EXPENSE_ID), ...(d.bankLedgerRules || [])];
  console.log("added fixed learn rule from", refTx.id);
} else {
  console.log("fixed learn rule already exists");
}

console.log("AFTER tx:", {
  linkedFixedExpensePaymentId: tx.linkedFixedExpensePaymentId,
  linkedCompanyExpenseId: tx.linkedCompanyExpenseId,
  folderId: tx.folderId,
});
console.log("payment:", { id: payment.id, date: payment.date, amount: payment.amount, fixedExpenseId: payment.fixedExpenseId });

if (!dryRun) {
  db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
    JSON.stringify(d),
    Number(state.version) + 1,
    new Date().toISOString(),
    "repair-ray-rent-april",
  );
  console.log("saved version", Number(state.version) + 1);
} else {
  console.log("dry-run only");
}
