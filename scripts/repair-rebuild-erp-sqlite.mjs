import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { getDb, getErpState, saveErpState } from "../server/db.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dryRun = process.argv.includes("--dry-run");
const dbPath = process.env.DATABASE_PATH || path.join(root, "data/erp.sqlite");

function readTableSafe(db, table) {
  try {
    return db.prepare(`SELECT * FROM ${table}`).all();
  } catch (error) {
    return { error: error.message };
  }
}

function main() {
  const state = getErpState();
  const corruptDb = new DatabaseSync(dbPath, { readOnly: true });
  const users = readTableSafe(corruptDb, "users");
  corruptDb.close();

  const summary = {
    dryRun,
    dbPath,
    version: state.version,
    sales: state.data.sales?.length || 0,
    bankTransactions: state.data.bankTransactions?.length || 0,
    users: Array.isArray(users) ? users.length : users,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (dryRun) return;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const corruptPath = `${dbPath}.corrupt-${stamp}`;
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;

  fs.renameSync(dbPath, corruptPath);
  if (fs.existsSync(walPath)) fs.renameSync(walPath, `${corruptPath}-wal`);
  if (fs.existsSync(shmPath)) fs.renameSync(shmPath, `${corruptPath}-shm`);

  const freshDb = getDb();
  saveErpState(state.data, null, "repair-rebuild-erp-sqlite");

  if (Array.isArray(users) && users.length) {
    const columns = Object.keys(users[0]);
    const placeholders = columns.map(() => "?").join(", ");
    const insert = freshDb.prepare(
      `INSERT OR REPLACE INTO users (${columns.join(", ")}) VALUES (${placeholders})`,
    );
    freshDb.exec("BEGIN");
    try {
      for (const row of users) {
        insert.run(...columns.map((col) => row[col]));
      }
      freshDb.exec("COMMIT");
    } catch (error) {
      freshDb.exec("ROLLBACK");
      throw error;
    }
  }

  const integrity = freshDb.prepare("PRAGMA integrity_check").get();
  console.log(JSON.stringify({ ok: true, corruptPath, integrity }));
}

main();
