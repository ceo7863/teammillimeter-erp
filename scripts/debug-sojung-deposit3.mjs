import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const byClient = (d.sales || []).filter((s) => String(s.client || "").trim() === "\uD82C\uC778\uC81C\uB2C8\uC2A4");
console.log("sales client=?????:", JSON.stringify(byClient, null, 2));

const bySite = (d.sales || []).filter((s) => String(s.site || "").includes("\uD82C\uC778\uC81C\uB2C8\uC2A4"));
console.log("sales site contains ?????:", JSON.stringify(bySite, null, 2));

const june8 = (d.sales || []).filter((s) => String(s.date || "").startsWith("2026-06"));
console.log("june 2026 sales count", june8.length);
