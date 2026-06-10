#!/usr/bin/env node
/** Fix 2026-02-25 신희숙 715000 → 임대료(141호) (was wrongly linked to 관리비) */
import { DatabaseSync } from "node:sqlite";
import {
  assignBankTxToFixedExpensePayment,
  buildFixedExpensePaymentMemoFromBankTx,
  releaseFixedExpensePaymentBankLink,
} from "../src/utils/bankCompanyLedger.ts";

const dbPath = process.argv[2] || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");

const RENT_FIXED_ID = "49ea5ece-a368-4ac3-92d2-a29e5da831c4"; // 임대료(141호)
const MGMT_FIXED_ID = "963b9db0-a128-4505-91fe-fb8586b55c67"; // 관리비(141호)

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

const tx = (data.bankTransactions || []).find(
  (row) =>
    String(row.transactionAt || "").startsWith("2026-02-25") &&
    String(row.counterpartyName || "").includes("신희숙") &&
    Number(row.withdrawal) === 715000,
);
if (!tx) {
  console.log("target tx not found");
  process.exit(0);
}

const payment = (data.fixedExpensePayments || []).find((row) => row.id === tx.linkedFixedExpensePaymentId);
const fixed = payment
  ? (data.fixedExpenses || []).find((row) => row.id === payment.fixedExpenseId)
  : null;

console.log({ txId: tx.id, currentFixed: fixed?.name, paymentId: payment?.id });

if (fixed?.id === RENT_FIXED_ID) {
  console.log("already correct");
  process.exit(0);
}

if (dryRun) process.exit(0);

let payments = data.fixedExpensePayments || [];
if (payment?.id) {
  payments = releaseFixedExpensePaymentBankLink(payments, payment.id, tx.id);
}

const rentItem = (data.fixedExpenses || []).find((row) => row.id === RENT_FIXED_ID);
const assignment = assignBankTxToFixedExpensePayment({
  tx,
  resolvedFixedExpenseId: RENT_FIXED_ID,
  fixedItem: rentItem,
  payments,
  fixedExpenses: data.fixedExpenses || [],
  resolvedCategory: rentItem?.category || "",
  memo: buildFixedExpensePaymentMemoFromBankTx(tx, rentItem),,
  savedBy: "repair-shinhee-feb-rent",
});

const bankTransactions = (data.bankTransactions || []).map((row) =>
  row.id === tx.id
    ? { ...row, linkedFixedExpensePaymentId: assignment.paymentId, linkedCompanyExpenseId: undefined }
    : row,
);

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify({ ...data, bankTransactions, fixedExpensePayments: assignment.payments }),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-shinhee-feb-rent",
);
console.log("fixed → 임대료(141호), version", Number(state.version || 0) + 1);
