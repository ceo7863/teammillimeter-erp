#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import {
  findBestBankLearnRuleWithScore,
  fixedLearnRuleAmountMatches,
  canRegisterBankTxToCompanyLedger,
  isBankTransactionLinkedToCompanyLedger,
  scoreBankLearnRule,
} from "../src/utils/bankCompanyLedger.ts";
import { findLinkableFixedExpensePayment } from "../src/utils/companyLedger.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const txs = (d.bankTransactions || []).filter((tx) => {
  const hay = `${tx.description || ""}${tx.memo || ""}${tx.counterpartyName || ""}`;
  return hay.includes("SMS") || hay.includes("\uD86D\uC9C0\uC218\uB8CC");
});

const fixedExpenses = (d.fixedExpenses || []).filter((r) => r.isActive !== false);
const rules = (d.bankLedgerRules || []).filter((r) => r.kind === "fixed");
const smsFixed = fixedExpenses.filter((f) => String(f.name || "").includes("SMS"));
const payments = d.fixedExpensePayments || [];
const expenses = d.companyExpenses || [];
const context = { fixedExpensePayments: payments, companyExpenses: expenses };

console.log(
  JSON.stringify(
    {
      smsFixedItems: smsFixed,
      smsRules: rules.filter((r) => {
        const fixed = fixedExpenses.find((f) => f.id === r.fixedExpenseId);
        return String(fixed?.name || "").includes("SMS") || (r.descriptionTokens || []).some((t) => t.includes("SMS"));
      }),
      txs: txs.map((tx) => {
        const match = findBestBankLearnRuleWithScore(tx, rules, fixedExpenses, ["fixed"]);
        const rule = match?.rule;
        const fixedId = rule?.fixedExpenseId;
        const fixedItem = fixedExpenses.find((f) => f.id === fixedId);
        const linkable = fixedId
          ? findLinkableFixedExpensePayment(tx, fixedId, payments, fixedExpenses)
          : null;
        return {
          id: tx.id,
          date: String(tx.transactionAt || "").slice(0, 10),
          withdrawal: tx.withdrawal,
          description: tx.description,
          memo: tx.memo,
          ledgerAccountCode: tx.ledgerAccountCode,
          ledgerFixedExpenseId: tx.ledgerFixedExpenseId,
          linkedFixedExpensePaymentId: tx.linkedFixedExpensePaymentId,
          linkedCompanyExpenseId: tx.linkedCompanyExpenseId,
          folderId: tx.folderId,
          ledgerStatus: tx.ledgerStatus,
          canRegister: canRegisterBankTxToCompanyLedger(tx, context),
          alreadyLinked: isBankTransactionLinkedToCompanyLedger(tx, context),
          paymentByBankTx: payments.find((p) => p.bankTransactionId === tx.id),
          aprilSmsPayment: payments.find(
            (p) =>
              p.fixedExpenseId === smsFixed[0]?.id &&
              String(p.date || "").startsWith("2026-04"),
          ),
          learnMatch: match
            ? {
                fixedName: fixedItem?.name,
                score: match.score,
                amountOk: rule ? fixedLearnRuleAmountMatches(tx, rule, fixedExpenses) : false,
              }
            : null,
          linkablePayment: linkable
            ? { id: linkable.id, date: linkable.date, amount: linkable.amount, bankTx: linkable.bankTransactionId }
            : null,
        };
      }),
    },
    null,
    2,
  ),
);
