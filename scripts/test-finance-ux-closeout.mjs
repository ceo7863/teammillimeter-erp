/**
 * Finance UX closeout gates (drawer identity, exception inbox, identity metrics, API helpers).
 * Run: node --import tsx scripts/test-finance-ux-closeout.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const {
  SALE_DETAIL_DRAWER_IDENTITY,
  SaleDetailDrawer,
  SaleVoucherEditModal,
} = await import("../src/components/SaleDetailDrawer.tsx");

const modalExports = await import("../src/components/SaleVoucherEditModal.tsx");

const {
  HISTORICAL_EXCEPTION_EXCLUDED,
  countActionableExceptionBadge,
  dedupeFinanceExceptions,
  filterActionableFinanceExceptions,
  isActionableFinanceException,
  mapUnresolvedQueueToExceptionItems,
} = await import("../src/utils/financeExceptionInbox.ts");

const {
  countActionableExceptionBadge: countActionableExceptionBadgeServer,
  filterActionableFinanceExceptions: filterActionableServer,
} = await import("../server/financeExceptionInbox.mjs");

const {
  measureBankWorkerLinkMetrics,
  measureFinanceIdentityMetrics,
} = await import("../server/financeIdentityMetrics.mjs");

let failed = 0;
const results = {};

function check(name, fn) {
  try {
    fn();
    results[name] = "PASS";
    console.log("PASS:", name);
  } catch (error) {
    failed += 1;
    results[name] = "FAIL";
    console.error("FAIL:", name);
    console.error(error?.message || error);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

check("SALE_DETAIL_DRAWER_IDENTITY is unique canonical string", () => {
  assert.equal(SALE_DETAIL_DRAWER_IDENTITY, "canonical-sale-detail-drawer");
  const drawerSrc = read("src/components/SaleDetailDrawer.tsx");
  const matches = drawerSrc.match(/export const SALE_DETAIL_DRAWER_IDENTITY/g) || [];
  assert.equal(matches.length, 1, "identity should be declared once in SaleDetailDrawer");
  for (const rel of [
    "src/components/SaleVoucherEditModal.tsx",
    "src/App.tsx",
    "src/components/SalesManagementPage.tsx",
  ]) {
    assert.ok(
      !/export const SALE_DETAIL_DRAWER_IDENTITY\s*=/.test(read(rel)),
      rel + " must not redefine SALE_DETAIL_DRAWER_IDENTITY",
    );
  }
});

check("SaleVoucherEditModal re-exports SaleDetailDrawer", () => {
  const adapterSrc = read("src/components/SaleVoucherEditModal.tsx");
  assert.ok(adapterSrc.includes('from "@/components/SaleDetailDrawer"'));
  assert.ok(/SaleDetailDrawer as SaleVoucherEditModal/.test(adapterSrc));
  assert.equal(modalExports.SALE_DETAIL_DRAWER_IDENTITY, SALE_DETAIL_DRAWER_IDENTITY);
  assert.equal(modalExports.SaleDetailDrawer, SaleDetailDrawer);
  assert.equal(modalExports.SaleVoucherEditModal, SaleDetailDrawer);
  assert.equal(SaleVoucherEditModal, SaleDetailDrawer);
});

check("App/Calendar/Search/SalesManagement only use SaleVoucherEditModal or SaleDetailDrawer", () => {
  const appSrc = read("src/App.tsx");
  const salesMgmtSrc = read("src/components/SalesManagementPage.tsx");
  const searchEditorSrc = read("src/components/SalesVoucherSearchEditor.tsx");
  const drawerSrc = read("src/components/SaleDetailDrawer.tsx");

  assert.ok(appSrc.includes('from "@/components/SaleVoucherEditModal"'));
  assert.ok(!appSrc.includes('from "@/components/SaleDetailDrawer"'));

  const mountMatches = appSrc.match(/<SaleVoucherEditModal[\s>]/g) || [];
  assert.ok(mountMatches.length >= 1);
  assert.ok(mountMatches.length <= 3, "SaleVoucherEditModal mounts must be <= 3, got " + mountMatches.length);

  assert.ok(!salesMgmtSrc.includes("<SaleVoucherEditModal"));
  assert.ok(!salesMgmtSrc.includes("<SaleDetailDrawer"));
  assert.ok(!/from ["']@\/components\/SaleDetailDrawer["']/.test(salesMgmtSrc));
  assert.ok(!searchEditorSrc.includes("<SaleVoucherEditModal") && !searchEditorSrc.includes("<SaleDetailDrawer"));

  assert.ok(drawerSrc.includes("data-sale-detail-identity={SALE_DETAIL_DRAWER_IDENTITY}"));
  assert.equal((drawerSrc.match(/canonical-sale-detail-drawer/g) || []).length, 1);
});

check("financeExceptionInbox excludes PRE_CUTOVER, historical 492/156, resolved/ignored; dedupes bankTransactionId", () => {
  assert.equal(HISTORICAL_EXCEPTION_EXCLUDED.expenseMismatch, 492);
  assert.equal(HISTORICAL_EXCEPTION_EXCLUDED.unattributedPayment, 156);

  const sample = [
    { exceptionId: "a", bankTransactionId: "btx-1", kind: "CLIENT_NOT_FOUND", status: "needs_review" },
    { exceptionId: "a-dup", bankTransactionId: "btx-1", kind: "CLIENT_NOT_FOUND", status: "needs_review" },
    { exceptionId: "b", bankTransactionId: "btx-2", kind: "PRE_CUTOVER", status: "needs_review", reasonCode: "PRE_CUTOVER" },
    { exceptionId: "c", bankTransactionId: "btx-3", kind: "historical_expense_mismatch_492", status: "needs_review" },
    { exceptionId: "d", bankTransactionId: "btx-4", kind: "historical_unattributed_payout_156", status: "needs_review" },
    { exceptionId: "e", bankTransactionId: "btx-5", kind: "legacy_expense_mismatch", status: "needs_review" },
    { exceptionId: "f", bankTransactionId: "btx-6", kind: "legacy_unattributed_payment", status: "needs_review" },
    { exceptionId: "g", bankTransactionId: "btx-7", kind: "CLIENT_AMBIGUOUS", status: "resolved" },
    { exceptionId: "h", bankTransactionId: "btx-8", kind: "MANUAL_OVERRIDE_REQUIRED", status: "ignored", ignored: true },
    { exceptionId: "i", bankTransactionId: "btx-9", kind: "NO_SENT_SALES", status: "needs_review" },
  ];

  assert.equal(isActionableFinanceException(sample[0]), true);
  assert.equal(isActionableFinanceException(sample[2]), false);
  assert.equal(isActionableFinanceException(sample[3]), false);
  assert.equal(isActionableFinanceException(sample[4]), false);
  assert.equal(isActionableFinanceException(sample[7]), false);
  assert.equal(isActionableFinanceException(sample[8]), false);

  const deduped = dedupeFinanceExceptions(sample);
  assert.equal(deduped.filter((row) => row.bankTransactionId === "btx-1").length, 1);

  const actionable = filterActionableFinanceExceptions(sample);
  assert.equal(actionable.length, 2);
  assert.deepEqual(
    actionable.map((row) => row.bankTransactionId).sort(),
    ["btx-1", "btx-9"],
  );

  // Client badge helper filters only; server/filterActionable path dedupes.
  assert.equal(countActionableExceptionBadge(sample), 3, "client badge counts actionable rows before dedupe");
  assert.equal(countActionableExceptionBadge(actionable), 2);
  assert.equal(countActionableExceptionBadgeServer(sample), 2);
  assert.equal(filterActionableServer(sample).length, 2);

  const mapped = mapUnresolvedQueueToExceptionItems([
    { bankTransactionId: "z1", reasonCode: "PRE_CUTOVER", status: "needs_review" },
    { bankTransactionId: "z2", reasonCode: "CLIENT_NOT_FOUND", status: "needs_review" },
  ]);
  assert.equal(countActionableExceptionBadge(mapped), 1);
});

check("measureBankWorkerLinkMetrics uses linkedWorkerMonthlyPaymentVoucherId", () => {
  const metricsSrc = read("server/financeIdentityMetrics.mjs");
  assert.ok(metricsSrc.includes("linkedWorkerMonthlyPaymentVoucherId"));

  const sample = measureBankWorkerLinkMetrics({
    bankTransactions: [
      { id: "t1", linkedWorkerMonthlyPaymentVoucherId: "m1", deposit: 0, withdrawal: 1000 },
      { id: "t2", linkedWorkerMonthlyPaymentVoucherId: "missing", deposit: 0, withdrawal: 500 },
      { id: "t3", deposit: 100, withdrawal: 0 },
      { id: "t4", linkedWorkerMonthlyPaymentVoucherId: "m1", deposit: 200, withdrawal: 0 },
    ],
    workerMonthlyActualVouchers: [
      { id: "m1", entries: [{ kind: "bank", bankTransactionId: "t1" }] },
    ],
    disbursements: [{ id: "d1", bankTransactionId: "t1", status: "posted" }],
  });

  assert.equal(sample.legacyBankWorkerLinkRowCount, 3);
  assert.equal(sample.bankWorkerLinkCount, 3);
  assert.equal(sample.orphanLegacyBankWorkerLinkCount, 1);
  assert.equal(sample.invalidDirectionWorkerLinkCount, 1);
  assert.equal(sample.duplicateLegacyBankWorkerLinkCount, 1);

  const full = measureFinanceIdentityMetrics({
    workerMonthlyActualVouchers: [{ id: "m1", entries: [] }],
    sales: [{ id: "s1" }],
    clients: [{ id: "c1" }],
  });
  assert.equal(full.saleCount, 1);
  assert.equal(full.clientCount, 1);
  assert.ok("legacyBankWorkerLinkRowCount" in full);
});

check("probe-finance-identity imports measureFinanceIdentityMetrics", () => {
  const probeSrc = read("scripts/probe-finance-identity.mjs");
  assert.ok(probeSrc.includes("measureFinanceIdentityMetrics"));
  assert.ok(probeSrc.includes("../server/financeIdentityMetrics.mjs"));
});

check("GET unresolved deposit API helpers exist in erpApi", () => {
  const apiSrc = read("src/utils/erpApi.ts");
  assert.ok(apiSrc.includes("export async function fetchUnresolvedDepositsApi"));
  assert.ok(apiSrc.includes('"/bank-deposits/unresolved"'));
  assert.ok(apiSrc.includes("export async function ignoreUnresolvedDepositApi"));
  assert.ok(apiSrc.includes("export async function retryUnresolvedDepositApi"));
  assert.ok(/\/bank-deposits\/unresolved\/\$\{encodeURIComponent\(bankTransactionId\)\}\/ignore/.test(apiSrc));
  assert.ok(/\/bank-deposits\/unresolved\/\$\{encodeURIComponent\(bankTransactionId\)\}\/retry/.test(apiSrc));
});

const summary = {
  ok: failed === 0,
  failed,
  passed: Object.values(results).filter((v) => v === "PASS").length,
  results,
  saleDetailIdentity: SALE_DETAIL_DRAWER_IDENTITY,
  historicalExcluded: HISTORICAL_EXCEPTION_EXCLUDED,
};

console.log(JSON.stringify({ PASS: summary }, null, 2));
if (failed) {
  console.error("finance UX closeout gates failed: " + failed);
  process.exit(1);
}
console.log("finance UX closeout: ALL PASS");
