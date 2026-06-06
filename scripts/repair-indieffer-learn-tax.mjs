#!/usr/bin/env node
import { getDb, getErpState, saveErpState } from "../server/db.mjs";

const CLIENT_ID = 9;

function appendDepositNameAlias(existing, alias) {
  const next = String(alias || "").trim();
  if (!next) return existing || "";
  const parts = String(existing || "")
    .split(/[,?;?|/]+/)
    .map((row) => row.trim())
    .filter(Boolean);
  if (parts.some((row) => row === next)) return existing || "";
  return [...parts, next].join(",");
}

getDb();
const state = getErpState();
const { data, version } = state;

const client = (data.clients || []).find((row) => row.id === CLIENT_ID);
if (!client) {
  console.error("client not found");
  process.exit(1);
}

const indiefferTxs = (data.bankTransactions || []).filter((row) => {
  const hay = [row.counterpartyName, row.description, row.memo, row.ledgerClientName, row.linkedSubject]
    .map((v) => String(v || ""))
    .join(" ");
  return hay.includes("\uC778\uB514\uD37C") || hay.includes("\uC8FC\uC2DD\uD68C\uC0AC\uC778\uB514\uD37C");
});

const linkedTx = indiefferTxs.find((row) => row.linkedTaxInvoiceId);
const aliasCandidates = linkedTx
  ? [linkedTx.counterpartyName, linkedTx.description, linkedTx.memo]
  : ["\uC8FC\uC2DD\uD68C\uC0AC\uC778\uB514\uD37C", "\uC778\uB514\uD37C"];

let aliases = String(client.depositNameAliases || "");
for (const alias of aliasCandidates.map((v) => String(v || "").trim()).filter(Boolean)) {
  aliases = appendDepositNameAlias(aliases, alias);
}

const updated = {
  ...client,
  taxInvoiceExactPayments: true,
  ...(aliases !== String(client.depositNameAliases || "") ? { depositNameAliases: aliases } : {}),
};

console.log({
  linkedTx: linkedTx
    ? { id: linkedTx.id, linkedTaxInvoiceId: linkedTx.linkedTaxInvoiceId, deposit: linkedTx.deposit }
    : null,
  before: {
    taxInvoiceExactPayments: client.taxInvoiceExactPayments,
    depositNameAliases: client.depositNameAliases,
  },
  after: {
    taxInvoiceExactPayments: updated.taxInvoiceExactPayments,
    depositNameAliases: updated.depositNameAliases,
  },
});

const clients = (data.clients || []).map((row) => (row.id === CLIENT_ID ? updated : row));
saveErpState({ ...data, clients }, version, "repair-indieffer-learn-tax");
console.log("saved");
