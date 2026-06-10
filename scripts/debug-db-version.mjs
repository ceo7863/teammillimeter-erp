#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
console.log("version", db.prepare("SELECT version FROM erp_state WHERE id = 1").get().version);
