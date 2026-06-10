import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

const STAIN = "\uC2A4\uD14C\uC778"; // ???
const PERSON = "\uC774\uC131\uAD6C"; // ???

console.log("clients with stain:", (state.clients || []).filter(c => String(c.name||"").includes(STAIN)).map(c => ({name:c.name, manager:c.manager, aliases:c.depositNameAliases})));

console.log("clients with person:", (state.clients || []).filter(c => {
  const s = JSON.stringify(c);
  return s.includes(PERSON);
}).map(c => ({name:c.name, manager:c.manager, aliases:c.depositNameAliases})));

const allDeposits = (state.bankTransactions||[]).filter(t => Number(t.deposit||0) > 0);
console.log("total deposits:", allDeposits.length);

const personTxs = allDeposits.filter(t => {
  const blob = [t.counterpartyName, t.description, t.memo, t.linkedSubject].map(x => String(x||"")).join("|");
  return blob.includes(PERSON);
});
console.log("personTxs count:", personTxs.length);
for (const t of personTxs) {
  console.log(JSON.stringify({
    id: t.id, date: String(t.transactionAt).slice(0,10), deposit: t.deposit,
    cp: t.counterpartyName, desc: t.description, linkedSubject: t.linkedSubject,
    linkedPaymentVoucherId: t.linkedPaymentVoucherId, matchAutoLinked: t.matchAutoLinked,
    folderId: t.folderId, classificationKind: t.classificationKind,
  }));
}

const stainSales = (state.sales||[]).filter(s => String(s.client||"").trim() === STAIN);
console.log("stain sales:", stainSales.length);
for (const s of stainSales.slice(-10)) {
  console.log(JSON.stringify({id:s.id, date:s.date, site:s.site, amount:s.amount, paid:s.paidAmount, unpaid: Number(s.amount||0)-Number(s.paidAmount||0)}));
}

const stainTxs = allDeposits.filter(t => String(t.linkedSubject||"").includes(STAIN) || String(t.counterpartyName||"").includes(STAIN) || String(t.description||"").includes(STAIN));
console.log("stain related txs:", stainTxs.length);
for (const t of stainTxs.slice(-10)) {
  console.log(JSON.stringify({
    id: t.id, date: String(t.transactionAt).slice(0,10), deposit: t.deposit,
    cp: t.counterpartyName, linkedSubject: t.linkedSubject,
    linkedPaymentVoucherId: t.linkedPaymentVoucherId,
  }));
}

// recent unlinked client deposits
const unlinked = allDeposits.filter(t => !t.linkedPaymentVoucherId && t.classificationKind === "client").slice(-20);
console.log("recent unlinked client deposits:", unlinked.length);
for (const t of unlinked) {
  console.log(JSON.stringify({
    id: t.id.slice(0,8), date: String(t.transactionAt).slice(0,10), deposit: t.deposit,
    cp: t.counterpartyName, linkedSubject: t.linkedSubject,
  }));
}
