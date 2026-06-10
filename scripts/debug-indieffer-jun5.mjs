#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data, version } = getErpState();

const TARGET_AMOUNT = 2147200;
const TX_ID = "936c2f0c-dca0-491d-b5a8-2bb6db1c9813";
const CLIENT_KEY = "\uC778\uB514\uD37C";
const CORP_PREFIX = "\uC8FC\uC2DD\uD68C\uC0AC";

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, "");
}

function getPaidForSale(salesId, paymentVouchers) {
  return paymentVouchers
    .filter((v) => String(v.salesId) === String(salesId))
    .reduce((sum, v) => sum + Number(v.finalAmount || v.amount || 0), 0);
}

function getUnpaid(sale, paymentVouchers) {
  const amount = Number(sale.amount || 0);
  const paid = Number(sale.paidAmount || 0) || getPaidForSale(sale.id, paymentVouchers);
  return Math.max(0, amount - paid);
}

const tx = (data.bankTransactions || []).find((row) => row.id === TX_ID);
const paymentVouchers = data.paymentVouchers || [];
const sales = data.sales || [];
const clients = data.clients || [];

console.log("version", version);
console.log("tx", tx);

const key = norm(CLIENT_KEY);
const indiefferClients = clients.filter(
  (c) => norm(c.name).includes(key) || norm(c.depositNameAliases || "").includes(key),
);
console.log("\nclients", indiefferClients);

const indiefferSales = sales.filter((s) => norm(s.client).includes(key));
console.log("\nindieffer sales count", indiefferSales.length);
for (const s of indiefferSales.slice(-15)) {
  const unpaid = getUnpaid(s, paymentVouchers);
  const withVat = unpaid + Math.round(unpaid * 0.1);
  console.log({
    id: s.id,
    date: s.date,
    client: s.client,
    site: s.site,
    amount: s.amount,
    paidAmount: s.paidAmount,
    computedUnpaid: unpaid,
    withVat,
    matchesDepositExact: unpaid === TARGET_AMOUNT || withVat === TARGET_AMOUNT,
    voucherNo: s.voucherNo,
  });
}

const indiefferPvs = paymentVouchers.filter((v) => norm(v.client).includes(key));
console.log("\nindieffer vouchers count", indiefferPvs.length);
for (const v of indiefferPvs.slice(-10)) {
  console.log({
    id: v.id,
    date: v.date,
    client: v.client,
    site: v.site,
    finalAmount: v.finalAmount,
    amount: v.amount,
    bankTransactionId: v.bankTransactionId,
    salesId: v.salesId,
  });
}

console.log("\nall sales with unpaid or withVat = 2147200");
for (const s of sales) {
  const unpaid = getUnpaid(s, paymentVouchers);
  if (unpaid <= 0) continue;
  const withVat = unpaid + Math.round(unpaid * 0.1);
  if (unpaid === TARGET_AMOUNT || withVat === TARGET_AMOUNT) {
    console.log({
      id: s.id,
      date: s.date,
      client: s.client,
      site: s.site,
      amount: s.amount,
      unpaid,
      withVat,
    });
  }
}

const cp = norm(tx?.counterpartyName);
const clientMatch = clients.find((c) => {
  const name = norm(c.name);
  const aliases = norm(c.depositNameAliases || "");
  const cpShort = cp.replace(new RegExp(CORP_PREFIX, "g"), "");
  return cp.includes(name) || name.includes(cpShort) || aliases.split(",").some((a) => a && cp.includes(a));
});
console.log("\ncounterparty client match", clientMatch);
