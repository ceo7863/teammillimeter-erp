#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
const TX_ID = "87606643-d02e-465a-8697-d43ccedbb2cc";

const fields = new Set();
for (const a of d.auditLogs || []) {
  if (a.entityId === TX_ID) fields.add(a.field);
}
console.log("audit fields for tx:", [...fields]);

const ledgerAudits = (d.auditLogs || []).filter((a) => {
  if (a.entityId !== TX_ID) return false;
  const f = String(a.field || a.fieldLabel || "");
  return /ledger|fixed|category|link|payment|memo/i.test(f) || /??|ecount|??|??/i.test(JSON.stringify(a));
});
console.log("\nledger-related audits:", ledgerAudits.length);
for (const a of ledgerAudits) console.log(a);

// Any payment ever linked to this tx?
const allPayLinks = (d.fixedExpensePayments || []).filter((p) => p.bankTransactionId === TX_ID);
console.log("\npayments with bankTransactionId=tx:", allPayLinks);

// eCount payments with wrong amount
const ecountId = "8dcaf0af-0fc4-4836-85b8-edc7e614a2e2";
for (const p of d.fixedExpensePayments || []) {
  if (p.fixedExpenseId !== ecountId) continue;
  const tx = (d.bankTransactions || []).find((t) => t.id === p.bankTransactionId || t.linkedFixedExpensePaymentId === p.id);
  console.log("ecount pay:", { id: p.id, date: p.date, amt: p.amount, memo: p.memo, txCp: tx?.counterpartyName, txAmt: tx?.withdrawal, txId: tx?.id });
}

// Search company ledger for rent 880000
for (const f of d.fixedExpenses || []) {
  if (Number(f.amount) === 880000 || String(f.name).includes("\uC815\uC9C4")) {
    console.log("fixed match:", f.name, f.amount, f.id);
  }
}

// Check if 880000 matches eCount via tolerance
const base = 44000;
const actual = 880000;
const ratio = Math.abs(actual - base) / base;
console.log("\n880k vs 44k tolerance ratio:", ratio, "compatible?", ratio <= 0.05);
