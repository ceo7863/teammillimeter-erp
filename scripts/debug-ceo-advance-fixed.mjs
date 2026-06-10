#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

getDb();
const { data } = getErpState();
const txs = data.bankTransactions || [];
const fixedExpenses = data.fixedExpenses || [];
const fixedPayments = data.fixedExpensePayments || [];
const expenses = data.companyExpenses || [];

const hits = txs.filter((tx) => {
  const hay = [tx.description, tx.memo, tx.counterpartyName, tx.ledgerMemo, tx.ledgerClientName]
    .join(" ");
  const amount = Number(tx.withdrawal || 0);
  const date = String(tx.transactionAt || "").slice(0, 10);
  return (
    (date === "2026-05-11" && amount === 3000000) ||
    hay.includes("???") ||
    (date === "2026-05-11" && amount === 3000000)
  );
});

console.log(
  JSON.stringify(
    {
      hits: hits.map((tx) => ({
        id: tx.id,
        transactionAt: tx.transactionAt,
        withdrawal: tx.withdrawal,
        deposit: tx.deposit,
        description: tx.description,
        memo: tx.memo,
        counterpartyName: tx.counterpartyName,
        ledgerAccountCode: tx.ledgerAccountCode,
        ledgerClientName: tx.ledgerClientName,
        ledgerMemo: tx.ledgerMemo,
        ledgerFixedExpenseId: tx.ledgerFixedExpenseId,
        linkedFixedExpensePaymentId: tx.linkedFixedExpensePaymentId,
        linkedCompanyExpenseId: tx.linkedCompanyExpenseId,
        ledgerStatus: tx.ledgerStatus,
        folderId: tx.folderId,
      })),
      fixedLinks: hits.flatMap((tx) => {
        const paymentId = tx.linkedFixedExpensePaymentId;
        const payment = paymentId ? fixedPayments.find((p) => p.id === paymentId) : null;
        const fixedId = tx.ledgerFixedExpenseId || payment?.fixedExpenseId;
        const fixed = fixedId ? fixedExpenses.find((f) => f.id === fixedId) : null;
        return [
          {
            txId: tx.id,
            payment,
            fixed: fixed || (fixedId ? { missingId: fixedId } : null),
          },
        ];
      }),
      companyExpenseLinks: hits.map((tx) => ({
        txId: tx.id,
        linkedCompanyExpenseId: tx.linkedCompanyExpenseId,
        expense: expenses.find((e) => e.id === tx.linkedCompanyExpenseId) || null,
      })),
    },
    null,
    2,
  ),
);
