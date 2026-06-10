import Database from "better-sqlite3";
import { readFileSync, existsSync } from "node:fs";

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error("Usage: node check-erp-data.mjs <sqlite-path>...");
  process.exit(1);
}

for (const dbPath of paths) {
  if (!existsSync(dbPath)) {
    console.log(`=== ${dbPath} === MISSING`);
    continue;
  }
  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare("SELECT version, updated_at, payload FROM erp_state WHERE id = 1").get();
  if (!row) {
    console.log(`=== ${dbPath} === no erp_state`);
    db.close();
    continue;
  }
  const payload = JSON.parse(row.payload);
  console.log(`=== ${dbPath} ===`);
  console.log(`version=${row.version} updated=${row.updated_at} payload_bytes=${row.payload.length}`);
  for (const key of [
    "sales",
    "workers",
    "workerMonthlyActualVouchers",
    "workerPaymentRecords",
    "bankTransactions",
    "workerPayoutVouchers",
  ]) {
    const value = payload[key];
    console.log(`  ${key}: ${Array.isArray(value) ? value.length : String(value)}`);
  }
  const memos = (payload.workers || []).filter((w) => String(w.monthlyPaymentMemo || "").trim()).length;
  console.log(`  workers with monthlyPaymentMemo: ${memos}`);
  db.close();
}
