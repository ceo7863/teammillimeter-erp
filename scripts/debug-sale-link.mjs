import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);
const saleId = process.argv[3] || "3597";

const sale = (d.sales || []).find((s) => String(s.id) === String(saleId));
console.log("sale:", sale ? { id: sale.id, client: sale.client, site: sale.site, date: sale.date, amount: sale.amount, paid: sale.paid } : null);

const pvs = (d.paymentVouchers || []).filter((v) => {
  if (String(v.salesId) === String(saleId)) return true;
  return (v.statementSalesIds || []).some((id) => String(id) === String(saleId));
});
console.log("paymentVouchers:", pvs.map((v) => ({
  id: v.id,
  salesId: v.salesId,
  statementSalesIds: v.statementSalesIds,
  client: v.client,
  site: v.site,
  amount: v.amount,
  bankTransactionId: v.bankTransactionId,
})));

const txs = (d.bankTransactions || []).filter((t) => {
  if (String(t.linkedSalesId) === String(saleId)) return true;
  if (pvs.some((v) => v.bankTransactionId === t.id)) return true;
  if (pvs.some((v) => String(v.id) === String(t.linkedPaymentVoucherId))) return true;
  return false;
});
console.log("bankTx:", txs.map((t) => ({
  id: t.id,
  transactionAt: t.transactionAt,
  deposit: t.deposit,
  linkedSubject: t.linkedSubject,
  linkedPaymentVoucherId: t.linkedPaymentVoucherId,
  linkedSalesId: t.linkedSalesId,
  matchAutoLinked: t.matchAutoLinked,
})));

// simulate auto badge
const autoTxIds = new Set((d.bankTransactions || []).filter((t) => t.matchAutoLinked === true).map((t) => String(t.id)));
const linkedSaleIds = new Set();
for (const v of d.paymentVouchers || []) {
  if (!v.bankTransactionId || !autoTxIds.has(String(v.bankTransactionId))) continue;
  if (v.salesId != null && v.salesId !== "") linkedSaleIds.add(String(v.salesId));
  (v.statementSalesIds || []).forEach((id) => { if (id != null && id !== "") linkedSaleIds.add(String(id)); });
}
console.log("autoLinkedSaleIds has sale?", linkedSaleIds.has(String(saleId)));

// search bank tx by client name 우림 around 5-27
const urimTx = (d.bankTransactions || []).filter((t) => {
  const at = String(t.transactionAt || "");
  if (!at.includes("2026-05")) return false;
  const blob = JSON.stringify(t);
  return blob.includes("\uC6B0\uB984") || Number(t.deposit) === 520000;
});
console.log("urim May bank tx count:", urimTx.length);
for (const t of urimTx.slice(0, 10)) {
  console.log({
    id: t.id.slice(0, 12),
    at: t.transactionAt,
    deposit: t.deposit,
    linkedSubject: t.linkedSubject,
    linkedPaymentVoucherId: t.linkedPaymentVoucherId,
    linkedSalesId: t.linkedSalesId,
    matchAutoLinked: t.matchAutoLinked,
  });
}
