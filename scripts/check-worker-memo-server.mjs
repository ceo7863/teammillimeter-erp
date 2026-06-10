import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT version, payload FROM erp_state ORDER BY version DESC LIMIT 1").get();
const data = JSON.parse(row.payload || "{}");
const memosMap =
  data.workerMonthlyPaymentMemos && typeof data.workerMonthlyPaymentMemos === "object"
    ? data.workerMonthlyPaymentMemos
    : {};

console.log(
  JSON.stringify(
    {
      version: row.version,
      memosMap,
      kim: memosMap["2"] ?? null,
      park: memosMap["6"] ?? null,
    },
    null,
    2,
  ),
);
