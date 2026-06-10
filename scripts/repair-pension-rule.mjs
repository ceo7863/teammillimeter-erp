import { DatabaseSync } from "node:sqlite";

const PENSION_FIXED_ID = "71d79cca-e568-4bb9-9c57-af062fbe91a9";
const TOKEN = "\uAD6D\uB3C4\uC5F0\uAE082604";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

data.bankLedgerRules = (data.bankLedgerRules || []).map((rule) => {
  if (rule.kind !== "fixed" || rule.fixedExpenseId !== PENSION_FIXED_ID) return rule;
  const tokens = [...new Set([...(rule.descriptionTokens || []), TOKEN])];
  return { ...rule, descriptionTokens: tokens };
});

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify(data),
  Number(state.version) + 1,
  new Date().toISOString(),
  "repair-pension-rule",
);

console.log(
  "pension tokens:",
  data.bankLedgerRules.find((r) => r.fixedExpenseId === PENSION_FIXED_ID)?.descriptionTokens,
);
