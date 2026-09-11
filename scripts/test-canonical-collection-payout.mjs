/**
 * Canonical collection + payout foundation tests (throwaway DB only).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "erp-canonical-cp-"));
process.env.DATABASE_PATH = path.join(tmp, "erp.sqlite");
process.env.PDF_ARCHIVE_DIR = path.join(tmp, "pdf");
process.env.JWT_SECRET = "canonical-collection-payout-test";

const { initDb, saveErpState, getErpState } = await import("../server/db.mjs");
const {
  registerCanonicalReceipt,
  applyPrepaidForStatementSales,
  listReceipts,
  listReceiptAllocations,
  saleAllocatedAsOf,
  todaySeoul,
} = await import("../server/receipts.mjs");
const { collectSentStatementSaleIds, classifyCashBankTransfer } = await import("../server/canonicalCollection.mjs");
const {
  registerDisbursement,
  reverseDisbursement,
  listContractorPayablesFromSales,
  getWorkerApBalance,
  listDisbursements,
} = await import("../server/disbursements.mjs");

initDb();

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(e);
  }
}

function seedSales() {
  const state = getErpState();
  saveErpState(
    {
      ...(state.data || {}),
      clients: [{ id: "c1", name: "테스트업체" }],
      sales: [
        { id: "s1", date: "2026-09-01", client: "테스트업체", amount: 5_000_000, workers: [{ name: "김시공", lineSpend: 4_000_000 }] },
        { id: "s2", date: "2026-09-05", client: "테스트업체", amount: 5_000_000, workers: [{ name: "김시공", lineSpend: 3_000_000 }] },
        { id: "s3", date: "2026-09-12", client: "테스트업체", amount: 4_400_000, workers: [{ name: "김시공", lineSpend: 3_000_000 }] },
      ],
      workers: [{ id: "w1", name: "김시공" }],
      receipts: [],
      receiptAllocations: [],
    },
    state.version,
    "test",
    { allowReceiptMutation: true },
  );
}

seedSales();

check("overlapping statements: unique saleId union", () => {
  const archives = [
    { id: "a1", category: "client", subjectName: "테스트업체", sentViaLink: true, statementSalesIds: ["s1", "s2"] },
    { id: "a2", category: "client", subjectName: "테스트업체", sentViaLink: true, statementSalesIds: ["s1", "s2", "s3"] },
  ];
  const scope = collectSentStatementSaleIds(archives, { clientName: "테스트업체", requireSent: true });
  assert.deepEqual(scope.saleIds.sort(), ["s1", "s2", "s3"]);
});

check("partial receipt then new sale outstanding", () => {
  seedSales();
  const r1 = registerCanonicalReceipt(
    {
      operationId: "rcpt-partial-1",
      clientName: "테스트업체",
      receiptDate: "2026-09-10",
      grossAmount: 10_000_000,
      channel: "cash",
      source: "receivables",
      requireSentStatements: false,
      autoAllocate: true,
    },
    "test",
  );
  assert.equal(r1.summary.allocatedAmount + r1.summary.unallocatedAmount, 10_000_000);
  const st = getErpState();
  const applied = ["s1", "s2", "s3"].reduce(
    (sum, id) => sum + saleAllocatedAsOf(listReceiptAllocations(st.data), listReceipts(st.data), id, todaySeoul()),
    0,
  );
  assert.equal(applied, 10_000_000);
  assert.equal(14_400_000 - applied, 4_400_000);
  const st2 = getErpState();
  saveErpState(
    {
      ...st2.data,
      sales: [...st2.data.sales, { id: "s4", date: "2026-09-11", client: "테스트업체", amount: 5_000_000, workers: [] }],
    },
    st2.version,
    "test",
  );
  assert.equal(19_400_000 - applied, 9_400_000);
});

check("prepayment then statement auto-apply", () => {
  seedSales();
  const prepaid = registerCanonicalReceipt(
    {
      operationId: "rcpt-prepaid-1",
      clientName: "테스트업체",
      receiptDate: "2026-09-01",
      grossAmount: 3_000_000,
      channel: "cash",
      source: "receivables",
      requireSentStatements: true,
      autoAllocate: true,
    },
    "test",
  );
  assert.equal(prepaid.summary.unallocatedAmount, 3_000_000);
  const applied = applyPrepaidForStatementSales({
    statementSalesIds: ["s1", "s2"],
    actor: "test",
    effectiveDate: "2026-09-10",
  });
  assert.ok(applied.appliedTotal > 0);
  const st = getErpState();
  assert.ok(saleAllocatedAsOf(listReceiptAllocations(st.data), listReceipts(st.data), "s1", "2026-09-10") > 0);
});

check("cash transfer classification blocks second customer receipt", () => {
  const decision = classifyCashBankTransfer({
    bankTx: { deposit: 1_000_000, memo: "현금 입금" },
    receipts: [{ id: "r-cash", channel: "cash", grossAmount: 1_000_000 }],
    linkedCashReceiptId: "r-cash",
  });
  assert.equal(decision.allowCustomerReceipt, false);
  assert.equal(decision.code, "CASH_TRANSFER_NOT_CUSTOMER_RECEIPT");
});

check("partial disbursement ladder + reverse", () => {
  const st0 = getErpState();
  saveErpState(
    {
      ...st0.data,
      sales: [
        {
          id: "ws1",
          date: "2026-09-01",
          client: "테스트업체",
          amount: 1,
          workers: [{ name: "김시공", lineSpend: 10_000_000 }],
        },
      ],
      disbursements: [],
      disbursementAllocations: [],
    },
    st0.version,
    "test",
    { allowDisbursementMutation: true },
  );
  registerDisbursement(
    { operationId: "disb-1", workerName: "김시공", disbursementDate: "2026-09-08", grossAmount: 5_000_000, channel: "cash", source: "manual" },
    "test",
  );
  assert.equal(getWorkerApBalance("김시공", getErpState().data).outstanding, 5_000_000);
  registerDisbursement(
    { operationId: "disb-2", workerName: "김시공", disbursementDate: "2026-09-09", grossAmount: 3_000_000, channel: "cash", source: "manual" },
    "test",
  );
  assert.equal(getWorkerApBalance("김시공", getErpState().data).outstanding, 2_000_000);
  registerDisbursement(
    { operationId: "disb-3", workerName: "김시공", disbursementDate: "2026-09-10", grossAmount: 2_000_000, channel: "cash", source: "manual" },
    "test",
  );
  assert.equal(getWorkerApBalance("김시공", getErpState().data).outstanding, 0);
  const last = listDisbursements(getErpState().data)
    .filter((r) => !r.reversalOfDisbursementId && r.status !== "reversed")
    .at(-1);
  reverseDisbursement(last.id, { operationId: "disb-rev-1", reversalEffectiveDate: "2026-09-11" }, "test");
  assert.equal(getWorkerApBalance("김시공", getErpState().data).outstanding, 2_000_000);
});

check("idempotency replay", () => {
  const a = registerDisbursement(
    { operationId: "disb-idem-1", workerName: "김시공", disbursementDate: "2026-09-11", grossAmount: 100_000, channel: "cash", source: "manual" },
    "test",
  );
  const b = registerDisbursement(
    { operationId: "disb-idem-1", workerName: "김시공", disbursementDate: "2026-09-11", grossAmount: 100_000, channel: "cash", source: "manual" },
    "test",
  );
  assert.equal(b.idempotent, true);
  assert.equal(a.disbursement.id, b.disbursement.id);
});

check("generic save cannot clear disbursements", () => {
  const st = getErpState();
  const before = (st.data.disbursements || []).length;
  saveErpState({ ...st.data, disbursements: [] }, st.version, "attacker");
  assert.equal((getErpState().data.disbursements || []).length, before);
});

check("workItemIds unique", () => {
  const ids = listContractorPayablesFromSales(getErpState().data.sales || []).map((r) => r.workItemId);
  assert.equal(new Set(ids).size, ids.length);
});

console.log(`\ncanonical collection/payout: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
