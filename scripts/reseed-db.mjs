/**
 * ERP DB를 public/erp-seed.json 내용으로 덮어씁니다.
 * Usage: node scripts/reseed-db.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initDb, getDb } from "../server/db.mjs";
import { config } from "../server/config.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSeed() {
  const seedPath = path.join(rootDir, "public", "erp-seed.json");
  if (!fs.existsSync(seedPath)) {
    throw new Error(`seed 파일을 찾을 수 없습니다: ${seedPath}`);
  }
  return JSON.parse(fs.readFileSync(seedPath, "utf-8"));
}

initDb();
const seed = readSeed();
const payload = {
  sales: seed.sales || [],
  paymentVouchers: seed.paymentVouchers || [],
  clients: seed.clients || [],
  workers: seed.workers || [],
  auditLogs: seed.auditLogs || [],
};

const now = new Date().toISOString();
getDb()
  .prepare(`
    INSERT INTO erp_state (id, payload, version, updated_at, updated_by)
    VALUES (1, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload,
      version = 1,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `)
  .run(JSON.stringify(payload), now, "reseed-script");

const sample = payload.sales?.[0];
console.log("reseed complete");
console.log(`db: ${config.dbPath}`);
console.log(`sales: ${payload.sales.length}`);
console.log(`clients: ${payload.clients.length}`);
console.log(`workers: ${payload.workers.length}`);
if (sample) {
  console.log(`sample: ${sample.client} | ${sample.site}`);
}
