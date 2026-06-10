#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv.find((a) => a.endsWith(".sqlite")) || "data/erp.sqlite";

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

const txs = data.bankTransactions || [];
const fixedExpenses = data.fixedExpenses || [];
const fixedExpensePayments = data.fixedExpensePayments || [];
const rules = data.bankLedgerRules || [];

function hayIncludesLg(text) {
  const hay = String(text || "").toLowerCase();
  return hay.includes("\uC5D8\uC9C0") || hay.includes("\uAD6C\uB3C5") || hay.includes("lg");
}

const hits = txs.filter((t) => {
  const hay = [t.counterpartyName, t.description, t.memo].join(" ");
  return hayIncludesLg(hay) && String(t.transactionAt || "").includes("2026-06-10");
});

const lgFixed = fixedExpenses.filter((f) => hayIncludesLg(`${f.name} ${f.category}`));
const lgRules = rules.filter((r) => {
  const cp = String(r.counterpartyName || "");
  const fixed = fixedExpenses.find((f) => f.id === r.fixedExpenseId);
  return hayIncludesLg(cp) || hayIncludesLg(fixed?.name) || hayIncludesLg(r.category);
});

function monthKey(d) {
  return String(d || "").slice(0, 7);
}

for (const t of hits) {
  const mk = monthKey(t.transactionAt);
  const paymentsSameMonth = fixedExpensePayments.filter(
    (p) => lgFixed.some((f) => f.id === p.fixedExpenseId) && monthKey(p.date) === mk,
  );
  console.log(
    JSON.stringify(
      {
        version: state.version,
        tx: {
          id: t.id,
          at: t.transactionAt,
          cp: t.counterpartyName,
          desc: t.description,
          withdrawal: t.withdrawal,
          transactionType: t.transactionType,
          folderId: t.folderId,
          ledgerFixedExpenseId: t.ledgerFixedExpenseId,
          linkedFixedExpensePaymentId: t.linkedFixedExpensePaymentId,
        },
        lgFixedItems: lgFixed.map((f) => ({
          id: f.id,
          name: f.name,
          category: f.category,
          amount: f.amount,
          paymentDay: f.paymentDayOfMonth,
          isActive: f.isActive,
        })),
        lgRules: lgRules.map((r) => ({
          id: r.id,
          kind: r.kind,
          counterpartyName: r.counterpartyName,
          fixedExpenseId: r.fixedExpenseId,
          amount: r.amount,
          tokens: (r.descriptionTokens || []).slice(0, 6),
        })),
        paymentsSameMonth,
        allJuneLgPayments: fixedExpensePayments
          .filter((p) => lgFixed.some((f) => f.id === p.fixedExpenseId) && monthKey(p.date) === "2026-06")
          .map((p) => ({
            id: p.id,
            fixedExpenseId: p.fixedExpenseId,
            date: p.date,
            amount: p.amount,
            bankTransactionId: p.bankTransactionId,
          })),
      },
      null,
      2,
    ),
  );
}

if (!hits.length) console.log(JSON.stringify({ version: state.version, message: "No LG tx on 2026-06-10" }));
