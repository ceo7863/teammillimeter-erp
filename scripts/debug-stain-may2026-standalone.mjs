/**
 * Standalone prod investigation � no TS imports.
 */
import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

const STAIN = "???";
const PERSON = "???";
const MAY_START = "2026-04-25";
const MAY_END = "2026-05-31";

function getUnpaid(row) {
  const amount = Number(row.amount ?? row.salesAmount ?? 0);
  const paid = Number(row.paidAmount ?? row.paid ?? 0);
  return Math.max(amount - paid, 0);
}

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

function resolveSubject(tx) {
  const ls = String(tx.linkedSubject || "").trim();
  if (ls) return ls;
  return String(tx.counterpartyName || tx.description || "").trim();
}

function saleRow(s) {
  return {
    id: s.id,
    date: s.date,
    client: s.client,
    site: s.site,
    amount: Number(s.amount || 0),
    paid: Number(s.paidAmount ?? s.paid ?? 0),
    unpaid: getUnpaid(s),
    voucherNo: s.voucherNo,
    memo: String(s.memo || "").slice(0, 100),
  };
}

function txRow(t) {
  return {
    id: t.id,
    date: String(t.transactionAt || "").slice(0, 10),
    deposit: t.deposit,
    counterparty: t.counterpartyName,
    description: t.description,
    linkedSubject: t.linkedSubject,
    linkedSalesId: t.linkedSalesId,
    linkedPaymentVoucherId: t.linkedPaymentVoucherId,
    matchAutoLinked: t.matchAutoLinked,
    subject: resolveSubject(t),
  };
}

function amountMatchReason(deposit, unpaid) {
  if (unpaid <= 0) return null;
  const withVat = unpaid + Math.round(unpaid * 0.1);
  if (deposit === unpaid) return { score: 45, reason: "??? ?? ??" };
  if (deposit === withVat) return { score: 45, reason: "??? ?? ??" };
  if (deposit < unpaid && deposit >= unpaid * 0.95) return { score: 30, reason: "?? ??" };
  if (deposit > unpaid && deposit <= withVat + Math.max(1000, Math.round(unpaid * 0.02)))
    return { score: 28, reason: "??? ??" };
  return null;
}

console.log("=== DB ===", process.env.DATABASE_PATH);
console.log("totals:", {
  sales: (state.sales || []).length,
  clients: (state.clients || []).length,
  bankTxs: (state.bankTransactions || []).length,
});

console.log("\n=== CLIENTS ===");
for (const c of state.clients || []) {
  const blob = haystack(c);
  if (blob.includes("???") || blob.includes("stain") || blob.includes("???")) {
    console.log(JSON.stringify({ name: c.name, manager: c.manager, depositNameAliases: c.depositNameAliases }));
  }
}

// all client names containing ??
console.log("\nclient names with '??':", (state.clients || []).filter((c) => String(c.name || "").includes("??")).map((c) => c.name));

console.log("\n=== SALES (broad stain/???) ===");
const patterns = ["???", "stain", "???"];
const broadSales = (state.sales || []).filter((s) => patterns.some((p) => haystack(s).includes(norm(p)) || haystack(s).includes(p)));
console.log("count:", broadSales.length);
for (const s of broadSales.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
  console.log(JSON.stringify(saleRow(s)));
}

console.log("\n=== EXACT client='???' ===");
const exactStain = (state.sales || []).filter((s) => String(s.client || "").trim() === STAIN);
console.log("count:", exactStain.length);
for (const s of exactStain.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
  console.log(JSON.stringify(saleRow(s)));
}

console.log("\n=== MAY UNPAID (Apr25-May31, all clients) ===");
const mayUnpaid = (state.sales || [])
  .filter((s) => inPeriod(s.date, MAY_START, MAY_END) && getUnpaid(s) > 0)
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));
console.log("count:", mayUnpaid.length);
for (const s of mayUnpaid) {
  console.log(JSON.stringify(saleRow(s)));
}

console.log("\n=== MAY UNPAID stain/??? related ===");
const stainMayUnpaid = mayUnpaid.filter((s) => patterns.some((p) => haystack(s).includes(norm(p)) || haystack(s).includes(p)));
console.log("count:", stainMayUnpaid.length);
for (const s of stainMayUnpaid) {
  console.log(JSON.stringify(saleRow(s)));
}

console.log("\n=== BANK: May ??? ===");
const mayLee = (state.bankTransactions || []).filter((t) => {
  const d = String(t.transactionAt || "").slice(0, 10);
  if (d < "2026-05-01" || d > MAY_END) return false;
  const blob = `${t.counterpartyName} ${t.description} ${t.memo} ${t.linkedSubject}`;
  return blob.includes(PERSON);
});
for (const t of mayLee) console.log(JSON.stringify(txRow(t)));

console.log("\n=== BANK: Apr25-May31 stain/??? deposits ===");
const stainDeps = (state.bankTransactions || []).filter((t) => {
  const d = String(t.transactionAt || "").slice(0, 10);
  if (d < MAY_START || d > MAY_END || Number(t.deposit) <= 0) return false;
  const blob = `${t.counterpartyName} ${t.description} ${t.memo} ${t.linkedSubject}`;
  return blob.includes(STAIN) || blob.includes(PERSON) || norm(blob).includes("stain");
});
for (const t of stainDeps) console.log(JSON.stringify(txRow(t)));

console.log("\n=== ALL ??? deposits (any date) ===");
const allLeeDeps = (state.bankTransactions || []).filter((t) => {
  const blob = `${t.counterpartyName} ${t.description} ${t.memo}`;
  return blob.includes(PERSON) && Number(t.deposit) > 0;
});
for (const t of allLeeDeps.sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))) {
  console.log(JSON.stringify(txRow(t)));
}

console.log("\n=== MATCH DIAGNOSIS ===");
const linkedSalesIds = new Set(
  (state.bankTransactions || []).filter((r) => r.linkedSalesId).map((r) => String(r.linkedSalesId)),
);
const receivables = (state.sales || []).filter((s) => getUnpaid(s) > 0);

for (const tx of allLeeDeps) {
  const subject = resolveSubject(tx);
  const deposit = Number(tx.deposit || 0);
  const txDate = String(tx.transactionAt || "").slice(0, 10);
  console.log(`\nTX ${txDate} ${deposit} cp=${tx.counterpartyName} subject=${subject} linked=${!!tx.linkedPaymentVoucherId}`);

  const stainRecv = receivables.filter((s) => {
    const c = String(s.client || "");
    return c === STAIN || c.includes("???") || norm(c).includes("stain") || haystack(s).includes("???");
  });

  if (!stainRecv.length) {
    console.log("  NO unpaid receivables for stain/???");
    // show closest amount matches any client
    const amountHits = receivables
      .filter((s) => inPeriod(s.date, "2026-04-01", MAY_END))
      .map((s) => ({ ...saleRow(s), amtMatch: amountMatchReason(deposit, getUnpaid(s)) }))
      .filter((s) => s.amtMatch)
      .slice(0, 5);
    console.log("  amount-only matches in period:", amountHits);
    continue;
  }

  for (const s of stainRecv) {
    const unpaid = getUnpaid(s);
    const am = amountMatchReason(deposit, unpaid);
    const txBefore = txDate && s.date && txDate < String(s.date).slice(0, 10);
    const linked = linkedSalesIds.has(String(s.id));
    console.log(
      "  sale",
      JSON.stringify({
        id: s.id,
        date: s.date,
        client: s.client,
        site: s.site,
        unpaid,
        deposit,
        amountMatch: am,
        nameMatch: subject.includes(STAIN) || subject.includes(PERSON) || String(s.client).includes(subject),
        txBeforeSale: txBefore,
        alreadyLinked: linked,
        failReasons: [
          !am ? "?? ???" : null,
          txBefore ? "???? ????? ??" : null,
          linked ? "?? ?? ??? ???" : null,
          !(subject.includes(STAIN) || subject.includes(PERSON)) ? `????(${subject})????(${s.client})` : null,
        ].filter(Boolean),
      }),
    );
  }
}

console.log("\n=== PAYMENT VOUCHERS (stain sales) ===");
const stainIds = new Set(broadSales.map((s) => String(s.id)));
for (const v of state.paymentVouchers || []) {
  if (stainIds.has(String(v.salesId)) || String(v.client || "").includes(STAIN)) {
    console.log(JSON.stringify({ id: v.id, salesId: v.salesId, date: v.date, client: v.client, amount: v.amount, bankTx: v.bankTransactionId }));
  }
}

console.log("\n=== DONE ===");
