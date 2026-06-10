import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDb } from "../server/db.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.join(root, "data", `erp-vacuum-${Date.now()}.sqlite`);

try {
  const db = getDb();
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const stat = fs.statSync(target);
  console.log(JSON.stringify({ ok: true, target, bytes: stat.size }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
}
