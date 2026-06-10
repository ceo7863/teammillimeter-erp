import { getDb, getErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();

console.log("=== CLIENTS with depositNameAliases ===");
for (const c of state.clients||[]) {
  if (c.depositNameAliases) {
    console.log(JSON.stringify({name:c.name, manager:c.manager, aliases:c.depositNameAliases}));
  }
}

console.log("\n=== ALL unpaid receivables count ===");
const unpaid = (state.sales||[]).filter(s => Number(s.amount||0) - Number(s.paidAmount||0) > 0);
console.log("total unpaid sales:", unpaid.length);

// Simulate: if a deposit from ??? for hypothetical amount - what would match?
// Check smart ledger classification for unknown depositor names
import { resolveBankDepositMatchSubject } from "../src/utils/clientDepositAliases.ts";

// hypothetical tx
const hypoTx = {
  id: "test",
  transactionAt: "2026-05-30T10:00:00",
  deposit: 1000000,
  counterpartyName: "\uC774\uC131\uAD6C",
  description: "\uC774\uC131\uAD6C",
  withdrawal: 0,
};
console.log("\nHypothetical ??? deposit subject:", resolveBankDepositMatchSubject(hypoTx));

import { buildBankDepositMatchCandidates } from "../src/utils/bankReceivableMatch.ts";
const receivableRows = unpaid.map(s => ({
  id: s.id, client: s.client, site: s.site, voucherNo: s.voucherNo,
  date: s.date, salesAmount: Number(s.amount||0), paidAmount: Number(s.paidAmount||0),
}));
const linkedSalesIds = new Set(
  (state.bankTransactions||[]).filter(r => r.linkedSalesId).map(r => String(r.linkedSalesId))
);
const hypoCandidates = buildBankDepositMatchCandidates(hypoTx, receivableRows, {
  linkedSalesIds, clients: state.clients||[], minScore: 0, limit: 5,
});
console.log("Hypo candidates (any amount 1M):", hypoCandidates.map(c => ({client:c.client, score:c.score, reasons:c.reasons})));

// Check if any client manager is ???
const mgrMatch = (state.clients||[]).filter(c => String(c.manager||"").includes("\uC774\uC131"));
console.log("\nClients with ?? in manager:", mgrMatch.map(c => ({name:c.name, manager:c.manager})));
