#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data } = getErpState();

const TARGET = 2147200;
const key = "\uC778\uB514\uD37C";

function getPaidForSale(salesId, pvs) {
  return pvs.filter((v) => String(v.salesId) === String(salesId)).reduce((s, v) => s + Number(v.finalAmount || v.amount || 0), 0);
}
function getUnpaid(sale, pvs) {
  const amount = Number(sale.amount || 0);
  const paid = Number(sale.paidAmount || 0) || getPaidForSale(sale.id, pvs);
  return Math.max(0, amount - paid);
}

const pvs = data.paymentVouchers || [];
const sales = (data.sales || []).filter((s) => String(s.client || "").includes(key));

const unpaidRows = sales
  .map((s) => {
    const unpaid = getUnpaid(s, pvs);
    const withVat = unpaid + Math.round(unpaid * 0.1);
    return { id: s.id, date: s.date, site: s.site, amount: s.amount, unpaid, withVat };
  })
  .filter((r) => r.unpaid > 0)
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

console.log("unpaid indieffer sales", unpaidRows.length);
for (const r of unpaidRows) console.log(r);

const sumUnpaid = unpaidRows.reduce((s, r) => s + r.unpaid, 0);
const sumWithVat = unpaidRows.reduce((s, r) => s + r.withVat, 0);
console.log("\ntotal unpaid", sumUnpaid, "total withVat", sumWithVat);

function findSubsetSum(rows, target, useVat = false) {
  const items = rows.map((r) => ({ ...r, val: useVat ? r.withVat : r.unpaid }));
  const results = [];
  function dfs(i, picked, sum) {
    if (sum === target && picked.length) {
      results.push([...picked]);
      return;
    }
    if (i >= items.length || sum > target) return;
    dfs(i + 1, picked, sum);
    dfs(i + 1, [...picked, items[i]], sum + items[i].val);
  }
  dfs(0, [], 0);
  return results.slice(0, 5);
}

console.log("\nsubset unpaid = target", findSubsetSum(unpaidRows, TARGET, false));
console.log("subset withVat = target", findSubsetSum(unpaidRows, TARGET, true));

const archives = (data.pdfArchives || []).filter((a) => String(a.subjectName || "").includes(key));
console.log("\nindieffer pdf archives", archives.slice(-5).map((a) => ({
  id: a.id,
  subject: a.subjectName,
  period: `${a.periodStart}~${a.periodEnd}`,
  total: a.statementTotalAmount,
  linkedBank: a.linkedBankTransactionId,
  status: a.depositStatus,
})));

const sent = archives.filter((a) => {
  const total = Number(a.statementTotalAmount || 0);
  return Math.abs(total - TARGET) <= 1 || Math.abs(total * 1.1 - TARGET) <= 1000;
});
console.log("\narchives matching amount", sent);
