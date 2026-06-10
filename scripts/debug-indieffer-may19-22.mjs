#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data } = getErpState();

const NEEDLE = "\uC778\uB514\uD37C"; // ???

function norm(s) {
  return String(s || "").replace(/\s/g, "").toLowerCase();
}

function getPaid(saleId) {
  return (data.paymentVouchers || [])
    .filter((v) => String(v.salesId) === String(saleId))
    .reduce((sum, v) => sum + Number(v.finalAmount || v.amount || 0), 0);
}

function matchesNeedle(value) {
  return norm(value).includes(norm(NEEDLE));
}

const clientNames = (data.clients || []).filter((c) => matchesNeedle(c.name) || matchesNeedle(c.depositNameAliases));
console.log("=== CLIENTS ===");
for (const c of clientNames) console.log({ id: c.id, name: c.name, businessNo: c.businessNo, aliases: c.depositNameAliases });

const sales = (data.sales || []).filter((s) => matchesNeedle(s.client));
console.log("\n=== ALL INDIEFFER SALES ===");
for (const s of sales.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
  const paid = getPaid(s.id);
  const unpaid = Math.max(0, Number(s.amount || 0) - paid);
  console.log({
    id: s.id,
    date: s.date,
    client: s.client,
    site: s.site,
    amount: s.amount,
    paid,
    unpaid,
    withVat: unpaid + Math.round(unpaid * 0.1),
    voucherNo: s.voucherNo,
  });
}

const maySales = sales.filter((s) => String(s.date || "").includes("-05-19") || String(s.date || "").includes("-05-22"));
console.log("\n=== MAY 19 / 22 SALES ===");
let sum = 0;
for (const s of maySales) {
  sum += Number(s.amount || 0);
  console.log({ id: s.id, date: s.date, amount: s.amount, site: s.site });
}
console.log("combined supply:", sum, "combined total with vat:", sum + Math.round(sum * 0.1));

const invoices = (data.taxInvoices || []).filter(
  (t) => matchesNeedle(t.client) && t.status === "issued" && t.flowType === "sales",
);
console.log("\n=== TAX INVOICES ===");
for (const t of invoices.sort((a, b) => String(a.issueDate).localeCompare(String(b.issueDate)))) {
  console.log({
    id: t.id,
    issueDate: t.issueDate,
    client: t.client,
    supply: t.supplyAmount,
    vat: t.vatAmount,
    total: t.totalAmount,
    memo: t.memo,
    invoiceNo: t.invoiceNo,
  });
}

console.log("\n=== AMOUNT MATCH CANDIDATES ===");
const combined = sum;
const combinedTotal = combined + Math.round(combined * 0.1);
for (const t of invoices) {
  console.log({
    issueDate: t.issueDate,
    supplyDiff: t.supplyAmount - combined,
    totalDiff: t.totalAmount - combinedTotal,
  });
}

const bankTxs = (data.bankTransactions || []).filter(
  (t) => matchesNeedle(t.counterpartyName) || matchesNeedle(t.description) || matchesNeedle(t.memo),
);
console.log("\n=== BANK TX (recent) ===");
for (const t of bankTxs.sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt))).slice(0, 8)) {
  console.log({
    id: t.id,
    at: t.transactionAt,
    deposit: t.deposit,
    counterparty: t.counterpartyName,
    linkedSalesId: t.linkedSalesId,
    linkedTaxInvoiceId: t.linkedTaxInvoiceId,
  });
}
