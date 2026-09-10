/**
 * As-of integrity tests for unified AR receipt subledger.
 * Run: npx tsx scripts/test-receipt-ledger-asof.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-receipt-asof-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = "test-receipt-asof";

const { initDb, getErpState, saveErpState } = await import("../server/db.mjs");
const {
  createAndPostReceipt,
  reverseReceipt,
  replaceReceiptAllocations,
} = await import("../server/receipts.mjs");
const { buildClientArSubledger } = await import("../server/receiptArSubledger.mjs");
const { buildEffectivePaymentVouchers } = await import("../server/receiptProjection.mjs");

initDb();

function seedBase() {
  const state = getErpState();
  saveErpState(
    {
      ...state.data,
      clients: [
        { id: 101, name: "Alpha Construction" },
        { id: 102, name: "Beta Interior" },
      ],
      sales: [
        { id: 1, date: "2026-08-01", client: "Alpha Construction", clientId: 101, amount: 1_000_000, paid: 0, basePaid: 0, site: "Site A" },
        { id: 2, date: "2026-08-15", client: "Alpha Construction", clientId: 101, amount: 500_000, paid: 0, basePaid: 0, site: "Site B" },
        { id: 3, date: "2026-09-05", client: "Alpha Construction", clientId: 101, amount: 400_000, paid: 0, basePaid: 0, site: "Site C" },
      ],
      paymentVouchers: [],
      paymentInputLogs: [],
      receipts: [],
      receiptAllocations: [],
      bankTransactions: [],
    },
    state.version,
    "test-seed",
    { allowReceiptMutation: true },
  );
}

function reload() {
  return getErpState().data;
}

function ledger(clientId, startDate, endDate) {
  return buildClientArSubledger(reload(), { clientId, startDate, endDate });
}

function saleAllocated(endDate, saleId) {
  const row = ledger(101, "2026-08-01", endDate).sales.find((s) => String(s.saleId) === String(saleId));
  return row ? row.allocatedAmount : 0;
}

const results = {
  delayedAllocationTest: "PENDING",
  futureReversalHistoricalSnapshotTest: "PENDING",
  crossPeriodReallocationTest: "PENDING",
  partialReallocationBalanceTest: "PENDING",
  reverseBeforeReceiptDateTest: "PENDING",
  outOfOrderEventTest: "PENDING",
  idempotencyDateConflictTest: "PENDING",
  concurrencyTest: "PENDING",
};

// 1) Delayed allocation: Aug 31 unallocated cash, Sep 5 allocate to Sep sale
{
  seedBase();
  const created = createAndPostReceipt(
    {
      operationId: "asof-delay-1",
      clientId: 101,
      receiptDate: "2026-08-31",
      grossAmount: 400_000,
      channel: "cash",
      source: "receivables",
      allocations: [],
    },
    "tester",
  );
  const augBefore = ledger(101, "2026-08-01", "2026-08-31");
  assert.equal(augBefore.periodAppliedAllocations, 0);
  assert.equal(augBefore.unallocatedPrepaid, 400_000);
  assert.equal(augBefore.closingAr, 1_500_000);
  assert.equal(augBefore.periodReceiptsGross, 400_000);

  replaceReceiptAllocations(
    created.receipt.id,
    {
      operationId: "asof-delay-alloc-1",
      effectiveDate: "2026-09-05",
      allocations: [{ saleId: 3, amount: 400_000 }],
    },
    "tester",
  );

  const augAfter = ledger(101, "2026-08-01", "2026-08-31");
  assert.equal(augAfter.periodAppliedAllocations, 0, "Aug applied must stay 0 after Sep allocation");
  assert.equal(augAfter.unallocatedPrepaid, 400_000);
  assert.equal(augAfter.closingAr, 1_500_000);
  assert.deepEqual(
    { ar: augAfter.closingAr, prepaid: augAfter.unallocatedPrepaid, applied: augAfter.periodAppliedAllocations },
    { ar: augBefore.closingAr, prepaid: augBefore.unallocatedPrepaid, applied: augBefore.periodAppliedAllocations },
  );

  const sep = ledger(101, "2026-09-01", "2026-09-30");
  assert.equal(sep.periodAppliedAllocations, 400_000);
  assert.equal(sep.unallocatedPrepaid, 0);
  assert.equal(sep.closingAr, sep.closingBilled - 400_000);
  assert.equal(sep.closingBilled, 1_900_000);
  assert.equal(sep.openingAr, 1_500_000);
  results.delayedAllocationTest = "PASS";
}

// 2) Future reversal must not rewrite historical Aug snapshot
{
  seedBase();
  const created = createAndPostReceipt(
    {
      operationId: "asof-rev-base",
      clientId: 101,
      receiptDate: "2026-08-31",
      grossAmount: 400_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 1, amount: 400_000 }],
    },
    "tester",
  );
  const augSnap = ledger(101, "2026-08-01", "2026-08-31");
  assert.equal(augSnap.periodAppliedAllocations, 400_000);
  assert.equal(augSnap.closingAr, 1_100_000);

  // Sep 5 sale (400k) is billed by Sep 9 → billed 1.9M - applied 400k = 1.5M
  const sep9 = ledger(101, "2026-08-01", "2026-09-09");
  assert.equal(sep9.closingAppliedAllocations, 400_000);
  assert.equal(sep9.closingBilled, 1_900_000);
  assert.equal(sep9.closingAr, 1_500_000);

  reverseReceipt(
    created.receipt.id,
    { operationId: "asof-rev-1", receiptDate: "2026-09-10", reversalEffectiveDate: "2026-09-10" },
    "tester",
  );

  const augAfterRev = ledger(101, "2026-08-01", "2026-08-31");
  assert.equal(augAfterRev.periodAppliedAllocations, 400_000);
  assert.equal(augAfterRev.closingAr, 1_100_000);
  assert.equal(augAfterRev.closingAppliedAllocations, 400_000);

  const sep9After = ledger(101, "2026-08-01", "2026-09-09");
  assert.equal(sep9After.closingAr, 1_500_000);
  assert.equal(sep9After.closingAppliedAllocations, 400_000);

  const sep10 = ledger(101, "2026-08-01", "2026-09-10");
  assert.equal(sep10.closingAppliedAllocations, 0);
  assert.equal(sep10.closingAr, 1_900_000);
  assert.equal(sep10.closingAr - sep9After.closingAr, 400_000);
  assert.equal(sep10.periodAppliedAllocations, 0);
  results.futureReversalHistoricalSnapshotTest = "PASS";
}

// 3) Cross-period reallocation A -> B; client AR net unchanged
{
  seedBase();
  const created = createAndPostReceipt(
    {
      operationId: "asof-realloc-base",
      clientId: 101,
      receiptDate: "2026-08-20",
      grossAmount: 300_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 1, amount: 300_000 }],
    },
    "tester",
  );
  const aug = ledger(101, "2026-08-01", "2026-08-31");
  assert.equal(saleAllocated("2026-08-31", 1), 300_000);
  assert.equal(saleAllocated("2026-08-31", 2), 0);
  const augClosingAr = aug.closingAr;

  replaceReceiptAllocations(
    created.receipt.id,
    {
      operationId: "asof-realloc-1",
      effectiveDate: "2026-09-15",
      allocations: [{ saleId: 2, amount: 300_000 }],
    },
    "tester",
  );

  assert.equal(saleAllocated("2026-08-31", 1), 300_000, "Aug still shows A");
  assert.equal(saleAllocated("2026-08-31", 2), 0);
  assert.equal(ledger(101, "2026-08-01", "2026-08-31").closingAr, augClosingAr);

  assert.equal(saleAllocated("2026-09-30", 1), 0, "Sep shows A cleared");
  assert.equal(saleAllocated("2026-09-30", 2), 300_000, "Sep shows B");
  const sep = ledger(101, "2026-09-01", "2026-09-30");
  assert.equal(sep.closingAppliedAllocations, 300_000, "applied cash net unchanged by reallocation");
  assert.equal(sep.closingAr, sep.closingBilled - 300_000, "AR reduced only by applied amount");
  assert.equal(sep.periodAppliedAllocations, 0);
  results.crossPeriodReallocationTest = "PASS";
}

// 4) Aug cash + Sep partial reallocation: period change matches closing-opening
{
  seedBase();
  const created = createAndPostReceipt(
    {
      operationId: "asof-partial-base",
      clientId: 101,
      receiptDate: "2026-08-31",
      grossAmount: 400_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 1, amount: 400_000 }],
    },
    "tester",
  );
  replaceReceiptAllocations(
    created.receipt.id,
    {
      operationId: "asof-partial-1",
      effectiveDate: "2026-09-12",
      allocations: [
        { saleId: 1, amount: 100_000 },
        { saleId: 2, amount: 300_000 },
      ],
    },
    "tester",
  );
  const sep = ledger(101, "2026-09-01", "2026-09-30");
  assert.equal(sep.periodAppliedAllocations, sep.closingAppliedAllocations - sep.openingAppliedAllocations);
  assert.equal(sep.openingAppliedAllocations, 400_000);
  assert.equal(sep.closingAppliedAllocations, 400_000);
  assert.equal(sep.periodAppliedAllocations, 0);
  assert.equal(saleAllocated("2026-09-30", 1), 100_000);
  assert.equal(saleAllocated("2026-09-30", 2), 300_000);
  assert.equal(sep.closingAr, sep.closingBilled - 400_000);
  assert.equal(sep.closingBilled, 1_900_000);
  results.partialReallocationBalanceTest = "PASS";
}

// 5) Reverse before receipt date rejected, zero mutation
{
  seedBase();
  const created = createAndPostReceipt(
    {
      operationId: "asof-early-rev-base",
      clientId: 101,
      receiptDate: "2026-08-31",
      grossAmount: 100_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 1, amount: 100_000 }],
    },
    "tester",
  );
  const before = JSON.stringify(reload().receipts) + JSON.stringify(reload().receiptAllocations);
  assert.throws(
    () =>
      reverseReceipt(
        created.receipt.id,
        { operationId: "asof-early-rev", receiptDate: "2026-08-01" },
        "tester",
      ),
    (err) => err.code === "EVENT_BEFORE_RECEIPT_DATE" && err.status === 400,
  );
  const after = JSON.stringify(reload().receipts) + JSON.stringify(reload().receiptAllocations);
  assert.equal(after, before);
  results.reverseBeforeReceiptDateTest = "PASS";
}

// 6) Out-of-order reallocation after later event
{
  seedBase();
  const created = createAndPostReceipt(
    {
      operationId: "asof-ooo-base",
      clientId: 101,
      receiptDate: "2026-08-31",
      grossAmount: 200_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 1, amount: 200_000 }],
    },
    "tester",
  );
  replaceReceiptAllocations(
    created.receipt.id,
    {
      operationId: "asof-ooo-late",
      effectiveDate: "2026-09-20",
      allocations: [{ saleId: 2, amount: 200_000 }],
    },
    "tester",
  );
  const before = JSON.stringify(reload().receipts) + JSON.stringify(reload().receiptAllocations);
  assert.throws(
    () =>
      replaceReceiptAllocations(
        created.receipt.id,
        {
          operationId: "asof-ooo-early",
          effectiveDate: "2026-09-10",
          allocations: [{ saleId: 1, amount: 200_000 }],
        },
        "tester",
      ),
    (err) => err.code === "OUT_OF_ORDER_ACCOUNTING_EVENT" && err.status === 409,
  );
  const after = JSON.stringify(reload().receipts) + JSON.stringify(reload().receiptAllocations);
  assert.equal(after, before);
  results.outOfOrderEventTest = "PASS";
}

// 7+8) Idempotency conflicts on reverse/reallocate dates
{
  seedBase();
  const created = createAndPostReceipt(
    {
      operationId: "asof-idem-base",
      clientId: 101,
      receiptDate: "2026-08-31",
      grossAmount: 150_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 1, amount: 150_000 }],
    },
    "tester",
  );
  reverseReceipt(
    created.receipt.id,
    { operationId: "asof-idem-rev", receiptDate: "2026-09-10" },
    "tester",
  );
  assert.throws(
    () =>
      reverseReceipt(
        created.receipt.id,
        { operationId: "asof-idem-rev", receiptDate: "2026-09-11" },
        "tester",
      ),
    (err) => err.code === "IDEMPOTENCY_CONFLICT" && err.status === 409,
  );

  seedBase();
  const created2 = createAndPostReceipt(
    {
      operationId: "asof-idem-realloc-base",
      clientId: 101,
      receiptDate: "2026-08-31",
      grossAmount: 150_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 1, amount: 150_000 }],
    },
    "tester",
  );
  replaceReceiptAllocations(
    created2.receipt.id,
    {
      operationId: "asof-idem-realloc",
      effectiveDate: "2026-09-10",
      allocations: [{ saleId: 2, amount: 150_000 }],
    },
    "tester",
  );
  assert.throws(
    () =>
      replaceReceiptAllocations(
        created2.receipt.id,
        {
          operationId: "asof-idem-realloc",
          effectiveDate: "2026-09-11",
          allocations: [{ saleId: 2, amount: 150_000 }],
        },
        "tester",
      ),
    (err) => err.code === "IDEMPOTENCY_CONFLICT" && err.status === 409,
  );
  results.idempotencyDateConflictTest = "PASS";
}

// 9) Generic ERP save concurrent with receipt domain — no loss, as-of unchanged
{
  seedBase();
  const created = createAndPostReceipt(
    {
      operationId: "asof-conc-1",
      clientId: 101,
      receiptDate: "2026-08-31",
      grossAmount: 400_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 1, amount: 400_000 }],
    },
    "tester",
  );
  const snap = ledger(101, "2026-08-01", "2026-08-31");
  const state = getErpState();
  saveErpState(
    {
      ...reload(),
      clients: [...reload().clients, { id: 999, name: "Noise" }],
      receipts: [],
      receiptAllocations: [],
    },
    state.version,
    "generic-save",
  );
  assert.ok(reload().receipts.some((r) => r.id === created.receipt.id));
  assert.ok(reload().receiptAllocations.some((a) => String(a.receiptId) === String(created.receipt.id)));
  const after = ledger(101, "2026-08-01", "2026-08-31");
  assert.equal(after.closingAr, snap.closingAr);
  assert.equal(after.periodAppliedAllocations, snap.periodAppliedAllocations);
  assert.ok(buildEffectivePaymentVouchers(reload()).some((v) => String(v.receiptId) === String(created.receipt.id)));
  results.concurrencyTest = "PASS";
}

console.log("receipt ledger as-of integrity tests passed");
console.log(JSON.stringify(results, null, 2));
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {}
