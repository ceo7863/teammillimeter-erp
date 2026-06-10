#!/usr/bin/env node
/**
 * Analyze why unlinked withdrawals don't get fixed-expense links.
 * Usage: npx tsx scripts/debug-backfill-candidates.mjs [dbPath]
 */
import { DatabaseSync } from "node:sqlite";
import {
  findBestBankLearnRuleWithScore,
  formatLearnRuleConfidencePercent,
  meetsLedgerRegistrationConfidenceThreshold,
  normalizeBankLearnRules,
  scoreBankLearnRule,
  fixedLearnRuleAmountMatches,
} from "../src/utils/bankCompanyLedger.ts";
import { isNetGroupSuppressed } from "../src/utils/bankPreauthNetting.ts";
import { isCheckCardBankTransaction } from "../src/utils/bankTransactions.ts";
import { getMonthKey, resolveCompanyExpenseKind } from "../src/utils/companyLedger.ts";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const data = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

const bankTransactions = data.bankTransactions || [];
const companyExpenses = data.companyExpenses || [];
const fixedExpensePayments = data.fixedExpensePayments || [];
const fixedExpenses = data.fixedExpenses || [];
const rules = normalizeBankLearnRules(data.bankLedgerRules || []).filter(
  (r) => r.kind === "fixed" && r.fixedExpenseId,
);

function monthHasLinkedPayment(fixedExpenseId, monthKey, excludeTxId = "") {
  return fixedExpensePayments.some((payment) => {
    if (payment.fixedExpenseId !== fixedExpenseId) return false;
    if (getMonthKey(payment.date) !== monthKey) return false;
    if (!payment.bankTransactionId) return false;
    if (payment.bankTransactionId === excludeTxId) return false;
    return true;
  });
}

const mayPatterns = [];
for (const tx of bankTransactions) {
  if (!String(tx.transactionAt || "").startsWith("2026-05")) continue;
  if (!tx.linkedFixedExpensePaymentId) continue;
  if (!(Number(tx.withdrawal) > 0)) continue;
  const pay = fixedExpensePayments.find((p) => p.id === tx.linkedFixedExpensePaymentId);
  if (!pay?.fixedExpenseId) continue;
  const fixed = fixedExpenses.find((f) => f.id === pay.fixedExpenseId);
  mayPatterns.push({
    cp: String(tx.counterpartyName || "").trim(),
    amount: Number(tx.withdrawal),
    fixedExpenseId: pay.fixedExpenseId,
    fixed: fixed?.name,
  });
}

const candidates = [];
const blocked = { noRule: 0, lowConf: 0, monthDedup: 0, fixedExpense: 0, checkCard: 0, net: 0, inactive: 0 };

for (const tx of bankTransactions) {
  if (tx.linkedFixedExpensePaymentId) continue;
  if (!(Number(tx.withdrawal) > 0)) continue;
  if (isNetGroupSuppressed(tx)) {
    blocked.net++;
    continue;
  }
  if (isCheckCardBankTransaction(tx)) {
    blocked.checkCard++;
    continue;
  }

  const allScores = rules
    .map((rule) => ({ rule, score: scoreBankLearnRule(tx, rule, fixedExpenses) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  const learnMatch = findBestBankLearnRuleWithScore(tx, rules, fixedExpenses, ["fixed"]);
  const conf = learnMatch ? formatLearnRuleConfidencePercent(learnMatch.score) : 0;
  const meetsConf = meetsLedgerRegistrationConfidenceThreshold(conf);

  const linkedExpense = tx.linkedCompanyExpenseId
    ? companyExpenses.find((row) => row.id === tx.linkedCompanyExpenseId)
    : companyExpenses.find((row) => row.bankTransactionId === tx.id);
  const expenseKind = linkedExpense ? resolveCompanyExpenseKind(linkedExpense) : null;

  const monthKey = getMonthKey(String(tx.transactionAt || "").slice(0, 10));
  let reason = "ok";
  if (!learnMatch?.rule?.fixedExpenseId) {
    reason = "no_rule";
    blocked.noRule++;
  } else if (!meetsConf) {
    reason = `low_conf_${conf}`;
    blocked.lowConf++;
  } else {
    const fixedExpenseId = learnMatch.rule.fixedExpenseId;
    const fixedItem = fixedExpenses.find((row) => row.id === fixedExpenseId);
    if (!fixedItem?.isActive) {
      reason = "inactive";
      blocked.inactive++;
    } else if (monthKey && monthHasLinkedPayment(fixedExpenseId, monthKey, tx.id)) {
      reason = "month_dedup";
      blocked.monthDedup++;
    } else if (linkedExpense && expenseKind === "fixed") {
      reason = "has_fixed_expense";
      blocked.fixedExpense++;
    }
  }

  const mayDirect = mayPatterns.find(
    (p) =>
      p.cp &&
      String(tx.counterpartyName || "").trim() === p.cp &&
      p.amount === Number(tx.withdrawal),
  );

  if (reason !== "ok" || mayDirect) {
    candidates.push({
      date: String(tx.transactionAt || "").slice(0, 10),
      cp: tx.counterpartyName || tx.description,
      amount: tx.withdrawal,
      reason,
      conf,
      topRule:
        allScores[0] &&
        fixedExpenses.find((f) => f.id === allScores[0].rule.fixedExpenseId)?.name,
      topScore: allScores[0]?.score,
      secondRule:
        allScores[1] &&
        fixedExpenses.find((f) => f.id === allScores[1].rule.fixedExpenseId)?.name,
      variable: expenseKind === "variable" ? linkedExpense?.category : null,
      mayDirect: mayDirect?.fixed,
      amountMatchTop: allScores[0] && fixedLearnRuleAmountMatches(tx, allScores[0].rule, fixedExpenses),
    });
  }
}

console.log("may patterns", mayPatterns.length);
console.log("blocked summary", blocked);
console.log("candidates", candidates.length);
console.log(
  JSON.stringify(
    candidates
      .filter((c) => c.mayDirect || c.reason.startsWith("low_conf") || c.reason === "month_dedup")
      .slice(0, 60),
    null,
    2,
  ),
);
