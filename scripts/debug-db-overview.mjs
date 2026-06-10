import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

const allClients = (state.clients || []).map(c => c.name).filter(Boolean).sort();
console.log("client count:", allClients.length);
console.log("clients sample:", allClients.slice(0, 30));
console.log("clients ending ?:", allClients.filter(n => n.includes("\uC2A4") || n.includes("\uC778")));

const deposits = (state.bankTransactions||[]).filter(t => Number(t.deposit||0) > 0);
console.log("deposits:", deposits.length);
console.log("recent 15 deposits:");
for (const t of deposits.sort((a,b) => String(b.transactionAt).localeCompare(String(a.transactionAt))).slice(0,15)) {
  console.log(JSON.stringify({
    date: String(t.transactionAt).slice(0,10), deposit: t.deposit, cp: t.counterpartyName,
    linkedSubject: t.linkedSubject, linked: !!t.linkedPaymentVoucherId, kind: t.classificationKind,
  }));
}

// search fuzzy
const needles = ["\uC774\uC131", "\uC131\uAD6C", "\uC2A4\uD14C", "\uD14C\uC778", "\uC6B0\uB9BC"];
for (const n of needles) {
  const txHits = deposits.filter(t => JSON.stringify(t).includes(n));
  const clientHits = (state.clients||[]).filter(c => JSON.stringify(c).includes(n));
  const saleHits = (state.sales||[]).filter(s => JSON.stringify(s).includes(n));
  console.log(`needle ${n}: txs=${txHits.length} clients=${clientHits.length} sales=${saleHits.length}`);
  if (clientHits.length) console.log("  clients:", clientHits.map(c=>c.name));
  if (txHits.length) txHits.forEach(t => console.log("  tx:", String(t.transactionAt).slice(0,10), t.deposit, t.counterpartyName, t.linkedSubject));
}

console.log("sales count:", (state.sales||[]).length);
console.log("bank tx count:", (state.bankTransactions||[]).length);
