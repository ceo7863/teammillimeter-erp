#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { isFixedExpensePaymentBankLinked } from "../src/utils/companyLedger.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const data = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload));

function norm(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\w\uac00-\ud7a3]/g, "");
}

function resolve(p, txs) {
  const d = String(p.bankTransactionId || "").trim();
  if (d) return txs.find((t) => t.id === d) || null;
  return txs.find((t) => t.linkedFixedExpensePaymentId === p.id) || null;
}

const a = data.fixedExpenses.find((r) => r.id === "2a942748-5eae-4852-85c4-63d3c61696fc");
const b = data.fixedExpenses.find((r) => r.id === "0720dd9c-6fe8-4b76-82f9-b08ed0a9a759");
const chunks = [];
for (const p of data.fixedExpensePayments || []) {
  if (p.fixedExpenseId !== b.id) continue;
  if (!isFixedExpensePaymentBankLinked(p, data.bankTransactions || [])) continue;
  const tx = resolve(p, data.bankTransactions || []);
  chunks.push(tx?.description, tx?.counterpartyName, tx?.memo, p.memo);
}
const hay = norm(chunks.filter(Boolean).join(" "));
const key = norm(a?.name || "");
console.log(JSON.stringify({ a: a?.name, b: b?.name, key, hay, match: hay.includes(key) }, null, 2));
