#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import {
  isFixedExpensePaymentBankLinked,
  isFixedExpensePaymentSettled,
  getMonthKey,
} from "../src/utils/companyLedger.ts";

const monthKey = process.argv[3] || "2026-04";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const bankTransactions = d.bankTransactions || [];
const payments = d.fixedExpensePayments || [];
const fixedExpenses = d.fixedExpenses || [];

const monthPayments = payments.filter((row) => getMonthKey(row.date) === monthKey);

const linked = [];
const unlinkedButSettled = [];
const unlinkedUnpaid = [];

for (const payment of monthPayments) {
  const name = fixedExpenses.find((f) => f.id === payment.fixedExpenseId)?.name || payment.fixedExpenseId;
  const bankLinked = isFixedExpensePaymentBankLinked(payment, bankTransactions);
  const settled = isFixedExpensePaymentSettled(payment, payments, bankTransactions, fixedExpenses);

  const row = {
    date: payment.date,
    name,
    amount: payment.amount,
    memo: payment.memo,
    bankLinked,
    settled,
    paymentId: payment.id.slice(0, 8),
    bankTxId: payment.bankTransactionId?.slice(0, 8) || null,
  };

  if (bankLinked) linked.push(row);
  else if (settled) unlinkedButSettled.push(row);
  else unlinkedUnpaid.push(row);
}

console.log(JSON.stringify({
  monthKey,
  totalPayments: monthPayments.length,
  directlyLinked: linked.length,
  unlinkedButSettled: unlinkedButSettled.length,
  unlinkedUnpaid: unlinkedUnpaid.length,
  unlinkedUnpaidList: unlinkedUnpaid,
  unlinkedButSettledSample: unlinkedButSettled.slice(0, 15),
}, null, 2));
