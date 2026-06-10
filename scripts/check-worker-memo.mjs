import Database from "better-sqlite3";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new Database(dbPath);
const row = db.prepare("SELECT version, payload FROM erp_state ORDER BY version DESC LIMIT 1").get();
const data = JSON.parse(row.payload || "{}");
const workers = Array.isArray(data.workers) ? data.workers : [];
const memosMap =
  data.workerMonthlyPaymentMemos && typeof data.workerMonthlyPaymentMemos === "object"
    ? data.workerMonthlyPaymentMemos
    : {};
const legacyOnWorkers = workers.filter((w) => String(w.monthlyPaymentMemo || "").trim());
const targetName = process.argv[3] || "???";
const exact = workers.find((w) => String(w.name || "").trim() === targetName);

console.log(
  JSON.stringify(
    {
      version: row.version,
      exactMatch: exact
        ? {
            id: exact.id,
            name: exact.name,
            legacyWorkerMemo: exact.monthlyPaymentMemo ?? null,
            mapMemo: memosMap[String(exact.id)] ?? null,
          }
        : null,
      memosMap,
      legacyWorkerMemoCount: legacyOnWorkers.length,
    },
    null,
    2,
  ),
);
