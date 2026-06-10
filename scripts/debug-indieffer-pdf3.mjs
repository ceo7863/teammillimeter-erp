#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";
import { listPdfArchiveMetas, listSentStatementArchiveMetas } from "../server/pdfArchive.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();

const key = "\uC778\uB514\uD37C";
const all = listPdfArchiveMetas();
const sent = listSentStatementArchiveMetas();

console.log("total", all.length, "sentViaLink", sent.length);

for (const a of all.filter((x) => String(x.subjectName || "").includes(key))) {
  console.log("\n=== indieffer ===");
  console.log(JSON.stringify(a, null, 2));
}

for (const a of all.filter((x) => String(x.createdAt || "").includes("2026-05-29"))) {
  console.log("\n=== may29 ===");
  console.log(JSON.stringify({
    id: a.id,
    subjectName: a.subjectName,
    category: a.category,
    statementTotalAmount: a.statementTotalAmount,
    paymentStatus: a.paymentStatus,
    sentViaLink: a.sentViaLink,
    createdAt: a.createdAt,
    periodStart: a.periodStart,
    periodEnd: a.periodEnd,
    statementSalesIds: a.statementSalesIds,
    linkedBankTransactionId: a.linkedBankTransactionId,
  }, null, 2));
}

const db = getDb();
const rows = db.prepare("SELECT id, subject_name, created_at, statement_total_amount, payment_status, sent_via_link, category FROM pdf_archives WHERE subject_name LIKE ? ORDER BY created_at DESC").all(`%${key}%`);
console.log("\nSQL indieffer rows", rows);

const { data } = getErpState();
const tx = (data.bankTransactions || []).find((r) => r.id === "936c2f0c-dca0-491d-b5a8-2bb6db1c9813");
console.log("\ntx deposit", tx?.deposit);

// check VAT: if statement is 1952000 and deposit 2147200
for (const a of all.filter((x) => String(x.subjectName || "").includes(key))) {
  const total = Number(a.statementTotalAmount || 0);
  const withVat = total + Math.round(total * 0.1);
  console.log("\namount check", {
    id: a.id,
    total,
    withVat,
    deposit: tx?.deposit,
    exactMatch: total === tx?.deposit || withVat === tx?.deposit,
    matchable: a.sentViaLink && a.category === "statement-client" && a.paymentStatus !== "confirmed" && total > 0,
  });
}
