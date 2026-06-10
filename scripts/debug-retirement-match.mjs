#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { bankTransactionMatchesFixedPayment } from "../src/utils/companyLedger.ts";
import {
  bankTransactionMatchesFixedPaymentForLink,
  bankTransactionMatchesLedgerLinkName,
  canRegisterBankTxToCompanyLedger,
} from "../src/utils/bankCompanyLedger.ts";
import { areRecurringAmountsCompatible } from "../src/utils/companyLedger.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const data = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload));

const fixedId = "8ba664c4-29ff-4625-9058-10664fa6e1c2";
const txId = "768433fb-0dd5-4084-ad0b-06975fc511a3";

const fixed = (data.fixedExpenses || []).find((r) => r.id.startsWith("8ba664c4"));
const tx = (data.bankTransactions || []).find((r) => r.id === txId);
const payment = (data.fixedExpensePayments || []).find((p) => p.fixedExpenseId === fixed?.id);

console.log(JSON.stringify({ fixed, payment, tx }, null, 2));

if (fixed && tx && payment) {
  console.log(
    JSON.stringify(
      {
        amountCompatible: areRecurringAmountsCompatible(Number(fixed.amount), Number(tx.withdrawal)),
        amountCompatiblePayment: areRecurringAmountsCompatible(Number(payment.amount), Number(tx.withdrawal)),
        amountMatch: bankTransactionMatchesFixedPayment(tx, payment, data.fixedExpenses || []),
        nameMatch: bankTransactionMatchesLedgerLinkName(fixed.name, tx),
        linkMatch: bankTransactionMatchesFixedPaymentForLink(tx, payment, data.fixedExpenses || [], {
          companyExpenses: data.companyExpenses || [],
          fixedExpensePayments: data.fixedExpensePayments || [],
        }),
        canRegister: canRegisterBankTxToCompanyLedger(tx, {
          companyExpenses: data.companyExpenses || [],
          fixedExpensePayments: data.fixedExpensePayments || [],
        }),
      },
      null,
      2,
    ),
  );
}

const rules = (data.bankLedgerRules || []).filter((r) => r.fixedExpenseId === fixed?.id || r.kind === "fixed");
console.log("rules for fixed:", rules.filter((r) => r.fixedExpenseId === fixed?.id));
