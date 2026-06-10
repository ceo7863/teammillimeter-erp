#!/usr/bin/env node
/**
 * Debug 2026-05-11 CEO advance (???? ????) txs showing "??? ??" in ???.
 * Usage: node scripts/debug-ceo-advance-ledger.mjs [sqlite-path]
 */
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT version, updated_at, payload FROM erp_state WHERE id = 1").get();
const d = JSON.parse(row.payload);

const TX_IDS = [
  "91d13a23-34d9-45aa-b9a9-ebd6acc01c53",
  "66c5da89-fbe1-4c4f-9d09-db3833f0a12f",
];
const MISSING_FIXED_ID = "a78c1f5c-bc56-4080-866c-a08f9a1bf229";

const fixedExpenses = d.fixedExpenses || [];
const fixedPayments = d.fixedExpensePayments || [];
const rules = d.bankLedgerRules || [];
const audits = d.auditLogs || [];

function pickTx(tx) {
  const paymentId = tx.linkedFixedExpensePaymentId;
  const payment = paymentId ? fixedPayments.find((p) => p.id === paymentId) : null;
  const fixedId = tx.ledgerFixedExpenseId || payment?.fixedExpenseId;
  const fixed = fixedId ? fixedExpenses.find((f) => f.id === fixedId) : null;
  return {
    id: tx.id,
    transactionAt: tx.transactionAt,
    withdrawal: tx.withdrawal,
    deposit: tx.deposit,
    counterpartyName: tx.counterpartyName,
    description: tx.description,
    memo: tx.memo,
    ledgerStatus: tx.ledgerStatus,
    ledgerAccountCode: tx.ledgerAccountCode,
    ledgerMemo: tx.ledgerMemo,
    ledgerClientName: tx.ledgerClientName,
    ledgerFixedExpenseId: tx.ledgerFixedExpenseId,
    linkedFixedExpensePaymentId: tx.linkedFixedExpensePaymentId,
    linkedCompanyExpenseId: tx.linkedCompanyExpenseId,
    folderId: tx.folderId,
    fixedExpenseName: fixed?.name || (fixedId ? `(MISSING: ${fixedId})` : null),
    payment,
  };
}

console.log("=== DB meta ===");
console.log({ version: row.version, updated_at: row.updated_at });

console.log("\n=== Target txs (2026-05-11 3M) ===");
const txs = (d.bankTransactions || []).filter((tx) => {
  const date = String(tx.transactionAt || "").slice(0, 10);
  const amount = Number(tx.withdrawal || 0);
  const hay = [tx.memo, tx.description, tx.counterpartyName].join(" ");
  return (
    TX_IDS.includes(tx.id) ||
    (date === "2026-05-11" && amount === 3000000 && hay.includes("????"))
  );
});
for (const tx of txs) {
  console.log(JSON.stringify(pickTx(tx), null, 2));
}

console.log("\n=== Missing fixed expense a78c1f5c ===");
const fixed = fixedExpenses.find((f) => f.id === MISSING_FIXED_ID);
console.log("current record:", fixed || "(not in fixedExpenses)");

const fixedAudits = audits.filter((a) => {
  const s = JSON.stringify(a);
  return s.includes(MISSING_FIXED_ID);
});
console.log("audit entries referencing id:", fixedAudits.length);
for (const a of fixedAudits.slice(-15)) {
  console.log(
    JSON.stringify(
      {
        at: a.createdAt || a.timestamp,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        fieldLabel: a.fieldLabel,
        before: a.before,
        after: a.after,
        screen: a.screen,
        userName: a.userName,
      },
      null,
      2,
    ),
  );
}

const paymentsForMissing = fixedPayments.filter((p) => p.fixedExpenseId === MISSING_FIXED_ID);
console.log("\nfixedExpensePayments still pointing to missing id:", paymentsForMissing.length);
for (const p of paymentsForMissing.slice(0, 10)) {
  const tx = (d.bankTransactions || []).find((t) => t.id === p.bankTransactionId);
  console.log(
    JSON.stringify({
      paymentId: p.id,
      date: p.date,
      amount: p.amount,
      bankTxId: p.bankTransactionId,
      counterparty: tx?.counterpartyName,
      memo: tx?.memo,
    }),
  );
}

console.log("\n=== Bank learn rules (??, ???, ????) ===");
const ruleHits = rules.filter((r) => {
  const hay = [
    r.counterpartyName,
    r.description,
    r.memo,
    r.keyword,
    ...(r.descriptionTokens || []),
    r.fixedExpenseId,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    hay.includes("??") ||
    hay.includes("???") ||
    hay.includes("????") ||
    r.fixedExpenseId === MISSING_FIXED_ID
  );
});
for (const r of ruleHits) {
  const fe = r.fixedExpenseId ? fixedExpenses.find((f) => f.id === r.fixedExpenseId) : null;
  console.log(
    JSON.stringify(
      {
        id: r.id,
        kind: r.kind,
        counterpartyName: r.counterpartyName,
        descriptionTokens: r.descriptionTokens,
        memo: r.memo,
        keyword: r.keyword,
        category: r.category,
        accountCode: r.accountCode,
        fixedExpenseId: r.fixedExpenseId,
        fixedExpenseName: fe?.name || (r.fixedExpenseId ? `(MISSING: ${r.fixedExpenseId})` : null),
        createdAt: r.createdAt,
      },
      null,
      2,
    ),
  );
}

console.log("\n=== Audit log for target tx ids ===");
for (const txId of TX_IDS) {
  const txAudits = audits.filter((a) => {
    const s = JSON.stringify(a);
    return (
      a.entityId === txId ||
      s.includes(txId) ||
      (a.entityType === "bankTransaction" && a.entityId === txId)
    );
  });
  console.log(`\n--- tx ${txId}: ${txAudits.length} audits ---`);
  for (const a of txAudits.slice(-20)) {
    console.log(
      JSON.stringify(
        {
          at: a.createdAt || a.timestamp,
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId,
          fieldLabel: a.fieldLabel,
          before: a.before,
          after: a.after,
          screen: a.screen,
          userName: a.userName,
        },
        null,
        2,
      ),
    );
  }
}

console.log("\n=== All 2026-05-11 3M withdrawals ===");
const may11 = (d.bankTransactions || []).filter((tx) => {
  const date = String(tx.transactionAt || "").slice(0, 10);
  return date === "2026-05-11" && Number(tx.withdrawal || 0) === 3000000;
});
console.log("count:", may11.length);
for (const tx of may11) {
  console.log(
    JSON.stringify({
      id: tx.id,
      counterparty: tx.counterpartyName,
      memo: tx.memo,
      ledgerAccountCode: tx.ledgerAccountCode,
      ledgerMemo: tx.ledgerMemo,
      ledgerFixedExpenseId: tx.ledgerFixedExpenseId,
      ledgerStatus: tx.ledgerStatus,
    }),
  );
}
