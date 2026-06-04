import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";

const dbPath = process.argv[2] || "data/erp.sqlite";
const testPassword = process.argv[3] || "1234";
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const d = JSON.parse(row.payload);
const workers = d.workers || [];

for (const w of workers) {
  if (!w.portalLoginId && !w.portalPasswordHash) continue;
  const ok = w.portalPasswordHash ? bcrypt.compareSync(testPassword, w.portalPasswordHash) : null;
  console.log(
    JSON.stringify({
      name: w.name,
      id: w.id,
      portalLoginId: w.portalLoginId,
      hasHash: Boolean(w.portalPasswordHash),
      test1234: ok,
    }),
  );
}
