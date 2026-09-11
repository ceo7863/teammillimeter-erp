/**
 * Read-only production finance identity probe (no mutations).
 * Run from repo root: DATABASE_PATH=./data/erp.sqlite node --import tsx scripts/probe-finance-identity.mjs
 */
import { createHash } from "node:crypto";
import { initDb, getErpState } from "../server/db.mjs";

initDb();
const data = getErpState().data || {};

const monthly = Array.isArray(data.workerMonthlyActualVouchers) ? data.workerMonthlyActualVouchers : [];
const entries = monthly.flatMap((v) => (Array.isArray(v?.entries) ? v.entries : []));
const payouts = Array.isArray(data.workerPayoutVouchers) ? data.workerPayoutVouchers : [];
const bankLinks = Array.isArray(data.bankTransactions)
  ? data.bankTransactions.filter((tx) => tx?.workerLink || tx?.linkedWorkerId || tx?.workerPaymentLink)
  : [];
const paymentVouchers = Array.isArray(data.paymentVouchers) ? data.paymentVouchers : [];
const receipts = Array.isArray(data.receipts) ? data.receipts : [];
const allocations = Array.isArray(data.receiptAllocations) ? data.receiptAllocations : [];
const disbursements = Array.isArray(data.disbursements) ? data.disbursements : [];
const disbursementAllocations = Array.isArray(data.disbursementAllocations)
  ? data.disbursementAllocations
  : [];
const openings = Array.isArray(data.apOpeningBalances) ? data.apOpeningBalances : [];
const sales = Array.isArray(data.sales) ? data.sales : [];
const clients = Array.isArray(data.clients) ? data.clients : [];
const statements = Array.isArray(data.statementGenerationLogs) ? data.statementGenerationLogs : [];
const cutover = data.apLedgerCutover || data.bankSyncMeta?.apLedgerCutover || {};
const legacyPayload = JSON.stringify({
  monthlyCount: monthly.length,
  entryCount: entries.length,
  payoutCount: payouts.length,
  bankLinkCount: bankLinks.length,
  paymentVoucherCount: paymentVouchers.length,
});
const legacyHash = createHash("sha256").update(legacyPayload).digest("hex");

const out = {
  ok: true,
  measuredAt: new Date().toISOString(),
  legacyDatasetHash: legacyHash,
  monthlyActualCount: monthly.length,
  monthlyActualEntryCount: entries.length,
  payoutHistoryCount: payouts.length,
  bankWorkerLinkCount: bankLinks.length,
  paymentVoucherCount: paymentVouchers.length,
  receiptCount: receipts.length,
  receiptAllocationCount: allocations.length,
  disbursementCount: disbursements.length,
  disbursementAllocationCount: disbursementAllocations.length,
  openingBalanceCount: openings.length,
  saleCount: sales.length,
  clientCount: clients.length,
  statementLogCount: statements.length,
  cutoverActivated: Boolean(cutover.activated || cutover.cutoverActivated),
  disbursementWriteEnabled: Boolean(
    cutover.disbursementWriteEnabled || process.env.DISBURSEMENT_WRITE_ENABLED === "1",
  ),
};

console.log(JSON.stringify(out, null, 2));
