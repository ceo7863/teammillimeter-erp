/**
 * Audit suspicious bank tx ? fixed expense payment links.
 * Usage: node scripts/audit-bank-fixed-links.mjs [path/to/erp.sqlite|erp-seed.json]
 *
 * Read-only � does not modify data. Back up before any manual unlink/repair.
 */
import fs from "node:fs";
import path from "node:path";

function normalizeText(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, "");
}

async function loadState(sourcePath) {
  const resolved = path.resolve(sourcePath || "data/erp.sqlite");
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  if (resolved.endsWith(".json")) {
    const raw = JSON.parse(fs.readFileSync(resolved, "utf8"));
    return raw.data || raw;
  }

  const { getErpState } = await import("../server/db.mjs");
  process.env.DATABASE_PATH = resolved;
  return getErpState().data;
}

function nameMatchesTx(expenseName, tx) {
  const haystack = normalizeText(
    [tx.description, tx.counterpartyName, tx.memo, tx.transactionType].filter(Boolean).join(" "),
  );
  const nameKey = normalizeText(expenseName);
  if (nameKey.length >= 2 && haystack.includes(nameKey)) return true;

  const tokens = String(expenseName || "")
    .split(/[\s/.]+/)
    .map((token) => normalizeText(token))
    .filter((token) => token.length >= 2);
  return tokens.some((token) => haystack.includes(token));
}

function amountMatches(withdrawal, payment, expense) {
  if (withdrawal <= 0) return false;
  if (withdrawal === Number(payment.amount)) return true;
  if (expense && withdrawal === Number(expense.amount)) return true;
  return false;
}

const sourcePath = process.argv[2];
const state = await loadState(sourcePath);

const bankTransactions = state.bankTransactions || [];
const fixedExpensePayments = state.fixedExpensePayments || [];
const fixedExpenses = state.fixedExpenses || [];

const expenseById = new Map(fixedExpenses.map((row) => [row.id, row]));
const txById = new Map(bankTransactions.map((row) => [row.id, row]));

const suspicious = [];
const linkedPayments = fixedExpensePayments.filter((row) => row.bankTransactionId);

for (const payment of linkedPayments) {
  const tx = txById.get(payment.bankTransactionId);
  const expense = expenseById.get(payment.fixedExpenseId);
  if (!tx) {
    suspicious.push({
      reason: "missing-bank-tx",
      paymentId: payment.id,
      bankTransactionId: payment.bankTransactionId,
      paymentDate: payment.date,
      paymentAmount: payment.amount,
      fixedExpenseId: payment.fixedExpenseId,
      fixedExpenseName: expense?.name || "(unknown)",
    });
    continue;
  }

  const withdrawal = Number(tx.withdrawal || 0);
  const amountOk = amountMatches(withdrawal, payment, expense);
  const nameOk = expense ? nameMatchesTx(expense.name, tx) : false;

  if (!amountOk || !nameOk) {
    suspicious.push({
      reason: !amountOk && !nameOk ? "amount-and-name-mismatch" : !amountOk ? "amount-mismatch" : "name-mismatch",
      paymentId: payment.id,
      bankTransactionId: tx.id,
      txDate: tx.transactionAt,
      txDescription: tx.description || tx.counterpartyName || "",
      withdrawal,
      paymentDate: payment.date,
      paymentAmount: payment.amount,
      fixedExpenseId: payment.fixedExpenseId,
      fixedExpenseName: expense?.name || "(unknown)",
      fixedExpenseAmount: expense?.amount,
      fixedExpenseCategory: expense?.category,
    });
  }
}

const txLinkedViaField = bankTransactions.filter((row) => row.linkedFixedExpensePaymentId);
const orphanTxLinks = txLinkedViaField.filter((tx) => {
  const payment = fixedExpensePayments.find((row) => row.id === tx.linkedFixedExpensePaymentId);
  return !payment || payment.bankTransactionId !== tx.id;
});

console.log("=== Bank ? Fixed expense link audit (read-only) ===");
console.log(`Source: ${sourcePath || "data/erp.sqlite"}`);
console.log(`Linked payments: ${linkedPayments.length}`);
console.log(`Suspicious links: ${suspicious.length}`);
console.log(`Orphan tx.linkedFixedExpensePaymentId: ${orphanTxLinks.length}`);
console.log("");

if (suspicious.length) {
  console.log("--- Suspicious links ---");
  for (const row of suspicious) {
    console.log(JSON.stringify(row, null, 0));
  }
  console.log("");
}

if (orphanTxLinks.length) {
  console.log("--- Orphan bank tx links ---");
  for (const tx of orphanTxLinks) {
    console.log(
      JSON.stringify({
        bankTransactionId: tx.id,
        linkedFixedExpensePaymentId: tx.linkedFixedExpensePaymentId,
        txDate: tx.transactionAt,
        withdrawal: tx.withdrawal,
        description: tx.description || tx.counterpartyName || "",
      }),
    );
  }
  console.log("");
}

console.log("Recovery (UI):");
console.log("  1. Company ledger ? fixed payment row ? delete (clears bank link)");
console.log("  2. Or edit payment and remove bank link via ledger page unlink helpers");
console.log("  3. Bank transactions ? manually register correct ledger target");
console.log("");
console.log("Back up data/erp.sqlite before bulk edits.");
