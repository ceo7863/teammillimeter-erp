#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

for (const t of d.bankTransactions || []) {
  if (t.linkedFixedExpensePaymentId || !(Number(t.withdrawal) > 0)) continue;
  if (String(t.counterpartyName || "").trim()) continue;
  if (![33000, 100000, 9900, 44000].includes(Number(t.withdrawal))) continue;
  console.log({
    date: t.transactionAt?.slice(0, 10),
    amt: t.withdrawal,
    desc: t.description,
    memo: t.memo,
    var: t.linkedCompanyExpenseId,
  });
}
