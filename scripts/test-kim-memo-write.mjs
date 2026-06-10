import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "../data/erp.sqlite");
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(row.payload);
const workerId = "2";
const memo = "??? ??? ??";
const workers = data.workers || [];
const workerIndex = workers.findIndex((w) => String(w?.id ?? "") === workerId);
if (workerIndex < 0) {
  console.error("worker not found");
  process.exit(1);
}
const nextWorkers = workers.map((w, i) =>
  i === workerIndex ? { ...w, monthlyPaymentMemo: memo } : w,
);
const nextPayload = { ...data, workers: nextWorkers };
const updatedAt = new Date().toISOString();
db.prepare("UPDATE erp_state SET payload = ?, version = version + 1, updated_at = ? WHERE id = 1").run(
  JSON.stringify(nextPayload),
  updatedAt,
);
const check = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);
const kim = check.workers.find((w) => String(w.id) === "2");
console.log(JSON.stringify({ ok: true, kimMemo: kim?.monthlyPaymentMemo }, null, 2));
