#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { syncFixedExpenseAutomation, refreshCompanyLedgerFromBankTransactions } from "../src/utils/fixedExpenseAutomation.ts";
import { normalizeBankLearnRules } from "../src/utils/bankCompanyLedger.ts";

const TX_ID = "87606643-d02e-465a-8697-d43ccedbb2cc";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

function txLinkLabel(data, tx) {
  const pay = (data.fixedExpensePayments || []).find((p) => p.id === tx.linkedFixedExpensePaymentId);
  const fixed = (data.fixedExpenses || []).find((f) => f.id === pay?.fixedExpenseId);
  return fixed?.name || tx.linkedCompanyExpenseId || "-";
}

const txBefore = (d.bankTransactions || []).find((t) => t.id === TX_ID);
console.log("before:", txBefore?.counterpartyName, txBefore?.withdrawal, txLinkLabel(d, txBefore));

const sync1 = syncFixedExpenseAutomation({
  fixedExpenses: d.fixedExpenses || [],
  fixedExpensePayments: d.fixedExpensePayments || [],
  bankTransactions: d.bankTransactions || [],
  bankLedgerRules: normalizeBankLearnRules(d.bankLedgerRules || []),
  companyExpenses: d.companyExpenses || [],
  monthKey: "2026-05",
});
const txAfterSync = sync1.bankTransactions.find((t) => t.id === TX_ID);
console.log("after syncFixedExpenseAutomation:", {
  linkedCount: sync1.linkedCount,
  link: txLinkLabel({ ...d, fixedExpensePayments: sync1.fixedExpensePayments }, txAfterSync),
});

const refresh = refreshCompanyLedgerFromBankTransactions({
  bankTransactions: d.bankTransactions || [],
  fixedExpenses: d.fixedExpenses || [],
  fixedExpensePayments: d.fixedExpensePayments || [],
  companyExpenses: d.companyExpenses || [],
  bankLedgerRules: normalizeBankLearnRules(d.bankLedgerRules || []),
  bankTransactionFolders: d.bankTransactionFolders || [],
  expenseCategories: d.expenseCategories || [],
  clients: d.clients || [],
  workers: d.workers || [],
});
const txAfterRefresh = refresh.bankTransactions.find((t) => t.id === TX_ID);
console.log("after refreshCompanyLedgerFromBank:", {
  linkedPaymentCount: refresh.linkedPaymentCount,
  learnedFixedCount: refresh.learnedFixedCount,
  link: txLinkLabel({ ...d, fixedExpensePayments: refresh.fixedExpensePayments }, txAfterRefresh),
});

// Check if eCount may payment gets linked to any tx
const ecountId = "8dcaf0af-0fc4-4836-85b8-edc7e614a2e2";
for (const pass of [{ name: "sync", data: sync1 }, { name: "refresh", data: refresh }]) {
  const pay = pass.data.fixedExpensePayments.find((p) => p.fixedExpenseId === ecountId && p.date?.startsWith("2026-05"));
  const tx = pass.data.bankTransactions.find((t) => t.id === pay?.bankTransactionId || t.linkedFixedExpensePaymentId === pay?.id);
  console.log(`${pass.name} eCount May payment ->`, pay?.bankTransactionId, tx?.counterpartyName, tx?.withdrawal);
}
