/**
 * Phase 1 accounting hardening regression tests (temp SQLite).
 * Run: npx tsx scripts/test-receipt-ledger-hardening.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-receipt-hardening-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = "test-receipt-hardening";

const { initDb, getErpState, saveErpState } = await import("../server/db.mjs");
const {
  createAndPostReceipt,
  reverseReceipt,
  replaceReceiptAllocations,
  deleteReceiptForbidden,
} = await import("../server/receipts.mjs");
const { buildClientArSubledger } = await import("../server/receiptArSubledger.mjs");
const { buildEffectivePaymentVouchers } = await import("../server/receiptProjection.mjs");
const { mergeErpPaymentLinkState, mergeReceiptsForSave } = await import("../server/erpSaveMerge.mjs");
const { applyPaymentVouchers } = await import("../src/utils/applyPaymentVouchers.ts");

initDb();

function seedBase() {
  const state = getErpState();
  saveErpState(
    {
      ...state.data,
      clients: [
        { id: 101, name: "알파건설" },
        { id: 102, name: "베타인테리어" },
        { id: 103, name: "알파건설" },
      ],
      sales: [
        { id: 1, date: "2026-08-01", client: "알파건설", clientId: 101, amount: 1_000_000, paid: 0, basePaid: 0 },
        { id: 2, date: "2026-08-15", client: "알파건설", clientId: 101, amount: 500_000, paid: 0, basePaid: 0 },
        { id: 3, date: "2026-08-20", client: "베타인테리어", clientId: 102, amount: 800_000, paid: 0, basePaid: 0 },
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

seedBase();

// 1) partial allocation: closingAr drops only allocated; prepaid separate
{
  const created = createAndPostReceipt(
    {
      operationId: "partial-1",
      clientId: 101,
      receiptDate: "2026-09-01",
      grossAmount: 1_000_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 1, amount: 600_000 }],
    },
    "tester",
  );
  assert.equal(created.summary.unallocatedAmount, 400_000);
  const ledger = buildClientArSubledger(reload(), {
    clientId: 101,
    startDate: "2026-08-01",
    endDate: "2026-09-30",
  });
  // opening 0 + billed 1.5M - applied 600k = 900k
  assert.equal(ledger.periodAppliedAllocations, 600_000);
  assert.equal(ledger.periodReceiptsGross, 1_000_000);
  assert.equal(ledger.unallocatedPrepaid, 400_000);
  assert.equal(ledger.closingAr, 1_500_000 - 600_000);
  assert.equal(ledger.cashIdentity.ok, true);
}

// 2) fully unallocated receipt does not reduce AR
{
  seedBase();
  createAndPostReceipt(
    {
      operationId: "unalloc-1",
      clientId: 101,
      receiptDate: "2026-09-01",
      grossAmount: 1_000_000,
      channel: "cash",
      source: "receivables",
      allocations: [],
    },
    "tester",
  );
  const ledger = buildClientArSubledger(reload(), {
    clientId: 101,
    startDate: "2026-08-01",
    endDate: "2026-09-30",
  });
  assert.equal(ledger.periodAppliedAllocations, 0);
  assert.equal(ledger.closingAr, 1_500_000);
  assert.equal(ledger.unallocatedPrepaid, 1_000_000);
  assert.equal(ledger.periodReceiptsGross, 1_000_000);
}

// 3) reverse restores AR exactly once
{
  seedBase();
  const created = createAndPostReceipt(
    {
      operationId: "rev-base",
      clientId: 101,
      receiptDate: "2026-09-01",
      grossAmount: 600_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 1, amount: 600_000 }],
    },
    "tester",
  );
  const before = buildClientArSubledger(reload(), { clientId: 101, startDate: "2026-08-01", endDate: "2026-09-30" });
  assert.equal(before.closingAr, 900_000);
  reverseReceipt(created.receipt.id, { operationId: "rev-1" }, "tester");
  const after = buildClientArSubledger(reload(), { clientId: 101, startDate: "2026-08-01", endDate: "2026-09-30" });
  assert.equal(after.periodAppliedAllocations, 0);
  assert.equal(after.closingAr, 1_500_000);
  assert.notEqual(after.closingAr, 1_600_000);
  const data = reload();
  const postedAllocs = data.receiptAllocations.filter((row) => row.status === "posted" && Number(row.amount) > 0);
  assert.equal(postedAllocs.filter((row) => String(row.saleId) === "1").length, 0);
}

// 4) cross-period cash vs allocation
{
  seedBase();
  createAndPostReceipt(
    {
      operationId: "cross-1",
      clientId: 101,
      receiptDate: "2026-08-31",
      grossAmount: 400_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 1, amount: 400_000 }],
    },
    "tester",
  );
  const aug = buildClientArSubledger(reload(), { clientId: 101, startDate: "2026-08-01", endDate: "2026-08-31" });
  const sep = buildClientArSubledger(reload(), { clientId: 101, startDate: "2026-09-01", endDate: "2026-09-30" });
  assert.equal(aug.periodReceiptsGross, 400_000);
  assert.equal(aug.periodAppliedAllocations, 400_000);
  assert.equal(sep.periodReceiptsGross, 0);
  assert.equal(sep.periodAppliedAllocations, 0);
  assert.ok(sep.openingAr < 1_500_000);
}

// 5/6 idempotency same/conflict
{
  seedBase();
  const payload = {
    operationId: "idem-1",
    clientId: 101,
    receiptDate: "2026-09-02",
    grossAmount: 100_000,
    channel: "cash",
    source: "receivables",
    allocations: [{ saleId: 2, amount: 100_000 }],
  };
  const first = createAndPostReceipt(payload, "tester");
  const second = createAndPostReceipt(payload, "tester");
  assert.equal(second.idempotent, true);
  assert.equal(second.receipt.id, first.receipt.id);
  assert.equal(reload().receipts.filter((r) => r.operationId === "idem-1").length, 1);

  assert.throws(
    () =>
      createAndPostReceipt(
        { ...payload, grossAmount: 200_000, allocations: [{ saleId: 2, amount: 200_000 }] },
        "tester",
      ),
    (err) => err.code === "IDEMPOTENCY_CONFLICT" && err.status === 409,
  );
  assert.equal(reload().receipts.filter((r) => r.operationId === "idem-1").length, 1);
  assert.equal(reload().receipts.find((r) => r.operationId === "idem-1").grossAmount, 100_000);
}

// allocation order independence
{
  seedBase();
  const a = createAndPostReceipt(
    {
      operationId: "order-1",
      clientId: 101,
      receiptDate: "2026-09-03",
      grossAmount: 300_000,
      channel: "cash",
      source: "receivables",
      allocations: [
        { saleId: 1, amount: 200_000 },
        { saleId: 2, amount: 100_000 },
      ],
    },
    "tester",
  );
  const b = createAndPostReceipt(
    {
      operationId: "order-1",
      clientId: 101,
      receiptDate: "2026-09-03",
      grossAmount: 300_000,
      channel: "cash",
      source: "receivables",
      allocations: [
        { saleId: 2, amount: 100_000 },
        { saleId: 1, amount: 200_000 },
      ],
    },
    "tester",
  );
  assert.equal(b.idempotent, true);
  assert.equal(b.receipt.id, a.receipt.id);
}

// 7) generic ERP save cannot mutate receipts
{
  seedBase();
  const created = createAndPostReceipt(
    {
      operationId: "immut-1",
      clientId: 101,
      receiptDate: "2026-09-04",
      grossAmount: 50_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 2, amount: 50_000 }],
    },
    "tester",
  );
  const before = reload();
  const state = getErpState();
  saveErpState(
    {
      ...before,
      receipts: [{ ...created.receipt, grossAmount: 1, clientId: "hacked", receiptDate: "1999-01-01" }],
      receiptAllocations: [],
    },
    state.version,
    "attacker",
  );
  const after = reload();
  const kept = after.receipts.find((r) => r.id === created.receipt.id);
  assert.equal(kept.grossAmount, 50_000);
  assert.equal(String(kept.clientId), "101");
  assert.equal(kept.receiptDate, "2026-09-04");
  assert.ok(after.receiptAllocations.some((a) => String(a.receiptId) === String(created.receipt.id)));
  assert.deepEqual(
    mergeReceiptsForSave(after.receipts, [{ id: created.receipt.id, grossAmount: 9 }]).find((r) => r.id === created.receipt.id)
      .grossAmount,
    50_000,
  );
  const merged = mergeErpPaymentLinkState(after, { ...after, receipts: [], receiptAllocations: [] });
  assert.ok(merged.receipts.length >= 1);
}

// 8) reallocation audit + idempotent retry
{
  seedBase();
  const created = createAndPostReceipt(
    {
      operationId: "realloc-base",
      clientId: 101,
      receiptDate: "2026-09-05",
      grossAmount: 300_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 1, amount: 300_000 }],
    },
    "tester",
  );
  const first = replaceReceiptAllocations(
    created.receipt.id,
    {
      operationId: "realloc-1",
      allocations: [
        { saleId: 1, amount: 100_000 },
        { saleId: 2, amount: 200_000 },
      ],
    },
    "tester",
  );
  assert.equal(first.idempotent, false);
  assert.equal(first.summary.allocatedAmount, 300_000);
  const data1 = reload();
  const history = data1.receiptAllocations.filter((row) => String(row.receiptId) === String(created.receipt.id));
  assert.ok(history.some((row) => row.status === "reversed"));
  assert.equal(history.filter((row) => row.status === "posted").length, 2);
  assert.equal(data1.receipts.find((r) => r.id === created.receipt.id).reallocationEvents.length, 1);

  const retry = replaceReceiptAllocations(
    created.receipt.id,
    {
      operationId: "realloc-1",
      allocations: [
        { saleId: 2, amount: 200_000 },
        { saleId: 1, amount: 100_000 },
      ],
    },
    "tester",
  );
  assert.equal(retry.idempotent, true);
  assert.equal(reload().receipts.find((r) => r.id === created.receipt.id).reallocationEvents.length, 1);

  assert.throws(
    () =>
      replaceReceiptAllocations(
        created.receipt.id,
        { operationId: "realloc-1", allocations: [{ saleId: 1, amount: 300_000 }] },
        "tester",
      ),
    (err) => err.code === "IDEMPOTENCY_CONFLICT",
  );
}

// 9) client rename keeps clientId ledger
{
  seedBase();
  createAndPostReceipt(
    {
      operationId: "rename-1",
      clientId: 101,
      receiptDate: "2026-09-06",
      grossAmount: 100_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 1, amount: 100_000 }],
    },
    "tester",
  );
  const state = getErpState();
  const data = state.data;
  saveErpState(
    {
      ...data,
      clients: data.clients.map((c) => (String(c.id) === "101" ? { ...c, name: "알파건설(변경)" } : c)),
      sales: data.sales.map((s) => (String(s.clientId) === "101" ? { ...s, client: "알파건설(변경)" } : s)),
    },
    state.version,
    "rename",
  );
  const ledger = buildClientArSubledger(reload(), { clientId: 101, startDate: "2026-08-01", endDate: "2026-09-30" });
  assert.equal(ledger.periodAppliedAllocations, 100_000);
  assert.equal(ledger.clientName, "알파건설(변경)");
}

// 10) duplicate client name cannot create by name alone
{
  seedBase();
  assert.throws(
    () =>
      createAndPostReceipt(
        {
          operationId: "ambig-1",
          clientName: "알파건설",
          grossAmount: 10_000,
          channel: "cash",
          source: "receivables",
          allocations: [],
        },
        "tester",
      ),
    (err) => err.code === "CLIENT_AMBIGUOUS",
  );
}

// draft rejected
{
  seedBase();
  assert.throws(
    () =>
      createAndPostReceipt(
        {
          operationId: "draft-1",
          clientId: 101,
          status: "draft",
          grossAmount: 10_000,
          channel: "cash",
          source: "receivables",
          allocations: [],
        },
        "tester",
      ),
    (err) => err.code === "DRAFT_NOT_ALLOWED",
  );
}

// reverse requires operationId + conflict
{
  seedBase();
  const created = createAndPostReceipt(
    {
      operationId: "revreq-1",
      clientId: 101,
      grossAmount: 10_000,
      channel: "cash",
      source: "receivables",
      allocations: [{ saleId: 2, amount: 10_000 }],
    },
    "tester",
  );
  assert.throws(() => reverseReceipt(created.receipt.id, {}, "tester"), /operationId/);
  const rev = reverseReceipt(created.receipt.id, { operationId: "revreq-op" }, "tester");
  const rev2 = reverseReceipt(created.receipt.id, { operationId: "revreq-op" }, "tester");
  assert.equal(rev2.idempotent, true);
  assert.equal(rev2.receipt.id, rev.receipt.id);
}

// projection + legacy vouchers do not double-count
{
  seedBase();
  createAndPostReceipt(
    {
      operationId: "proj-1",
      clientId: 101,
      grossAmount: 70_000,
      channel: "cash",
      source: "calendar",
      allocations: [{ saleId: 2, amount: 70_000 }],
    },
    "tester",
  );
  const data = reload();
  data.paymentVouchers = [
    { id: 999, salesId: 2, client: "알파건설", amount: 30_000, finalAmount: 30_000 },
  ];
  const effective = buildEffectivePaymentVouchers(data);
  const applied = applyPaymentVouchers(data.sales, effective);
  assert.equal(applied.sales.find((s) => String(s.id) === "2").paid, 100_000);
}

assert.throws(() => deleteReceiptForbidden(), /삭제/);

console.log("receipt ledger hardening tests passed");
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {}
