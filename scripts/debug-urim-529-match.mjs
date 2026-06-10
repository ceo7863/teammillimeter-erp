import { getDb, getErpState } from "../server/db.mjs";
import { listSentStatementArchiveMetas } from "../server/pdfArchive.mjs";

getDb();
const { data } = getErpState();
const tx = (data.bankTransactions || []).find((t) => t.id === "30d5f454-0ea4-4a24-ab99-d81e44f39302");
console.log("tx", tx ? { deposit: tx.deposit, counterparty: tx.counterpartyName, linked: tx.linkedPaymentVoucherId } : null);

const archives = listSentStatementArchiveMetas().filter((r) => r.category === "statement-client");
const urimPdfs = archives.filter((a) => String(a.subjectName || "").includes("\uC6B0\uB9BC") || String(a.id || "").includes("1780037547123"));
console.log("urim pdfs", urimPdfs.map((a) => ({
  id: a.id,
  subject: a.subjectName,
  period: a.periodLabel,
  total: a.statementTotalAmount,
  paymentStatus: a.paymentStatus,
  linkedBankTx: a.linkedBankTransactionId,
})));

const pdfId = "pdf-1780037547123-bf151613";
const target = archives.find((a) => a.id === pdfId);
console.log("target pdf", target);

const voucherId = target?.linkedPaymentVoucherId || "1780273734091";
const vouchers = (data.paymentVouchers || []).filter(
  (v) => String(v.id) === String(voucherId) || String(v.bankTransactionId) === "30d5f454-0ea4-4a24-ab99-d81e44f39302",
);
console.log("vouchers by id/bankTx", vouchers);
