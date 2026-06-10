/**
 * Full match simulation for ??? / ??? deposit on prod.
 */
import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

const STAIN = "\uC2A4\uD14C\uC778";
const PERSON = "\uC774\uC131\uAD6C";
const TX_ID = "ca3c6723-8e5e-453d-b54d-25bc8f6a4257";

function unpaid(s) {
  return Math.max(Number(s.amount || 0) - Number(s.paidAmount ?? s.paid ?? 0), 0);
}

const tx = (state.bankTransactions || []).find((t) => t.id === TX_ID);
if (!tx) {
  console.log("TX not found");
  process.exit(1);
}

const stainSales = (state.sales || []).filter((s) => String(s.client || "").trim() === STAIN);
const mayUnpaid = stainSales.filter((s) => unpaid(s) > 0);
const totalUnpaid = mayUnpaid.reduce((a, s) => a + unpaid(s), 0);
const totalWithVat = totalUnpaid + Math.round(totalUnpaid * 0.1);

console.log("=== DEPOSIT ===");
console.log(JSON.stringify({
  id: tx.id,
  date: String(tx.transactionAt).slice(0, 10),
  deposit: tx.deposit,
  cp: tx.counterpartyName,
  linkedSubject: tx.linkedSubject,
  linkedPaymentVoucherId: tx.linkedPaymentVoucherId,
  linkedSalesId: tx.linkedSalesId,
  folderId: tx.folderId,
  matchAutoLinked: tx.matchAutoLinked,
  classifiedAt: tx.classifiedAt,
}));

console.log("\n=== COMBINED AMOUNT CHECK ===");
console.log({ totalUnpaid, totalWithVat, deposit: tx.deposit, exactVatMatch: tx.deposit === totalWithVat, exactUnpaidMatch: tx.deposit === totalUnpaid });

console.log("\n=== PDF ARCHIVES (stain) ===");
const archives = (state.pdfArchives || []).filter((a) => String(a.client || "").trim() === STAIN || String(a.title || "").includes(STAIN));
console.log("count:", archives.length);
for (const a of archives) {
  console.log(JSON.stringify({
    id: a.id,
    client: a.client,
    sentAt: a.sentAt,
    periodStart: a.periodStart,
    periodEnd: a.periodEnd,
    totalAmount: a.totalAmount,
    statementTotalAmount: a.statementTotalAmount,
    paymentStatus: a.paymentStatus,
    statementSalesIds: a.statementSalesIds,
    linkedBankTransactionId: a.linkedBankTransactionId,
  }));
}

console.log("\n=== STATEMENT GENERATION LOGS (stain) ===");
const logs = (state.statementGenerationLogs || []).filter((l) => JSON.stringify(l).includes(STAIN));
for (const l of logs.slice(-5)) {
  console.log(JSON.stringify({ id: l.id, client: l.client, periodStart: l.periodStart, periodEnd: l.periodEnd, totalAmount: l.totalAmount }));
}

console.log("\n=== PER-SALE SCORE (manual) ===");
const deposit = Number(tx.deposit);
const subject = String(tx.linkedSubject || tx.counterpartyName || "");
const stainClient = (state.clients || []).find((c) => String(c.name || "").trim() === STAIN);

for (const s of mayUnpaid) {
  const u = unpaid(s);
  const vat = u + Math.round(u * 0.1);
  console.log(JSON.stringify({
    id: s.id,
    date: s.date,
    unpaid: u,
    withVat: vat,
    depositMatch: deposit === u || deposit === vat,
    pctOfTotal: Math.round((u / totalUnpaid) * 100) + "%",
  }));
}

console.log("\n=== WHY AUTO-LINK FAILS ===");
console.log([
  "1. ??? 2,882,000 = 3? ?? ??(2,620,000) + ??? 10% � ?? ?? ??",
  "2. ????(bankReceivableMatch)? 1? ???? ?? ?? � ?? ??(730k/1530k/360k)? ???",
  "3. ?? ?? ??: ?????? amountMatch=null ? ?? ?? (score 70 ??)",
  "4. linkedSubject=??? ??? ? ???? ??? OK, ??? ??",
  "5. sent statement PDF ??? statementSalesIds ???? ??? ??",
].join("\n"));

console.log("\n=== BANK FOLDERS (stain) ===");
const folders = (state.bankTransactionFolders || []).filter((f) => String(f.name || "").includes(STAIN));
console.log(folders.map((f) => ({ id: f.id, name: f.name })));

console.log("\n=== LEDGER RULES (stain/person) ===");
const rules = (state.bankLedgerRules || []).filter((r) => JSON.stringify(r).includes(STAIN) || JSON.stringify(r).includes(PERSON));
for (const r of rules) console.log(JSON.stringify(r));

console.log("\n=== DONE ===");
