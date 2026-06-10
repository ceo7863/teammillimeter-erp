#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const d = JSON.parse(new DatabaseSync(process.argv[2] || "data/erp.sqlite").prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const p = d.fixedExpensePayments || [];
const t = d.bankTransactions || [];
for (const mk of ["2026-02", "2026-03", "2026-04"]) {
  let byPay = 0;
  let byLink = 0;
  for (const tx of t) {
    if (!String(tx.transactionAt).startsWith(mk) || !(Number(tx.withdrawal) > 0)) continue;
    if (p.some((x) => x.bankTransactionId === tx.id)) byPay += 1;
    if (tx.linkedFixedExpensePaymentId) byLink += 1;
  }
  const repair = p.filter(
    (x) => x.createdBy === "repair-backfill-fixed" && String(x.date || "").startsWith(mk),
  ).length;
  console.log(mk, { byPay, byLink, repairBackfillPayments: repair });
}
