/**
 * Legacy payment voucher → Receipt migration: plan generator and Phase 5 scaffolding.
 *
 * Task ID: `ERP_UNIFIED_AR_SUBLEDGER_PHASE4_MIGRATION_READINESS_AUDIT_FINAL`
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ PHASE 4 FORBIDS APPLY. Passing `--apply` exits with an error, by design.      │
 * │ This script exists so the future Phase 5 migration has a reviewed, hash-      │
 * │ pinned entry point rather than an ad-hoc repair script.                       │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * Run (dry-run, the default and the only mode available in Phase 4):
 *   DATABASE_PATH=/path/to/erp.sqlite npx tsx scripts/legacy-receipt-migration-plan.mjs [--json]
 *
 * Options:
 *   --json                      emit the plan as JSON
 *   --as-of=YYYY-MM-DD          accounting as-of date (default: today Seoul)
 *   --buckets=A,B               restrict to some AUTO_SAFE buckets (default: all three)
 *   --limit=N                   rows printed in text mode (default 20)
 *   --expect-snapshot=HASH      fail unless the snapshot hash matches
 *   --expect-plan-hash=HASH     fail unless the plan hash matches
 *   --expect-counts=k=v,k=v     fail unless the snapshot record counts match
 *   --approval-token=TOKEN      recorded for Phase 5; ignored while apply is forbidden
 *   --apply                     REFUSED in Phase 4
 *
 * ── Phase 5 apply preconditions (all required, none of them optional) ──────────
 *   1. `--apply` AND `--approval-token=<token issued by the data owner>`
 *   2. `--expect-snapshot=<hash>` matching the audited snapshot exactly
 *   3. `--expect-plan-hash=<hash>` matching the reviewed plan exactly
 *   4. `--expect-counts=<record counts>` matching the audited snapshot exactly
 *   5. A GO decision from `scripts/phase4-migration-readiness-audit.mjs`
 *
 * ── Canary ────────────────────────────────────────────────────────────────────
 *   Apply the plan to a single client (smallest `AUTO_SAFE_BANK` group first), then
 *   re-run the readiness audit and `scripts/ar-parity-dry-run.mjs`. Client closing AR,
 *   sale outstanding, statement status and bank conflict counts must all be unchanged;
 *   only `sourceLedger` may move from `legacy` to `receipt`. Hold for one business day
 *   before widening.
 *
 * ── Backup ────────────────────────────────────────────────────────────────────
 *   `bash scripts/backup-erp-db.sh` (or `node scripts/backup-erp-manual.mjs`) immediately
 *   before the run, with the resulting file hash recorded next to the plan hash. The
 *   backup must be restorable into a temp path and pass the readiness audit before apply.
 *
 * ── Rollback ──────────────────────────────────────────────────────────────────
 *   Receipts are append-only, so rollback is a reversal, not a delete:
 *   for every applied `deterministicReceiptId` post a reversal Receipt through
 *   `reverseReceipt(...)` with the original `receiptDate` as the reversal effective date,
 *   which restores the legacy voucher's suppression state. `deleteReceiptForbidden()` stays
 *   in force. If reversal cannot restore parity, restore the backup taken above and re-run
 *   the readiness audit before resuming service.
 */

import { getErpState } from "../server/db.mjs";
import {
  AUTO_SAFE_BUCKETS,
  buildDeterministicMigrationPlan,
  classifyLegacyVouchers,
  computeMigrationSnapshotHash,
  simulateMigrationOnClone,
} from "../server/legacyReceiptMigrationAudit.mjs";

const APPLY_REFUSAL =
  "Legacy Receipt migration apply is permanently refused after cutover stabilization; preserve paymentVouchers read-only unless the data owner issues a new explicit approval for a future phase";

export function parseArgs(argv) {
  const options = {
    apply: false,
    json: false,
    asOfDate: undefined,
    buckets: AUTO_SAFE_BUCKETS,
    limit: 20,
    expectSnapshot: null,
    expectPlanHash: null,
    expectCounts: null,
    approvalToken: null,
  };
  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg === "--json") options.json = true;
    else if (arg.startsWith("--as-of=")) options.asOfDate = arg.slice("--as-of=".length);
    else if (arg.startsWith("--limit=")) options.limit = Math.max(0, Number(arg.slice("--limit=".length)) || 0);
    else if (arg.startsWith("--buckets=")) {
      options.buckets = arg
        .slice("--buckets=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--expect-snapshot=")) options.expectSnapshot = arg.slice("--expect-snapshot=".length);
    else if (arg.startsWith("--expect-plan-hash=")) options.expectPlanHash = arg.slice("--expect-plan-hash=".length);
    else if (arg.startsWith("--approval-token=")) options.approvalToken = arg.slice("--approval-token=".length);
    else if (arg.startsWith("--expect-counts=")) {
      options.expectCounts = Object.fromEntries(
        arg
          .slice("--expect-counts=".length)
          .split(",")
          .map((pair) => pair.split("="))
          .filter((parts) => parts.length === 2)
          .map(([key, value]) => [key.trim(), Number(value)]),
      );
    }
  }
  return options;
}

/**
 * Phase 4 gate. Kept as a pure function so the test suite can assert the refusal without
 * spawning a process.
 */
export function assertApplyForbidden(options) {
  if (!options.apply) return { apply: false, ok: true };
  const error = new Error(APPLY_REFUSAL);
  error.code = "PHASE4_APPLY_FORBIDDEN";
  throw error;
}

/** Phase 5 will call this before touching anything; Phase 4 only reports the verdict. */
export function evaluateApplyPreconditions(options, snapshot, plan) {
  const missing = [];
  const mismatched = [];
  if (!options.approvalToken) missing.push("--approval-token");
  if (!options.expectSnapshot) missing.push("--expect-snapshot");
  if (!options.expectPlanHash) missing.push("--expect-plan-hash");
  if (!options.expectCounts) missing.push("--expect-counts");

  if (options.expectSnapshot && options.expectSnapshot !== snapshot.hash) {
    mismatched.push({ field: "snapshotHash", expected: options.expectSnapshot, actual: snapshot.hash });
  }
  if (options.expectPlanHash && options.expectPlanHash !== plan.planHash) {
    mismatched.push({ field: "planHash", expected: options.expectPlanHash, actual: plan.planHash });
  }
  for (const [key, expected] of Object.entries(options.expectCounts || {})) {
    const actual = snapshot.counts[key];
    if (actual !== expected) mismatched.push({ field: `count.${key}`, expected, actual });
  }

  return {
    satisfied: missing.length === 0 && mismatched.length === 0,
    missing,
    mismatched,
  };
}

export function buildPlanReport(options = {}) {
  const state = getErpState();
  const data = state.data || {};
  const snapshot = computeMigrationSnapshotHash(data);
  const classification = classifyLegacyVouchers(data, { asOfDate: options.asOfDate });
  const plan = buildDeterministicMigrationPlan(data, {
    asOfDate: options.asOfDate,
    buckets: options.buckets,
    classification,
    snapshot,
  });
  const simulation = simulateMigrationOnClone(data, { asOfDate: options.asOfDate, plan });
  const preconditions = evaluateApplyPreconditions(options, snapshot, plan);

  return {
    ok: plan.ok && simulation.ok,
    apply: false,
    dryRun: true,
    mutations: 0,
    generatedAt: new Date().toISOString(),
    erpVersion: state.version,
    snapshot,
    classificationCounts: classification.counts,
    plan,
    simulation,
    preconditions,
    phase5: {
      applyAllowed: false,
      refusalReason: APPLY_REFUSAL,
      requiredFlags: ["--apply", "--approval-token", "--expect-snapshot", "--expect-plan-hash", "--expect-counts"],
    },
  };
}

function krw(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function printReport(report, options) {
  const { plan, snapshot, simulation } = report;
  console.log(`[migration-plan] DRY RUN — apply=false mutations=0 asOf=${plan.asOfDate}`);
  console.log(`[migration-plan] snapshotHash=${snapshot.hash}`);
  console.log(`[migration-plan] planHash=${plan.planHash}`);
  console.log(
    `[migration-plan] counts ${Object.entries(snapshot.counts)
      .map(([key, value]) => `${key}=${value}`)
      .join(",")}`,
  );
  console.log(
    `[migration-plan] buckets=${plan.buckets.join(",")} groups=${plan.counts.groupCount} ` +
      `planned=${plan.counts.plannedReceiptCount} blocked=${plan.counts.blockedReceiptCount} ` +
      `allocations=${plan.counts.plannedAllocationCount}`,
  );
  console.log(
    `[migration-plan] gross=${krw(plan.totals.grossAmount)} allocated=${krw(plan.totals.allocatedAmount)} ` +
      `prepaid=${krw(plan.totals.unallocatedAmount)}`,
  );
  console.log(
    `[migration-plan] simulation gate=${simulation.gate} appliedDelta=${krw(simulation.deltas.appliedDelta)} ` +
      `newBankConflicts=${simulation.deltas.bankConflicts.new.length} failures=${simulation.failures.join(",") || "(none)"}`,
  );

  for (const row of plan.receipts.slice(0, options.limit)) {
    console.log(
      `  ${row.deterministicReceiptId} ${row.receiptNoCandidate} ${row.receiptDate} ${row.clientRef} ` +
        `${row.bucket} gross=${krw(row.grossAmount)} alloc=${krw(row.allocatedAmount)} prepaid=${krw(row.prepaidAmount)} ` +
        `operationId=${row.operationId}`,
    );
  }
  if (plan.receipts.length > options.limit) {
    console.log(`  ... ${plan.receipts.length - options.limit} more (use --json)`);
  }
  for (const row of plan.blocked.slice(0, options.limit)) {
    console.log(
      `  BLOCKED ${row.groupKey} ${row.clientRef} gross=${krw(row.grossAmount)} ` +
        `reasons=${row.blockers.map((blocker) => blocker.code).join(",")}`,
    );
  }

  const { preconditions } = report;
  console.log(
    `[migration-plan] phase5 preconditions satisfied=${preconditions.satisfied} ` +
      `missing=${preconditions.missing.join(",") || "(none)"} ` +
      `mismatched=${preconditions.mismatched.map((row) => row.field).join(",") || "(none)"}`,
  );
  console.log(`[migration-plan] apply is refused in this phase: ${APPLY_REFUSAL}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  try {
    assertApplyForbidden(options);
  } catch (error) {
    console.error(`[migration-plan] ${error.message}`);
    process.exit(2);
  }

  const report = buildPlanReport(options);

  // A dry-run with explicit expectations still verifies them, so Phase 5 inputs can be
  // rehearsed safely before anyone is allowed to pass --apply.
  if (report.preconditions.mismatched.length) {
    console.error(
      `[migration-plan] FAIL expectation mismatch: ${report.preconditions.mismatched
        .map((row) => `${row.field} expected=${row.expected} actual=${row.actual}`)
        .join("; ")}`,
    );
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printReport(report, options);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("legacy-receipt-migration-plan.mjs")) {
  main();
}

export { APPLY_REFUSAL };
export default buildPlanReport;
