import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(row.payload);

function normalizeWorkerRecordId(id) {
  if (id == null || id === "") return "";
  return String(id);
}

function normalizeWorkerMonthlyPaymentMemos(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const idKey = normalizeWorkerRecordId(key);
    const text = String(value ?? "").trim();
    if (idKey && text) out[idKey] = text;
  }
  return out;
}

function patchWorkerMonthlyPaymentMemos(memos = {}, workerId, memo) {
  const idKey = normalizeWorkerRecordId(workerId);
  if (!idKey) return memos;
  const trimmed = String(memo ?? "").trim();
  const next = { ...memos };
  if (trimmed) next[idKey] = trimmed;
  else delete next[idKey];
  return next;
}

const workerId = "2";
const memo = process.argv[3] || "TEST_MEMO_" + Date.now();
const workers = Array.isArray(data.workers) ? data.workers : [];
const workerIndex = workers.findIndex((w) => String(w?.id ?? "") === workerId);
if (workerIndex < 0) {
  console.error("worker not found", workerId);
  process.exit(1);
}

const nextWorkers = workers.map((w, i) =>
  i === workerIndex ? { ...w, monthlyPaymentMemo: memo } : w,
);
const existingMemos = normalizeWorkerMonthlyPaymentMemos(data.workerMonthlyPaymentMemos);
const workerMonthlyPaymentMemos = patchWorkerMonthlyPaymentMemos(existingMemos, workerId, memo);
const nextPayload = { ...data, workers: nextWorkers, workerMonthlyPaymentMemos };
const nextVersion = Number(row.version || 0) + 1;

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ? WHERE id = 1").run(
  JSON.stringify(nextPayload),
  nextVersion,
  new Date().toISOString(),
);

const verify = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const verified = JSON.parse(verify.payload);
const w = verified.workers.find((x) => String(x.id) === workerId);
console.log(
  JSON.stringify(
    {
      ok: true,
      workerMemo: w?.monthlyPaymentMemo ?? null,
      mapMemo: verified.workerMonthlyPaymentMemos?.[workerId] ?? null,
    },
    null,
    2,
  ),
);
