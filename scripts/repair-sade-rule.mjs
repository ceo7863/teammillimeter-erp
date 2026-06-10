import { DatabaseSync } from "node:sqlite";

const SID = "736c5a77-c008-49d8-a9ac-dfa4dd1d9629";
const PENSION_TOKEN = "\uAD6D\uB3C4\uC5F0\uAE082604";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

data.bankLedgerRules = (data.bankLedgerRules || []).map((rule) => {
  if (rule.kind !== "fixed" || rule.fixedExpenseId !== SID) return rule;
  const tokens = (rule.descriptionTokens || []).filter(
    (t) => !/\uC5F0\uAE08/.test(String(t)),
  );
  return { ...rule, descriptionTokens: tokens };
});

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify(data),
  Number(state.version) + 1,
  new Date().toISOString(),
  "repair-sade-rule",
);

const updated = data.bankLedgerRules.find((r) => r.fixedExpenseId === SID);
console.log("tokens:", updated?.descriptionTokens);
