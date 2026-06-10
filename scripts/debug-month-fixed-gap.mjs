#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { getMonthKey, isFixedExpensePaymentBankLinked, isFixedExpensePaymentSettled } from "../src/utils/companyLedger.ts";
import {
  findBestBankLearnRuleWithScore,
  fixedLearnRuleAmountMatches,
  buildBankLedgerMatchHaystack,
} from "../src/utils/bankCompanyLedger.ts";

const monthKey = process.argv[3] || "2026-04";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const txs = d.bankTransactions || [];
const payments = d.fixedExpensePayments || [];
const expenses = d.companyExpenses || [];
const fixedExpenses = (d.fixedExpenses || []).filter((r) => r.isActive !== false);
const fixedRules = (d.bankLedgerRules || []).filter((r) => r.kind === "fixed");

const monthPayments = payments.filter((p) => getMonthKey(p.date) === monthKey);
const monthTxs = txs.filter((tx) => String(tx.transactionAt || "").slice(0, 7) === monthKey && Number(tx.withdrawal) > 0);

const paymentStatus = monthPayments.map((p) => {
  const name = fixedExpenses.find((f) => f.id === p.fixedExpenseId)?.name || "?";
  const bankLinked = isFixedExpensePaymentBankLinked(p, txs);
  const settled = isFixedExpensePaymentSettled(p, payments, txs, fixedExpenses);
  const bankTx = p.bankTransactionId ? txs.find((t) => t.id === p.bankTransactionId) : null;
  return {
    name,
    date: p.date,
    amount: p.amount,
    bankLinked,
    settled,
    bankTxDesc: bankTx?.description,
    memo: p.memo,
  };
});

// Fixed-rule txs registered as variable expense instead
const wrongVariable = [];
for (const tx of monthTxs) {
  const expense = expenses.find((e) => e.bankTransactionId === tx.id);
  if (!expense || expense.kind === "fixed") continue;
  const match = findBestBankLearnRuleWithScore(tx, fixedRules, fixedExpenses, ["fixed"]);
  if (!match?.rule?.fixedExpenseId) continue;
  if (!fixedLearnRuleAmountMatches(tx, match.rule, fixedExpenses)) continue;
  const fixedName = fixedExpenses.find((f) => f.id === match.rule.fixedExpenseId)?.name;
  wrongVariable.push({
    date: String(tx.transactionAt || "").slice(0, 10),
    description: tx.description,
    withdrawal: tx.withdrawal,
    expenseCategory: expense.category,
    shouldBeFixed: fixedName,
    folderId: tx.folderId ? "yes" : "no",
  });
}

// Unlinked txs that match fixed rules
const unlinkedMatch = [];
for (const tx of monthTxs) {
  const hasPayment = payments.some((p) => p.bankTransactionId === tx.id);
  const hasExpense = expenses.some((e) => e.bankTransactionId === tx.id);
  if (hasPayment || hasExpense) continue;
  const match = findBestBankLearnRuleWithScore(tx, fixedRules, fixedExpenses, ["fixed"]);
  if (!match?.rule?.fixedExpenseId) continue;
  if (!fixedLearnRuleAmountMatches(tx, match.rule, fixedExpenses)) continue;
  unlinkedMatch.push({
    date: String(tx.transactionAt || "").slice(0, 10),
    description: tx.description,
    withdrawal: tx.withdrawal,
    fixedName: fixedExpenses.find((f) => f.id === match.rule.fixedExpenseId)?.name,
    folderId: tx.folderId,
    ledgerAccountCode: tx.ledgerAccountCode,
  });
}

const folderBlocked = monthTxs.filter((tx) => tx.folderId).length;

console.log(
  JSON.stringify(
    {
      monthKey,
      withdrawalTxCount: monthTxs.length,
      withFolderId: folderBlocked,
      fixedPayments: paymentStatus.length,
      bankLinkedPayments: paymentStatus.filter((p) => p.bankLinked).length,
      settledNotBankLinked: paymentStatus.filter((p) => p.settled && !p.bankLinked),
      unpaidFixed: paymentStatus.filter((p) => !p.settled),
      wrongVariableCount: wrongVariable.length,
      wrongVariableSample: wrongVariable.slice(0, 20),
      unlinkedFixedMatchCount: unlinkedMatch.length,
      unlinkedFixedMatchSample: unlinkedMatch.slice(0, 20),
    },
    null,
    2,
  ),
);
