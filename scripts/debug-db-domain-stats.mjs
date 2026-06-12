#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

for (const p of process.argv.slice(2)) {
  const db = new DatabaseSync(p, { readOnly: true });
  let domains = [];
  try {
    domains = db.prepare("SELECT domain, length(payload) len FROM erp_domain_state ORDER BY domain").all();
  } catch {
    // ignore
  }
  let merged = {};
  for (const row of domains) {
    try {
      Object.assign(merged, JSON.parse(String(db.prepare("SELECT payload FROM erp_domain_state WHERE domain = ?").get(row.domain).payload)));
    } catch {
      // ignore
    }
  }
  const blob = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
  const parsed = JSON.parse(String(blob.payload));
  const blobData = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
  console.log(JSON.stringify({
    file: p,
    domains,
    mergedScSchedules: Array.isArray(merged.scSchedules) ? merged.scSchedules.length : null,
    mergedClients: Array.isArray(merged.clients) ? merged.clients.length : null,
    mergedClientContacts: (merged.clients || []).reduce((n, c) => n + (c.contacts?.length || 0), 0),
    blobScSchedules: Array.isArray(blobData.scSchedules) ? blobData.scSchedules.length : null,
    blobClients: Array.isArray(blobData.clients) ? blobData.clients.length : null,
  }, null, 2));
  db.close();
}
