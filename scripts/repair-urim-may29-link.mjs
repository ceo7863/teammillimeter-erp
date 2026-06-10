/**
 * Restore May 29 ??????? deposit link from pdf_archives metadata.
 * Usage: node scripts/repair-urim-may29-link.mjs [sqlite-path]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { DatabaseSync } from "node:sqlite";
import { listSentStatementArchiveMetas, updatePdfArchiveMeta } from "../server/pdfArchive.mjs";
import {
  buildSentStatementMatchCandidates,
  createPaymentVouchersFromSentStatementMatch,
  resolveArchivePaymentStatusAfterApply,
  resolveStatementPaidAmount,
} from "../src/utils/bankSentStatementMatch.ts";

const TX_ID = "30d5f454-0ea4-4a24-ab99-d81e44f39302";
const PDF_ID = "pdf-1780037547123-bf151613";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const db = new DatabaseSync(process.env.DATABASE_PATH);
const { data: state, version } = getErpState();

const tx = (state.bankTransactions || []).find((row) => row.id === TX_ID);
if (!tx) {
  console.error("Bank tx not found:", TX_ID);
  process.exit(1);
}

const pdf = db.prepare("SELECT * FROM pdf_archives WHERE id = ?").get(PDF_ID);
console.log("Current tx:", {
  linkedSubject: tx.linkedSubject,
  linkedPaymentVoucherId: tx.linkedPaymentVoucherId,
  linkedPdfArchiveId: tx.linkedPdfArchiveId,
  matchAutoLinked: tx.matchAutoLinked,
});
console.log("PDF meta:", pdf
  ? {
      subject: pdf.subject_name,
      period: `${pdf.period_start}~${pdf.period_end}`,
      paymentStatus: pdf.payment_status,
      linkedBankTransactionId: pdf.linked_bank_transaction_id,
      linkedPaymentVoucherId: pdf.linked_payment_voucher_id,
    }
  : null);

if (tx.linkedPaymentVoucherId && tx.linkedPdfArchiveId) {
  console.log("Already linked � nothing to do.");
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
console.log("Top candidates:", candidates.slice(0, 3).map((c) => ({ client: c.client, score: c.score, pdf: c.pdfArchiveId })));

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
  savedBy: "repair-urim-may29-link",
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
        matchConfirmedBy: "repair-urim-may29-link",
        matchAutoLinked: true,
        folderId: row.folderId || "bank-folder-client-default",
      }
    : row,
);

const saved = saveErpState(state, version, "repair-urim-may29-link");
console.log("Saved ERP version", saved.version);
console.log("Restored voucher", primaryVoucher.id, "client", primaryVoucher.client, "amount", primaryVoucher.finalAmount);

updatePdfArchiveMeta(candidate.pdfArchiveId, {
  paymentStatus,
  linkedBankTransactionId: TX_ID,
  linkedPaymentVoucherId: primaryVoucher.id,
  statementSalesIds: archive?.statementSalesIds || candidate.statementSalesIds,
});
console.log("PDF archive synced:", candidate.pdfArchiveId);
