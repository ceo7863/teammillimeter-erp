import { getDb, getErpState } from "../server/db.mjs";
import { listSentStatementArchiveMetas, listPdfArchiveMetas } from "../server/pdfArchive.mjs";
import {
  buildSentStatementMatchCandidates,
  buildAllSentStatementDepositSuggestions,
} from "../src/utils/bankSentStatementMatch.ts";
import {
  findBestClientDepositReceivableMatch,
  buildBankDepositMatchCandidates,
} from "../src/utils/bankReceivableMatch.ts";
import { hasManualClientClassificationOverride } from "../src/utils/bankTransactions.ts";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

const CRESE = "\uD06C\uB808\uC138"; // ???

const pdfs = listPdfArchiveMetas().filter(
  (p) =>
    String(p.subjectName || "").includes(CRESE) ||
    (p.statementSalesIds || []).some((id) => {
      const sale = (state.sales || []).find((s) => String(s.id) === String(id));
      return String(sale?.client || "").includes(CRESE);
    }),
);

const sentPdfs = listSentStatementArchiveMetas().filter((p) => String(p.subjectName || "").includes(CRESE));
console.log("=== Sent PDF (???) ===", sentPdfs.length);
for (const p of sentPdfs) {
  console.log(JSON.stringify(p, null, 2));
}

console.log("=== PDF archives (???) ===", pdfs.length);
for (const p of pdfs) {
  console.log(
    JSON.stringify(
      {
        id: p.id,
        subjectName: p.subjectName,
        folderKind: p.folderKind,
        paymentStatus: p.paymentStatus,
        statementTotalAmount: p.statementTotalAmount,
        statementSalesIds: p.statementSalesIds,
        linkedBankTransactionId: p.linkedBankTransactionId,
        linkedPaymentVoucherId: p.linkedPaymentVoucherId,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        createdAt: p.createdAt,
      },
      null,
      2,
    ),
  );
}

const txs = (state.bankTransactions || []).filter((t) => {
  const blob = JSON.stringify(t);
  return t.deposit > 0 && (blob.includes(CRESE) || String(t.linkedSubject || "").includes(CRESE));
});

console.log("\n=== Bank deposits (???) ===", txs.length);
for (const t of txs) {
  const vouchers = (state.paymentVouchers || []).filter((v) => String(v.bankTransactionId) === String(t.id));
  console.log(
    JSON.stringify(
      {
        id: t.id,
        date: String(t.transactionAt || "").slice(0, 10),
        deposit: t.deposit,
        counterparty: t.counterpartyName,
        description: t.description,
        linkedSubject: t.linkedSubject,
        linkedPaymentVoucherId: t.linkedPaymentVoucherId,
        linkedPdfArchiveId: t.linkedPdfArchiveId,
        linkedSalesId: t.linkedSalesId,
        matchAutoLinked: t.matchAutoLinked,
        matchConfirmedBy: t.matchConfirmedBy,
        classifiedAt: t.classifiedAt,
        matchConfirmedAt: t.matchConfirmedAt,
        manualOverride: hasManualClientClassificationOverride(t),
        vouchers: vouchers.map((v) => ({
          id: v.id,
          salesId: v.salesId,
          finalAmount: v.finalAmount,
          client: v.client,
        })),
      },
      null,
      2,
    ),
  );
}

const receivableRows = (state.sales || [])
  .map((sale) => ({
    id: sale.id,
    client: sale.client,
    site: sale.site,
    date: sale.date,
    salesAmount: Number(sale.amount || 0),
    paidAmount: Number(sale.paid ?? sale.paidAmount ?? 0),
  }))
  .filter((row) => String(row.client || "").includes(CRESE));

console.log("\n=== Sales (???) ===");
for (const row of receivableRows) {
  console.log({
    id: row.id,
    date: row.date,
    client: row.client,
    site: row.site,
    amount: row.salesAmount,
    paid: row.paidAmount,
    unpaid: row.salesAmount - row.paidAmount,
  });
}

const client = (state.clients || []).find((c) => String(c.name || "").includes(CRESE));
console.log("\n=== Client (???) ===", client ? {
  name: client.name,
  manager: client.manager,
  depositNameAliases: client.depositNameAliases,
  vat: client.vat,
} : null);

for (const t of txs) {
  console.log("\n=== Match analysis for tx", t.id.slice(0, 8), "(linked:", !!t.linkedPaymentVoucherId, ") ===");
  const linkedSalesIds = new Set(
    (state.bankTransactions || []).filter((row) => row.linkedSalesId).map((row) => String(row.linkedSalesId)),
  );
  const unpaidRows = (state.sales || [])
    .map((sale) => ({
      id: sale.id,
      client: sale.client,
      site: sale.site,
      date: sale.date,
      salesAmount: Number(sale.amount || 0),
      paidAmount: Number(sale.paid ?? sale.paidAmount ?? 0),
    }))
    .filter((row) => row.salesAmount - row.paidAmount > 0);

  const receivable = findBestClientDepositReceivableMatch(t, unpaidRows, t.linkedSubject || CRESE, {
    linkedSalesIds,
    clients: state.clients || [],
  });
  console.log("findBestClientDepositReceivableMatch:", receivable);

  const sentArchives = pdfs.filter((a) => a.folderKind === "sent" || !a.folderKind);
  const candidates = buildSentStatementMatchCandidates(t, listSentStatementArchiveMetas(), {
    clients: state.clients || [],
    paymentVouchers: state.paymentVouchers || [],
    bankTransactions: state.bankTransactions || [],
    minScore: 0,
    limit: 5,
  }).filter((c) => String(c.client || "").includes(CRESE) || c.statementSalesIds?.some((id) => receivableRows.some((s) => String(s.id) === String(id))));

  console.log("sent statement candidates:", candidates);

  const allSuggestions = buildAllSentStatementDepositSuggestions(
    [t],
    listSentStatementArchiveMetas(),
    state.clients || [],
    state.paymentVouchers || [],
  );
  console.log("auto link suggestions:", allSuggestions);
}
