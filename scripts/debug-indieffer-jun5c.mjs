#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data } = getErpState();

const TX_ID = "936c2f0c-dca0-491d-b5a8-2bb6db1c9813";
const SALE_IDS = [3556, 3575, 3606, 3644];
const pvs = data.paymentVouchers || [];

for (const id of SALE_IDS) {
  const s = (data.sales || []).find((x) => Number(x.id) === id);
  const vpvs = pvs.filter((v) => String(v.salesId) === String(id));
  console.log({
    saleId: id,
    date: s?.date,
    site: s?.site,
    amount: s?.amount,
    paidAmount: s?.paidAmount,
    vouchers: vpvs.map((v) => ({
      id: v.id,
      date: v.date,
      finalAmount: v.finalAmount,
      bankTransactionId: v.bankTransactionId,
    })),
  });
}

const junIndieffer = pvs.filter(
  (v) => String(v.date || "").startsWith("2026-06-0") && String(v.client || "").includes("\uC778\uB514\uD37C"),
);
console.log("\nJun indieffer vouchers", junIndieffer.length, junIndieffer.map((v) => ({
  id: v.id,
  date: v.date,
  site: v.site,
  final: v.finalAmount,
  bank: v.bankTransactionId,
  salesId: v.salesId,
})));

const tx = (data.bankTransactions || []).find((r) => r.id === TX_ID);
console.log("\ntx link fields", {
  linkedPaymentVoucherId: tx?.linkedPaymentVoucherId,
  linkedSalesId: tx?.linkedSalesId,
  linkedSubject: tx?.linkedSubject,
  folderId: tx?.folderId,
  matchAutoLinked: tx?.matchAutoLinked,
});

// sum check
const unpaid = SALE_IDS.reduce((sum, id) => {
  const s = (data.sales || []).find((x) => Number(x.id) === id);
  const paid = pvs.filter((v) => String(v.salesId) === String(id)).reduce((a, v) => a + Number(v.finalAmount || v.amount || 0), 0);
  const u = Math.max(0, Number(s?.amount || 0) - paid);
  return sum + u;
}, 0);
console.log("\n4-sale unpaid sum", unpaid, "withVat", unpaid + Math.round(unpaid * 0.1));
