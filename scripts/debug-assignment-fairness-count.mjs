#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const d = JSON.parse(String(row.payload));
const workers = d.workers || [];

const OUT = "\uC678\uC8FC";
const TEAM = "\uD300\uC6D0";
const normCat = (c) => (String(c || "").trim() === OUT ? OUT : TEAM);
const normName = (v) => String(v || "").trim();
const isActive = (w) => w?.isActive !== false;

const active = workers.filter(isActive);
const teamNorm = active.filter((w) => normCat(w.category) === TEAM);
const teamExplicit = active.filter((w) => String(w.category || "").trim() === TEAM);
const outsource = active.filter((w) => normCat(w.category) === OUT);

const nameCounts = new Map();
for (const w of teamNorm) {
  const n = normName(w.name);
  if (!n) continue;
  nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
}

const dupes = [...nameCounts.entries()].filter(([, c]) => c > 1);

console.log(
  JSON.stringify(
    {
      totalWorkers: workers.length,
      active: active.length,
      teamNorm: teamNorm.length,
      teamExplicit: teamExplicit.length,
      outsource: outsource.length,
      uniqueTeamNames: nameCounts.size,
      duplicateNameGroups: dupes.length,
      duplicateExamples: dupes.slice(0, 15),
      emptyCategoryActive: active.filter((w) => !String(w.category || "").trim()).length,
      inactive: workers.length - active.length,
    },
    null,
    2,
  ),
);
