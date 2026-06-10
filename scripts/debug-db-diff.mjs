import { getDb, getErpState } from "../server/db.mjs";

function load(path) {
  process.env.DATABASE_PATH = path;
  getDb();
  return getErpState().data;
}

const cur = load(process.argv[2]);
const bak = load(process.argv[3]);

console.log("current clients:", (cur.clients||[]).length, "backup:", (bak.clients||[]).length);
console.log("current bank txs:", (cur.bankTransactions||[]).length, "backup:", (bak.bankTransactions||[]).length);

const curNames = new Set((cur.clients||[]).map(c => c.name));
const bakNames = new Set((bak.clients||[]).map(c => c.name));
const added = [...curNames].filter(n => !bakNames.has(n));
const removed = [...bakNames].filter(n => !curNames.has(n));
console.log("clients added:", added);
console.log("clients removed:", removed);

const curIds = new Set((cur.bankTransactions||[]).map(t => t.id));
const bakIds = new Set((bak.bankTransactions||[]).map(t => t.id));
const newTxs = (cur.bankTransactions||[]).filter(t => !bakIds.has(t.id));
console.log("new bank txs since backup:", newTxs.length);
newTxs.forEach(t => console.log(JSON.stringify({date:String(t.transactionAt).slice(0,10), deposit:t.deposit, cp:t.counterpartyName, desc:t.description, linkedSubject:t.linkedSubject})));

// search both for stain/???
for (const [label, data] of [["current", cur], ["backup", bak]]) {
  const hits = (data.bankTransactions||[]).filter(t => JSON.stringify(t).includes("\uC774\uC131\uAD6C") || JSON.stringify(t).includes("\uC2A4\uD14C\uC778"));
  console.log(`${label} stain/lee txs:`, hits.length);
  hits.forEach(t => console.log(JSON.stringify(t)));
}
