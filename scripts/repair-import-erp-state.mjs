import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { getDb, saveErpState } from "../server/db.mjs";
import { initPdfArchiveStore } from "../server/pdfArchive.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const inPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "data/erp-state-export.json");
const dbPath = process.env.DATABASE_PATH || path.join(root, "data/erp.sqlite");

if (!fs.existsSync(inPath)) {
  console.error(`Missing export file: ${inPath}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(inPath, "utf8"));
for (const suffix of ["", "-wal", "-shm"]) {
  const target = `${dbPath}${suffix}`;
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

getDb();
saveErpState(payload.data, null, "repair-import-erp-state");

const db = getDb();
if (Array.isArray(payload.users) && payload.users.length) {
  const columns = Object.keys(payload.users[0]);
  const insert = db.prepare(
    `INSERT OR REPLACE INTO users (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
  );
  db.exec("BEGIN");
  try {
    for (const row of payload.users) {
      insert.run(...columns.map((col) => row[col]));
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

initPdfArchiveStore();
const integrity = db.prepare("PRAGMA integrity_check").get();
console.log(
  JSON.stringify({
    ok: true,
    dbPath,
    version: payload.version,
    sales: payload.data.sales?.length || 0,
    bankTransactions: payload.data.bankTransactions?.length || 0,
    integrity,
  }),
);
