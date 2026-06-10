/**
 * Link 우림 1,140,040 deposit to sent statement 2026-05-26~27.
 * Usage: npx tsx scripts/repair-urim-jun1-match.mts [sqlite-path]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { listSentStatementArchiveMetas, updatePdfArchiveMeta } from "../server/pdfArchive.mjs";
import {
  buildSentStatementMatchCandidates,
  createPaymentVouchersFromSentStatementMatch,
  resolveArchivePaymentStatusAfterApply,
  resolveStatementPaidAmount,
} from "../src/utils/bankSentStatementMatch.ts";

const TX_ID = "30d5f454-0ea4-4a24-ab99-d81e44f39302";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();

const { data: state, version } = getErpState();
const tx = (state.bankTransactions || []).find((row) => row.id === TX_ID);
if (!tx) {
  console.error("Bank tx not found:", TX_ID);
  process.exit(1);
}
if (tx.linkedPaymentVoucherId) {
  console.log("Already linked to voucher", tx.linkedPaymentVoucherId);
  process.exit(0);
}

const archives = listSentStatementArchiveMetas().filter((row) => row.category === "statement-client");
const candidates = buildSentStatementMatchCandidates(tx, archives, {
  clients: state.clients || [],
  paymentVouchers: state.paymentVouchers || [],
  bankTransactions: state.bankTransactions || [],
  minScore: 0,
  limit: 5,
});

console.log("Candidates:", candidates);
const candidate = candidates[0];
if (!candidate) {
  console.error("No match candidate found");
  process.exit(1);
}

const archive = archives.find((row) => row.id === candidate.pdfArchiveId);
const paidSoFar = resolveStatementPaidAmount(candidate.pdfArchiveId, state.paymentVouchers || [], state.bankTransactions || []);
const vouchers = createPaymentVouchersFromSentStatementMatch(tx, candidate, {
  sales: state.sales || [],
  clients: state.clients || [],
  archive,
  paymentVouchers: state.paymentVouchers || [],
});
const appliedAmount = vouchers.reduce((sum, row) => sum + Number(row.finalAmount || 0), 0);
const paymentStatus = resolveArchivePaymentStatusAfterApply(candidate.statementTotalAmount, paidSoFar, appliedAmount);
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
  savedBy: "repair-urim-jun1-match",
  paymentVoucherId: voucher.id,
}));

state.paymentVouchers = [...(state.paymentVouchers || []), ...vouchers];
state.paymentInputLogs = [...(state.paymentInputLogs || []), ...logs];
state.bankTransactions = (state.bankTransactions || []).map((row) =>
  row.id === TX_ID
    ? {
        ...row,
        linkedPaymentVoucherId: primaryVoucher.id,
        linkedPdfArchiveId: candidate.pdfArchiveId,
        linkedSubject: candidate.client,
        linkedSalesId: vouchers.length === 1 ? primaryVoucher.salesId : undefined,
        matchConfirmedAt: new Date().toISOString(),
        matchConfirmedBy: "repair-urim-jun1-match",
        matchAutoLinked: true,
      }
    : row,
);

const saved = saveErpState(state, version, "repair-urim-jun1-match");
console.log("Saved ERP version", saved.version);
console.log(
  "Vouchers:",
  vouchers.map((v) => ({ id: v.id, salesId: v.salesId, finalAmount: v.finalAmount })),
);

const meta = updatePdfArchiveMeta(candidate.pdfArchiveId, {
  paymentStatus,
  linkedBankTransactionId: TX_ID,
  linkedPaymentVoucherId: primaryVoucher.id,
  statementSalesIds: archive?.statementSalesIds || candidate.statementSalesIds,
});
console.log("PDF archive updated:", meta?.id, meta?.paymentStatus, meta?.linkedBankTransactionId);
