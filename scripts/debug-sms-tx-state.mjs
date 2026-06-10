#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const txId = process.argv[3] || "384f016f-ea91-47d2-b049-0075ef8589dd";

const db = new DatabaseSync(dbPath);
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);
const tx = (d.bankTransactions || []).find((row) => row.id === txId);
const pay = (d.fixedExpensePayments || []).find((row) => row.bankTransactionId === txId);
const fixed = pay
  ? (d.fixedExpenses || []).find((row) => row.id === pay.fixedExpenseId)
  : null;
const orphan = tx?.ledgerFixedExpenseId
  ? !(d.fixedExpenses || []).some((row) => row.id === tx.ledgerFixedExpenseId)
  : false;
const smsRules = (d.bankLedgerRules || []).filter(
  (rule) =>
    rule.kind === "fixed" &&
    (rule.descriptionTokens || []).some((t) => String(t).includes("SMS")),
);

console.log(
  JSON.stringify(
    {
      version: db.prepare("SELECT version FROM erp_state WHERE id = 1").get().version,
      tx: tx
        ? {
            id: tx.id,
            date: String(tx.transactionAt || "").slice(0, 10),
            withdrawal: tx.withdrawal,
            ledgerFixedExpenseId: tx.ledgerFixedExpenseId || null,
            linkedFixedExpensePaymentId: tx.linkedFixedExpensePaymentId || null,
            orphanLedgerFixedExpenseId: orphan,
          }
        : null,
      payment: pay
        ? { id: pay.id, fixedExpenseId: pay.fixedExpenseId, date: pay.date, amount: pay.amount }
        : null,
      fixedExpenseName: fixed?.name || null,
      smsFixedRuleCount: smsRules.length,
    },
    null,
    2,
  ),
);
