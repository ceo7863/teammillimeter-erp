#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { buildBankLedgerMatchHaystack } from "../src/utils/bankCompanyLedger.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
const tx = (d.bankTransactions || []).find(
  (t) => t.transactionAt?.startsWith("2026-04-01") && Number(t.withdrawal) === 33000 && String(t.description || "").includes("???"),
);
console.log("tx", tx?.id, tx?.description, tx?.linkedCompanyExpenseId, tx?.linkedFixedExpensePaymentId);
console.log("haystack", buildBankLedgerMatchHaystack(tx));

function normalizeCp(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, "");
}
const descCp = normalizeCp(tx?.description);
console.log("descCp", descCp);

const may = [];
for (const t of d.bankTransactions || []) {
  if (!String(t.transactionAt || "").startsWith("2026-05") || !t.linkedFixedExpensePaymentId) continue;
  if (Number(t.withdrawal) !== 33000) continue;
  const pay = (d.fixedExpensePayments || []).find((p) => p.id === t.linkedFixedExpensePaymentId);
  const fixed = (d.fixedExpenses || []).find((f) => f.id === pay?.fixedExpenseId);
  may.push({ cp: t.counterpartyName, desc: t.description, fixed: fixed?.name, hay: buildBankLedgerMatchHaystack(t) });
}
console.log("may 33000", may);
