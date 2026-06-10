/**
 * Prod re-investigation: ???/??? May 2026 unpaid sales + deposit linking.
 */
import { getDb, getErpState } from "../server/db.mjs";
import {
  buildBankDepositMatchCandidates,
  findBestClientDepositReceivableMatch,
} from "../src/utils/bankReceivableMatch.ts";
import { resolveBankDepositMatchSubject } from "../src/utils/clientDepositAliases.ts";
import { getUnpaid } from "../src/utils/receivables.ts";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

const STAIN = "???";
const PERSON = "???";
const MAY_START = "2026-04-25";
const MAY_END = "2026-05-31";

function norm(s) {
  return String(s || "").toLowerCase();
}

function haystack(obj) {
  return norm(JSON.stringify(obj));
}

function inPeriod(dateStr, start, end) {
  const d = String(dateStr || "").slice(0, 10);
  return d >= start && d <= end;
}

function saleRow(s) {
  const paid = s.paidAmount ?? s.paid ?? 0;
  const amount = Number(s.amount || 0);
  const unpaid = getUnpaid(s);
  return {
    id: s.id,
    date: s.date,
    client: s.client,
    site: s.site,
    amount,
    paid,
    unpaid,
    voucherNo: s.voucherNo,
    memo: String(s.memo || "").slice(0, 80),
  };
}

function txRow(t) {
  return {
    id: t.id,
    date: String(t.transactionAt || "").slice(0, 10),
    deposit: t.deposit,
    withdrawal: t.withdrawal,
    counterparty: t.counterpartyName,
    description: t.description,
    memo: t.memo,
    linkedSubject: t.linkedSubject,
    linkedSalesId: t.linkedSalesId,
    linkedPaymentVoucherId: t.linkedPaymentVoucherId,
    matchAutoLinked: t.matchAutoLinked,
    subject: resolveBankDepositMatchSubject(t),
  };
}

console.log("=== DB PATH ===", process.env.DATABASE_PATH);
console.log("=== TOTALS ===", {
  sales: (state.sales || []).length,
  clients: (state.clients || []).length,
  bankTxs: (state.bankTransactions || []).length,
});

// 1. Clients search
console.log("\n=== CLIENTS (???/stain/???) ===");
const clientPatterns = ["???", "stain", "STAIN", "???"];
for (const c of state.clients || []) {
  const blob = haystack(c);
  if (clientPatterns.some((p) => blob.includes(norm(p)) || String(c.name || "").includes(p))) {
    console.log(JSON.stringify({
      name: c.name,
      manager: c.manager,
      phone: c.phone,
      depositNameAliases: c.depositNameAliases,
    }));
  }
}

// fuzzy client names
const fuzzyClients = (state.clients || []).filter((c) => {
  const n = norm(c.name);
  return n.includes("stain") || n.includes("??") || String(c.manager || "").includes(PERSON);
});
console.log("fuzzy client matches:", fuzzyClients.map((c) => c.name));

// 2. Sales broad search
console.log("\n=== SALES broad (client/site/memo/worker) ===");
const salesPatterns = ["???", "stain", "STAIN", "???"];
const broadSales = (state.sales || []).filter((s) => {
  const blob = haystack(s);
  return salesPatterns.some((p) => blob.includes(norm(p)) || blob.includes(p));
});
console.log("count:", broadSales.length);
for (const s of broadSales.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
  console.log(JSON.stringify(saleRow(s)));
}

// 3. May 2026 unpaid sales (any client) in period
console.log("\n=== MAY 2026 UNPAID SALES (all clients, Apr25-May31) ===");
const mayUnpaid = (state.sales || [])
  .filter((s) => inPeriod(s.date, MAY_START, MAY_END) && getUnpaid(s) > 0)
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));
console.log("count:", mayUnpaid.length);
for (const s of mayUnpaid) {
  console.log(JSON.stringify(saleRow(s)));
}

// 4. Stain-related unpaid in May
console.log("\n=== STAIN/??? UNPAID in May ===");
const stainMayUnpaid = mayUnpaid.filter((s) => {
  const blob = haystack(s);
  return salesPatterns.some((p) => blob.includes(norm(p)) || blob.includes(p));
});
console.log("count:", stainMayUnpaid.length);
for (const s of stainMayUnpaid) {
  console.log(JSON.stringify(saleRow(s)));
}

// 5. Exact client = ???
console.log("\n=== EXACT client='???' ALL DATES ===");
const exactStain = (state.sales || []).filter((s) => String(s.client || "").trim() === STAIN);
console.log("count:", exactStain.length);
for (const s of exactStain.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
  console.log(JSON.stringify(saleRow(s)));
}

// 6. Bank txs May 2026 with ???
console.log("\n=== BANK TX May 2026 (???) ===");
const mayLeeTxs = (state.bankTransactions || []).filter((t) => {
  const d = String(t.transactionAt || "").slice(0, 10);
  if (d < "2026-05-01" || d > MAY_END) return false;
  const blob = `${t.counterpartyName} ${t.description} ${t.memo} ${t.linkedSubject}`;
  return blob.includes(PERSON);
});
console.log("count:", mayLeeTxs.length);
for (const t of mayLeeTxs.sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))) {
  console.log(JSON.stringify(txRow(t)));
}

// 7. All May deposits with ??? or ??? anywhere
console.log("\n=== BANK TX Apr25-May31 deposits (stain/???/subject) ===");
const stainDeposits = (state.bankTransactions || []).filter((t) => {
  const d = String(t.transactionAt || "").slice(0, 10);
  if (d < MAY_START || d > MAY_END) return false;
  if (Number(t.deposit) <= 0) return false;
  const blob = `${t.counterpartyName} ${t.description} ${t.memo} ${t.linkedSubject} ${resolveBankDepositMatchSubject(t)}`;
  return blob.includes(STAIN) || blob.includes(PERSON) || norm(blob).includes("stain");
});
console.log("count:", stainDeposits.length);
for (const t of stainDeposits) {
  console.log(JSON.stringify(txRow(t)));
}

// 8. Match simulation
const receivableRows = (state.sales || [])
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

const linkedSalesIds = new Set(
  (state.bankTransactions || []).filter((row) => row.linkedSalesId).map((row) => String(row.linkedSalesId)),
);

const allLeeTxs = (state.bankTransactions || []).filter((t) => {
  const blob = `${t.counterpartyName} ${t.description} ${t.memo} ${t.linkedSubject}`;
  return blob.includes(PERSON) && Number(t.deposit) > 0;
});

console.log("\n=== MATCH SIMULATION (all ??? deposits) ===");
for (const tx of allLeeTxs.sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))) {
  console.log("\n--- TX", txRow(tx).date, txRow(tx).deposit, txRow(tx).counterparty, "---");

  const allCandidates = buildBankDepositMatchCandidates(tx, receivableRows, {
    linkedSalesIds,
    clients: state.clients || [],
    minScore: 0,
    limit: 15,
  });
  console.log("top candidates (minScore=0):");
  for (const c of allCandidates.slice(0, 8)) {
    console.log(JSON.stringify({
      salesId: c.salesId,
      client: c.client,
      site: c.site,
      saleDate: c.saleDate,
      unpaid: c.unpaid,
      score: c.score,
      reasons: c.reasons,
      finalAmount: c.finalAmount,
    }));
  }
  if (!allCandidates.length) console.log("  (no candidates at all � check amount/name match)");

  for (const clientName of [STAIN, tx.linkedSubject, "???", ...fuzzyClients.map((c) => c.name)].filter(Boolean)) {
    const trimmed = String(clientName || "").trim();
    if (!trimmed) continue;
    const best = findBestClientDepositReceivableMatch(tx, receivableRows, trimmed, {
      linkedSalesIds,
      clients: state.clients || [],
      minScore: 0,
    });
    if (best) {
      console.log(`findBest(${trimmed}):`, {
        salesId: best.salesId,
        score: best.score,
        reasons: best.reasons,
      });
    }
  }

  // diagnose why stain candidates fail
  const stainReceivables = receivableRows.filter((r) => {
    const blob = `${r.client} ${r.site}`;
    return blob.includes(STAIN) || norm(blob).includes("stain");
  });
  console.log("stain receivables count:", stainReceivables.length);
  for (const row of stainReceivables) {
    const unpaid = getUnpaid(row);
    const subject = resolveBankDepositMatchSubject(tx);
    const deposit = tx.deposit;
    const withVat = unpaid + Math.round(unpaid * 0.1);
    console.log("  receivable", row.id, row.client, row.site, {
      unpaid,
      deposit,
      exactMatch: deposit === unpaid,
      vatMatch: deposit === withVat,
      txBeforeSale: String(tx.transactionAt).slice(0, 10) < String(row.date).slice(0, 10),
      alreadyLinked: linkedSalesIds.has(String(row.id)),
    });
  }
}

// 9. Payment vouchers for stain sales
console.log("\n=== PAYMENT VOUCHERS for stain/??? sales ===");
const stainSaleIds = new Set(broadSales.map((s) => String(s.id)));
for (const v of state.paymentVouchers || []) {
  if (stainSaleIds.has(String(v.salesId)) || String(v.client || "").includes(STAIN)) {
    console.log(JSON.stringify({
      id: v.id,
      salesId: v.salesId,
      date: v.date,
      client: v.client,
      amount: v.amount,
      finalAmount: v.finalAmount,
      bankTransactionId: v.bankTransactionId,
    }));
  }
}

console.log("\n=== DONE ===");
