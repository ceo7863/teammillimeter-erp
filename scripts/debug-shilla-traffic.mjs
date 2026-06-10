#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const KEY = "\uC2E0\uB77C";
const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const raw = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const txs = (raw.bankTransactions || []).filter((t) => {
  const hay = `${t.description || ""}${t.counterpartyName || ""}${t.memo || ""}${t.ledgerMemo || ""}`;
  return hay.includes(KEY) && Number(t.withdrawal) > 0;
});

const expenses = raw.companyExpenses || [];
const rules = (raw.bankLedgerRules || []).filter((r) => {
  const hay = JSON.stringify(r);
  return hay.includes(KEY) || hay.includes("\uAD50\uD86D") || hay.includes("\uC2DD");
});

console.log(
  JSON.stringify(
    {
      txs: txs.map((t) => {
        const expense = expenses.find((e) => e.bankTransactionId === t.id || e.id === t.linkedCompanyExpenseId);
        return {
          id: t.id,
          at: t.transactionAt,
          withdrawal: t.withdrawal,
          desc: t.description,
          counterparty: t.counterpartyName,
          memo: t.memo,
          ledgerAccountCode: t.ledgerAccountCode,
          ledgerMemo: t.ledgerMemo,
          ledgerCategoryId: t.ledgerCategoryId,
          ledgerStatus: t.ledgerStatus,
          linkedCompanyExpenseId: t.linkedCompanyExpenseId,
          expenseCategory: expense?.category,
          expenseMemo: expense?.memo,
          folderId: t.folderId,
        };
      }),
      rules,
      trafficRules: (raw.bankLedgerRules || []).filter((r) =>
        String(r.category || "").includes("\uAD50\uD86D"),
      ),
    },
    null,
    2,
  ),
);
