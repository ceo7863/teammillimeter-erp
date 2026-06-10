import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

const salesWithLee = (state.sales||[]).filter(s => JSON.stringify(s).includes("\uC774\uC131"));
console.log("=== SALES with ?? ===");
for (const s of salesWithLee) {
  console.log(JSON.stringify({id:s.id, date:s.date, client:s.client, site:s.site, amount:s.amount, paid:s.paidAmount, worker:s.worker, memo:s.memo}));
}

const salesWithStain = (state.sales||[]).filter(s => JSON.stringify(s).includes("\uC2A4\uD14C"));
console.log("\n=== SALES with ?? ===");
for (const s of salesWithStain) {
  console.log(JSON.stringify({id:s.id, date:s.date, client:s.client, site:s.site, amount:s.amount, paid:s.paidAmount}));
}

// 711338 deposit full detail
const tx711 = (state.bankTransactions||[]).find(t => Number(t.deposit) === 711338);
console.log("\n=== TX 711338 ===");
console.log(JSON.stringify(tx711, null, 2));

// all unlinked deposits with no cp in recent dates
const recent = (state.bankTransactions||[]).filter(t => Number(t.deposit)>0 && !t.linkedPaymentVoucherId)
  .sort((a,b) => String(b.transactionAt).localeCompare(String(a.transactionAt)));
console.log("\n=== ALL UNLINKED DEPOSITS ===");
for (const t of recent) {
  console.log(JSON.stringify({
    id: t.id, date: String(t.transactionAt).slice(0,10), deposit: t.deposit,
    cp: t.counterpartyName, desc: t.description, memo: t.memo,
    linkedSubject: t.linkedSubject, folderId: t.folderId, kind: t.classificationKind,
    matchAutoLinked: t.matchAutoLinked,
  }));
}

// check urim client
const urim = (state.clients||[]).find(c => c.name === "\uC6B0\uB9BC");
console.log("\n=== ?? client ===");
console.log(JSON.stringify({name: urim?.name, manager: urim?.manager, aliases: urim?.depositNameAliases}));

// pdf archives with stain or lee
const pdfs = (state.pdfArchives||[]).filter(a => JSON.stringify(a).includes("\uC2A4\uD14C") || JSON.stringify(a).includes("\uC774\uC131"));
console.log("\n=== PDF archives ===");
for (const a of pdfs) {
  console.log(JSON.stringify({id:a.id, client:a.client, title:a.title, sentAt:a.sentAt, total:a.totalAmount, paymentStatus:a.paymentStatus, linkedBank:a.linkedBankTransactionId}));
}
