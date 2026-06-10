#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload FROM erp_state WHERE id=1").get();
const data = JSON.parse(String(row.payload));
const txs = data.bankTransactions || [];
const withCode = txs.filter((t) => String(t.ledgerAccountCode || "").trim());
const confirmedNoCode = txs.filter(
  (t) => t.ledgerStatus === "confirmed" && !String(t.ledgerAccountCode || "").trim(),
);
console.log("total txs", txs.length);
console.log("with ledgerAccountCode", withCode.length);
console.log("confirmed without code", confirmedNoCode.length);
console.log("accountCodes", (data.accountCodes || []).length);

const sample = txs.find((t) => Number(t.withdrawal) > 0) || txs[0];
if (sample) {
  console.log("sample tx", {
    id: sample.id,
    idType: typeof sample.id,
    code: sample.ledgerAccountCode,
    status: sample.ledgerStatus,
    linkedExp: sample.linkedCompanyExpenseId,
    desc: String(sample.description || "").slice(0, 40),
  });
}

const groups = new Map();
for (const t of txs) {
  const k = [t.transactionAt, t.withdrawal, t.deposit, t.description, t.balanceAfter].join("|");
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(t);
}
const dupeGroups = [...groups.entries()].filter(([, g]) => g.length > 1);
console.log("duplicate fingerprint groups", dupeGroups.length);
if (dupeGroups[0]) {
  const [, g] = dupeGroups[0];
  console.log(
    "first dupe group ids",
    g.map((t) => ({
      id: t.id,
      code: t.ledgerAccountCode,
      linkedExp: t.linkedCompanyExpenseId,
      linkedPay: t.linkedFixedExpensePaymentId,
    })),
  );
}
