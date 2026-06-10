#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
const TX_ID = "87606643-d02e-465a-8697-d43ccedbb2cc";

const audits = (d.auditLogs || []).filter(
  (a) =>
    a.entityId === TX_ID ||
    String(a.entityLabel || "").includes("\uC815\uC9C4\uD76C") ||
    String(JSON.stringify(a)).includes(TX_ID),
);
console.log("all audits for tx", audits.length);
for (const a of audits.sort((x, y) => String(x.at).localeCompare(String(y.at)))) {
  console.log({
    at: a.at,
    entityType: a.entityType,
    field: a.field || a.fieldLabel,
    before: a.before,
    after: a.after,
    action: a.action,
    screen: a.screen,
  });
}

// memo learn rules?
console.log("\nmemo rules keys", Object.keys(d).filter((k) => /memo|learn|rule/i.test(k)));

// search fixed payment audits mentioning ecount or this tx
const payAudits = (d.auditLogs || []).filter((a) => {
  const s = JSON.stringify(a);
  return s.includes("\uC774\uCE74") || s.includes("ecount") || s.includes(TX_ID);
});
console.log("\necount/tx audits", payAudits.length);
for (const a of payAudits.slice(-15)) {
  console.log({ at: a.at, entityType: a.entityType, entityLabel: a.entityLabel, field: a.field, before: a.before, after: a.after });
}
