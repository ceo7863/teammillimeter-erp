#!/usr/bin/env node
import { getErpState } from "../server/db.mjs";

const state = getErpState();
const data = state.data || {};
const txs = data.bankTransactions || [];
const fixedExpenses = data.fixedExpenses || [];
const fixedExpensePayments = data.fixedExpensePayments || [];
const ledgerCategories = data.ledgerCategories || [];
const rules = data.bankLedgerRules || [];

const hits = txs.filter((t) => {
  const hay = [t.counterpartyName, t.description, t.memo].join(" ");
  return hay.includes("????") && String(t.transactionAt || "").startsWith("2026-06-10");
});

for (const t of hits) {
  const payment = fixedExpensePayments.find(
    (p) => p.id === t.linkedFixedExpensePaymentId || p.bankTransactionId === t.id,
  );
  const fixed = fixedExpenses.find(
    (f) => f.id === (payment?.fixedExpenseId || t.ledgerFixedExpenseId),
  );
  const cat = ledgerCategories.find((c) => c.id === fixed?.categoryId || c.name === fixed?.category);
  const matchingRules = rules.filter((r) => {
    const cp = String(r.counterpartyName || "").trim();
    return cp && String(t.counterpartyName || "").includes(cp.slice(0, 4));
  });

  console.log(
    JSON.stringify(
      {
        version: state.version,
        tx: {
          id: t.id,
          transactionAt: t.transactionAt,
          counterpartyName: t.counterpartyName,
          description: t.description,
          withdrawal: t.withdrawal,
          ledgerAccountCode: t.ledgerAccountCode,
          ledgerFixedExpenseId: t.ledgerFixedExpenseId,
          linkedFixedExpensePaymentId: t.linkedFixedExpensePaymentId,
          ledgerStatus: t.ledgerStatus,
          folderId: t.folderId,
          memo: t.memo,
        },
        payment,
        fixed: fixed
          ? {
              id: fixed.id,
              name: fixed.name,
              category: fixed.category,
              categoryId: fixed.categoryId,
              accountCode: fixed.accountCode,
            }
          : null,
        ledgerCategory: cat || null,
        rulesSample: matchingRules.slice(0, 3),
      },
      null,
      2,
    ),
  );
}

if (!hits.length) {
  console.log("No hits for 2026-06-10 ????");
}
