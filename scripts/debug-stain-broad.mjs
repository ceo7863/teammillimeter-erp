import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

// broad search
const patterns = ["\uC774\uC131\uAD6C", "\uC131\uAD6C", "\uC2A4\uD14C\uC778", "STAIN", "stain"];
for (const p of patterns) {
  const txs = (state.bankTransactions||[]).filter(t => JSON.stringify(t).includes(p));
  console.log(`pattern ${JSON.stringify(p)}: ${txs.length} bank txs`);
  txs.forEach(t => console.log(" ", String(t.transactionAt).slice(0,10), t.deposit, t.counterpartyName, t.description, t.linkedSubject));
}

// all client names
const names = (state.clients||[]).map(c => c.name).sort();
console.log("\nALL CLIENTS:", names.join(" | "));

// clients with ?? in manager or alias
for (const c of state.clients||[]) {
  const blob = JSON.stringify(c);
  if (blob.includes("\uC774\uC131\uAD6C") || blob.includes("\uC2A4\uD14C\uC778")) {
    console.log("client match:", JSON.stringify({name:c.name, manager:c.manager, aliases:c.depositNameAliases}));
  }
}

// sales client=??? or site contains stain
const stainSales = (state.sales||[]).filter(s => 
  String(s.client||"") === "\uC2A4\uD14C\uC778" || 
  String(s.site||"").includes("\uC2A4\uD14C\uC778") ||
  JSON.stringify(s).includes("\uC774\uC131\uAD6C")
);
console.log("\nSTAIN/??? sales:", stainSales.length);
stainSales.forEach(s => console.log(JSON.stringify({id:s.id, date:s.date, client:s.client, site:s.site, amount:s.amount, paid:s.paidAmount})));

// Jun 2026 txs
const junTxs = (state.bankTransactions||[]).filter(t => String(t.transactionAt||"").startsWith("2026-06"));
console.log("\nJun 2026 bank txs:", junTxs.length);
junTxs.forEach(t => console.log(JSON.stringify({date:String(t.transactionAt).slice(0,10), deposit:t.deposit, withdrawal:t.withdrawal, cp:t.counterpartyName, desc:t.description})));

// May 29-31 deposits
const lateMay = (state.bankTransactions||[]).filter(t => {
  const d = String(t.transactionAt||"").slice(0,10);
  return d >= "2026-05-29" && Number(t.deposit)>0;
});
console.log("\nMay 29+ deposits:", lateMay.length);
lateMay.forEach(t => console.log(JSON.stringify({id:t.id.slice(0,8), date:String(t.transactionAt).slice(0,10), deposit:t.deposit, cp:t.counterpartyName, desc:t.description, linkedSubject:t.linkedSubject, linked:!!t.linkedPaymentVoucherId})));
