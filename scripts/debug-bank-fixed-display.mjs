#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const payments = d.fixedExpensePayments || [];
const expenses = d.companyExpenses || [];

for (const mk of ["2026-04", "2026-05"]) {
  const txs = (d.bankTransactions || []).filter(
    (tx) => String(tx.transactionAt || "").slice(0, 7) === mk && Number(tx.withdrawal) > 0,
  );
  let fixedPayment = 0;
  let ledgerFixedId = 0;
  let variable = 0;
  let none = 0;
  for (const tx of txs) {
    const pay = payments.some((p) => p.bankTransactionId === tx.id);
    const exp = expenses.find((e) => e.bankTransactionId === tx.id);
    const fixedId = Boolean(tx.ledgerFixedExpenseId);
    if (pay) fixedPayment += 1;
    if (fixedId) ledgerFixedId += 1;
    if (exp && exp.kind !== "fixed") variable += 1;
    else if (!pay && !fixedId && !exp) none += 1;
  }
  console.log(mk, { txs: txs.length, fixedPayment, ledgerFixedId, variable, none });
}
