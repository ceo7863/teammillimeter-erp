/**
 * Targeted repair: Perlabs 2026-08-03 deposit 3,227,400 — complete remaining individual vouchers.
 * Strict preconditions; default dry-run. Use --apply only after product deploy + precondition PASS.
 * Never prints account numbers, raw bank text, or public statement URLs.
 *
 * Usage:
 *   npx tsx scripts/repair-perlabs-20260803-sent-statement-vouchers.mts [sqlite-path]
 *   npx tsx scripts/repair-perlabs-20260803-sent-statement-vouchers.mts [sqlite-path] --apply
 */
import fs from "node:fs";
import path from "node:path";
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { listSentStatementArchiveMetas, updatePdfArchiveMeta } from "../server/pdfArchive.mjs";
import {
  buildSentStatementPaymentApplication,
  type SentStatementMatchCandidate,
} from "../src/utils/bankSentStatementMatch.ts";
import { summarizeBankSentStatementAllocation } from "../src/utils/bankSentStatementAllocation.ts";
import { createPaymentInputLogsFromVouchers } from "../src/utils/paymentInputLogs.ts";

const APPLY = process.argv.includes("--apply");
const EXPECTED_DATE = "2026-08-03";
const EXPECTED_AMOUNT = 3_227_400;
const EXPECTED_CLIENT = "퍼랩스";
const EXPECTED_SUPPLY_SUM = 2_934_000;
const EXPECTED_SALES_COUNT = 5;
const EXPECTED_VOUCHER_COUNT = 1;
const EXPECTED_ALLOCATED = 327_800;
const EXPECTED_UNALLOCATED = 2_899_600;
const EXPECTED_NEW_VOUCHERS = 4;

const sqliteArg = process.argv.find((arg) => arg.endsWith(".sqlite"));
process.env.DATABASE_PATH = sqliteArg || "data/erp.sqlite";
getDb();

function fail(reason: string): never {
  console.error(JSON.stringify({ ok: false, apply: APPLY, reason }, null, 2));
  process.exit(2);
}

const { data: state, version } = getErpState();
const archives = listSentStatementArchiveMetas();

const candidates = (state.bankTransactions || []).filter((tx) => {
  const date = String(tx.transactionAt || "").slice(0, 10);
  const deposit = Math.round(Number(tx.deposit || 0));
  const subject = String(tx.linkedSubject || tx.counterpartyName || "").trim();
  return date === EXPECTED_DATE && deposit === EXPECTED_AMOUNT && subject.includes(EXPECTED_CLIENT);
});

if (candidates.length !== 1) {
  fail(`target bank tx count ${candidates.length} (expected 1)`);
}

const tx = candidates[0];
const archiveId = String(tx.linkedPdfArchiveId || "").trim();
if (!archiveId) fail("missing linkedPdfArchiveId");

const archive = archives.find((row) => String(row.id) === archiveId);
if (!archive) fail("archive meta not found for linked id");

const clientName = String(archive.subjectName || tx.linkedSubject || "").trim();
if (!clientName.includes(EXPECTED_CLIENT)) fail("client name mismatch");

const statementTotal = Math.round(Number(archive.statementTotalAmount || 0));
if (statementTotal !== EXPECTED_AMOUNT) fail(`statement total ${statementTotal}`);

const salesIds = Array.isArray(archive.statementSalesIds)
  ? archive.statementSalesIds.map((id) => String(id))
  : [];
if (salesIds.length !== EXPECTED_SALES_COUNT) fail(`statement sales count ${salesIds.length}`);

const salesById = new Map((state.sales || []).map((sale) => [String(sale.id), sale]));
const statementSales = salesIds.map((id) => salesById.get(id)).filter(Boolean);
if (statementSales.length !== EXPECTED_SALES_COUNT) fail("resolved sales count mismatch");

const supplySum = statementSales.reduce((sum, sale) => sum + Math.round(Number(sale?.amount || 0)), 0);
if (supplySum !== EXPECTED_SUPPLY_SUM) fail(`supply sum ${supplySum}`);

const vouchersForTx = (state.paymentVouchers || []).filter(
  (voucher) => String(voucher.bankTransactionId || "") === String(tx.id),
);
if (vouchersForTx.length !== EXPECTED_VOUCHER_COUNT) {
  fail(`current voucher count ${vouchersForTx.length}`);
}

const allocated = vouchersForTx.reduce(
  (sum, voucher) => sum + Math.round(Number(voucher.finalAmount ?? voucher.amount ?? 0)),
  0,
);
if (allocated !== EXPECTED_ALLOCATED) fail(`current allocated ${allocated}`);

const distinctSales = new Set(
  vouchersForTx.map((voucher) => String(voucher.salesId ?? "").trim()).filter(Boolean),
);
if (distinctSales.size !== 1) fail(`current distinct sales ${distinctSales.size}`);

const summary = summarizeBankSentStatementAllocation({
  tx,
  paymentVouchers: state.paymentVouchers || [],
  archive,
});
if (!summary || summary.unallocatedAmount !== EXPECTED_UNALLOCATED) {
  fail(`unallocated ${summary?.unallocatedAmount}`);
}

const candidate: SentStatementMatchCandidate = {
  pdfArchiveId: archive.id,
  client: clientName,
  statementTotalAmount: statementTotal,
  sentAt: archive.createdAt,
  periodStart: archive.periodStart,
  periodEnd: archive.periodEnd,
  score: 100,
  reasons: ["repair-perlabs-complete-remaining"],
  paymentAmount: statementTotal,
  paymentStatus: "confirmed",
  statementRemainingAmount: EXPECTED_UNALLOCATED,
  statementSalesIds: salesIds,
};

const application = buildSentStatementPaymentApplication(tx, candidate, {
  sales: state.sales || [],
  clients: state.clients || [],
  archive,
  paymentVouchers: state.paymentVouchers || [],
});

const newVouchers = application.vouchers;
const newSum = newVouchers.reduce((sum, voucher) => sum + Math.round(Number(voucher.finalAmount || 0)), 0);
if (newVouchers.length !== EXPECTED_NEW_VOUCHERS) fail(`dry-run new voucher count ${newVouchers.length}`);
if (newSum !== EXPECTED_UNALLOCATED) fail(`dry-run new sum ${newSum}`);
if (application.paymentStatus !== "confirmed") fail(`dry-run final status ${application.paymentStatus}`);

const foreignVoucherReuse = newVouchers.some((voucher) => {
  const bankId = String(voucher.bankTransactionId || "");
  return bankId && bankId !== String(tx.id);
});
if (foreignVoucherReuse) fail("new vouchers reference other bank tx");

const report = {
  ok: true,
  mode: APPLY ? "apply" : "dry-run",
  bankTransactionId: String(tx.id),
  archiveIdPresent: true,
  currentVoucherCount: vouchersForTx.length,
  currentAllocated: allocated,
  currentDistinctSales: distinctSales.size,
  dryRunCreateCount: newVouchers.length,
  dryRunCreateSum: newSum,
  dryRunFinalStatus: application.paymentStatus,
  otherCustomerDataMutation: 0,
};

if (!APPLY) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const snapshotDir = path.join(
  "data",
  "repair-snapshots",
  `perlabs-${EXPECTED_DATE}-${Date.now()}`,
);
fs.mkdirSync(snapshotDir, { recursive: true });
fs.writeFileSync(
  path.join(snapshotDir, "pre.json"),
  JSON.stringify(
    {
      bankTransaction: {
        id: tx.id,
        transactionAt: tx.transactionAt,
        deposit: tx.deposit,
        linkedPdfArchiveId: tx.linkedPdfArchiveId,
        linkedPaymentVoucherId: tx.linkedPaymentVoucherId,
        linkedSubject: tx.linkedSubject,
      },
      archive: {
        id: archive.id,
        subjectName: archive.subjectName,
        statementTotalAmount: archive.statementTotalAmount,
        statementSalesIds: archive.statementSalesIds,
        paymentStatus: archive.paymentStatus,
      },
      vouchers: vouchersForTx.map((voucher) => ({
        id: voucher.id,
        salesId: voucher.salesId,
        finalAmount: voucher.finalAmount,
        bankTransactionId: voucher.bankTransactionId,
      })),
      paymentLogs: (state.paymentInputLogs || []).filter((log) =>
        vouchersForTx.some((voucher) => String(voucher.id) === String(log.paymentVoucherId || "")),
      ),
    },
    null,
    2,
  ),
);

const savedBy = "repair-perlabs-20260803";
const logs = createPaymentInputLogsFromVouchers(newVouchers, savedBy);
const nextVouchers = [...newVouchers, ...(state.paymentVouchers || [])];
const nextLogs = [...logs, ...(state.paymentInputLogs || [])];
const nextBank = (state.bankTransactions || []).map((row) =>
  row.id === tx.id
    ? {
        ...row,
        linkedPaymentVoucherId: row.linkedPaymentVoucherId || newVouchers[0].id,
        linkedPdfArchiveId: archive.id,
        linkedSubject: clientName,
        matchConfirmedAt: new Date().toISOString(),
        matchConfirmedBy: savedBy,
        matchAutoLinked: false,
      }
    : row,
);

saveErpState(
  {
    ...state,
    paymentVouchers: nextVouchers,
    paymentInputLogs: nextLogs,
    bankTransactions: nextBank,
  },
  version,
);

await updatePdfArchiveMeta(archive.id, {
  paymentStatus: "confirmed",
  linkedBankTransactionId: tx.id,
  linkedPaymentVoucherId: String(tx.linkedPaymentVoucherId || newVouchers[0].id),
  statementSalesIds: salesIds,
});

const after = getErpState().data;
const afterVouchers = (after.paymentVouchers || []).filter(
  (voucher) => String(voucher.bankTransactionId || "") === String(tx.id),
);
const afterAllocated = afterVouchers.reduce(
  (sum, voucher) => sum + Math.round(Number(voucher.finalAmount ?? voucher.amount ?? 0)),
  0,
);
const afterSales = new Set(
  afterVouchers.map((voucher) => String(voucher.salesId ?? "").trim()).filter(Boolean),
);
const afterSummary = summarizeBankSentStatementAllocation({
  tx: afterBankTx(after, tx.id),
  paymentVouchers: after.paymentVouchers || [],
  archive: { ...archive, paymentStatus: "confirmed", statementSalesIds: salesIds },
});

const rerun = buildSentStatementPaymentApplication(
  afterBankTx(after, tx.id),
  candidate,
  {
    sales: after.sales || [],
    clients: after.clients || [],
    archive: { ...archive, statementSalesIds: salesIds },
    paymentVouchers: after.paymentVouchers || [],
  },
);

const paidSalesCount = salesIds.filter((id) => {
  const sale = salesById.get(id);
  if (!sale) return false;
  const dueGross = Math.round(Number(sale.amount || 0) * 1.1);
  const paid = afterVouchers
    .filter((voucher) => String(voucher.salesId) === id)
    .reduce((sum, voucher) => sum + Math.round(Number(voucher.finalAmount ?? 0)), 0);
  return paid >= dueGross;
}).length;

console.log(
  JSON.stringify(
    {
      ...report,
      snapshotDir,
      targetExistingVoucherCount: EXPECTED_VOUCHER_COUNT,
      targetCreatedVoucherCount: newVouchers.length,
      targetFinalVoucherCount: afterVouchers.length,
      targetFinalDistinctSalesCount: afterSales.size,
      targetFinalAllocatedAmount: afterAllocated,
      targetFinalUnallocatedAmount: afterSummary?.unallocatedAmount ?? null,
      targetSalesPaidCount: paidSalesCount,
      repairRerunCreateCount: rerun.vouchers.length,
      archivePaymentStatus: "confirmed",
      allocationKind: afterSummary?.kind,
    },
    null,
    2,
  ),
);

function afterBankTx(data: { bankTransactions?: Array<{ id: string }> }, id: string) {
  return (data.bankTransactions || []).find((row) => row.id === id) as typeof tx;
}
