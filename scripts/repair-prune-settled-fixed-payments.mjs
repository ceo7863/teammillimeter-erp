#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { pruneSettledDuplicateFixedExpensePayments } from "../src/utils/companyLedger.ts";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

const before = (data.fixedExpensePayments || []).length;
const pruned = pruneSettledDuplicateFixedExpensePayments({
  fixedExpensePayments: data.fixedExpensePayments || [],
  bankTransactions: data.bankTransactions || [],
  fixedExpenses: data.fixedExpenses || [],
});

const nextPayload = {
  ...data,
  fixedExpensePayments: pruned.payments,
};

const nextVersion = Number(state.version || 0) + 1;
db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify(nextPayload),
  nextVersion,
  new Date().toISOString(),
  "repair-prune-settled-fixed-payments",
);

console.log(
  JSON.stringify(
    {
      version: nextVersion,
      before,
      after: pruned.payments.length,
      removedCount: pruned.removedCount,
      removedIds: pruned.removedIds,
    },
    null,
    2,
  ),
);
