import { DatabaseSync } from "node:sqlite";
import { hashPortalPassword } from "../server/workerPortal.mjs";

const dbPath = process.argv[2] || "data/erp.sqlite";
const loginId = String(process.argv[3] || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const password = String(process.argv[4] || "").trim();

if (!loginId || !password) {
  console.error("Usage: node scripts/repair-portal-password.mjs <db> <portalLoginId> <password>");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(row.payload);
const workers = data.workers || [];
let changed = false;

const nextWorkers = workers.map((worker) => {
  const id = String(worker.portalLoginId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (id !== loginId) return worker;
  changed = true;
  const { portalPassword: _pw, ...rest } = worker;
  return { ...rest, portalLoginId: id, portalPasswordHash: hashPortalPassword(password) };
});

if (!changed) {
  console.error("No worker found for portalLoginId:", loginId);
  process.exit(1);
}

data.workers = nextWorkers;
db.prepare("UPDATE erp_state SET payload = ?, version = version + 1 WHERE id = 1").run(
  JSON.stringify(data),
);
console.log("OK portal password set for", loginId);
