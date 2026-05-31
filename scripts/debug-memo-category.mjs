/**
 * Trace memo -> ledger category for bank tx drawer save.
 * Usage: npx tsx scripts/debug-memo-category.mjs
 */
import {
  applyMemoCategoryToLedgerDraft,
  resolveCategoryFromMemo,
  resolveMemoLearnCategory,
} from "../src/utils/bankCompanyLedger.ts";

const MEAL = "\uC2DD\uBE44";
const MEAL_ALT = "\uC2DD\uB300";
const MISC = "\uAE30\uD0C0";

console.log("=== resolveCategoryFromMemo ===");
for (const memo of [MEAL, MEAL_ALT, `\uC624\uB298 ${MEAL}`, MISC, ""]) {
  console.log(JSON.stringify(memo), "->", resolveCategoryFromMemo(memo));
}

console.log("\n=== applyMemoCategoryToLedgerDraft (manual + ??) ===");
for (const memo of [MEAL, MEAL_ALT]) {
  const out = applyMemoCategoryToLedgerDraft(memo, {
    ledgerKind: "manual",
    ledgerCategory: MISC,
  });
  console.log(JSON.stringify(memo), "->", out);
}

console.log("\n=== applyMemoCategoryToLedgerDraft (fixed + ??) ===");
{
  const out = applyMemoCategoryToLedgerDraft(MEAL, {
    ledgerKind: "fixed",
    ledgerCategory: MISC,
  });
  console.log(JSON.stringify(MEAL), "->", out);
}

console.log("\n=== resolveMemoLearnCategory ===");
console.log(`${MEAL} ->`, resolveMemoLearnCategory(MEAL));
