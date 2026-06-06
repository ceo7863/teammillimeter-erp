/**
 * Merge Barobill-style standard account codes into ERP accountCodes.
 * Usage: npx tsx scripts/seed-standard-account-codes.ts [--dry-run]
 */
import { getErpState, saveErpState } from "../server/db.mjs";
import { mergeStandardAccountCodes } from "../src/utils/standardAccountCodes.ts";

const dryRun = process.argv.includes("--dry-run");

const state = getErpState();
const before = Array.isArray(state.data?.accountCodes) ? state.data.accountCodes : [];
const after = mergeStandardAccountCodes(before);
const added = after.length - before.length;

console.log(`accountCodes before: ${before.length}`);
console.log(`accountCodes after:  ${after.length}`);
console.log(`added: ${added}`);

if (added > 0) {
  const beforeKeys = new Set(before.map((row) => `${row.parentGroup}|${row.name}`));
  for (const row of after) {
    const key = `${row.parentGroup}|${row.name}`;
    if (!beforeKeys.has(key)) {
      console.log(`  + [${row.parentGroup}] ${row.name} (${row.code})`);
    }
  }
}

if (dryRun) {
  console.log("dry-run: not saved");
  process.exit(0);
}

if (added === 0) {
  console.log("nothing to save");
  process.exit(0);
}

const saved = saveErpState(
  { ...state.data, accountCodes: after },
  state.version,
  "seed-standard-account-codes",
);
console.log(`saved version ${saved.version}`);
