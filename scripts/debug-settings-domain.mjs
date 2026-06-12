#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2], { readOnly: true });
const row = db.prepare("SELECT payload FROM erp_domain_state WHERE domain = 'settings'").get();
const data = JSON.parse(String(row.payload));
console.log(JSON.stringify({
  topKeys: Object.keys(data),
  scSchedules: Array.isArray(data.scSchedules) ? data.scSchedules.length : null,
  notificationSettings: data.notificationSettings || null,
  scScheduleSyncMeta: data.scScheduleSyncMeta || null,
  clientSiteRequests: Array.isArray(data.clientSiteRequests) ? data.clientSiteRequests.length : null,
}, null, 2));
db.close();
