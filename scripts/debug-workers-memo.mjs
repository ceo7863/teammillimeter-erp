import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload, version, updated_at FROM erp_state WHERE id = 1").get();
const data = JSON.parse(row.payload);
const withMemo = (data.workers || []).filter((w) => String(w.monthlyPaymentMemo || "").trim());
console.log(JSON.stringify({ version: row.version, updatedAt: row.updated_at, withMemoCount: withMemo.length, samples: withMemo.slice(0, 10).map((w) => ({ name: w.name, monthlyPaymentMemo: w.monthlyPaymentMemo })) }, null, 2));
