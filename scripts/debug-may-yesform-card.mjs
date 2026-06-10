#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { isCheckCardBankTransaction } from "../src/utils/bankTransactions.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
const t = (d.bankTransactions || []).find(
  (x) => x.transactionAt?.startsWith("2026-05-05") && x.linkedFixedExpensePaymentId,
);
console.log({
  desc: t?.description,
  memo: t?.memo,
  checkCard: isCheckCardBankTransaction(t),
  withdrawal: t?.withdrawal,
});
