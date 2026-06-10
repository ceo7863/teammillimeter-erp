/**
 * Prod investigation using unicode escapes (encoding-safe).
 */
import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

const STAIN = "\uC2A4\uD14C\uC778";
const PERSON = "\uC774\uC131\uAD6C";

function unpaid(s) {
  return Math.max(Number(s.amount || 0) - Number(s.paidAmount ?? s.paid ?? 0), 0);
}

function subject(tx) {
  return String(tx.linkedSubject || tx.counterpartyName || tx.description || "").trim();
}

console.log("=== STAIN SALES (all dates) ===");
const stainSales = (state.sales || []).filter((s) => String(s.client || "").trim() === STAIN);
console.log("count:", stainSales.length);
for (const s of stainSales.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
  console.log(JSON.stringify({ id: s.id, date: s.date, client: s.client, site: s.site, amount: s.amount, paid: s.paidAmount ?? s.paid ?? 0, unpaid: unpaid(s), memo: s.memo }));
}

console.log("\n=== MAY 2026 STAIN UNPAID ===");
const mayUnpaid = stainSales.filter((s) => String(s.date || "").startsWith("2026-05") && unpaid(s) > 0);
console.log("count:", mayUnpaid.length, "total unpaid:", mayUnpaid.reduce((a, s) => a + unpaid(s), 0));
for (const s of mayUnpaid) {
  console.log(JSON.stringify({ id: s.id, date: s.date, site: s.site, amount: s.amount, unpaid: unpaid(s) }));
}

console.log("\n=== CLIENT RECORD ===");
const stainClient = (state.clients || []).find((c) => String(c.name || "").trim() === STAIN);
console.log(stainClient ? JSON.stringify({ name: stainClient.name, manager: stainClient.manager, depositNameAliases: stainClient.depositNameAliases }) : "NOT FOUND in clients table");

// similar client names
const similar = (state.clients || []).filter((c) => {
  const n = String(c.name || "");
  return n.includes("\uC2A4\uD14C") || String(c.manager || "").includes(PERSON);
});
console.log("similar clients:", similar.map((c) => ({ name: c.name, manager: c.manager, aliases: c.depositNameAliases })));

console.log("\n=== BANK: PERSON deposits (all dates) ===");
const leeTxs = (state.bankTransactions || []).filter((t) => {
  const b = [t.counterpartyName, t.description, t.memo, t.linkedSubject].join(" ");
  return b.includes(PERSON) && Number(t.deposit) > 0;
});
console.log("count:", leeTxs.length);
for (const t of leeTxs.sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))) {
  console.log(JSON.stringify({
    id: t.id,
    date: String(t.transactionAt).slice(0, 10),
    deposit: t.deposit,
    cp: t.counterpartyName,
    desc: t.description,
    linkedSubject: t.linkedSubject,
    linkedPaymentVoucherId: t.linkedPaymentVoucherId,
    linkedSalesId: t.linkedSalesId,
    matchAutoLinked: t.matchAutoLinked,
  }));
}

console.log("\n=== BANK: May 2026 all deposits with PERSON or STAIN ===");
const mayDeposits = (state.bankTransactions || []).filter((t) => {
  const d = String(t.transactionAt || "").slice(0, 10);
  if (d < "2026-05-01" || d > "2026-05-31" || Number(t.deposit) <= 0) return false;
  const b = [t.counterpartyName, t.description, t.memo, t.linkedSubject].join(" ");
  return b.includes(PERSON) || b.includes(STAIN);
});
console.log("count:", mayDeposits.length);
for (const t of mayDeposits) console.log(JSON.stringify({ date: String(t.transactionAt).slice(0, 10), deposit: t.deposit, cp: t.counterpartyName, desc: t.description, linkedSubject: t.linkedSubject }));

console.log("\n=== MATCH DIAGNOSIS per Lee deposit ===");
const linkedSalesIds = new Set((state.bankTransactions || []).filter((r) => r.linkedSalesId).map((r) => String(r.linkedSalesId)));
const stainReceivables = stainSales.filter((s) => unpaid(s) > 0);

for (const tx of leeTxs) {
  const dep = Number(tx.deposit || 0);
  const txDate = String(tx.transactionAt || "").slice(0, 10);
  const subj = subject(tx);
  console.log(`\nTX ${txDate} ${dep} subject="${subj}" linked=${!!tx.linkedPaymentVoucherId}`);

  for (const s of stainReceivables) {
    const u = unpaid(s);
    const withVat = u + Math.round(u * 0.1);
    const reasons = [];
    if (dep !== u && dep !== withVat) reasons.push(`amount mismatch (deposit=${dep}, unpaid=${u}, vat=${withVat})`);
    if (txDate < String(s.date).slice(0, 10)) reasons.push("deposit before sale date");
    if (linkedSalesIds.has(String(s.id))) reasons.push("sale already linked");
    if (!subj.includes(STAIN) && !subj.includes(PERSON)) reasons.push(`name mismatch: subject="${subj}" vs client="${s.client}"`);
    if (!stainClient && !subj.includes(STAIN)) reasons.push("no client record + no linkedSubject=STAIN");
    console.log("  sale", s.id, s.date, s.site, "unpaid", u, "fail:", reasons.length ? reasons : ["would match if score>=70"]);
  }
}

console.log("\n=== PAYMENT VOUCHERS for stain sales ===");
const stainIds = new Set(stainSales.map((s) => String(s.id)));
for (const v of state.paymentVouchers || []) {
  if (stainIds.has(String(v.salesId))) {
    console.log(JSON.stringify({ id: v.id, salesId: v.salesId, date: v.date, amount: v.amount, bankTx: v.bankTransactionId }));
  }
}

console.log("\n=== AUDIT (stain/person) last 10 ===");
const audits = (state.auditLogs || []).filter((l) => JSON.stringify(l).includes(STAIN) || JSON.stringify(l).includes(PERSON));
for (const a of audits.slice(-10)) {
  console.log(JSON.stringify({ at: a.createdAt, type: a.entityType, label: a.entityLabel, action: a.action }));
}

console.log("\n=== DONE ===");
