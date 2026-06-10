#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import {
  findBestBankLearnRuleWithScore,
  normalizeBankLearnRules,
  scoreBankLearnRule,
  formatLearnRuleConfidencePercent,
} from "../src/utils/bankCompanyLedger.ts";
import { isCheckCardBankTransaction } from "../src/utils/bankTransactions.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
const rules = normalizeBankLearnRules(d.bankLedgerRules || []).filter((r) => r.kind === "fixed" && r.fixedExpenseId);
const fixed = d.fixedExpenses || [];

const rows = [];
for (const tx of d.bankTransactions || []) {
  if (tx.linkedFixedExpensePaymentId || !(Number(tx.withdrawal) > 0)) continue;
  if (isCheckCardBankTransaction(tx)) continue;
  const scored = rules
    .map((rule) => ({ rule, score: scoreBankLearnRule(tx, rule, fixed) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) continue;
  const best = findBestBankLearnRuleWithScore(tx, rules, fixed, ["fixed"]);
  rows.push({
    date: tx.transactionAt?.slice(0, 10),
    cp: tx.counterpartyName || "",
    desc: (tx.description || "").slice(0, 40),
    amt: tx.withdrawal,
    var: Boolean(tx.linkedCompanyExpenseId),
    top: fixed.find((f) => f.id === scored[0].rule.fixedExpenseId)?.name,
    topScore: scored[0].score,
    best: best ? fixed.find((f) => f.id === best.rule.fixedExpenseId)?.name : null,
    conf: best ? formatLearnRuleConfidencePercent(best.score) : 0,
  });
}
console.log("with some rule score", rows.length);
console.log(JSON.stringify(rows.slice(0, 40), null, 2));
