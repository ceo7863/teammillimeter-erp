/**
 * Link May 29 ??? / ??? deposit (385,000) to sale 3599 receivable.
 * Usage: node scripts/repair-cresse-may29-link.mjs [sqlite-path]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import {
  buildBankDepositMatchCandidates,
  createPaymentVoucherFromBankMatch,
  findBestClientDepositReceivableMatch,
} from "../src/utils/bankReceivableMatch.ts";
import { createPaymentInputLogsFromVouchers } from "../src/utils/paymentInputLogs.ts";

const TX_ID = "4e4098b8-4b56-4af6-8e50-c0be050bc975";
const REPAIR_BY = "repair-cresse-may29-link";
const DEFAULT_CLIENT_FOLDER_ID = "bank-folder-client-default";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state, version } = getErpState();

const tx = (state.bankTransactions || []).find((row) => row.id === TX_ID);
if (!tx) {
  console.error("Bank tx not found:", TX_ID);
  process.exit(1);
}

console.log("Current tx:", {
  deposit: tx.deposit,
  counterpartyName: tx.counterpartyName,
  linkedSubject: tx.linkedSubject,
  linkedPaymentVoucherId: tx.linkedPaymentVoucherId,
  linkedSalesId: tx.linkedSalesId,
  folderId: tx.folderId,
  classifiedAt: tx.classifiedAt,
});

if (tx.linkedPaymentVoucherId) {
  console.log("Already linked � nothing to do.");
  process.exit(0);
}

const receivableRows = (state.sales || [])
  .map((sale) => {
    const salesAmount = Number(sale.amount || 0);
    const paidAmount = Number(sale.paid ?? sale.paidAmount ?? 0);
    return {
      id: sale.id,
      client: sale.client,
      site: sale.site,
      voucherNo: sale.voucherNo,
      date: sale.date,
      salesAmount,
      paidAmount,
    };
  })
  .filter((row) => row.salesAmount - row.paidAmount > 0);

const linkedSalesIds = new Set(
  (state.bankTransactions || []).filter((row) => row.linkedSalesId).map((row) => String(row.linkedSalesId)),
);

const clientName = String(tx.linkedSubject || "").trim();
if (!clientName) {
  console.error("Tx has no linkedSubject client name");
  process.exit(1);
}

const allCandidates = buildBankDepositMatchCandidates(tx, receivableRows, {
  linkedSalesIds,
  clients: state.clients || [],
  minScore: 0,
  limit: 10,
});
console.log(
  "Top candidates (all clients):",
  allCandidates.slice(0, 5).map((c) => ({
    salesId: c.salesId,
    client: c.client,
    score: c.score,
    reasons: c.reasons,
  })),
);

const candidate = findBestClientDepositReceivableMatch(tx, receivableRows, clientName, {
  linkedSalesIds,
  clients: state.clients || [],
});
if (!candidate) {
  console.error("No receivable match for client", clientName);
  process.exit(1);
}

console.log("Selected candidate:", {
  salesId: candidate.salesId,
  client: candidate.client,
  score: candidate.score,
  finalAmount: candidate.finalAmount,
  reasons: candidate.reasons,
});

const receivable = receivableRows.find((row) => String(row.id) === String(candidate.salesId));
const sale = (state.sales || []).find((row) => String(row.id) === String(candidate.salesId));
if (!receivable) {
  console.error("Receivable row missing for", candidate.salesId);
  process.exit(1);
}

const voucher = createPaymentVoucherFromBankMatch(tx, candidate, receivable, sale);
const logs = createPaymentInputLogsFromVouchers([voucher], REPAIR_BY);

state.paymentVouchers = [voucher, ...(state.paymentVouchers || [])];
state.paymentInputLogs = [...logs, ...(state.paymentInputLogs || [])];
state.bankTransactions = (state.bankTransactions || []).map((row) =>
  row.id === TX_ID
    ? {
        ...row,
        linkedSalesId: receivable.id,
        linkedPaymentVoucherId: voucher.id,
        linkedSubject: receivable.client,
        folderId: row.folderId || DEFAULT_CLIENT_FOLDER_ID,
        classifiedAt: row.classifiedAt || new Date().toISOString(),
        matchConfirmedAt: new Date().toISOString(),
        matchConfirmedBy: REPAIR_BY,
        matchAutoLinked: false,
      }
    : row,
);

const saved = saveErpState(state, version, REPAIR_BY);
console.log("Saved ERP version", saved.version);
console.log("Linked voucher", voucher.id, "to sale", receivable.id, "amount", voucher.finalAmount);
