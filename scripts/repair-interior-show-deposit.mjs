/**
 * Link ????? 2026-06-10 deposit to sent statement + create payment vouchers.
 * Usage: node scripts/repair-interior-show-deposit.mjs [sqlite-path] [--dry-run]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { listSentStatementArchiveMetas, updatePdfArchiveMeta } from "../server/pdfArchive.mjs";
import {
  buildSentStatementMatchCandidates,
  createPaymentVouchersFromSentStatementMatch,
  resolveArchivePaymentStatusAfterApply,
  resolveStatementPaidAmount,
} from "../src/utils/bankSentStatementMatch.ts";

const TX_ID = "b3f5a842-424d-4035-aaf2-a5087063bb72";
const PDF_ID = "pdf-1781082474974-8b00a405";
const CLIENT_FOLDER_ID = "bank-folder-client-default";

const dryRun = process.argv.includes("--dry-run");
process.env.DATABASE_PATH = process.argv.find((arg) => arg.endsWith(".sqlite")) || "data/erp.sqlite";
getDb();
const { data: state, version } = getErpState();

const tx = (state.bankTransactions || []).find((row) => row.id === TX_ID);
if (!tx) {
  console.error("Bank tx not found:", TX_ID);
  process.exit(1);
}

if (tx.linkedPaymentVoucherId && tx.linkedPdfArchiveId) {
  console.log("Already linked:", tx.linkedPaymentVoucherId, tx.linkedPdfArchiveId);
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
console.log(
  "Candidates:",
  candidates.map((c) => ({ client: c.client, score: c.score, pdf: c.pdfArchiveId, total: c.statementTotalAmount })),
);

const candidate = candidates.find((row) => row.pdfArchiveId === PDF_ID) || candidates[0];
if (!candidate) {
  console.error("No match candidate");
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
if (!vouchers.length) {
  console.error("No vouchers created");
  process.exit(1);
}

const appliedAmount = vouchers.reduce((sum, row) => sum + Number(row.finalAmount || 0), 0);
const paymentStatus = resolveArchivePaymentStatusAfterApply(candidate.statementTotalAmount, paidSoFar, appliedAmount);
const primaryVoucher = vouchers[0];

console.log("Vouchers:", vouchers.map((v) => ({ id: v.id, salesId: v.salesId, finalAmount: v.finalAmount })));
console.log("paymentStatus", paymentStatus, "appliedAmount", appliedAmount);

if (dryRun) {
  console.log("DRY-RUN � no changes saved");
  process.exit(0);
}

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
  savedBy: "repair-interior-show-deposit",
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
        matchConfirmedBy: "repair-interior-show-deposit",
        matchAutoLinked: true,
        folderId: CLIENT_FOLDER_ID,
      }
    : row,
);

const saved = saveErpState(state, version, "repair-interior-show-deposit");
console.log("Saved ERP version", saved.version);

updatePdfArchiveMeta(candidate.pdfArchiveId, {
  paymentStatus,
  linkedBankTransactionId: TX_ID,
  linkedPaymentVoucherId: primaryVoucher.id,
  statementSalesIds: archive?.statementSalesIds || candidate.statementSalesIds,
});
console.log("PDF archive synced:", candidate.pdfArchiveId);
