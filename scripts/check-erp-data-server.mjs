import { getDb } from "../server/db.mjs";
import Database from "better-sqlite3";

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error("Usage: node scripts/check-erp-data-server.mjs <sqlite-path>...");
  process.exit(1);
}

for (const dbPath of paths) {
  try {
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT version, updated_at, payload FROM erp_state WHERE id = 1").get();
    if (!row) {
      console.log(`=== ${dbPath} === no erp_state`);
      db.close();
      continue;
    }
    const payload = JSON.parse(row.payload);
    console.log(`=== ${dbPath} ===`);
    console.log(`version=${row.version} updated=${row.updated_at}`);
    for (const key of [
      "sales",
      "workers",
      "workerMonthlyActualVouchers",
      "workerPaymentRecords",
      "bankTransactions",
      "workerPayoutVouchers",
    ]) {
      const value = payload[key];
      console.log(`  ${key}: ${Array.isArray(value) ? value.length : value}`);
    }
    const memos = (payload.workers || []).filter((w) => String(w.monthlyPaymentMemo || "").trim()).length;
    console.log(`  workers with monthlyPaymentMemo: ${memos}`);
    db.close();
  } catch (error) {
    console.log(`=== ${dbPath} === ERROR ${error.message}`);
  }
}
