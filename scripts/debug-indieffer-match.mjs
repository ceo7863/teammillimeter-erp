#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";
import { listSentStatementArchiveMetas } from "../server/pdfArchive.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data } = getErpState();

const txId = "936c2f0c-dca0-491d-b5a8-2bb6db1c9813";
const tx = (data.bankTransactions || []).find((r) => r.id === txId);
const archives = listSentStatementArchiveMetas();
const pdf = archives.find((a) => a.id === "pdf-1780035475677-43c027ef");

// inline match simulation
function normalizeMatchText(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, "").replace(/[^\w\uAC00-\uD7A3]/g, "");
}
function includesDepositName(subject, name) {
  const sub = normalizeMatchText(subject);
  const n = normalizeMatchText(name);
  if (!sub || !n || n.length < 2) return false;
  return sub.includes(n) || n.includes(sub);
}
function resolveSubject(tx) {
  return [tx.counterpartyName, tx.description, tx.memo].map((p) => String(p || "").trim()).filter(Boolean).join(" ");
}

const subject = resolveSubject(tx);
const nameMatch = includesDepositName(subject, pdf?.subjectName || "");
const deposit = tx.deposit;
const total = pdf?.statementTotalAmount || 0;
const amountMatch = deposit === total;

console.log({
  subject,
  pdfSubject: pdf?.subjectName,
  nameMatch,
  deposit,
  statementTotal: total,
  amountMatch,
  scoreEstimate: (amountMatch ? 50 : 0) + (nameMatch ? 40 : 0),
  pdf,
  txCreatedAt: tx.createdAt,
  importBatchId: tx.importBatchId,
});

// Was tx in addedIds on import? Check if duplicate merge happened
const dupes = (data.bankTransactions || []).filter(
  (r) =>
    r.transactionAt === tx.transactionAt &&
    r.deposit === tx.deposit &&
    r.counterpartyName === tx.counterpartyName &&
    r.id !== tx.id,
);
console.log("\ndupes same fingerprint", dupes.length, dupes.map((d) => d.id));

// git history - when was auto-link on import added? Maybe after 6/6 import
console.log("\ntx import date", tx.createdAt, "pdf date", pdf?.createdAt);
