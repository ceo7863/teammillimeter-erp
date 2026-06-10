import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

// audit logs
const audits = (state.auditLogs||[]).filter(l => JSON.stringify(l).includes("\uC774\uC131\uAD6C") || JSON.stringify(l).includes("\uC2A4\uD14C\uC778"));
console.log("audits with stain/???:", audits.length);
audits.slice(-20).forEach(a => console.log(JSON.stringify({at:a.createdAt, type:a.entityType, label:a.entityLabel, action:a.action, by:a.actorName})));

// urim sales all
const urimSales = (state.sales||[]).filter(s => s.client === "\uC6B0\uB9BC");
console.log("\n?? sales:", urimSales.length);
urimSales.forEach(s => console.log(JSON.stringify({id:s.id, date:s.date, site:s.site, amount:s.amount, paid:s.paidAmount, unpaid: Number(s.amount||0)-Number(s.paidAmount||0)})));

// search all sales for site/client containing stain substring exactly
const exactStain = (state.sales||[]).filter(s => 
  String(s.client||"").includes("\uC2A4\uD14C\uC778") || 
  String(s.site||"").includes("\uC2A4\uD14C\uC778") ||
  String(s.memo||"").includes("\uC2A4\uD14C\uC778")
);
console.log("\nexact stain in sales:", exactStain.length);

// bank rules / ledger rules for stain
const rules = (state.bankLedgerRules||[]).filter(r => JSON.stringify(r).includes("\uC2A4\uD14C\uC778") || JSON.stringify(r).includes("\uC774\uC131\uAD6C"));
console.log("\nledger rules:", rules.length);
rules.forEach(r => console.log(JSON.stringify(r)));

// folders
const folders = (state.bankTransactionFolders||[]).filter(f => JSON.stringify(f).includes("\uC2A4\uD14C\uC778"));
console.log("\nstain folders:", folders);

// latest import batch
const batches = [...new Set((state.bankTransactions||[]).map(t => t.importBatchId).filter(Boolean))];
console.log("\nimport batches:", batches.length);
const latestTx = (state.bankTransactions||[]).sort((a,b) => String(b.createdAt||b.transactionAt).localeCompare(String(a.createdAt||a.transactionAt)))[0];
console.log("latest tx:", JSON.stringify({date:String(latestTx?.transactionAt).slice(0,10), createdAt:latestTx?.createdAt, source:latestTx?.sourceFile}));

// search counterparty ?*
const leeCp = (state.bankTransactions||[]).filter(t => String(t.counterpartyName||"").startsWith("\uC774") && Number(t.deposit)>0);
console.log("\ndeposits counterparty starts with ?:", leeCp.length);
leeCp.slice(-15).forEach(t => console.log(String(t.transactionAt).slice(0,10), t.deposit, t.counterpartyName, t.linkedSubject, !!t.linkedPaymentVoucherId));
