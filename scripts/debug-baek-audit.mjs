import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const audits = (d.auditLogs || [])
  .filter((row) => {
    const hay = JSON.stringify(row).toLowerCase();
    return hay.includes("???") || hay.includes("66c5da89") || hay.includes("91d13a23") || hay.includes("????");
  })
  .slice(-15);

for (const row of audits) {
  console.log(row.createdAt, row.action, row.entityType, row.entityLabel, row.screen);
}
