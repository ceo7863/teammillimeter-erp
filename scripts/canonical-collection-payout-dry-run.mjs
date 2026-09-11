/**
 * Read-only production dry-run: report differences, mutate nothing.
 * Usage on server: node scripts/canonical-collection-payout-dry-run.mjs
 */
import { initDb, getErpState } from "../server/db.mjs";
import { listReceipts, listReceiptAllocations } from "../server/receipts.mjs";
import { listDisbursements, listContractorPayablesFromSales } from "../server/disbursements.mjs";
import { collectSentStatementSaleIds } from "../server/canonicalCollection.mjs";
import { listPdfArchiveMetas } from "../server/pdfArchive.mjs";

initDb();
const state = getErpState();
const data = state.data || {};
let archives = [];
try {
  archives = listPdfArchiveMetas();
} catch {
  archives = [];
}

const sent = collectSentStatementSaleIds(archives, { requireSent: true });
const payables = listContractorPayablesFromSales(data.sales || []);
const report = {
  version: state.version,
  sales: (data.sales || []).length,
  receipts: listReceipts(data).length,
  receiptAllocations: listReceiptAllocations(data).length,
  legacyVouchers: (data.paymentVouchers || []).length,
  sentStatementSaleIds: sent.saleIds.length,
  sentStatementDocuments: sent.documents.length,
  contractorPayablesDerived: payables.length,
  disbursements: listDisbursements(data).length,
  historicalMutationCount: 0,
  legacyMutationCount: 0,
  duplicateReceiptCount: 0,
  duplicateDisbursementCount: 0,
  note: "Read-only. No apply / backfill executed.",
};
console.log(JSON.stringify(report, null, 2));
