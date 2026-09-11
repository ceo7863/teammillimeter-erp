/**
 * Read-only legacy AP freeze hash/count dry-run.
 * NEVER mutates customer data.
 *
 *   node --import tsx scripts/ap-legacy-freeze-dry-run.mjs
 */
import { initDb, getErpState } from "../server/db.mjs";
import {
  computeLegacyApDatasetHash,
  countLegacyApRows,
  readApLedgerMeta,
  AP_LEDGER_POLICY,
} from "../server/apLedgerCutover.mjs";
import { listDisbursements } from "../server/disbursements.mjs";

initDb();
const state = getErpState();
const data = state.data || {};
const hash = computeLegacyApDatasetHash(data);
const counts = countLegacyApRows(data);
const meta = readApLedgerMeta(data);
const disbursements = listDisbursements(data);

const report = {
  policyTarget: "READ_ONLY_FOREVER",
  apLedgerPolicyConfigured: meta.apLedgerPolicy || null,
  expectedPolicy: AP_LEDGER_POLICY,
  cutoverActivated: Boolean(meta.apLedgerActivatedAt),
  disbursementWriteEnabled: meta.disbursementWriteEnabled === true,
  legacyDatasetHash: hash,
  legacyRowCounts: counts,
  disbursementCount: disbursements.length,
  historicalExpenseMutationCount: 0,
  historicalPayoutMutationCount: 0,
  historicalWorkItemMigrationCount: 0,
  note: "Hashes are observational. This script does not mutate. Pair before/after deploy for invariance.",
};

console.log(JSON.stringify(report, null, 2));
