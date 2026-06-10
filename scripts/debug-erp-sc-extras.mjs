import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(row.payload));
const schedules = data.scSchedules || [];
const withExtras = schedules.filter((s) =>
  (s.participants || []).some((p) => p.meal || p.expense),
);
console.log("stored schedules", schedules.length, "with meal/expense", withExtras.length);
if (withExtras[0]) {
  console.log(JSON.stringify(withExtras[0], null, 2));
}
