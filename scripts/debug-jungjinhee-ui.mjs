#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import {
  resolveLedgerTargetForBankTransaction,
  resolveMemoLearnCategory,
  resolveCategoryFromMemo,
  buildMemoCategorySuggestionMap,
  normalizeBankLearnRules,
  guessLedgerTargetFromBankTransaction,
} from "../src/utils/bankCompanyLedger.ts";
import { classifyBankTransactionForLedger } from "../src/utils/bankLedgerClassifier.ts";

const TX_ID = "87606643-d02e-465a-8697-d43ccedbb2cc";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
const tx = (d.bankTransactions || []).find((t) => t.id === TX_ID);
const rules = normalizeBankLearnRules(d.bankLedgerRules || []);
const fixed = d.fixedExpenses || [];
const cats = d.expenseCategories || [];

console.log("active fixed order (first 5):");
for (const f of fixed.filter((x) => x.isActive).slice(0, 5)) {
  console.log({ id: f.id, name: f.name, amount: f.amount });
}

console.log("\ntargetKey:", resolveLedgerTargetForBankTransaction(tx, rules, fixed));
console.log("classification:", classifyBankTransactionForLedger(tx, {
  rules,
  fixedExpenses: fixed,
  expenseCategories: cats,
  companyExpenses: d.companyExpenses || [],
  workers: d.workers || [],
  clients: d.clients || [],
}));

console.log("\nmemo learn empty:", resolveMemoLearnCategory("", cats), resolveCategoryFromMemo(""));
for (const memo of ["\uC774", "\uC784", "\uC784\uB300", "\uC784\uB300\uB8CC", "\uC784\uAE08"]) {
  console.log(`memo "${memo}":`, resolveMemoLearnCategory(memo, cats), resolveCategoryFromMemo(memo));
}

const suggestions = buildMemoCategorySuggestionMap(d.bankTransactions || [], rules, cats);
console.log("\nmemo suggestion for tx:", suggestions.get(TX_ID));

// Simulate drawer prefill logic
const targetKey = resolveLedgerTargetForBankTransaction(tx, rules, fixed);
const parsed = targetKey?.startsWith("fixed:") ? { kind: "fixed", fixedExpenseId: targetKey.slice(6) } : { kind: "manual" };
const defaultFixedId = fixed.find((x) => x.isActive)?.id;
console.log("\ndrawer would use defaultFixedId:", defaultFixedId, fixed.find((f) => f.id === defaultFixedId)?.name);
