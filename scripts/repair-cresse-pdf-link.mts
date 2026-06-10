/**
 * Sync ??? sent PDF with already-linked May 29 deposit.
 * Usage: npx tsx scripts/repair-cresse-pdf-link.mts [sqlite-path] [--dry-run]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { updatePdfArchiveMeta } from "../server/pdfArchive.mjs";

const PDF_ID = "pdf-1779937718194-7c7b98dd";
const TX_ID = "4e4098b8-4b56-4af6-8e50-c0be050bc975";
const VOUCHER_ID = 1780275818226;
const REPAIR_BY = "repair-cresse-pdf-link";
const dryRun = process.argv.includes("--dry-run");

process.env.DATABASE_PATH = process.argv.find((arg) => arg.endsWith(".sqlite")) || "data/erp.sqlite";
getDb();

const { data: state, version } = getErpState();
const tx = (state.bankTransactions || []).find((row) => row.id === TX_ID);
const voucher = (state.paymentVouchers || []).find((row) => String(row.id) === String(VOUCHER_ID));

if (!tx?.linkedPaymentVoucherId) {
  console.error("Bank tx not linked yet � run repair-cresse-may29-link first");
  process.exit(1);
}

if (!voucher) {
  console.error("Payment voucher not found:", VOUCHER_ID);
  process.exit(1);
}

console.log("Before:", {
  pdf: { id: PDF_ID },
  tx: {
    id: tx.id,
    linkedPdfArchiveId: tx.linkedPdfArchiveId,
    linkedPaymentVoucherId: tx.linkedPaymentVoucherId,
  },
});

if (dryRun) {
  console.log("Dry-run � would set PDF confirmed + link tx?pdf");
  process.exit(0);
}

updatePdfArchiveMeta(PDF_ID, {
  paymentStatus: "confirmed",
  linkedBankTransactionId: TX_ID,
  linkedPaymentVoucherId: String(voucher.id),
});

state.bankTransactions = (state.bankTransactions || []).map((row) =>
  row.id === TX_ID
    ? {
        ...row,
        linkedPdfArchiveId: PDF_ID,
        matchAutoLinked: false,
        matchConfirmedBy: row.matchConfirmedBy || REPAIR_BY,
      }
    : row,
);

const saved = saveErpState(state, version, REPAIR_BY);
console.log("Saved ERP version", saved.version);
console.log("PDF", PDF_ID, "? confirmed, linked to tx", TX_ID);
