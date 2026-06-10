#!/usr/bin/env node
/**
 * Compare April vs May fixed expense registration on bank txs.
 * Run: node --import tsx scripts/debug-april-may-fixed-detail.mjs [dbPath]
 */
import { DatabaseSync } from "node:sqlite";
import { getMonthKey } from "../src/utils/companyLedger.ts";
import {
  findBestBankLearnRuleWithScore,
  canRegisterBankTxToCompanyLedger,
  isBankTransactionLinkedToCompanyLedger,
  fixedLearnRuleAmountMatches,
} from "../src/utils/bankCompanyLedger.ts";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const txs = d.bankTransactions || [];
const payments = d.fixedExpensePayments || [];
const expenses = d.companyExpenses || [];
const fixedExpenses = (d.fixedExpenses || []).filter((r) => r.isActive !== false);
const rules = (d.bankLedgerRules || []).filter((r) => r.kind === "fixed");
const context = { companyExpenses: expenses, fixedExpensePayments: payments };

function monthTxs(mk) {
  return txs.filter((tx) => {
    const date = String(tx.transactionAt || "").slice(0, 7);
    return date === mk && Number(tx.withdrawal || 0) > 0;
  });
}

function summarizeMonth(mk) {
  const rows = monthTxs(mk);
  let fixedLinked = 0;
  let variableLinked = 0;
  let ledgerConfirmedNoLink = 0;
  let unlinked = 0;
  const missedFixed = [];

  for (const tx of rows) {
    const linked = isBankTransactionLinkedToCompanyLedger(tx, context);
    const fixedPayment = payments.find((p) => p.bankTransactionId === tx.id);
    const variableExpense = expenses.find((e) => e.bankTransactionId === tx.id);

    if (fixedPayment) fixedLinked += 1;
    else if (variableExpense) variableLinked += 1;
    else if (tx.ledgerStatus === "confirmed" && tx.ledgerAccountCode) ledgerConfirmedNoLink += 1;
    else unlinked += 1;

    if (!fixedPayment && canRegisterBankTxToCompanyLedger(tx, context)) {
      const match = findBestBankLearnRuleWithScore(tx, rules, fixedExpenses, ["fixed"]);
      if (match?.rule?.fixedExpenseId) {
        const amountOk = fixedLearnRuleAmountMatches(tx, match.rule, fixedExpenses);
        const fixedName = fixedExpenses.find((f) => f.id === match.rule.fixedExpenseId)?.name;
        missedFixed.push({
          date: String(tx.transactionAt || "").slice(0, 10),
          description: tx.description,
          counterparty: tx.counterpartyName,
          withdrawal: tx.withdrawal,
          ledgerAccountCode: tx.ledgerAccountCode,
          ledgerStatus: tx.ledgerStatus,
          variableCategory: variableExpense?.category,
          ruleFixed: fixedName,
          ruleScore: match.score,
          amountOk,
          reason: variableExpense
            ? "registered_as_variable"
            : tx.ledgerAccountCode
              ? "manual_account_code"
              : "not_applied",
        });
      }
    }
  }

  const monthPayments = payments.filter((p) => getMonthKey(p.date) === mk);
  const paymentNames = monthPayments.map(
    (p) => fixedExpenses.find((f) => f.id === p.fixedExpenseId)?.name || "?",
  );

  return {
    month: mk,
    withdrawalTxCount: rows.length,
    fixedLinked,
    variableLinked,
    ledgerConfirmedNoLink,
    unlinked,
    fixedPaymentCount: monthPayments.length,
    fixedPaymentNames: [...new Set(paymentNames)].sort(),
    missedFixedCandidates: missedFixed.filter((r) => r.amountOk),
    missedFixedBlocked: missedFixed.filter((r) => !r.amountOk).length,
  };
}

const april = summarizeMonth("2026-04");
const may = summarizeMonth("2026-05");

const aprilPayNames = new Set(april.fixedPaymentNames);
const mayPayNames = new Set(may.fixedPaymentNames);

console.log(
  JSON.stringify(
    {
      fixedRuleCount: rules.length,
      activeFixedItems: fixedExpenses.length,
      april,
      may,
      inMayNotApril: [...mayPayNames].filter((n) => !aprilPayNames.has(n)),
      inAprilNotMay: [...aprilPayNames].filter((n) => !mayPayNames.has(n)),
    },
    null,
    2,
  ),
);
