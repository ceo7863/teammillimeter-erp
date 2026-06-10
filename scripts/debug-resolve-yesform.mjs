#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { buildBankLedgerMatchHaystack } from "../src/utils/bankCompanyLedger.ts";
import { isCheckCardBankTransaction } from "../src/utils/bankTransactions.ts";
import { isNetGroupSuppressed } from "../src/utils/bankPreauthNetting.ts";

function normalizeCp(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, "");
}

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
const fixedExpenses = d.fixedExpenses || [];
const byCpAmount = new Map();

for (const tx of d.bankTransactions || []) {
  if (!String(tx.transactionAt || "").startsWith("2026-05") || !tx.linkedFixedExpensePaymentId) continue;
  if (Number(tx.withdrawal) !== 9900) continue;
  const pay = (d.fixedExpensePayments || []).find((p) => p.id === tx.linkedFixedExpensePaymentId);
  const amount = 9900;
  const cp = normalizeCp(tx.counterpartyName);
  const descCp = normalizeCp(tx.description);
  const entry = { fixedExpenseId: pay.fixedExpenseId, fixedName: fixedExpenses.find((f) => f.id === pay.fixedExpenseId)?.name };
  if (cp) byCpAmount.set(`${cp}|${amount}`, entry);
  if (descCp.length >= 2 && descCp !== cp) byCpAmount.set(`${descCp}|${amount}`, entry);
}

const tx = (d.bankTransactions || []).find(
  (t) => t.transactionAt?.startsWith("2026-02-06") && Number(t.withdrawal) === 9900,
);
const cp = normalizeCp(tx.counterpartyName);
const descCp = normalizeCp(tx.description);
const direct = !cp && descCp.length >= 2 ? byCpAmount.get(`${descCp}|9900`) : null;
console.log({
  cp,
  descCp,
  direct,
  mapKeys: [...byCpAmount.keys()],
  linkedFixed: tx?.linkedFixedExpensePaymentId,
  linkedCo: tx?.linkedCompanyExpenseId,
  checkCard: isCheckCardBankTransaction(tx),
  netSuppressed: isNetGroupSuppressed(tx),
});
