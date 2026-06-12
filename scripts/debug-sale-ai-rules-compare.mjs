#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const paths = process.argv.slice(2);
if (paths.length < 2) {
  console.error("Usage: node scripts/debug-sale-ai-rules-compare.mjs <db1> <db2>");
  process.exit(1);
}

function loadSaleAiRules(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  let rules = null;
  const meta = {};
  try {
    const row = db.prepare("SELECT version, updated_at FROM erp_state WHERE id = 1").get();
    if (row) {
      meta.version = row.version;
      meta.updatedAt = row.updated_at;
    }
  } catch (error) {
    meta.erpStateError = String(error);
  }

  try {
    const rows = db.prepare("SELECT domain, payload FROM erp_domain_state").all();
    const data = {};
    for (const row of rows) {
      try {
        Object.assign(data, JSON.parse(String(row.payload)));
      } catch {
        // ignore
      }
    }
    rules = data.saleAiRules ?? null;
    meta.source = "erp_domain_state";
  } catch {
    // legacy
  }

  if (!rules) {
    const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
    const parsed = JSON.parse(String(row.payload));
    const data = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
    rules = data.saleAiRules ?? null;
    meta.source = "erp_state.payload";
  }

  db.close();
  return { rules, meta, label: dbPath };
}

const snapshots = paths.map(loadSaleAiRules);
const [a, b] = snapshots;
const keys = [
  "shortShiftMaxHours",
  "shortShiftBaseAmount",
  "shortShiftHourlyAmount",
  "overtimeBaseHour",
  "overtimeStartHour",
  "normalEndHour",
];

const diffs = [];
for (const key of keys) {
  const left = a.rules?.[key];
  const right = b.rules?.[key];
  if (left !== right) diffs.push({ key, current: left, backup: right });
}

console.log(
  JSON.stringify(
    {
      current: a,
      backup: b,
      same: diffs.length === 0,
      diffs,
    },
    null,
    2,
  ),
);
