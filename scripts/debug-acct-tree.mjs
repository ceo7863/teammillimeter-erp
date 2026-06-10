#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
for (const c of d.accountCodes || []) {
  if (["1061", "1063", "504", "505"].includes(String(c.code))) {
    console.log(c.code, c.name, "parent:", c.parentCode, "flow:", c.flow);
  }
}
