#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data } = getErpState();

const archives = data.pdfArchives || [];
console.log("total pdfArchives", archives.length);

const pending = archives.filter((a) => {
  const st = String(a.depositStatus || a.paymentStatus || "");
  return st.includes("\uC785\uAE08\uB300\uAE30") || st === "pending" || st === "awaiting";
});
console.log("deposit pending count", pending.length);
for (const a of pending.slice(0, 30)) {
  console.log({
    id: a.id,
    subject: a.subjectName,
    category: a.category,
    total: a.statementTotalAmount,
    status: a.depositStatus,
    createdAt: a.createdAt,
    period: `${a.periodStart}~${a.periodEnd}`,
    linkedBank: a.linkedBankTransactionId,
  });
}

const may29All = archives.filter((a) => String(a.createdAt || "").includes("2026-05-29"));
console.log("\nall may29 archives", may29All.length);
for (const a of may29All) {
  console.log({
    id: a.id,
    subject: a.subjectName,
    category: a.category,
    total: a.statementTotalAmount,
    status: a.depositStatus,
    createdAt: a.createdAt,
    period: `${a.periodStart}~${a.periodEnd}`,
    salesIds: a.statementSalesIds?.length,
  });
}

const sentClient = archives.filter((a) => String(a.category || "").includes("statement"));
console.log("statement category count", sentClient.length);

// fuzzy search indieffer
const fuzzy = archives.filter((a) => JSON.stringify(a).includes("\uC778\uB514") || JSON.stringify(a).includes("indif") || JSON.stringify(a).includes("Indi"));
console.log("\nfuzzy indieffer", fuzzy.length);
for (const a of fuzzy) console.log(JSON.stringify(a, null, 0).slice(0, 500));
