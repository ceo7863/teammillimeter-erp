/**
 * Full prod investigation: ??? deposit + sent PDF archives.
 */
import { getDb, getErpState } from "../server/db.mjs";
import {
  buildSentStatementMatchCandidates,
  buildHighConfidenceSentStatementAutoLinks,
  resolveStatementSalesForArchive,
} from "../src/utils/bankSentStatementMatch.ts";
import { buildBankDepositMatchCandidates } from "../src/utils/bankReceivableMatch.ts";
import { listSentStatementArchiveMetas } from "../server/pdfArchive.mjs";
import { getUnpaid } from "../src/utils/receivables.ts";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

const STAIN = "\uC2A4\uD14C\uC778";
const URIM = "\uC6B0\uB9BC";
const TX_ID = "ca3c6723-8e5e-453d-b54d-25bc8f6a4257";
const EXPECTED_SALES = [3586, 3593, 3610];

console.log("=== DB ===", process.env.DATABASE_PATH);

// 1. Client record
const stainClient = (state.clients || []).find((c) => String(c.name || "").trim() === STAIN);
const urimClient = (state.clients || []).find((c) => String(c.name || "").trim() === URIM);
console.log("\n=== CLIENTS ===");
console.log("???:", JSON.stringify(stainClient || null));
console.log("??:", JSON.stringify(urimClient ? { name: urimClient.name, manager: urimClient.manager, vat: urimClient.vat } : null));

// 2. Sales 3586,3593,3610
console.log("\n=== EXPECTED SALES ===");
for (const id of EXPECTED_SALES) {
  const s = (state.sales || []).find((row) => String(row.id) === String(id));
  if (!s) {
    console.log(id, "NOT FOUND");
    continue;
  }
  console.log(JSON.stringify({
    id: s.id,
    date: s.date,
    client: s.client,
    site: s.site,
    amount: s.amount,
    paid: s.paidAmount ?? s.paid ?? 0,
    unpaid: getUnpaid(s),
  }));
}

// 3. All sent PDF archives for stain/urim
console.log("\n=== SENT PDF ARCHIVES (stain/urim) ===");
const archives = listSentStatementArchiveMetas();
const relevant = archives.filter((a) => {
  const subj = String(a.subjectName || "").trim();
  return subj === STAIN || subj === URIM;
});
console.log("count:", relevant.length);
for (const a of relevant) {
  const salesRows = resolveStatementSalesForArchive(a, state.sales || [], state.clients || []);
  const salesClients = (a.statementSalesIds || []).map((id) => {
    const s = (state.sales || []).find((row) => String(row.id) === String(id));
    return { id, client: s?.client, site: s?.site };
  });
  console.log(JSON.stringify({
    id: a.id,
    subjectName: a.subjectName,
    statementSalesIds: a.statementSalesIds,
    salesClients,
    resolvedSalesCount: salesRows.length,
    resolvedSalesIds: salesRows.map((r) => r.salesId),
    statementTotalAmount: a.statementTotalAmount,
    paymentStatus: a.paymentStatus,
    linkedBankTransactionId: a.linkedBankTransactionId,
    linkedPaymentVoucherId: a.linkedPaymentVoucherId,
    periodStart: a.periodStart,
    periodEnd: a.periodEnd,
    sentViaLink: a.sentViaLink,
    createdAt: a.createdAt,
  }));
}

// 4. Bank tx
console.log("\n=== BANK TX ca3c6723 ===");
const tx = (state.bankTransactions || []).find((t) => t.id === TX_ID);
console.log(JSON.stringify(tx ? {
  id: tx.id,
  date: String(tx.transactionAt).slice(0, 10),
  deposit: tx.deposit,
  counterparty: tx.counterpartyName,
  linkedSubject: tx.linkedSubject,
  linkedPaymentVoucherId: tx.linkedPaymentVoucherId,
  linkedPdfArchiveId: tx.linkedPdfArchiveId,
  linkedSalesId: tx.linkedSalesId,
  matchAutoLinked: tx.matchAutoLinked,
} : "NOT FOUND"));

// 5. All stain deposits
console.log("\n=== ALL STAIN DEPOSITS ===");
const stainDeposits = (state.bankTransactions || []).filter((t) => {
  if (Number(t.deposit) <= 0) return false;
  const blob = `${t.counterpartyName} ${t.description} ${t.memo} ${t.linkedSubject}`;
  return blob.includes(STAIN) || String(t.linkedSubject || "").trim() === STAIN;
});
for (const t of stainDeposits) {
  console.log(JSON.stringify({
    id: t.id,
    date: String(t.transactionAt).slice(0, 10),
    deposit: t.deposit,
    linkedSubject: t.linkedSubject,
    linked: !!t.linkedPaymentVoucherId,
  }));
}

// 6. Match simulation
if (tx) {
  console.log("\n=== SENT STATEMENT CANDIDATES ===");
  const candidates = buildSentStatementMatchCandidates(tx, archives, {
    clients: state.clients || [],
    paymentVouchers: state.paymentVouchers || [],
    bankTransactions: state.bankTransactions || [],
    minScore: 0,
  });
  console.log("count:", candidates.length);
  for (const c of candidates.slice(0, 5)) {
    console.log(JSON.stringify(c));
  }

  console.log("\n=== AUTO-LINK DRAFTS (minScore=75) ===");
  const autoLinks = buildHighConfidenceSentStatementAutoLinks({
    bankTransactions: state.bankTransactions || [],
    archives,
    clients: state.clients || [],
    sales: state.sales || [],
    paymentVouchers: state.paymentVouchers || [],
    onlyTransactionIds: new Set([TX_ID]),
    minScore: 75,
  });
  console.log(JSON.stringify(autoLinks, null, 2));

  console.log("\n=== RECEIVABLE MATCH CANDIDATES (single sale) ===");
  const receivables = (state.sales || [])
    .map((sale) => ({
      id: sale.id,
      client: sale.client,
      site: sale.site,
      voucherNo: sale.voucherNo,
      date: sale.date,
      salesAmount: Number(sale.amount || 0),
      paidAmount: Number(sale.paidAmount ?? sale.paid ?? 0),
    }))
    .filter((row) => getUnpaid(row) > 0);
  const bankCandidates = buildBankDepositMatchCandidates(tx, receivables, {
    clients: state.clients || [],
    minScore: 0,
    limit: 10,
  });
  for (const c of bankCandidates.filter((r) => r.client === STAIN || r.client === URIM)) {
    console.log(JSON.stringify({ salesId: c.salesId, client: c.client, unpaid: c.unpaid, score: c.score, finalAmount: c.finalAmount }));
  }
}

console.log("\n=== DONE ===");
