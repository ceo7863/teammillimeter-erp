import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const row = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(row.payload);
const matches = (data.workers || []).filter((w) => String(w.name || "").includes("???") || String(w.name || "").includes("??"));
console.log(JSON.stringify({ version: row.version, matches, memosMap: data.workerMonthlyPaymentMemos || {} }, null, 2));
