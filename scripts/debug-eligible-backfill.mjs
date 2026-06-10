#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { getMonthKey, isFixedExpensePaymentBankLinked } from "../src/utils/companyLedger.ts";
import { buildBankLedgerMatchHaystack } from "../src/utils/bankCompanyLedger.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const bankTransactions = d.bankTransactions || [];
const payments = d.fixedExpensePayments || [];
const fixedExpenses = d.fixedExpenses || [];

function norm(t) {
  return String(t || "").trim().toLowerCase();
}

const mayPatterns = [];
for (const tx of bankTransactions) {
  if (!String(tx.transactionAt || "").startsWith("2026-05")) continue;
  if (!tx.linkedFixedExpensePaymentId) continue;
  const pay = payments.find((p) => p.id === tx.linkedFixedExpensePaymentId);
  const fe = pay ? fixedExpenses.find((f) => f.id === pay.fixedExpenseId) : null;
  if (!fe) continue;
  mayPatterns.push({
    cp: norm(tx.counterpartyName),
    amount: Number(tx.withdrawal),
    fixed: fe.name,
    fixedId: fe.id,
    haystack: buildBankLedgerMatchHaystack(tx),
  });
}

const unlinked = bankTransactions.filter(
  (tx) =>
    Number(tx.withdrawal) > 0 &&
    !tx.linkedFixedExpensePaymentId &&
    !tx.linkedCompanyExpenseId &&
    String(tx.transactionAt || "").slice(0, 7) < "2026-05",
);

const matches = [];
for (const tx of unlinked) {
  const cp = norm(tx.counterpartyName);
  const amount = Number(tx.withdrawal);
  const hay = buildBankLedgerMatchHaystack(tx);
  for (const p of mayPatterns) {
    if (p.amount !== amount && Math.abs(p.amount - amount) / p.amount > 0.15) continue;
    if (cp && p.cp && cp === p.cp) {
      matches.push({
        date: String(tx.transactionAt).slice(0, 10),
        amount,
        cp: tx.counterpartyName,
        fixed: p.fixed,
        via: "cp",
      });
      break;
    }
    const shared = p.haystack.split(/\s+/).filter((t) => t.length >= 4 && hay.includes(t));
    if (shared.length >= 2) {
      matches.push({
        date: String(tx.transactionAt).slice(0, 10),
        amount,
        cp: tx.counterpartyName,
        fixed: p.fixed,
        via: "tokens",
        tokens: shared.slice(0, 3),
      });
      break;
    }
  }
}

console.log(JSON.stringify({
  mayPatterns: mayPatterns.length,
  unlinkedBeforeMay: unlinked.length,
  mayPatternMatches: matches.length,
  matches,
}, null, 2));

const shinhee = bankTransactions.filter((tx) => String(tx.counterpartyName || "").includes("신희숙"));
for (const tx of shinhee) {
  const pay = payments.find((p) => p.id === tx.linkedFixedExpensePaymentId);
  const fe = pay ? fixedExpenses.find((f) => f.id === pay.fixedExpenseId) : null;
  console.log({
    date: String(tx.transactionAt).slice(0, 10),
    amount: tx.withdrawal,
    fixed: fe?.name,
    linked: Boolean(tx.linkedFixedExpensePaymentId),
  });
}
