#!/usr/bin/env node
/** Fix mislinked insurance/ecount fixed payments on production DB. */
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

const REMOVE_PAYMENT_IDS = new Set([
  "8436b199-79fa-470c-b28f-a736f1f3db90", // 한화 → 잘못 이카ount
  "0d9b73b2-2127-4771-9e14-bccc8e9f0c61", // 연금 → 잘못 사대보험 (국민연금에 이미 연결됨)
]);

const HANWHA_PAYMENT_ID = "f758f695-95b2-4b76-bb59-cd84f60fa30f";
const HANWHA_BANK_TX_ID = "d87f4cbb-f4ca-4392-9f89-868d08ca8f67";

let payments = (data.fixedExpensePayments || []).filter((p) => !REMOVE_PAYMENT_IDS.has(p.id));
let transactions = [...(data.bankTransactions || [])];
let rules = [...(data.bankLedgerRules || [])];

const hanwhaTx = transactions.find((t) => t.id === HANWHA_BANK_TX_ID);
payments = payments.map((p) => {
  if (p.id !== HANWHA_PAYMENT_ID) return p;
  return {
    ...p,
    bankTransactionId: HANWHA_BANK_TX_ID,
    date: String(hanwhaTx?.transactionAt || p.date).slice(0, 10),
    amount: Number(hanwhaTx?.withdrawal || p.amount),
    memo: "\uD55C\uD654\uC0DD\uBA85\uCD08\uD68C \u00B7 \uD55C\uD654\uC0DD\uBA85\uBCF4\uD5D8(\uC8FC)",
    category: "\uBCF4\uD5D8",
  };
});

transactions = transactions.map((tx) => {
  if (tx.id === HANWHA_BANK_TX_ID) {
    return { ...tx, linkedFixedExpensePaymentId: HANWHA_PAYMENT_ID, linkedCompanyExpenseId: undefined };
  }
  if (REMOVE_PAYMENT_IDS.has(tx.linkedFixedExpensePaymentId || "")) {
    return { ...tx, linkedFixedExpensePaymentId: undefined };
  }
  return tx;
});

// 사대보험 rule: drop pension token so 국민연금2604 routes to 국민연금 only
rules = rules.map((rule) => {
  if (rule.kind !== "fixed") return rule;
  const fixed = (data.fixedExpenses || []).find((f) => f.id === rule.fixedExpenseId);
  if (fixed?.name !== "\uC0AC\uB300\uBCF4\uD5D8(\uAC74\uAC15/\uC5F0\uAE08)") return rule;
  const tokens = (rule.descriptionTokens || []).filter(
    (t) => !String(t).includes("\uAD6D\uB3C4\uC5F0\uAE082604") && t !== "\uAD6D\uB3C4\uC5F0\uAE082604",
  );
  return { ...rule, descriptionTokens: tokens };
});

// Ensure 한화생명 fixed learn rule exists
const hanwhaFixedId = "9531748b-874e-4e32-b11a-9677907bd7fa";
const hasHanwhaRule = rules.some(
  (r) => r.kind === "fixed" && r.fixedExpenseId === hanwhaFixedId && (r.descriptionTokens || []).some((t) => String(t).includes("\uD55C\uD654")),
);
if (!hasHanwhaRule) {
  rules.push({
    id: `repair-hanwha-${Date.now()}`,
    kind: "fixed",
    fixedExpenseId: hanwhaFixedId,
    counterpartyName: "\uD55C\uD654\uC0DD\uBA85\uBCF4\uD5D8(\uC8FC)",
    descriptionTokens: ["\uD55C\uD654\uC0DD\uBA85\uCD08\uD68C", "\uD55C\uD654\uC0DD\uBA85", "\uD55C\uD654\uC0DD\uBA85\uBCF4\uD5D8"],
    createdAt: new Date().toISOString(),
    createdBy: "repair-insurance-links",
  });
}

const nextPayload = {
  ...data,
  fixedExpensePayments: payments,
  bankTransactions: transactions,
  bankLedgerRules: rules,
};

const nextVersion = Number(state.version || 0) + 1;
db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify(nextPayload),
  nextVersion,
  new Date().toISOString(),
  "repair-insurance-links",
);

console.log(
  JSON.stringify(
    {
      version: nextVersion,
      removedPayments: [...REMOVE_PAYMENT_IDS],
      hanwhaLinked: HANWHA_PAYMENT_ID,
      paymentCount: payments.length,
    },
    null,
    2,
  ),
);
