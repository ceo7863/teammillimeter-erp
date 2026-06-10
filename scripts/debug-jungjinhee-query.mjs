#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
const TX_ID = "87606643-d02e-465a-8697-d43ccedbb2cc";

const amt880 = (d.fixedExpenses || []).filter((f) => Number(f.amount) === 880000);
console.log("fixed 880k", amt880.map((f) => ({ id: f.id, name: f.name, cat: f.category })));

const rules = (d.bankLedgerRules || []).filter(
  (r) =>
    String(r.counterpartyName || "").includes("\uC815\uC9C4") ||
    (r.descriptionTokens || []).some((t) => String(t).includes("\uC815\uC9C4")),
);
console.log("rules with jung", JSON.stringify(rules, null, 2));

const tx = (d.bankTransactions || []).find((t) => t.id === TX_ID);
console.log("tx", tx);

const pays = (d.fixedExpensePayments || []).filter(
  (p) => p.bankTransactionId === TX_ID || p.amount === 880000,
);
console.log("payments 880k or linked", pays);

const co = (d.companyExpenses || []).filter((e) => e.bankTransactionId === TX_ID || Number(e.amount) === 880000);
console.log("company expenses for tx/880k", co);

const workers = (d.workers || []).filter((w) => String(w.name || "").includes("\uC815\uC9C4"));
console.log("workers", workers.map((w) => ({ name: w.name, id: w.id })));

const audits = (d.auditLogs || []).filter(
  (a) =>
    String(a.entityId || "") === TX_ID ||
    JSON.stringify(a.after || {}).includes(TX_ID) ||
    JSON.stringify(a.before || {}).includes(TX_ID),
);
console.log("audit logs", audits.slice(-20));

// May 2026 unlinked 880k withdrawals
console.log("\nMay 2026 880k withdrawals:");
for (const t of d.bankTransactions || []) {
  if (!String(t.transactionAt || "").startsWith("2026-05")) continue;
  if (Number(t.withdrawal) !== 880000) continue;
  const pay = (d.fixedExpensePayments || []).find((p) => p.id === t.linkedFixedExpensePaymentId);
  const fixed = (d.fixedExpenses || []).find((f) => f.id === pay?.fixedExpenseId);
  console.log({ id: t.id, cp: t.counterpartyName, linked: fixed?.name || t.linkedCompanyExpenseId || "-" });
}
