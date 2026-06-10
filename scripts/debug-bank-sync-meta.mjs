import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const envPath = path.join(root, ".env");
let dbPath = path.join(root, "data", "erp.sqlite");
if (fs.existsSync(envPath)) {
  const match = fs.readFileSync(envPath, "utf8").match(/^DATABASE_PATH=(.+)$/m);
  if (match?.[1]) dbPath = match[1].trim();
}

const db = new Database(dbPath, { readonly: true });
const row = db.prepare("SELECT version, updated_at, payload FROM erp_state WHERE id = 1").get();
const payload = JSON.parse(row.payload);
const txs = Array.isArray(payload.bankTransactions) ? payload.bankTransactions : [];
const latest = [...txs].sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt)))[0];

console.log(
  JSON.stringify(
    {
      version: row.version,
      updatedAt: row.updated_at,
      txCount: txs.length,
      latestTxAt: latest?.transactionAt ?? null,
      latestCounterparty: latest?.counterpartyName ?? null,
      bankSyncMeta: payload.bankSyncMeta ?? null,
    },
    null,
    2,
  ),
);
