#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const d = JSON.parse(String(new DatabaseSync(process.argv[2] || "data/erp.sqlite").prepare("SELECT payload FROM erp_state WHERE id=1").get().payload));
const tx = (d.bankTransactions || []).find((t) => t.id === "033238a5-fc2f-4ffd-9651-2609d9bb63f2");
const exp = (d.companyExpenses || []).find((e) => e.id === tx?.linkedCompanyExpenseId);
console.log({ category: exp?.category, amount: exp?.amount, memo: tx?.memo, fixedPay: tx?.linkedFixedExpensePaymentId });
