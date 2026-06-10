#!/usr/bin/env node
/** Investigate 2026-05-27 Jung Jin-hee 880000 -> eCount mislink */
import { DatabaseSync } from "node:sqlite";
import {
  findMatchingBankLedgerRule,
  scoreBankLearnRule,
  buildBankLedgerMatchHaystack,
  normalizeBankLearnRules,
} from "../src/utils/bankCompanyLedger.ts";
import {
  getMonthKey,
  bankTransactionMatchesFixedPayment,
  findLinkableFixedExpensePayment,
  resolveFixedExpenseIdForBankTransaction,
} from "../src/utils/companyLedger.ts";
import {
  autoLinkBankTransactionsToFixedPayments,
  reconcileLedgerBankLinks,
} from "../src/utils/fixedExpenseAutomation.ts";

const CP = "\uC815\uC9C4\uD76C";
const CP_PART1 = "\uC815\uC9C4";
const CP_PART2 = "\uC9C4\uD76C";
const ECOUNT_RE = /\uC774\uCE74|ecount|\uC6D4\uC218\uC218\uB8CC/i;

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

const fixedExpenses = d.fixedExpenses || [];
const payments = d.fixedExpensePayments || [];
const transactions = d.bankTransactions || [];
const rules = normalizeBankLearnRules(d.bankLedgerRules || []);
const companyExpenses = d.companyExpenses || [];

console.log("\n=== eCount fixed expenses ===");
for (const f of fixedExpenses) {
  const name = String(f.name || "");
  if (ECOUNT_RE.test(name)) {
    console.log({ id: f.id, name: f.name, amount: f.amount, active: f.isActive, category: f.category });
    for (const p of payments.filter((row) => row.fixedExpenseId === f.id && getMonthKey(row.date) === "2026-05")) {
      const tx = transactions.find((t) => t.id === p.bankTransactionId || t.linkedFixedExpensePaymentId === p.id);
      console.log("  payment:", {
        id: p.id,
        date: p.date,
        amount: p.amount,
        memo: p.memo,
        bankTxId: p.bankTransactionId,
        txCp: tx?.counterpartyName,
        txAmt: tx?.withdrawal,
        txDate: tx?.transactionAt?.slice(0, 10),
      });
    }
  }
}

console.log("\n=== target tx 2026-05-27 ===");
const targets = transactions.filter((t) => {
  const date = String(t.transactionAt || "").slice(0, 10);
  const cp = String(t.counterpartyName || "");
  const amt = Number(t.withdrawal || 0);
  return date === "2026-05-27" && cp.includes(CP) && amt === 880000;
});
if (!targets.length) {
  const broad = transactions.filter((t) => {
    const date = String(t.transactionAt || "").slice(0, 10);
    const cp = String(t.counterpartyName || "");
    const amt = Number(t.withdrawal || 0);
    return date.includes("2026-05-27") && (cp.includes(CP_PART1) || cp.includes(CP_PART2)) && amt === 880000;
  });
  console.log("exact match none, broad:", broad.length);
  targets.push(...broad);
}

for (const tx of targets) {
  console.log("\n--- TX ---");
  console.log({
    id: tx.id,
    date: tx.transactionAt?.slice(0, 10),
    cp: tx.counterpartyName,
    desc: tx.description,
    memo: tx.memo,
    amt: tx.withdrawal,
    linkedFixed: tx.linkedFixedExpensePaymentId,
    linkedCo: tx.linkedCompanyExpenseId,
    folderId: tx.folderId,
  });

  const linkedPay = payments.find((p) => p.id === tx.linkedFixedExpensePaymentId);
  if (linkedPay) {
    const fixed = fixedExpenses.find((f) => f.id === linkedPay.fixedExpenseId);
    console.log("linked payment:", { payId: linkedPay.id, fixedName: fixed?.name, memo: linkedPay.memo });
  }

  console.log("haystack:", buildBankLedgerMatchHaystack(tx));

  const matchedRule = findMatchingBankLedgerRule(tx, rules, fixedExpenses);
  console.log("matchedRule:", matchedRule
    ? {
        id: matchedRule.id,
        cp: matchedRule.counterpartyName,
        tokens: matchedRule.descriptionTokens,
        fixedId: matchedRule.fixedExpenseId,
        fixedName: fixedExpenses.find((f) => f.id === matchedRule.fixedExpenseId)?.name,
      }
    : null);

  const scored = rules
    .filter((r) => r.kind === "fixed")
    .map((r) => ({ rule: r, score: scoreBankLearnRule(tx, r, fixedExpenses) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  console.log("top rule scores:");
  for (const { rule, score } of scored) {
    const fixed = fixedExpenses.find((f) => f.id === rule.fixedExpenseId);
    console.log(`  ${score}: ${fixed?.name} | cp=${rule.counterpartyName} tokens=${JSON.stringify(rule.descriptionTokens)}`);
  }

  const fallbackId = matchedRule?.fixedExpenseId || null;
  const resolvedId = resolveFixedExpenseIdForBankTransaction(tx, fixedExpenses, fallbackId);
  console.log("resolveFixedExpenseId:", resolvedId, fixedExpenses.find((f) => f.id === resolvedId)?.name);

  if (resolvedId) {
    const pay = findLinkableFixedExpensePayment(tx, resolvedId, payments, fixedExpenses);
    console.log("findLinkablePayment:", pay ? { id: pay.id, amount: pay.amount, memo: pay.memo } : null);
  }

  for (const f of fixedExpenses.filter((x) => /\uC774\uCE74|ecount/i.test(String(x.name)))) {
    const mayPay = payments.find((p) => p.fixedExpenseId === f.id && getMonthKey(p.date) === "2026-05");
    if (!mayPay) continue;
    const hay = buildBankLedgerMatchHaystack(tx);
    const fullName = String(f.name || "").toLowerCase().replace(/\s+/g, "");
    const nameMatch = fullName.length >= 2 && hay.includes(fullName)
      ? "fullName"
      : String(f.name || "")
          .split(/[\s/�]+/)
          .map((t) => t.toLowerCase().replace(/\s+/g, ""))
          .filter((t) => t.length >= 2)
          .find((t) => hay.includes(t)) || false;
    const amtMatch = bankTransactionMatchesFixedPayment(tx, mayPay, fixedExpenses);
    console.log(`reconcile check ${f.name}: amtMatch=${amtMatch} nameMatch=${nameMatch}`);
  }
}

if (targets[0]) {
  const txId = targets[0].id;
  console.log("\n=== simulate autoLink (single tx) ===");
  const sim = autoLinkBankTransactionsToFixedPayments(
    transactions,
    payments,
    fixedExpenses,
    rules,
    { companyExpenses, onlyTransactionIds: new Set([txId]) },
  );
  const after = sim.transactions.find((t) => t.id === txId);
  const pay = sim.payments.find((p) => p.id === after?.linkedFixedExpensePaymentId);
  const fixed = fixedExpenses.find((f) => f.id === pay?.fixedExpenseId);
  console.log({ linkedCount: sim.linkedCount, wouldLinkTo: fixed?.name, payMemo: pay?.memo });

  const rec = reconcileLedgerBankLinks({
    bankTransactions: sim.transactions,
    fixedExpensePayments: sim.payments,
    companyExpenses,
    fixedExpenses,
  });
  const afterRec = rec.bankTransactions.find((t) => t.id === txId);
  const payRec = rec.fixedExpensePayments.find((p) => p.id === afterRec?.linkedFixedExpensePaymentId);
  const fixedRec = fixedExpenses.find((f) => f.id === payRec?.fixedExpenseId);
  console.log("after reconcile:", { linkedCount: rec.linkedCount, linkTo: fixedRec?.name });
}

console.log("\n=== bankLedgerRules -> eCount ===");
const ecountIds = new Set(
  fixedExpenses.filter((f) => /\uC774\uCE74|ecount/i.test(String(f.name))).map((f) => f.id),
);
for (const r of rules.filter((row) => row.kind === "fixed" && ecountIds.has(row.fixedExpenseId))) {
  console.log({
    id: r.id,
    cp: r.counterpartyName,
    tokens: r.descriptionTokens,
    amount: r.amount,
    sourceTx: r.sourceBankTransactionId,
    fixed: fixedExpenses.find((f) => f.id === r.fixedExpenseId)?.name,
  });
}

console.log("\n=== all CP bank txs ===");
for (const t of transactions.filter((row) => String(row.counterpartyName || "").includes(CP))) {
  const pay = payments.find((p) => p.id === t.linkedFixedExpensePaymentId);
  const fixed = fixedExpenses.find((f) => f.id === pay?.fixedExpenseId);
  console.log({
    date: t.transactionAt?.slice(0, 10),
    amt: t.withdrawal,
    desc: t.description?.slice(0, 30),
    linked: fixed?.name || t.linkedCompanyExpenseId || "-",
  });
}
