/**
 * Read-only cutover health CLI.
 *   DATABASE_PATH=... npx tsx scripts/ar-ledger-cutover-health.mjs [--json] [--parity]
 */
import { getErpState } from "../server/db.mjs";
import { initPdfArchiveStore, listPdfArchiveMetas } from "../server/pdfArchive.mjs";
import { buildArLedgerCutoverHealthReport } from "../server/arLedgerCutover.mjs";

const json = process.argv.includes("--json");
const parity = process.argv.includes("--parity");

try {
  initPdfArchiveStore();
} catch {
  // optional
}

const state = getErpState();
const report = buildArLedgerCutoverHealthReport(state.data || {}, {
  archives: (() => {
    try {
      return listPdfArchiveMetas();
    } catch {
      return [];
    }
  })(),
  includeParity: parity,
  migrationBlockedConflictCount: 27,
  migrationManualReviewCount: 1065,
});

if (json) {
  console.log(JSON.stringify({ ...report, version: state.version }, null, 2));
} else {
  console.log(`status=${report.status}`);
  console.log(`globalArLedgerCutoverAt=${report.globalArLedgerCutoverAt}`);
  console.log(`legacyVouchers=${report.legacy.voucherCount} logs=${report.legacy.paymentInputLogCount}`);
  console.log(`legacyHash=${report.legacy.datasetHash}`);
  console.log(`hashMatch=${report.legacy.hashMatchesCutover}`);
  console.log(`receipts=${report.receipts.receiptCount} allocations=${report.receipts.allocationCount}`);
  console.log(`bankConflicts=${report.currentBankConflictCount}`);
  console.log(`blockers=${(report.blockers || []).join(",") || "(none)"}`);
}

if (report.mutations !== 0 || report.apply !== false) process.exit(2);
