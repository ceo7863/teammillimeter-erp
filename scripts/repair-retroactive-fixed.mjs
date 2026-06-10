#!/usr/bin/env node
/**
 * Retroactive fixed-expense months: adjust startDate, generate Feb–Apr payments, link banks, fix 신희숙.
 * Usage: npx tsx scripts/repair-retroactive-fixed.mjs [dbPath] [--dry-run]
 */
import { DatabaseSync } from "node:sqlite";
import {
  assignBankTxToFixedExpensePayment,
  buildFixedExpensePaymentMemoFromBankTx,
  releaseFixedExpensePaymentBankLink,
  syncBankTransactionLedgerLinkFields,
} from "../src/utils/bankCompanyLedger.ts";
import {
  buildMonthlyFixedExpensePayments,
  reconcileLedgerBankLinks,
} from "../src/utils/fixedExpenseAutomation.ts";
import {
  ensureDefaultBankTransactionFolders,
  syncLedgerLinkedBankTransactionFolders,
} from "../src/utils/bankTransactionFolders.ts";
import {
  getMonthKey,
  isFixedExpensePaymentBankLinked,
} from "../src/utils/companyLedger.ts";

const MONTHS = ["2026-02", "2026-03", "2026-04"];
const RENT_141_ID = "49ea5ece-a368-4ac3-92d2-a29e5da831c4";
const RETROACTIVE_START = "2026-02-01";

const dbPath = process.argv.find((a) => !a.startsWith("-") && a.endsWith(".sqlite")) || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

let bankTransactions = [...(data.bankTransactions || [])];
let companyExpenses = [...(data.companyExpenses || [])];
let fixedExpensePayments = [...(data.fixedExpensePayments || [])];
let fixedExpenses = [...(data.fixedExpenses || [])];

const startDateAdjustments = [];

function earliestLinkDate(fixedExpenseId) {
  let earliest = "";

  for (const payment of fixedExpensePayments) {
    if (payment.fixedExpenseId !== fixedExpenseId) continue;
    const date = String(payment.date || "").slice(0, 10);
    if (date && (!earliest || date < earliest)) earliest = date;
  }

  for (const tx of bankTransactions) {
    if (tx.linkedFixedExpensePaymentId) {
      const payment = fixedExpensePayments.find((p) => p.id === tx.linkedFixedExpensePaymentId);
      if (payment?.fixedExpenseId !== fixedExpenseId) continue;
    } else continue;
    const date = String(tx.transactionAt || "").slice(0, 10);
    if (date && (!earliest || date < earliest)) earliest = date;
  }

  return earliest;
}

for (let i = 0; i < fixedExpenses.length; i++) {
  const expense = fixedExpenses[i];
  if (!expense.isActive) continue;

  const linked = earliestLinkDate(expense.id);
  const mayLinked = fixedExpensePayments.some(
    (p) => p.fixedExpenseId === expense.id && getMonthKey(p.date) === "2026-05" && isFixedExpensePaymentBankLinked(p, bankTransactions),
  );

  let targetStart = expense.startDate || "";
  if (linked && (!targetStart || targetStart > linked)) {
    targetStart = linked.slice(0, 8) + "01";
  } else if (mayLinked && (!targetStart || targetStart > RETROACTIVE_START)) {
    targetStart = RETROACTIVE_START;
  }

  if (targetStart && targetStart !== expense.startDate) {
    startDateAdjustments.push({
      name: expense.name,
      from: expense.startDate,
      to: targetStart,
    });
    fixedExpenses[i] = { ...expense, startDate: targetStart };
  }
}

const generated = [];
for (const monthKey of MONTHS) {
  const batch = buildMonthlyFixedExpensePayments(
    fixedExpenses.filter((r) => r.isActive !== false),
    fixedExpensePayments,
    monthKey,
    "repair-retroactive-fixed",
  );
  if (batch.length) {
    fixedExpensePayments = [...batch, ...fixedExpensePayments];
    for (const row of batch) {
      generated.push({
        monthKey,
        name: fixedExpenses.find((f) => f.id === row.fixedExpenseId)?.name,
        amount: row.amount,
      });
    }
  }
}

const shinheeFixes = [];
for (const tx of bankTransactions) {
  const date = String(tx.transactionAt || "").slice(0, 10);
  if (!date.startsWith("2026-02") && !date.startsWith("2026-03")) continue;
  if (!String(tx.counterpartyName || "").includes("신희숙")) continue;
  if (Number(tx.withdrawal) !== 715000) continue;

  const payment = fixedExpensePayments.find((p) => p.id === tx.linkedFixedExpensePaymentId);
  const fixed = payment ? fixedExpenses.find((f) => f.id === payment.fixedExpenseId) : null;
  if (fixed?.id === RENT_141_ID) continue;

  if (!dryRun) {
    if (payment?.id) {
      fixedExpensePayments = releaseFixedExpensePaymentBankLink(fixedExpensePayments, payment.id, tx.id);
    }
    const rentItem = fixedExpenses.find((f) => f.id === RENT_141_ID);
    const assignment = assignBankTxToFixedExpensePayment({
      tx,
      resolvedFixedExpenseId: RENT_141_ID,
      fixedItem: rentItem,
      payments: fixedExpensePayments,
      fixedExpenses,
      resolvedCategory: rentItem?.category || "",
      memo: buildFixedExpensePaymentMemoFromBankTx(tx, rentItem),,
      savedBy: "repair-retroactive-fixed",
    });
    fixedExpensePayments = assignment.payments;
    bankTransactions = bankTransactions.map((row) =>
      row.id === tx.id
        ? { ...row, linkedFixedExpensePaymentId: assignment.paymentId, linkedCompanyExpenseId: undefined }
        : row,
    );
  }

  shinheeFixes.push({ date, from: fixed?.name || null, to: "임대료(141호)" });
}

const reconciled = reconcileLedgerBankLinks({
  bankTransactions,
  fixedExpensePayments,
  companyExpenses,
  fixedExpenses,
});

bankTransactions = reconciled.bankTransactions;
fixedExpensePayments = reconciled.fixedExpensePayments;
companyExpenses = reconciled.companyExpenses;

const folders = ensureDefaultBankTransactionFolders(data.bankTransactionFolders || []);
const synced = syncBankTransactionLedgerLinkFields(bankTransactions, companyExpenses, fixedExpensePayments);
const folderSync = syncLedgerLinkedBankTransactionFolders(synced, folders, {
  companyExpenses,
  fixedExpensePayments,
});

function countUnpaid(monthKey) {
  return fixedExpensePayments
    .filter((p) => getMonthKey(p.date) === monthKey)
    .filter((p) => !isFixedExpensePaymentBankLinked(p, folderSync.transactions))
    .map((p) => ({
      name: fixedExpenses.find((f) => f.id === p.fixedExpenseId)?.name,
      amount: p.amount,
      date: p.date,
    }));
}

console.log(
  JSON.stringify(
    {
      dryRun,
      startDateAdjustments,
      generatedCount: generated.length,
      generatedSample: generated.slice(0, 25),
      shinheeFixes,
      reconciledLinked: reconciled.linkedCount,
      removedDuplicates: reconciled.removedDuplicateCount,
      aprilUnpaid: countUnpaid("2026-04"),
      marchUnpaid: countUnpaid("2026-03"),
      febUnpaid: countUnpaid("2026-02"),
    },
    null,
    2,
  ),
);

if (dryRun) process.exit(0);

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify({
    ...data,
    fixedExpenses,
    bankTransactions: folderSync.transactions,
    bankTransactionFolders: folderSync.folders,
    companyExpenses,
    fixedExpensePayments,
  }),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-retroactive-fixed",
);
console.log("saved version", Number(state.version || 0) + 1);
