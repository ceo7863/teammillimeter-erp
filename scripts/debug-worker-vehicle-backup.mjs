#!/usr/bin/env node
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";

function loadWorkers(dbPath) {
  const tmp = path.join(os.tmpdir(), `erp-w-${Date.now()}.sqlite`);
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

const files = process.argv.slice(2);
for (const f of files) {
  const workers = loadWorkers(path.resolve(f));
  const withV = workers.filter((w) => String(w.vehicleNo || "").trim());
  console.log(
    JSON.stringify(
      {
        file: path.basename(f),
        total: workers.length,
        withVehicleNo: withV.length,
        samples: withV.slice(0, 8).map((w) => ({ name: w.name, vehicleNo: w.vehicleNo })),
      },
      null,
      2,
    ),
  );
}
