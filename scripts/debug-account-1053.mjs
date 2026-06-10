#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const accountCodes = d.accountCodes || d.ledgerAccountCodes || [];
const code1053 = accountCodes.filter((c) => String(c.code || c.accountCode || "") === "1053");
console.log("account 1053:", code1053);

const categories = d.ledgerCategories || [];
const ceoCat = categories.filter((c) => String(c.name || "").includes("???") || String(c.name || "").includes("??"));
console.log("ceo categories:", ceoCat.map((c) => ({ id: c.id, name: c.name, accountCode: c.accountCode })));

const txs1053 = (d.bankTransactions || []).filter((tx) => tx.ledgerAccountCode === "1053").slice(0, 8);
console.log("sample txs with 1053:", txs1053.map((tx) => ({
  id: tx.id,
  date: tx.transactionAt,
  counterparty: tx.counterpartyName,
  memo: tx.memo,
  ledgerMemo: tx.ledgerMemo,
  ledgerFixedExpenseId: tx.ledgerFixedExpenseId,
  withdrawal: tx.withdrawal,
})));
