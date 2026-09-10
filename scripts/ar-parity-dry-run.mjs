/**
 * Read-only Phase 3 parity check: the legacy `applyPaymentVouchers` view against the
 * Unified AR read model, compared by sale / client / month / statement / bank reference.
 *
 * Performs zero writes (`mutations: 0` is asserted before printing), so it is safe to run
 * against production state at any time. Exits non-zero only when the report itself is
 * unusable or when a mutation is somehow reported.
 *
 * Run:  npx tsx scripts/ar-parity-dry-run.mjs [--as-of=YYYY-MM-DD] [--json] [--limit=20]
 */

import { getErpState } from "../server/db.mjs";
import { initPdfArchiveStore, listPdfArchiveMetas } from "../server/pdfArchive.mjs";
import { buildArParityReport } from "../server/unifiedArReadModel.mjs";

function parseArgs(argv) {
  const options = { asOfDate: undefined, json: false, limit: 20 };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg.startsWith("--as-of=")) options.asOfDate = arg.slice("--as-of=".length);
    else if (arg.startsWith("--limit=")) options.limit = Math.max(0, Number(arg.slice("--limit=".length)) || 0);
  }
  return options;
}

function krw(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

export function buildParityDryRun({ asOfDate } = {}) {
  const state = getErpState();
  // The archive store lives in the same DB but is created by the API boot path; a bare
  // script run (or a fresh DB) must not fail just because the table is not there yet.
  let archives = [];
  try {
    initPdfArchiveStore();
    archives = listPdfArchiveMetas();
  } catch (error) {
    console.warn(`[ar-parity] pdf archives unavailable: ${error?.message || error}`);
  }
  return buildArParityReport(state.data || {}, { asOfDate, archives });
}

function printReport(report, options) {
  const { totals, diffCounts, diffClassCounts } = report;

  console.log(`[ar-parity] apply=false mutations=${report.mutations} asOf=${report.asOfDate}`);
  console.log(
    `[ar-parity] sales=${totals.saleCount} billed=${krw(totals.billedAmount)} ` +
      `legacyView=${krw(totals.legacyViewPaid)} unified=${krw(totals.unifiedApplied)} ` +
      `outstanding=${krw(totals.unifiedOutstanding)}`,
  );
  console.log(
    `[ar-parity] diffs sales=${diffCounts.sales} clients=${diffCounts.clients} ` +
      `months=${diffCounts.months} statements=${diffCounts.statements} bankConflicts=${diffCounts.bankConflicts}`,
  );
  console.log(
    `[ar-parity] diffClasses ${Object.entries(diffClassCounts)
      .map(([key, count]) => `${key}=${count}`)
      .join(" ")}`,
  );

  if (report.bank.reconciliationStatus !== "ok") {
    console.log(`[ar-parity] WARNING bank reference conflicts: ${report.bank.conflicts.length}`);
    for (const conflict of report.bank.conflicts.slice(0, options.limit)) {
      console.log(`  bankTx=${conflict.bankTransactionId} ${conflict.reason || conflict.code || ""}`);
    }
  }

  if (report.statementSaleIdReuse?.length) {
    console.log(
      `[ar-parity] statement saleId reuse across archive versions: ${report.statementSaleIdReuse.length}`,
    );
    for (const row of report.statementSaleIdReuse.slice(0, options.limit)) {
      console.log(`  saleId=${row.saleId} archives=${(row.archiveIds || []).join(",")}`);
    }
  }

  for (const diff of report.sales.slice(0, options.limit)) {
    console.log(
      `  [${diff.diffClass}] sale=${diff.saleId} ${diff.saleDate} ${diff.clientName} ` +
        `billed=${krw(diff.billedAmount)} legacy=${krw(diff.legacyPaid)} unified=${krw(diff.unifiedPaid)} ` +
        `delta=${krw(diff.delta)}`,
    );
  }
  if (report.sales.length > options.limit) {
    console.log(`  ... ${report.sales.length - options.limit} more sale diffs (use --json for the full report)`);
  }

  for (const diff of report.statements.slice(0, options.limit)) {
    console.log(
      `  [statement] archive=${diff.archiveId} ${diff.clientName} stored=${diff.storedPaymentStatus ?? "(none)"} ` +
        `derived=${diff.derivedStatus}${diff.manualReview ? ` manualReview(${diff.manualReviewReason})` : ""}`,
    );
  }

  if (report.errors.length) {
    console.log(`[ar-parity] reconciliation=${report.reconciliationStatus} errors=${report.errors.length}`);
    for (const row of report.errors.slice(0, options.limit)) {
      console.log(`  ERROR [${row.code}] ${row.message}`);
    }
    console.log("[ar-parity] errors are reported only; nothing is auto-fixed.");
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildParityDryRun({ asOfDate: options.asOfDate });

  if (report.mutations !== 0) {
    console.error(`[ar-parity] FAIL expected mutations=0 but got ${report.mutations}`);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printReport(report, options);
}

if (process.argv[1]?.endsWith("ar-parity-dry-run.mjs")) {
  main();
}

export default buildParityDryRun;
