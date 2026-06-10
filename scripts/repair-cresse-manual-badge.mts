/**
 * Set ??? May 29 deposit badge to ???? (matchAutoLinked: false).
 * Usage: npx tsx scripts/repair-cresse-manual-badge.mts [sqlite-path]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";

const TX_ID = "4e4098b8-4b56-4af6-8e50-c0be050bc975";
const REPAIR_BY = "repair-cresse-manual-badge";

process.env.DATABASE_PATH = process.argv.find((arg) => arg.endsWith(".sqlite")) || "data/erp.sqlite";
getDb();

const { data: state, version } = getErpState();
const tx = (state.bankTransactions || []).find((row) => row.id === TX_ID);
if (!tx) {
  console.error("Bank tx not found:", TX_ID);
  process.exit(1);
}

console.log("Before:", { matchAutoLinked: tx.matchAutoLinked, matchConfirmedBy: tx.matchConfirmedBy });

state.bankTransactions = (state.bankTransactions || []).map((row) =>
  row.id === TX_ID
    ? {
        ...row,
        matchAutoLinked: false,
        matchConfirmedAt: row.matchConfirmedAt || new Date().toISOString(),
        matchConfirmedBy: REPAIR_BY,
      }
    : row,
);

const saved = saveErpState(state, version, REPAIR_BY);
console.log("Saved ERP version", saved.version);
console.log("matchAutoLinked ? false (????)");
