#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data } = getErpState();

const TARGET_SUPPLY = 8833600;
const TARGET_TOTAL = 9716960;
const DEPOSIT_MAY19 = 5000000;
const DEPOSIT_MAY22 = 4716960;

function getPaid(saleId) {
  return (data.paymentVouchers || [])
    .filter((v) => String(v.salesId) === String(saleId))
    .reduce((sum, v) => sum + Number(v.finalAmount || v.amount || 0), 0);
}

const sales = (data.sales || [])
  .filter((s) => String(s.client || "").includes("???"))
  .sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id));

console.log("=== MAY 2026 SALES with payment detail ===");
const maySales = sales.filter((s) => String(s.date || "").startsWith("2026-05"));
let sumAmount = 0;
for (const s of maySales) {
  const paid = getPaid(s.id);
  const pvs = (data.paymentVouchers || []).filter((v) => String(v.salesId) === String(s.id));
  sumAmount += Number(s.amount || 0);
  console.log({
    id: s.id,
    date: s.date,
    site: s.site,
    amount: s.amount,
    paid,
    bankTxIds: [...new Set(pvs.map((v) => v.bankTransactionId).filter(Boolean))],
  });
}
console.log("May sales supply sum:", sumAmount);

console.log("\n=== Find subset summing to", TARGET_SUPPLY, "===");
// sales from 5/6 to 5/18 perhaps - before 5/19 deposit
const candidates = maySales.filter((s) => s.date >= "2026-05-06" && s.date <= "2026-05-18");
let candSum = 0;
for (const s of candidates) {
  candSum += Number(s.amount || 0);
}
console.log("5/6-5/18 sum:", candSum, "with vat:", candSum + Math.round(candSum * 0.1));

const candidates2 = maySales.filter((s) => s.date >= "2026-05-06" && s.date <= "2026-05-21");
let cand2Sum = 0;
for (const s of candidates2) {
  cand2Sum += Number(s.amount || 0);
}
console.log("5/6-5/21 sum:", cand2Sum, "with vat:", cand2Sum + Math.round(cand2Sum * 0.1));

// try all may sales
let allMay = 0;
for (const s of maySales) allMay += Number(s.amount || 0);
console.log("all May sum:", allMay, "with vat:", allMay + Math.round(allMay * 0.1));

console.log("\n=== TAX INVOICE 5/22 ===");
const inv522 = (data.taxInvoices || []).filter(
  (t) => t.issueDate === "2026-05-22" && String(t.client).includes("???"),
);
for (const t of inv522) {
  console.log({ id: t.id, supply: t.supplyAmount, total: t.totalAmount, invoiceNo: t.invoiceNo, status: t.status });
}

console.log("\n=== BANK TX 5/19 + 5/22 ===");
const txs = (data.bankTransactions || []).filter(
  (t) =>
    String(t.counterpartyName || "").includes("???") &&
    (String(t.transactionAt).startsWith("2026-05-19") || String(t.transactionAt).startsWith("2026-05-22")),
);
for (const t of txs) {
  console.log({
    id: t.id,
    at: t.transactionAt,
    deposit: t.deposit,
    linkedTaxInvoiceId: t.linkedTaxInvoiceId,
    linkedSalesId: t.linkedSalesId,
  });
}
console.log("deposit sum:", txs.reduce((s, t) => s + Number(t.deposit || 0), 0));

// April late + early May?
const rangeSales = sales.filter((s) => s.date >= "2026-04-28" && s.date <= "2026-05-18");
let rangeSum = 0;
for (const s of rangeSales) {
  rangeSum += Number(s.amount || 0);
}
console.log("\n4/28-5/18 sales sum:", rangeSum, "with vat:", rangeSum + Math.round(rangeSum * 0.1));
