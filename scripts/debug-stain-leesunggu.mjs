/**
 * Debug: why ??? deposit for client ??? was not auto-linked.
 */
import { getDb, getErpState } from "../server/db.mjs";
import {
  buildBankDepositMatchCandidates,
  findBestClientDepositReceivableMatch,
} from "../src/utils/bankReceivableMatch.ts";
import {
  buildAllSentStatementDepositSuggestions,
  buildHighConfidenceSentStatementAutoLinks,
} from "../src/utils/bankSentStatementMatch.ts";
import { resolveBankDepositMatchSubject } from "../src/utils/clientDepositAliases.ts";
import { getUnpaid } from "../src/utils/receivables.ts";

const STAIN = "???";
const PERSON = "???";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

const receivableRows = (state.sales || [])
  .map((sale) => ({
    id: sale.id,
    client: sale.client,
    site: sale.site,
    voucherNo: sale.voucherNo,
    date: sale.date,
    salesAmount: Number(sale.amount || 0),
    paidAmount: Number(sale.paidAmount || 0),
  }))
  .filter((row) => getUnpaid(row) > 0);

const linkedSalesIds = new Set(
  (state.bankTransactions || []).filter((row) => row.linkedSalesId).map((row) => String(row.linkedSalesId)),
);

function summarizeTx(t) {
  return {
    id: t.id,
    date: String(t.transactionAt || "").slice(0, 10),
    deposit: t.deposit,
    counterparty: t.counterpartyName,
    description: t.description,
    memo: t.memo,
    linkedSubject: t.linkedSubject,
    folderId: t.folderId,
    classificationKind: t.classificationKind,
    linkedPaymentVoucherId: t.linkedPaymentVoucherId,
    linkedSalesId: t.linkedSalesId,
    linkedPdfArchiveId: t.linkedPdfArchiveId,
    matchAutoLinked: t.matchAutoLinked,
    matchConfirmedAt: t.matchConfirmedAt,
    subject: resolveBankDepositMatchSubject(t),
  };
}

const txs = (state.bankTransactions || []).filter((t) => {
  const subj = resolveBankDepositMatchSubject(t);
  const cp = String(t.counterpartyName || "");
  const ls = String(t.linkedSubject || "");
  return (
    subj.includes(PERSON) ||
    cp.includes(PERSON) ||
    ls.includes(PERSON) ||
    String(t.description || "").includes(PERSON) ||
    String(t.memo || "").includes(PERSON)
  );
});

console.log("=== BANK TX (???) ===");
for (const t of txs.sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))) {
  console.log(JSON.stringify(summarizeTx(t), null, 2));
}

const stainClient = (state.clients || []).find((c) => String(c.name || "").trim() === STAIN);
console.log("\n=== CLIENT ??? ===");
console.log(
  stainClient
    ? {
        name: stainClient.name,
        manager: stainClient.manager,
        depositNameAliases: stainClient.depositNameAliases,
      }
    : "NOT FOUND",
);

const stainSales = (state.sales || []).filter((s) => String(s.client || "").trim() === STAIN);
console.log("\n=== SALES for ??? ===");
for (const s of stainSales.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
  const unpaid = Number(s.amount || 0) - Number(s.paidAmount || 0);
  console.log(
    JSON.stringify({
      id: s.id,
      date: s.date,
      site: s.site,
      amount: s.amount,
      paidAmount: s.paidAmount,
      unpaid,
    }),
  );
}

const stainReceivables = receivableRows.filter((r) => String(r.client || "").trim() === STAIN);
console.log("\n=== UNPAID RECEIVABLES for ??? ===");
for (const r of stainReceivables) {
  console.log(JSON.stringify({ ...r, unpaid: getUnpaid(r) }));
}

const stainArchives = (state.pdfArchives || []).filter(
  (a) => String(a.client || "").trim() === STAIN || String(a.title || "").includes(STAIN),
);
console.log("\n=== PDF ARCHIVES for ??? ===");
for (const a of stainArchives.slice(-5)) {
  console.log(
    JSON.stringify({
      id: a.id,
      client: a.client,
      sentAt: a.sentAt,
      periodStart: a.periodStart,
      periodEnd: a.periodEnd,
      totalAmount: a.totalAmount,
      paymentStatus: a.paymentStatus,
      linkedBankTransactionId: a.linkedBankTransactionId,
    }),
  );
}

console.log("\n=== MATCH SIMULATION per TX ===");
for (const tx of txs) {
  console.log("\n--- TX", tx.id.slice(0, 8), summarizeTx(tx).date, summarizeTx(tx).deposit, "---");

  const allCandidates = buildBankDepositMatchCandidates(tx, receivableRows, {
    linkedSalesIds,
    clients: state.clients || [],
    minScore: 0,
    limit: 10,
  });
  console.log(
    "allCandidates (minScore=0):",
    allCandidates.map((c) => ({
      salesId: c.salesId,
      client: c.client,
      site: c.site,
      unpaid: c.unpaid,
      score: c.score,
      reasons: c.reasons,
      finalAmount: c.finalAmount,
    })),
  );

  const stainOnly = buildBankDepositMatchCandidates(tx, stainReceivables, {
    linkedSalesIds,
    clients: state.clients || [],
    minScore: 0,
    limit: 5,
  });
  console.log("stainOnly candidates:", stainOnly);

  const linkedSubject = String(tx.linkedSubject || "").trim() || STAIN;
  const best = findBestClientDepositReceivableMatch(tx, receivableRows, linkedSubject, {
    linkedSalesIds,
    clients: state.clients || [],
  });
  console.log("findBestClientDepositReceivableMatch (linkedSubject=" + linkedSubject + "):", best);

  const sentSuggestions = buildAllSentStatementDepositSuggestions(
    [tx],
    state.pdfArchives || [],
    state.clients || [],
    state.paymentVouchers || [],
  );
  console.log(
    "sentStatement suggestions:",
    sentSuggestions.map((s) => ({
      txId: s.tx.id.slice(0, 8),
      candidates: s.candidates.map((c) => ({
        client: c.client,
        score: c.score,
        reasons: c.reasons,
        paymentAmount: c.paymentAmount,
        pdfArchiveId: c.pdfArchiveId?.slice(0, 20),
      })),
    })),
  );

  const autoLinks = buildHighConfidenceSentStatementAutoLinks({
    bankTransactions: [tx],
    archives: state.pdfArchives || [],
    clients: state.clients || [],
    sales: state.sales || [],
    paymentVouchers: state.paymentVouchers || [],
    minScore: 75,
  });
  console.log("highConfidence autoLinks:", autoLinks);

  const vouchers = (state.paymentVouchers || []).filter((v) => String(v.bankTransactionId) === String(tx.id));
  console.log("existing vouchers:", vouchers);
}
