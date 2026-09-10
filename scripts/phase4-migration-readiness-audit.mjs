/**
 * Phase 4 migration readiness audit — read-only CLI.
 *
 * Task ID: `ERP_UNIFIED_AR_SUBLEDGER_PHASE4_MIGRATION_READINESS_AUDIT_FINAL`
 *
 * Run:
 *   DATABASE_PATH=/path/to/erp.sqlite npx tsx scripts/phase4-migration-readiness-audit.mjs [--json]
 *
 * Options:
 *   --json                 print the full report as JSON instead of the section summary
 *   --as-of=YYYY-MM-DD     evaluate the ledger as-of this accounting date (default: today Seoul)
 *   --limit=N              rows printed per section in text mode (default 20)
 *   --include-migrated     also audit Receipts whose source is already `migration`
 *
 * Safety: `apply` is hard-coded false, every section asserts `mutations === 0`, and the ERP
 * state version + snapshot hash are re-read after the run and compared. The script exits
 * non-zero if anything mutated, so it is safe to run against production.
 */

import { getErpState, getErpVersionMeta } from "../server/db.mjs";
import { initPdfArchiveStore, listPdfArchiveMetas } from "../server/pdfArchive.mjs";
import { buildArParityReport } from "../server/unifiedArReadModel.mjs";
import {
  buildMigrationReadinessReport,
  computeMigrationSnapshotHash,
} from "../server/legacyReceiptMigrationAudit.mjs";

function parseArgs(argv) {
  const options = { json: false, asOfDate: undefined, limit: 20, includeMigrated: false };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--include-migrated") options.includeMigrated = true;
    else if (arg.startsWith("--as-of=")) options.asOfDate = arg.slice("--as-of=".length);
    else if (arg.startsWith("--limit=")) options.limit = Math.max(0, Number(arg.slice("--limit=".length)) || 0);
  }
  return options;
}

function krw(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function loadArchives() {
  try {
    initPdfArchiveStore();
    return listPdfArchiveMetas();
  } catch (error) {
    console.warn(`[phase4] pdf archives unavailable: ${error?.message || error}`);
    return [];
  }
}

export function runPhase4Audit(options = {}) {
  const versionBefore = getErpVersionMeta();
  const state = getErpState();
  const data = state.data || {};
  const archives = loadArchives();
  const snapshotBefore = computeMigrationSnapshotHash(data);

  const parityReport = buildArParityReport(data, { asOfDate: options.asOfDate, archives });
  const report = buildMigrationReadinessReport(data, {
    asOfDate: options.asOfDate,
    archives,
    parityReport,
  });

  const snapshotAfter = computeMigrationSnapshotHash(getErpState().data || {});
  const versionAfter = getErpVersionMeta();

  const sections = [
    report,
    report.organicReceipts,
    report.saleDiffs,
    report.unattributedFifo,
    report.legacyBuckets,
    report.plan,
    report.simulation,
  ].filter(Boolean);

  const mutationEvidence = [];
  if (snapshotBefore.hash !== snapshotAfter.hash) mutationEvidence.push("SNAPSHOT_HASH_CHANGED");
  if (versionBefore.version !== versionAfter.version) mutationEvidence.push("ERP_VERSION_CHANGED");
  for (const section of sections) {
    if (section.mutations !== 0) mutationEvidence.push("SECTION_REPORTED_MUTATION");
    if (section.apply !== false) mutationEvidence.push("SECTION_REPORTED_APPLY");
  }

  return {
    ...report,
    parity: {
      asOfDate: parityReport.asOfDate,
      diffCounts: parityReport.diffCounts,
      diffClassCounts: parityReport.diffClassCounts,
      totals: parityReport.totals,
    },
    readOnlyProof: {
      mutations: 0,
      apply: false,
      snapshotHashBefore: snapshotBefore.hash,
      snapshotHashAfter: snapshotAfter.hash,
      erpVersionBefore: versionBefore.version,
      erpVersionAfter: versionAfter.version,
      mutationEvidence,
      ok: mutationEvidence.length === 0,
    },
  };
}

function printSnapshot(report) {
  const { snapshot } = report;
  console.log(`\n=== 1. SNAPSHOT ===`);
  console.log(`snapshotHash=${snapshot.hash} asOf=${report.asOfDate}`);
  for (const [key, count] of Object.entries(snapshot.counts)) {
    console.log(`  ${key.padEnd(20)} ${String(count).padStart(7)}  checksum=${snapshot.checksums[key]}`);
  }
}

function printOrganicReceipts(report, limit) {
  const section = report.organicReceipts;
  console.log(`\n=== 2. ORGANIC RECEIPT AUDIT (gate=${section.gate}) ===`);
  console.log(
    `receipts=${section.counts.organicReceiptCount} blocked=${section.counts.blockedCount} ` +
      `cashIdentityBroken=${section.counts.cashIdentityBrokenCount} bankLinked=${section.counts.bankLinkedCount} ` +
      `unallocated=${section.counts.unallocatedReceiptCount}`,
  );
  console.log(
    `gross=${krw(section.totals.grossAmount)} allocated=${krw(section.totals.allocatedAmount)} ` +
      `unallocated=${krw(section.totals.unallocatedAmount)}`,
  );
  for (const row of section.receipts.slice(0, limit)) {
    console.log(
      `  ${row.blocked ? "BLOCKED" : "ok     "} ${row.receiptId} ${row.receiptDate} ${row.clientRef} ` +
        `source=${row.source} channel=${row.channel} gross=${krw(row.grossAmount)} ` +
        `alloc=${krw(row.allocatedSum)} unalloc=${krw(row.unallocatedAmount)} ` +
        `cashIdentity=${row.cashIdentity.ok ? "ok" : "BROKEN"} ` +
        `bankTx=${row.bank.bankTransactionId ?? "-"}${row.bank.depositMatchesGross === false ? " DEPOSIT_MISMATCH" : ""}` +
        `${row.bank.legacyVoucherIdsOnSameTx.length ? ` legacyOnSameTx=${row.bank.legacyVoucherIdsOnSameTx.length}` : ""}`,
    );
    for (const blocker of row.blockers) console.log(`      ! ${blocker.code} ${blocker.message}`);
  }
  if (section.receipts.length > limit) {
    console.log(`  ... ${section.receipts.length - limit} more (use --json)`);
  }
}

function printSaleDiffs(report, limit) {
  const section = report.saleDiffs;
  if (!section) {
    console.log(`\n=== 3. SALE DIFF CLASSIFICATION === (skipped: no parity report)`);
    return;
  }
  console.log(`\n=== 3. SALE DIFF CLASSIFICATION ===`);
  console.log(
    `diffs=${section.counts.diffCount} readModelBugs=${section.counts.readModelBugCount} ` +
      `unexplainedDelta=${krw(section.counts.unexplainedDelta)}`,
  );
  console.log(
    `  classes ${Object.entries(section.classCounts)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${key}=${count}`)
      .join(" ") || "(none)"}`,
  );
  for (const [prior, breakdown] of Object.entries(section.priorClassBreakdown)) {
    console.log(
      `  phase3:${prior} → ${Object.entries(breakdown)
        .map(([key, count]) => `${key}=${count}`)
        .join(" ")}`,
    );
  }
  for (const row of section.diffs.slice(0, limit)) {
    console.log(
      `  [${row.classification}] sale=${row.saleId} ${row.saleDate} ${row.clientRef} ` +
        `billed=${krw(row.billedAmount)} legacyView=${krw(row.legacyViewPaid)} unified=${krw(row.unifiedPaid)} ` +
        `delta=${krw(row.delta)} basePaid=${krw(row.basePaid)} direct=${krw(row.legacyDirectApplied)} ` +
        `fifo=${krw(row.legacyFifoApplied)} receipt=${krw(row.receiptAllocatedAmount)} ` +
        `bank=${row.bankFlags.hasBankEvidence ? "Y" : "N"} pdf=${row.pdfFlags.hasStatementEvidence ? "Y" : "N"}`,
    );
    for (const note of row.evidence) console.log(`      · ${note}`);
  }
  if (section.diffs.length > limit) {
    console.log(`  ... ${section.diffs.length - limit} more (use --json)`);
  }
}

function printUnattributed(report, limit) {
  const section = report.unattributedFifo;
  console.log(`\n=== 4. UNATTRIBUTED LEGACY / FIFO (autoAllocate=${section.autoAllocate}) ===`);
  console.log(
    `cases=${section.counts.caseCount} unresolved=${section.counts.unresolvedCaseCount} ` +
      `amount=${krw(section.counts.unattributedAmount)} vouchers=${section.counts.voucherCount}`,
  );
  for (const row of section.cases.slice(0, limit)) {
    console.log(
      `  ${row.clientRef} vouchers=${row.voucherCount} total=${krw(row.voucherTotalAmount)} ` +
        `fifoApplied=${krw(row.fifoAppliedAmount)} unattributed=${krw(row.unattributedAmount)} ` +
        `candidates=${row.candidateCount} decision=${row.decision}`,
    );
    for (const candidate of row.candidates.slice(0, 5)) {
      console.log(
        `      candidate#${candidate.rank} sale=${candidate.saleId} ${candidate.saleDate} ` +
          `outstanding=${krw(candidate.outstandingAmount)} inScope=${candidate.withinStatementScope}`,
      );
    }
    for (const choice of row.options.filter((item) => item.action !== "ALLOCATE_TO_SALE")) {
      console.log(`      option ${choice.optionId} ${choice.action} amount=${krw(choice.amount)}`);
    }
    for (const blocker of row.blockers) console.log(`      ! ${blocker.code} ${blocker.message}`);
  }
}

function printBuckets(report) {
  const section = report.legacyBuckets;
  console.log(`\n=== 5. LEGACY VOUCHER BUCKETS ===`);
  console.log(
    `vouchers=${section.counts.legacyVoucherCount} items=${section.counts.itemCount} ` +
      `autoSafe=${section.counts.autoSafeCount} manualReview=${section.counts.manualReviewCount} ` +
      `blocked=${section.counts.blockedCount} openingBalance=${section.counts.openingBalanceCandidateCount}`,
  );
  for (const bucket of Object.values(section.buckets)) {
    console.log(
      `  ${bucket.bucket.padEnd(26)} count=${String(bucket.count).padStart(5)} amount=${krw(bucket.amount).padStart(14)} ` +
        `sales=${bucket.saleCount} clients=${bucket.clientCount} bankTx=${bucket.bankTransactionCount} ` +
        `statements=${bucket.statementCount} batches=${bucket.batchCount}`,
    );
    const reasons = new Map();
    for (const item of bucket.items) {
      for (const reason of [...item.blockers, ...item.reviewReasons]) {
        reasons.set(reason, (reasons.get(reason) || 0) + 1);
      }
    }
    for (const [reason, count] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`      · ${reason} × ${count}`);
    }
  }
}

function printPlan(report, limit) {
  const section = report.plan;
  console.log(`\n=== 6. DETERMINISTIC MIGRATION PLAN (apply=${section.apply}) ===`);
  console.log(`planHash=${section.planHash}`);
  console.log(`snapshotHash=${section.snapshotHash} buckets=${section.buckets.join(",")}`);
  console.log(
    `groups=${section.counts.groupCount} planned=${section.counts.plannedReceiptCount} ` +
      `blocked=${section.counts.blockedReceiptCount} allocations=${section.counts.plannedAllocationCount} ` +
      `prepaidReceipts=${section.counts.prepaidReceiptCount}`,
  );
  console.log(
    `gross=${krw(section.totals.grossAmount)} allocated=${krw(section.totals.allocatedAmount)} ` +
      `unallocated(prepaid)=${krw(section.totals.unallocatedAmount)}`,
  );
  for (const row of section.receipts.slice(0, limit)) {
    console.log(
      `  ${row.deterministicReceiptId} ${row.receiptNoCandidate} ${row.receiptDate} ${row.clientRef} ` +
        `${row.bucket} channel=${row.channel} gross=${krw(row.grossAmount)} alloc=${krw(row.allocatedAmount)} ` +
        `prepaid=${krw(row.prepaidAmount)} allocations=${row.allocationCount} bankTx=${row.bankTransactionId ?? "-"} ` +
        `payloadHash=${row.payloadHash.slice(0, 12)} provenance=${row.provenanceHash.slice(0, 12)}`,
    );
  }
  for (const row of section.blocked.slice(0, limit)) {
    console.log(
      `  BLOCKED ${row.groupKey} ${row.clientRef} gross=${krw(row.grossAmount)} ` +
        `reasons=${row.blockers.map((blocker) => blocker.code).join(",")}`,
    );
  }
}

function printSimulation(report) {
  const section = report.simulation;
  console.log(`\n=== 7. TEMP-CLONE SIMULATION (gate=${section.gate}) ===`);
  console.log(
    `mode=${section.clone.mode} sourceUnchanged=${section.clone.sourceDataUnchanged} ` +
      `planHash=${section.planHash} appliedDelta=${krw(section.deltas.appliedDelta)}`,
  );
  console.log(
    `cashIdentity before=${section.deltas.cashIdentity.before.ok} after=${section.deltas.cashIdentity.after.ok} ` +
      `bankConflicts ${section.deltas.bankConflicts.before} → ${section.deltas.bankConflicts.after}`,
  );
  console.log(
    `changed sales=${section.deltas.salesChanged.length} clients=${section.deltas.clientsChanged.length} ` +
      `statements=${section.deltas.statementsChanged.length} newErrors=${section.deltas.newErrorCodes.join(",") || "(none)"}`,
  );
  for (const row of section.deltas.totals) {
    console.log(`  total ${row.key}: ${krw(row.before)} → ${krw(row.after)} (${krw(row.delta)})`);
  }
  if (section.failures.length) console.log(`  FAILURES: ${section.failures.join(", ")}`);
}

function printGoNoGo(report) {
  console.log(`\n=== 8. GO / NO-GO (decision=${report.goNoGo.decision}) ===`);
  for (const check of report.goNoGo.checks) {
    console.log(`  [${check.status.padEnd(7)}] ${check.id} — ${check.label}`);
  }
}

function printReadOnlyProof(report) {
  const proof = report.readOnlyProof;
  console.log(`\n=== 9. READ-ONLY PROOF ===`);
  console.log(
    `mutations=${proof.mutations} apply=${proof.apply} ` +
      `erpVersion ${proof.erpVersionBefore} → ${proof.erpVersionAfter} ` +
      `snapshot ${proof.snapshotHashBefore.slice(0, 12)} → ${proof.snapshotHashAfter.slice(0, 12)} ok=${proof.ok}`,
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = runPhase4Audit(options);

  if (!report.readOnlyProof.ok) {
    console.error(
      `[phase4] FAIL read-only proof violated: ${report.readOnlyProof.mutationEvidence.join(", ")}`,
    );
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`[phase4] migration readiness audit — apply=false mutations=0 asOf=${report.asOfDate}`);
  console.log(
    `[phase4] phase3 parity: diffs sales=${report.parity.diffCounts.sales} ` +
      `statements=${report.parity.diffCounts.statements} bankConflicts=${report.parity.diffCounts.bankConflicts} ` +
      `classes ${Object.entries(report.parity.diffClassCounts)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${key}=${count}`)
        .join(" ") || "(none)"}`,
  );

  printSnapshot(report);
  printOrganicReceipts(report, options.limit);
  printSaleDiffs(report, options.limit);
  printUnattributed(report, options.limit);
  printBuckets(report);
  printPlan(report, options.limit);
  printSimulation(report);
  printGoNoGo(report);
  printReadOnlyProof(report);

  console.log(`\n[phase4] done — nothing was written. apply=false, mutations=0.`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("phase4-migration-readiness-audit.mjs")) {
  main();
}

export default runPhase4Audit;
