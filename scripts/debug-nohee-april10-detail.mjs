import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const TX_ID = "cc1878f5-2e4b-48be-b092-3538c945aaff";

const tx = (d.bankTransactions || []).find((t) => t.id === TX_ID);
console.log("=== TX ===", JSON.stringify(tx, null, 2));

const audits = (d.auditLogs || []).filter((a) =>
  JSON.stringify(a).includes(TX_ID) ||
  (a.entityId === TX_ID) ||
  (a.after && JSON.stringify(a.after).includes(TX_ID)) ||
  (a.before && JSON.stringify(a.before).includes(TX_ID))
);
console.log("\n=== audit logs for tx", audits.length);
for (const a of audits.slice(-20)) {
  console.log(JSON.stringify({
    at: a.createdAt || a.timestamp,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    fieldLabel: a.fieldLabel,
    after: a.after,
    before: a.before,
    screen: a.screen,
  }, null, 2));
}

// Search audits mentioning ??? on 2026-04-10
const nameAudits = (d.auditLogs || []).filter((a) => {
  const s = JSON.stringify(a);
  return s.includes("\uB178\uD76C\uC815") && s.includes("2026-04-10");
});
console.log("\n=== audits mentioning ??? + 2026-04-10:", nameAudits.length);
for (const a of nameAudits.slice(-10)) {
  console.log(JSON.stringify({ at: a.createdAt, action: a.action, entityType: a.entityType, entityId: a.entityId, after: a.after, screen: a.screen }, null, 2));
}

// Worker info
const workers = (d.workers || []).filter((w) => (w.name || "").includes("\uB178\uD76C\uC815"));
console.log("\n=== workers:", workers);

// Worker payout vouchers
const vouchers = (d.workerPayoutVouchers || []).filter((v) => {
  const s = JSON.stringify(v);
  return s.includes("\uB178\uD76C\uC815") || v.bankTransactionId === TX_ID;
});
console.log("\n=== worker payout vouchers:", vouchers.length, vouchers);

// bank ledger rules for ???
const rules = (d.bankLedgerRules || []).filter((r) => {
  const hay = [r.counterpartyName, r.description, r.memo, r.keyword].join(" ");
  return hay.includes("\uB178\uD76C\uC815");
});
console.log("\n=== bankLedgerRules for ???:", rules);
