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
console.log("tx", tx);
const sale = (state.sales || []).find((row) => String(row.id) === "3599");
console.log(
  "sale3599",
  sale
    ? {
        id: sale.id,
        client: sale.client,
        amount: sale.amount,
        paidAmount: sale.paidAmount,
        date: sale.date,
        site: sale.site,
      }
    : null,
);
const client = (state.clients || []).find((row) => String(row.name || "").trim() === "크레세");
console.log("client", client ? { name: client.name, aliases: client.depositNameAliases } : null);

const receivableRows = (state.sales || [])
  .map((s) => ({
    id: s.id,
    client: s.client,
    site: s.site,
    voucherNo: s.voucherNo,
    date: s.date,
    salesAmount: Number(s.amount || 0),
    paidAmount: Number(s.paidAmount || 0),
  }))
  .filter((row) => row.salesAmount - row.paidAmount > 0);

const linkedSalesIds = new Set(
  (state.bankTransactions || []).filter((row) => row.linkedSalesId).map((row) => String(row.linkedSalesId)),
);

const best = findBestClientDepositReceivableMatch(tx, receivableRows, tx?.linkedSubject || "크레세", {
  linkedSalesIds,
  clients: state.clients || [],
});
console.log("bestMatch", best);

const all = buildBankDepositMatchCandidates(tx, receivableRows, {
  linkedSalesIds,
  clients: state.clients || [],
  minScore: 0,
  limit: 5,
});
console.log(
  "topCandidates",
  all.map((c) => ({ salesId: c.salesId, client: c.client, score: c.score, reasons: c.reasons })),
);

const vouchers = (state.paymentVouchers || []).filter((v) => String(v.bankTransactionId) === TX_ID);
console.log("vouchersForTx", vouchers.length, vouchers);

const expense = (state.companyExpenses || []).find((e) => e.id === tx?.linkedCompanyExpenseId);
console.log("linkedExpense", expense || null);
