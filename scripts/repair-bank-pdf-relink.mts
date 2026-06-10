/**
 * Restore bank tx ↔ sent statement link when PDF meta still points at tx but vouchers were lost.
 * Usage: npx tsx scripts/repair-bank-pdf-relink.mts <txId> [sqlite-path]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { listSentStatementArchiveMetas } from "../server/pdfArchive.mjs";
import { createPaymentVouchersFromSentStatementMatch } from "../src/utils/bankSentStatementMatch.ts";

const TX_ID = process.argv[2];
const FORCE = process.argv.includes("--force");
if (!TX_ID) {
  console.error("Usage: npx tsx scripts/repair-bank-pdf-relink.mts <txId> [sqlite-path] [--force]");
  process.exit(1);
}

const sqliteArg = process.argv.find((arg, index) => index >= 3 && arg.endsWith(".sqlite"));
process.env.DATABASE_PATH = sqliteArg || "data/erp.sqlite";
getDb();

const { data: state, version } = getErpState();
const tx = (state.bankTransactions || []).find((row) => row.id === TX_ID);
if (!tx) {
  console.error("Bank tx not found:", TX_ID);
  process.exit(1);
}

const archives = listSentStatementArchiveMetas();
const archive = archives.find((row) => row.linkedBankTransactionId === TX_ID);
if (!archive) {
  console.error("No sent-statement PDF linked to tx:", TX_ID);
  process.exit(1);
}

if (!FORCE && tx.linkedPaymentVoucherId) {
  const existing = (state.paymentVouchers || []).find(
    (row) => String(row.id) === String(tx.linkedPaymentVoucherId),
  );
  if (existing) {
    console.log("Already linked:", tx.linkedPaymentVoucherId, "(use --force to relink)");
    process.exit(0);
  }
}

const candidate = {
  pdfArchiveId: archive.id,
  client: archive.subjectName || "",
  statementTotalAmount: archive.statementTotalAmount || tx.deposit,
  sentAt: archive.createdAt,
  periodStart: archive.periodStart,
  periodEnd: archive.periodEnd,
  score: 100,
  reasons: ["repair-bank-pdf-relink"],
  paymentAmount: archive.statementTotalAmount || tx.deposit,
  paymentStatus: "confirmed" as const,
  statementRemainingAmount: 0,
  shareLinkUrl: archive.shareLinkUrl,
  statementSalesIds: archive.statementSalesIds,
};

const vouchers = createPaymentVouchersFromSentStatementMatch(tx, candidate, {
  sales: state.sales || [],
  clients: state.clients || [],
  archive,
  paymentVouchers: state.paymentVouchers || [],
});
if (!vouchers.length) {
  console.error("Failed to create vouchers");
  process.exit(1);
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
  savedBy: "repair-bank-pdf-relink",
  paymentVoucherId: voucher.id,
}));

state.paymentVouchers = [...(state.paymentVouchers || []), ...vouchers];
state.paymentInputLogs = [...(state.paymentInputLogs || []), ...logs];
state.bankTransactions = (state.bankTransactions || []).map((row) =>
  row.id === TX_ID
    ? {
        ...row,
        linkedPaymentVoucherId: primaryVoucher.id,
        linkedPdfArchiveId: archive.id,
        linkedSubject: candidate.client,
        linkedSalesId: vouchers.length === 1 ? primaryVoucher.salesId : undefined,
        matchConfirmedAt: new Date().toISOString(),
        matchConfirmedBy: "repair-bank-pdf-relink",
        matchAutoLinked: false,
      }
    : row,
);

const saved = saveErpState(state, version, "repair-bank-pdf-relink");
console.log("Saved ERP version", saved.version);
console.log(
  "Restored:",
  vouchers.map((v) => ({ id: v.id, client: v.client, site: v.site, finalAmount: v.finalAmount })),
);
