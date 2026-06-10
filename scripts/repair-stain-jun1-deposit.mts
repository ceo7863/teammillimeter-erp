/**
 * Link 6/1 ??? deposit (2,882,000) to sent statement + sales 3586/3593/3610.
 * Usage: npx tsx scripts/repair-stain-jun1-deposit.mts [sqlite-path] [--dry-run]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { listSentStatementArchiveMetas, updatePdfArchiveMeta } from "../server/pdfArchive.mjs";
import {
  createPaymentVouchersFromSentStatementMatch,
  resolveArchivePaymentStatusAfterApply,
  resolveStatementPaidAmount,
} from "../src/utils/bankSentStatementMatch.ts";

const TX_ID = "ca3c6723-8e5e-453d-b54d-25bc8f6a4257";
const PDF_ID = "pdf-1780037598591-7f8d5022";
const EXPECTED_SALES_IDS = ["3586", "3593", "3610"];
const DRY_RUN = process.argv.includes("--dry-run");

const sqliteArg = process.argv.find((arg) => arg.endsWith(".sqlite"));
process.env.DATABASE_PATH = sqliteArg || "data/erp.sqlite";
getDb();

const { data: state, version } = getErpState();
const tx = (state.bankTransactions || []).find((row) => row.id === TX_ID);
if (!tx) {
  console.error("Bank tx not found:", TX_ID);
  process.exit(1);
}

const archives = listSentStatementArchiveMetas();
const archive = archives.find((row) => row.id === PDF_ID);
if (!archive) {
  console.error("PDF archive not found:", PDF_ID);
  process.exit(1);
}

const removeVoucherIds = new Set<string>();
for (const voucher of state.paymentVouchers || []) {
  if (String(voucher.bankTransactionId || "") === TX_ID) {
    removeVoucherIds.add(String(voucher.id));
  }
}
if (tx.linkedPaymentVoucherId) {
  removeVoucherIds.add(String(tx.linkedPaymentVoucherId));
}

const beforeVouchers = (state.paymentVouchers || []).filter((row) =>
  removeVoucherIds.has(String(row.id)),
);
console.log(
  "Removing vouchers:",
  beforeVouchers.map((row) => ({
    id: row.id,
    salesId: row.salesId,
    site: row.site,
    finalAmount: row.finalAmount,
  })),
);

const remainingVouchers = (state.paymentVouchers || []).filter(
  (row) => !removeVoucherIds.has(String(row.id)),
);
const remainingLogs = (state.paymentInputLogs || []).filter(
  (row) => !removeVoucherIds.has(String(row.paymentVoucherId || "")),
);

const candidate = {
  pdfArchiveId: archive.id,
  client: archive.subjectName || tx.linkedSubject || "???",
  statementTotalAmount: archive.statementTotalAmount || tx.deposit,
  sentAt: archive.createdAt,
  periodStart: archive.periodStart,
  periodEnd: archive.periodEnd,
  score: 100,
  reasons: ["repair-stain-jun1-deposit"],
  paymentAmount: archive.statementTotalAmount || tx.deposit,
  paymentStatus: "confirmed" as const,
  statementRemainingAmount: 0,
  shareLinkUrl: archive.shareLinkUrl,
  statementSalesIds: archive.statementSalesIds?.length
    ? archive.statementSalesIds
    : EXPECTED_SALES_IDS,
};

const clearedTx = {
  ...tx,
  linkedPaymentVoucherId: undefined,
  linkedPdfArchiveId: undefined,
  linkedSalesId: undefined,
  matchConfirmedAt: undefined,
  matchConfirmedBy: undefined,
  matchAutoLinked: undefined,
};

const vouchers = createPaymentVouchersFromSentStatementMatch(clearedTx, candidate, {
  sales: state.sales || [],
  clients: state.clients || [],
  archive: {
    ...archive,
    statementSalesIds: candidate.statementSalesIds,
  },
  paymentVouchers: remainingVouchers,
});

console.log(
  "New vouchers:",
  vouchers.map((row) => ({
    id: row.id,
    salesId: row.salesId,
    site: row.site,
    finalAmount: row.finalAmount,
  })),
);

if (vouchers.length !== 3) {
  console.error(`Expected 3 vouchers, got ${vouchers.length}`);
  process.exit(1);
}

const salesIds = new Set(vouchers.map((row) => String(row.salesId)));
for (const id of EXPECTED_SALES_IDS) {
  if (!salesIds.has(id)) {
    console.error("Missing salesId in vouchers:", id);
    process.exit(1);
  }
}

const total = vouchers.reduce((sum, row) => sum + Number(row.finalAmount || 0), 0);
const deposit = Number(tx.deposit || candidate.paymentAmount || 0);
if (Math.abs(total - deposit) > 2) {
  console.error("Voucher total mismatch:", total, "expected", deposit);
  process.exit(1);
}

if (DRY_RUN) {
  console.log("Dry run OK � no save");
  process.exit(0);
}

const primaryVoucher = vouchers[0];
const batchId = Date.now();
const logs = vouchers.map((voucher, index) => ({
  id: `${batchId}-${index}`,
  createdAt: new Date().toISOString(),
  paymentDate: voucher.date || "",
  client: voucher.client || "",
  site: voucher.site || "",
  salesId: voucher.salesId,
  supplyAmount: voucher.amount || 0,
  vatAmount: voucher.vatAmount || 0,
  finalAmount: voucher.finalAmount ?? voucher.amount ?? 0,
  vatIncluded: voucher.vatType !== "excluded",
  savedBy: "repair-stain-jun1-deposit",
  paymentVoucherId: voucher.id,
}));

const paidSoFar = resolveStatementPaidAmount(
  archive.id,
  remainingVouchers,
  (state.bankTransactions || []).filter((row) => row.id !== TX_ID),
);
const appliedAmount = vouchers.reduce((sum, row) => sum + Number(row.finalAmount || 0), 0);
const paymentStatus = resolveArchivePaymentStatusAfterApply(
  candidate.statementTotalAmount,
  paidSoFar,
  appliedAmount,
);

state.paymentVouchers = [...remainingVouchers, ...vouchers];
state.paymentInputLogs = [...remainingLogs, ...logs];
state.bankTransactions = (state.bankTransactions || []).map((row) =>
  row.id === TX_ID
    ? {
        ...row,
        linkedPaymentVoucherId: primaryVoucher.id,
        linkedPdfArchiveId: archive.id,
        linkedSubject: candidate.client,
        linkedSalesId: undefined,
        matchConfirmedAt: new Date().toISOString(),
        matchConfirmedBy: "repair-stain-jun1-deposit",
        matchAutoLinked: false,
      }
    : row,
);

const saved = saveErpState(state, version, "repair-stain-jun1-deposit");
console.log("Saved ERP version", saved.version);

const meta = updatePdfArchiveMeta(archive.id, {
  paymentStatus,
  linkedBankTransactionId: TX_ID,
  linkedPaymentVoucherId: primaryVoucher.id,
  statementSalesIds: candidate.statementSalesIds,
});
console.log("PDF archive:", meta?.id, meta?.paymentStatus, meta?.statementSalesIds);
