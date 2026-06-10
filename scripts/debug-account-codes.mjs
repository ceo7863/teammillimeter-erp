#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const TRAFFIC = "\uAD50\uD86D";
const MEAL = "\uC2DD";
for (const c of d.accountCodes || []) {
  const hay = `${c.code} ${c.name}`;
  if (hay.includes(TRAFFIC) || hay.includes(MEAL) || ["1061", "1063", "505", "504"].includes(String(c.code))) {
    console.log("acct", c.code, c.name);
  }
}
for (const c of d.ledgerCategories || []) {
  if (c.name?.includes(TRAFFIC) || c.name?.includes(MEAL) || c.id?.includes("f5fd87") || c.id?.includes("260a7f")) {
    console.log("cat", c.id, c.name, c.accountCode);
  }
}
