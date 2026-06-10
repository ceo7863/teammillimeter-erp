/**
 * Verify match score for ??? / ??? / 385k deposit.
 */
import { getDb, getErpState } from "../server/db.mjs";
import {
  buildBankDepositMatchCandidates,
  findBestClientDepositReceivableMatch,
} from "../src/utils/bankReceivableMatch.ts";

const TX_ID = "4e4098b8-4b56-4af6-8e50-c0be050bc975";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

const tx = (state.bankTransactions || []).find((row) => row.id === TX_ID);
if (!tx) {
  console.error("Tx not found");
  process.exit(1);
}

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
  .filter((row) => row.salesAmount - row.paidAmount > 0);

const linkedSalesIds = new Set(
  (state.bankTransactions || []).filter((row) => row.linkedSalesId).map((row) => String(row.linkedSalesId)),
);

const cresseCandidates = buildBankDepositMatchCandidates(
  tx,
  receivableRows.filter((row) => String(row.client || "").includes("???")),
  { linkedSalesIds, clients: state.clients || [], minScore: 0, limit: 5 },
);
console.log("??? candidates:", cresseCandidates);

const best = findBestClientDepositReceivableMatch(tx, receivableRows, tx.linkedSubject || "???", {
  linkedSalesIds,
  clients: state.clients || [],
});
console.log("findBestClientDepositReceivableMatch:", best);
