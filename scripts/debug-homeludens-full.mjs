import { DatabaseSync } from "node:sqlite";
import { listSentStatementArchiveMetas } from "../server/pdfArchive.mjs";

const CLIENT = "\uD648\uB8E8\uB374\uC2A4";
const ANCHOR_SALE_ID = 3477;
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const anchor = (d.sales || []).find((s) => Number(s.id) === ANCHOR_SALE_ID);
const anchorClient = anchor ? String(anchor.client || "") : CLIENT;

const sales = (d.sales || []).filter((s) => String(s.client || "") === anchorClient);
const vouchers = (d.paymentVouchers || []).filter((v) => String(v.client || "") === anchorClient);
const voucherBankIds = new Set(vouchers.map((v) => String(v.bankTransactionId || "")).filter(Boolean));
const bank = (d.bankTransactions || []).filter(
  (t) => voucherBankIds.has(t.id) || (t.deposit > 0 && String(t.linkedSubject || "") === anchorClient),
);

const archives = listSentStatementArchiveMetas().filter(
  (a) =>
    String(a.subjectName || "") === anchorClient ||
    vouchers.some((v) => v.linkedPdfArchiveId === a.id) ||
    bank.some((t) => t.linkedPdfArchiveId === a.id),
);

const stmtIdSet = new Set();
for (const a of archives) for (const id of a.statementSalesIds || []) stmtIdSet.add(Number(id));
for (const v of vouchers) {
  if (v.salesId) stmtIdSet.add(Number(v.salesId));
  for (const id of v.statementSalesIds || []) stmtIdSet.add(Number(id));
}

const stmtSales = [...stmtIdSet]
  .sort((a, b) => a - b)
  .map((id) => {
    const s = sales.find((row) => Number(row.id) === id) || (d.sales || []).find((row) => Number(row.id) === id);
    return s ? { id: s.id, date: s.date, site: s.site, amount: s.amount, paid: s.paid } : { id, missing: true };
  });

console.log(
  JSON.stringify(
    {
      anchorClient,
      pdfArchives: archives.map((a) => ({
        id: a.id,
        periodStart: a.periodStart,
        periodEnd: a.periodEnd,
        statementTotalAmount: a.statementTotalAmount,
        paymentStatus: a.paymentStatus,
        statementSalesIds: a.statementSalesIds,
        linkedBankTransactionId: a.linkedBankTransactionId,
      })),
      bankDeposits: bank
        .sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))
        .map((t) => ({
          id: t.id,
          transactionAt: t.transactionAt,
          deposit: t.deposit,
          description: t.description,
          linkedPdfArchiveId: t.linkedPdfArchiveId,
          linkedPaymentVoucherId: t.linkedPaymentVoucherId,
        })),
      vouchers,
      statementSales: stmtSales,
      depositSum: bank.reduce((s, t) => s + (t.deposit || 0), 0),
      stmtSubtotal: stmtSales.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    },
    null,
    2,
  ),
);
