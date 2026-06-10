#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const keywords = ["\uC2E0\uB3C4\uB9AC\uCF54", "\uBCF5\uD569\uAE30", "\uC911\uC559"];
const fixed = (d.fixedExpenses || []).filter((f) =>
  keywords.some((k) => String(f.name || "").includes(k) || String(f.memo || "").includes(k)),
);
console.log("fixed expenses", fixed.length);
for (const f of fixed) console.log(JSON.stringify(f, null, 2));

for (const f of fixed) {
  const pays = (d.fixedExpensePayments || []).filter((p) => p.fixedExpenseId === f.id);
  console.log("\n", f.name, "payments", pays.length);
  for (const p of pays) console.log(p);
}

const rules = (d.bankLedgerRules || d.bankMemoLearnRules || []).filter((r) =>
  keywords.some((k) => JSON.stringify(r).includes(k)),
);
console.log("\nlearn rules", rules.length);
for (const r of rules) console.log(JSON.stringify(r, null, 2));

const txs = (d.bankTransactions || []).filter((t) =>
  keywords.some((k) => JSON.stringify(t).includes(k)),
);
console.log("\nbank txs", txs.length);
for (const t of txs.slice(0, 10)) {
  console.log({
    id: t.id,
    date: t.transactionAt?.slice(0, 10),
    amt: t.withdrawal,
    desc: t.description,
    cp: t.counterpartyName,
    linkedFixed: t.linkedFixedExpensePaymentId,
  });
}

console.log("\nversion", db.prepare("SELECT version FROM erp_state WHERE id=1").get().version);
