import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = join(root, "data/erp.sqlite");

function getState() {
  const db = new DatabaseSync(dbPath);
  const row = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
  return { data: JSON.parse(row.payload), version: row.version };
}

function saveState(data, version, updatedBy = "memo-test") {
  const db = new DatabaseSync(dbPath);
  const current = db.prepare("SELECT version FROM erp_state WHERE id = 1").get();
  if (current.version !== version) {
    throw Object.assign(new Error("VERSION_CONFLICT"), { status: 409, currentVersion: current.version });
  }
  const nextVersion = current.version + 1;
  const updatedAt = new Date().toISOString();
  db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
    JSON.stringify(data),
    nextVersion,
    updatedAt,
    updatedBy,
  );
  return { version: nextVersion, updatedAt };
}

const workerId = "2";
const testMemo = process.argv[2] || "??? DB ???";
const { data, version } = getState();
const workers = data.workers || [];
const idx = workers.findIndex((w) => String(w.id) === workerId);
if (idx < 0) throw new Error("worker 2 not found");
const nextWorkers = workers.map((w, i) =>
  i === idx ? { ...w, monthlyPaymentMemo: testMemo } : w,
);
const saved = saveState({ ...data, workers: nextWorkers }, version);
const check = getState();
const kim = check.data.workers.find((w) => String(w.id) === "2");
console.log(JSON.stringify({ saved, kimMemo: kim?.monthlyPaymentMemo }, null, 2));
