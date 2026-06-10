#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, getErpState } from "../server/db.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "data/erp-state-export.json");

getDb();
const state = getErpState();
let users = [];
try {
  users = getDb().prepare("SELECT * FROM users").all();
} catch {
  users = [];
}

const payload = {
  exportedAt: new Date().toISOString(),
  version: state.version,
  data: state.data,
  users,
};

fs.writeFileSync(outPath, JSON.stringify(payload));
console.log(
  JSON.stringify({
    ok: true,
    outPath,
    version: state.version,
    bankTransactions: state.data.bankTransactions?.length || 0,
    taxInvoices: state.data.taxInvoices?.length || 0,
    bankLedgerRules: state.data.bankLedgerRules?.length || 0,
  }),
);
