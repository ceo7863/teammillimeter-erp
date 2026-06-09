/**
 * Rename client "에이치" -> "미무" across entire ERP state (SQLite).
 * Merges duplicate client rows if both names exist; keeps 미무 master + deposit alias for 에이치.
 *
 * Usage:
 *   node scripts/repair-rename-client-aichi-to-miumu.mjs           # apply
 *   node scripts/repair-rename-client-aichi-to-miumu.mjs --dry-run # preview only
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import {
  countClientRenameMatches,
  migrateClientAichiToMiumu,
} from "../server/migrateClientAichiToMiumu.mjs";

const dryRun = process.argv.includes("--dry-run");

getDb();
const { data: state, version } = getErpState();

const before = countClientRenameMatches(state);
console.log(JSON.stringify({ dryRun, before, version }, null, 2));

if (dryRun) {
  const preview = migrateClientAichiToMiumu(JSON.parse(JSON.stringify(state)));
  console.log("Preview after:", preview.after);
  console.log("Would merge duplicate clients:", preview.mergedClient);
  console.log("Would add deposit alias:", preview.aliasAdded);
  process.exit(0);
}

const stats = migrateClientAichiToMiumu(state, { updatePdfArchives: true, getDb });
const saved = saveErpState(state, version, "repair-rename-client-aichi-to-miumu");

console.log(
  JSON.stringify(
    {
      savedVersion: saved.version,
      mergedClient: stats.mergedClient,
      aliasAdded: stats.aliasAdded,
      before,
      after: stats.after,
    },
    null,
    2,
  ),
);
