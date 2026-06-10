#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const txId = process.argv[3] || "453dc640-186c-4d0b-89a5-b2df081acd2c";

const bc = (d.bankTransactions || []).filter((t) => {
  const text = JSON.stringify(t);
  return (/\uBE44\uC528|\"BC\"/.test(text)) && Number(t.withdrawal) > 0;
});
console.log("all BC withdrawals", bc.length);
for (const t of bc) {
  const pay = (d.fixedExpensePayments || []).find(
    (p) => p.bankTransactionId === t.id || p.id === t.linkedFixedExpensePaymentId,
  );
  const exp = (d.companyExpenses || []).find(
    (e) => e.bankTransactionId === t.id || e.id === t.linkedCompanyExpenseId,
  );
  const fe = pay ? (d.fixedExpenses || []).find((f) => f.id === pay.fixedExpenseId) : null;
  console.log({
    date: String(t.transactionAt || "").slice(0, 10),
    amt: t.withdrawal,
    folder: t.folderId,
    fixed: fe?.name,
    expCat: exp?.category,
    expKind: exp?.kind,
    id: t.id,
  });
}

const pays = (d.fixedExpensePayments || []).filter((p) => p.bankTransactionId === txId);
const exps = (d.companyExpenses || []).filter((e) => e.bankTransactionId === txId);
console.log("\norphan pays for tx", pays);
console.log("orphan exps for tx", exps);

const apr2546 = (d.fixedExpensePayments || []).filter(
  (p) => String(p.date || "").startsWith("2026-04") && Number(p.amount) === 2546787,
);
console.log("\napr 2546787 payments", apr2546);

const apr2546exp = (d.companyExpenses || []).filter(
  (e) => String(e.date || "").startsWith("2026-04") && Number(e.amount) === 2546787,
);
console.log("apr 2546787 expenses", apr2546exp);

const rules = (d.bankMemoLearnRules || []).filter((r) => {
  const s = JSON.stringify(r);
  return /\uBE44\uC528|BC|2546787|453dc640/.test(s);
});
console.log("\nlearn rules", rules.length);
for (const r of rules) console.log(JSON.stringify(r, null, 2));

const cardFixed = (d.fixedExpenses || []).filter((f) => {
  const s = JSON.stringify(f);
  return /\uCE74\uB4DC|\uBE44\uC528|BC|card/i.test(s);
});
console.log("\ncard-related fixed expenses", cardFixed.map((f) => ({ id: f.id, name: f.name, amount: f.amount })));

console.log("\nversion", db.prepare("SELECT version FROM erp_state WHERE id=1").get().version);
