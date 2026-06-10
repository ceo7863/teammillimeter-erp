#!/usr/bin/env node
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const p = process.argv[2] || "data/erp.sqlite.bak-pre-restore-";
const tmp = path.join(os.tmpdir(), `inspect-${Date.now()}.sqlite`);
fs.copyFileSync(p, tmp);
const db = new DatabaseSync(tmp, { readOnly: true });
const row = db.prepare("SELECT payload FROM erp_state WHERE id=1").get();
const data = JSON.parse(String(row.payload));
const d = data.data || data;
const rules = d.workerPayWithVatLearnRules;
console.log(JSON.stringify({
  type: typeof rules,
  isArray: Array.isArray(rules),
  sample: Array.isArray(rules) ? rules.slice(0,2) : rules,
  expenseCategories: (d.expenseCategories||[]).length,
  expenseSample: (d.expenseCategories||[]).slice(0,2).map(x=>({id:x.id,name:x.name})),
}, null, 2));
db.close();
fs.unlinkSync(tmp);
