import { DatabaseSync } from "node:sqlite";
import { listSentStatementArchiveMetas } from "../server/pdfArchive.mjs";
import { getDb } from "../server/db.mjs";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const query = process.argv[3] || "\uC774\uC885\uD601";
const date = process.argv[4] || "2026-06-02";

const sales = (d.sales || []).filter(
  (s) => String(s.date || "").startsWith(date) && String(s.client || "").includes(query),
);
const vouchers = (d.paymentVouchers || []).filter((v) => {
  if (String(v.client || "").includes(query)) return true;
  const sale = (d.sales || []).find((s) => String(s.id) === String(v.salesId));
  return String(sale?.date || "").startsWith(date) && String(sale?.client || "").includes(query);
});
const bank = (d.bankTransactions || []).filter((t) => {
  const txDate = String(t.transactionAt || "").slice(0, 10);
  if (txDate !== date && t.deposit !== 825000) return false;
  const blob = `${t.description || ""} ${t.counterpartyName || ""} ${t.linkedSubject || ""} ${t.memo || ""}`;
  return blob.includes(query) || t.deposit === 825000;
});

const bankTxId = "68b4527f-2ad2-4b7f-9c53-37448e8480c9";
let archives = [];
try {
  archives = listSentStatementArchiveMetas();
} catch {
  archives = [];
}
const pdfRows = getDb()
  .prepare(
    "SELECT id, subject_name, payment_status, statement_total_amount, linked_bank_transaction_id, linked_payment_voucher_id, period_start, period_end, statement_sales_ids FROM pdf_archives WHERE sent_via_link = 1 AND (subject_name LIKE ? OR linked_bank_transaction_id = ? OR statement_total_amount = ?)",
  )
  .all(`%${query}%`, bankTxId, 825000);

const voucherId = pdfRows[0]?.linked_payment_voucher_id;
const voucher = (d.paymentVouchers || []).find((v) => String(v.id) === String(voucherId));
const linkedTx = (d.bankTransactions || []).find((t) => t.id === bankTxId);
const statementSales = [3440, 3478, 3499].map((sid) => {
  const s = (d.sales || []).find((row) => String(row.id) === String(sid));
  return s
    ? {
        id: s.id,
        date: s.date,
        client: s.client,
        amount: s.amount,
        paid: s.paid,
        paidAmount: s.paidAmount,
      }
    : { id: sid, missing: true };
});

console.log(
  JSON.stringify(
    {
      linkedVoucherLookup: { voucherId, voucher: voucher || null },
      linkedBankTx: linkedTx || null,
      voucherExistsAnywhere: (d.paymentVouchers || []).some((v) => String(v.id) === "1780482779057"),
      vouchersForBankTx: (d.paymentVouchers || []).filter(
        (v) => String(v.bankTransactionId || "") === bankTxId,
      ),
      vouchersForPdf: (d.paymentVouchers || []).filter(
        (v) => String(v.linkedPdfArchiveId || "") === "pdf-1780274040742-940a3d9d",
      ),
      statementSales,
      sales: sales.map((s) => ({
        id: s.id,
        client: s.client,
        date: s.date,
        amount: s.amount,
        paid: s.paid,
        paidAmount: s.paidAmount,
        salesAmount: s.salesAmount,
      })),
      paymentVouchers: vouchers.map((v) => ({
        id: v.id,
        salesId: v.salesId,
        client: v.client,
        site: v.site,
        finalAmount: v.finalAmount,
        amount: v.amount,
        bankTransactionId: v.bankTransactionId,
        linkedPdfArchiveId: v.linkedPdfArchiveId,
        date: v.date,
      })),
      bankTransactions: bank.map((t) => ({
        id: t.id,
        deposit: t.deposit,
        transactionAt: t.transactionAt,
        description: t.description,
        counterpartyName: t.counterpartyName,
        linkedPdfArchiveId: t.linkedPdfArchiveId,
        linkedPaymentVoucherId: t.linkedPaymentVoucherId,
        linkedSalesId: t.linkedSalesId,
        matchAutoLinked: t.matchAutoLinked,
      })),
      pdfSqlMatches: pdfRows,
      sentArchives: archives
        .filter(
          (a) =>
            String(a.subjectName || "").includes(query) ||
            a.linkedBankTransactionId === bankTxId ||
            a.statementTotalAmount === 825000,
        )
        .map((a) => ({
          id: a.id,
          subjectName: a.subjectName,
          paymentStatus: a.paymentStatus,
          statementTotalAmount: a.statementTotalAmount,
          linkedBankTransactionId: a.linkedBankTransactionId,
          linkedPaymentVoucherId: a.linkedPaymentVoucherId,
          periodStart: a.periodStart,
          periodEnd: a.periodEnd,
          statementSalesIds: a.statementSalesIds,
        })),
    },
    null,
    2,
  ),
);
