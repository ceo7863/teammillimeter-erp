import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { getDb, getErpState } from "../server/db.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "data/erp-state-export.json");

getDb();
const state = getErpState();
const corruptDbPath = process.env.DATABASE_PATH || path.join(root, "data/erp.sqlite");
const usersDb = new DatabaseSync(corruptDbPath, { readOnly: true });
let users = [];
try {
  users = usersDb.prepare("SELECT * FROM users").all();
} catch {
  users = [];
}
usersDb.close();

const payload = {
  exportedAt: new Date().toISOString(),
  version: state.version,
  updatedAt: state.updatedAt,
  updatedBy: state.updatedBy,
  data: state.data,
  users,
};

fs.writeFileSync(outPath, JSON.stringify(payload));
console.log(JSON.stringify({ ok: true, outPath, version: state.version, users: users.length }));
