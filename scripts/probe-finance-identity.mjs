/**
 * Read-only production finance identity probe (no mutations).
 * Run from repo root: DATABASE_PATH=./data/erp.sqlite node --import tsx scripts/probe-finance-identity.mjs
 */
import { initDb, getErpState } from "../server/db.mjs";
import { measureFinanceIdentityMetrics } from "../server/financeIdentityMetrics.mjs";

initDb();
const data = getErpState().data || {};
const metrics = measureFinanceIdentityMetrics(data);

const out = {
  ok: true,
  measuredAt: new Date().toISOString(),
  ...metrics,
};

console.log(JSON.stringify(out, null, 2));
