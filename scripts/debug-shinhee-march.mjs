#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { getMonthKey } from "../src/utils/companyLedger.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

for (const t of d.bankTransactions || []) {
  if (!String(t.transactionAt || "").includes("2026-03")) continue;
  if (!String(t.counterpartyName || "").includes("???")) continue;
  console.log({
    date: t.transactionAt?.slice(0, 10),
    amt: t.withdrawal,
    linkedFixed: t.linkedFixedExpensePaymentId,
    linkedCo: t.linkedCompanyExpenseId,
    desc: t.description,
    memo: t.memo,
  });
}

const fixed141 = (d.fixedExpenses || []).filter((f) => String(f.name).includes("141"));
for (const item of fixed141) {
  console.log("\n---", item.name, "---");
  for (const p of (d.fixedExpensePayments || []).filter((x) => x.fixedExpenseId === item.id && getMonthKey(x.date) === "2026-03")) {
    const tx = (d.bankTransactions || []).find((t) => t.id === p.bankTransactionId || t.linkedFixedExpensePaymentId === p.id);
    console.log({ date: p.date, amt: p.amount, bankTx: p.bankTransactionId, txCp: tx?.counterpartyName, txAmt: tx?.withdrawal });
  }
}
