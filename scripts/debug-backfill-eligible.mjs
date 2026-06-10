#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { isNetGroupSuppressed } from "../src/utils/bankPreauthNetting.ts";
import { isCheckCardBankTransaction } from "../src/utils/bankTransactions.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
let eligible = 0;
let linkedFixed = 0;
for (const t of d.bankTransactions || []) {
  if (!(Number(t.withdrawal) > 0)) continue;
  if (t.linkedFixedExpensePaymentId) linkedFixed++;
  if (t.linkedFixedExpensePaymentId || t.linkedCompanyExpenseId) continue;
  if (isNetGroupSuppressed(t) || isCheckCardBankTransaction(t)) continue;
  eligible++;
}
console.log({ linkedFixed, eligible, totalWithdrawals: (d.bankTransactions || []).filter((t) => Number(t.withdrawal) > 0).length });
