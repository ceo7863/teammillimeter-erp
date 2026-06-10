/**
 * Verify memo category learn across different withdrawal amounts (Shilla Galbi scenario).
 * Run: npx tsx scripts/debug-memo-learn-shilla.mjs
 */
import {
  autoApplyBankLearnRules,
  buildMemoCategorySuggestionMap,
  buildMemoLearnRulesFromTransactions,
  findBestBankLearnRuleWithScore,
  mergeMemoLearnRules,
  resolveMemoLearnCategory,
  extractBankTransactionMerchantFingerprints,
  merchantFingerprintsOverlap,
} from "../src/utils/bankCompanyLedger.ts";
import { EXPENSE_CATEGORY_OPTIONS, normalizeExpenseCategories } from "../src/utils/companyLedger.ts";

const SHILLA = "\uC2E0\uB77C\uAC08\uBE44";
const MEAL_MEMO = "\uC2DD\uB300";
const MEAL_CATEGORY = "\uC811\uB300/\uC2DD\uBE44";

const categories = normalizeExpenseCategories(EXPENSE_CATEGORY_OPTIONS);
const sourceId = "tx-shilla-source";
const targetId = "tx-shilla-target";

const source = {
  id: sourceId,
  transactionAt: "2026-05-01T12:00:00",
  withdrawal: 87000,
  deposit: 0,
  balanceAfter: 0,
  counterpartyName: SHILLA,
  description: "\uCE74\uB4DC\uACB0\uC81C",
  memo: MEAL_MEMO,
};

const target = {
  id: targetId,
  transactionAt: "2026-05-10T12:00:00",
  withdrawal: 125000,
  deposit: 0,
  balanceAfter: 0,
  counterpartyName: `${SHILLA} \uAC15\uB0A8\uC810`,
  description: "\uCCB4\uD06C\uCE74\uB4DC",
  memo: "",
};

const resolved = resolveMemoLearnCategory(MEAL_MEMO, categories);
const fpsSource = extractBankTransactionMerchantFingerprints(source);
const fpsTarget = extractBankTransactionMerchantFingerprints(target);
const overlap = merchantFingerprintsOverlap(fpsSource, fpsTarget);
const memoRules = buildMemoLearnRulesFromTransactions([source], categories);
const mergedRules = mergeMemoLearnRules([], memoRules);
const learnMatch = findBestBankLearnRuleWithScore(target, mergedRules, [], ["manual"]);
const map = buildMemoCategorySuggestionMap([source, target], memoRules, categories);
const suggestion = map.get(targetId);
const autoApply = autoApplyBankLearnRules([source, target], [], [], mergedRules, [], {
  applyKinds: ["manual"],
});
const linkedTarget = autoApply.transactions.find((row) => row.id === targetId);

console.log("resolveMemoLearnCategory:", resolved);
console.log("fingerprint overlap:", overlap);
console.log("learn rule match:", learnMatch);
console.log("target suggestion:", suggestion);
console.log("autoApply manualCount:", autoApply.manualCount, "linked:", linkedTarget?.linkedCompanyExpenseId);

if (resolved !== MEAL_CATEGORY) {
  console.error("FAIL: expected", MEAL_CATEGORY);
  process.exit(1);
}
if (!overlap) {
  console.error("FAIL: merchant fingerprints should overlap");
  process.exit(1);
}
if (!suggestion || suggestion.category !== MEAL_CATEGORY) {
  console.error("FAIL: other row should get memo category suggestion");
  process.exit(1);
}
if (suggestion.confidence < 90) {
  console.error("FAIL: confidence should be >= 90, got", suggestion.confidence);
  process.exit(1);
}
if (!learnMatch || learnMatch.score < 12) {
  console.error("FAIL: learn rule should match target across amounts, got", learnMatch);
  process.exit(1);
}
if (!linkedTarget?.linkedCompanyExpenseId || autoApply.manualCount < 1) {
  console.error("FAIL: autoApply should register target to ledger");
  process.exit(1);
}
console.log("OK: memo learn propagates across amounts for same merchant");
