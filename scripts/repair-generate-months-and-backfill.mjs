#!/usr/bin/env node
/**
 * Generate missing monthly fixed payments (Feb–Apr 2026) + backfill bank links + fix known mislinks.
 * Usage: npx tsx scripts/repair-generate-months-and-backfill.mjs [dbPath] [--dry-run]
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
import { getMonthKey } from "../src/utils/companyLedger.ts";

const MONTHS = ["2026-02", "2026-03", "2026-04"];
const RENT_141_ID = "49ea5ece-a368-4ac3-92d2-a29e5da831c4";

const dbPath = process.argv.find((a) => !a.startsWith("-") && a.endsWith(".sqlite")) || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

let bankTransactions = [...(data.bankTransactions || [])];
let companyExpenses = [...(data.companyExpenses || [])];
let fixedExpensePayments = [...(data.fixedExpensePayments || [])];
const fixedExpenses = (data.fixedExpenses || []).filter((r) => r.isActive !== false);

const generated = [];
for (const monthKey of MONTHS) {
  const batch = buildMonthlyFixedExpensePayments(
    fixedExpenses,
    fixedExpensePayments,
    monthKey,
    "repair-generate-months",
  );
  if (batch.length) {
    fixedExpensePayments = [...batch, ...fixedExpensePayments];
    for (const row of batch) {
      const name = fixedExpenses.find((f) => f.id === row.fixedExpenseId)?.name;
      generated.push({ monthKey, name, amount: row.amount, date: row.date });
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

  if (dryRun) {
    shinheeFixes.push({ date, from: fixed?.name, to: "임대료(141호)", dryRun: true });
    continue;
  }

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
    memo: buildFixedExpensePaymentMemoFromBankTx(tx, rentItem),
    savedBy: "repair-shinhee-rent",
  });

  fixedExpensePayments = assignment.payments;
  bankTransactions = bankTransactions.map((row) =>
    row.id === tx.id
      ? { ...row, linkedFixedExpensePaymentId: assignment.paymentId, linkedCompanyExpenseId: undefined }
      : row,
  );
  shinheeFixes.push({ date, from: fixed?.name, to: "임대료(141호)", paymentId: assignment.paymentId.slice(0, 8) });
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

const aprilUnpaid = fixedExpensePayments
  .filter((p) => getMonthKey(p.date) === "2026-04")
  .filter((p) => {
    const linked = folderSync.transactions.some((tx) => tx.linkedFixedExpensePaymentId === p.id);
    const direct = String(p.bankTransactionId || "").trim();
    return !linked && !direct;
  })
  .map((p) => ({
    date: p.date,
    name: fixedExpenses.find((f) => f.id === p.fixedExpenseId)?.name,
    amount: p.amount,
  }));

console.log(
  JSON.stringify(
    {
      dryRun,
      generatedCount: generated.length,
      generatedSample: generated.slice(0, 20),
      shinheeFixes,
      reconciledLinked: reconciled.linkedCount,
      removedDuplicates: reconciled.removedDuplicateCount,
      aprilUnpaidCount: aprilUnpaid.length,
      aprilUnpaidSample: aprilUnpaid.slice(0, 15),
    },
    null,
    2,
  ),
);

if (dryRun) process.exit(0);

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify({
    ...data,
    bankTransactions: folderSync.transactions,
    bankTransactionFolders: folderSync.folders,
    companyExpenses,
    fixedExpensePayments,
  }),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-generate-months-and-backfill",
);
console.log("saved version", Number(state.version || 0) + 1);
