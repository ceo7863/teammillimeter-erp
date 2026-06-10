#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data } = getErpState();

const key = "\uC778\uB514\uD37C";
const TX_ID = "936c2f0c-dca0-491d-b5a8-2bb6db1c9813";
const TARGET = 2147200;

const archives = (data.pdfArchives || []).filter((a) => {
  const sub = String(a.subjectName || "");
  const cat = String(a.category || "");
  return sub.includes(key) || norm(sub).includes(norm(key));
});

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, "");
}

console.log("indieffer pdf archives", archives.length);
for (const a of archives.sort((x, y) => String(x.createdAt || x.sentAt || "").localeCompare(String(y.createdAt || y.sentAt || "")))) {
  console.log({
    id: a.id,
    category: a.category,
    subjectName: a.subjectName,
    periodStart: a.periodStart,
    periodEnd: a.periodEnd,
    statementTotalAmount: a.statementTotalAmount,
    depositStatus: a.depositStatus,
    linkedBankTransactionId: a.linkedBankTransactionId,
    linkedPaymentVoucherId: a.linkedPaymentVoucherId,
    shareToken: a.shareToken ? "yes" : "no",
    createdAt: a.createdAt,
    sentAt: a.sentAt,
    statementSalesIds: a.statementSalesIds?.length ? a.statementSalesIds.slice(0, 8) : a.statementSalesIds,
    statementView: a.statementView,
  });
}

const may29 = archives.filter((a) => {
  const created = String(a.createdAt || a.sentAt || "");
  return created.includes("2026-05-29") || created.includes("2025-05-29");
});
console.log("\nmay29 indieffer", may29);

const tx = (data.bankTransactions || []).find((r) => r.id === TX_ID);
console.log("\nbank tx", {
  id: tx?.id,
  at: tx?.transactionAt,
  deposit: tx?.deposit,
  cp: tx?.counterpartyName,
  linkedPdfArchiveId: tx?.linkedPdfArchiveId,
  linkedPaymentVoucherId: tx?.linkedPaymentVoucherId,
});

for (const a of archives) {
  const total = Number(a.statementTotalAmount || 0);
  const diff = Math.abs(total - TARGET);
  const diffVat = Math.abs(total * 1.1 - TARGET);
  console.log("\namount compare", a.id, { total, diff, diffVat, depositStatus: a.depositStatus });
}
