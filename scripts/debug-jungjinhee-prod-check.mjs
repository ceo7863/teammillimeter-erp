#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const d = JSON.parse(String(new DatabaseSync(process.argv[2] || "data/erp.sqlite").prepare("SELECT payload FROM erp_state WHERE id=1").get().payload));
const CP = "\uC815\uC9C4";
for (const x of d.bankTransactions || []) {
  if (!String(x.counterpartyName || "").includes(CP)) continue;
  if (Number(x.withdrawal) !== 880000) continue;
  const pay = (d.fixedExpensePayments || []).find((p) => p.id === x.linkedFixedExpensePaymentId);
  const fixed = (d.fixedExpenses || []).find((f) => f.id === pay?.fixedExpenseId);
  console.log({ id: x.id, date: x.transactionAt, linked: fixed?.name || x.linkedCompanyExpenseId || "-" });
}
