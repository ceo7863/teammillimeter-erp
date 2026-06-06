#!/usr/bin/env node
/**
 * Re-fetch bank transactions from Barobill for a wide date range and merge into ERP.
 * Usage: node scripts/resync-barobill-bank-full.mjs [startDate] [endDate]
 */
import { getDb, getErpState } from "../server/db.mjs";
import { runBarobillBankSync } from "../server/barobillBankSync.mjs";

const startDate = process.argv[2] || "2025-01-01";
const endDate = process.argv[3] || new Date().toISOString().slice(0, 10);

getDb();
const before = getErpState();
const beforeCount = (before.data.bankTransactions || []).length;

console.log(JSON.stringify({ phase: "before", bankTransactions: beforeCount, startDate, endDate }));

const result = await runBarobillBankSync({
  startDate,
  endDate,
  requestRefresh: true,
  updatedBy: "resync-barobill-bank-full",
  forceMetaUpdate: true,
});

const after = getErpState();
const afterCount = (after.data.bankTransactions || []).length;

console.log(
  JSON.stringify({
    phase: "after",
    ok: result.ok,
    added: result.added,
    skipped: result.skipped,
    fetched: result.fetched,
    collecting: result.collecting,
    notices: result.notices,
    bankTransactions: afterCount,
    delta: afterCount - beforeCount,
    version: after.version,
  }),
);
