#!/usr/bin/env node
/**
 * Restore worker vehicleNo (and other empty worker contact fields) from backup.
 * Usage: node scripts/repair-restore-worker-vehicle.mjs [backup-path] [--dry-run]
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { getDb, getErpState, saveErpState } from "../server/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const backupPath = args[0]
  ? path.resolve(process.cwd(), args[0])
  : path.join(rootDir, "data/erp.sqlite.bak-pre-restore-");

const PATCH_FIELDS = ["vehicleNo", "address", "businessNo", "bank", "account", "memo"];

function loadWorkers(dbPath) {
  const tmp = path.join(os.tmpdir(), `erp-wv-${Date.now()}.sqlite`);
  fs.copyFileSync(dbPath, tmp);
  const db = new DatabaseSync(tmp, { readOnly: true });
  let data = {};
  try {
    for (const r of db.prepare("SELECT payload FROM erp_domain_state WHERE domain='workers'").all()) {
      Object.assign(data, JSON.parse(String(r.payload)));
    }
  } catch {}
  const row = db.prepare("SELECT payload FROM erp_state WHERE id=1").get();
  if (row) {
    const p = JSON.parse(String(row.payload));
    const blob = p.data || p;
    if (!data.workers?.length) data.workers = blob.workers;
  }
  db.close();
  fs.unlinkSync(tmp);
  return data.workers || [];
}

function indexWorkers(workers) {
  const byId = new Map();
  const byName = new Map();
  for (const worker of workers) {
    if (worker.id != null) byId.set(String(worker.id), worker);
    const name = String(worker.name || "").trim();
    if (name) byName.set(name, worker);
  }
  return { byId, byName };
}

getDb();
const currentState = getErpState();
const backupWorkers = loadWorkers(backupPath);
const backupIndex = indexWorkers(backupWorkers);
const workers = Array.isArray(currentState.data.workers) ? [...currentState.data.workers] : [];

let patched = 0;
const samples = [];

for (let i = 0; i < workers.length; i += 1) {
  const worker = workers[i];
  const backup =
    backupIndex.byId.get(String(worker.id)) ||
    backupIndex.byName.get(String(worker.name || "").trim());
  if (!backup) continue;

  const patch = {};
  for (const field of PATCH_FIELDS) {
    const cur = String(worker[field] ?? "").trim();
    const bak = String(backup[field] ?? "").trim();
    if (!cur && bak) patch[field] = bak;
  }
  if (!Object.keys(patch).length) continue;

  workers[i] = { ...worker, ...patch };
  patched += 1;
  if (samples.length < 10) {
    samples.push({ name: worker.name, ...patch });
  }
}

const withVehicle = workers.filter((w) => String(w.vehicleNo || "").trim()).length;

console.log(
  JSON.stringify(
    {
      dryRun,
      backupPath,
      patchedWorkers: patched,
      workersWithVehicleNo: withVehicle,
      samples,
    },
    null,
    2,
  ),
);

if (!dryRun && patched > 0) {
  const saved = saveErpState({ ...currentState.data, workers }, currentState.version, "repair-restore-worker-vehicle");
  console.log(JSON.stringify({ ok: true, newVersion: saved.version, workersWithVehicleNo: withVehicle }));
}
