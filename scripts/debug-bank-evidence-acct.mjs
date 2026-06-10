#!/usr/bin/env node
import { getErpState } from "../server/db.mjs";

const state = getErpState();
const d = state.data || {};
const txs = d.bankTransactions || [];

let withAcct = 0;
let withTi = 0;
for (const t of txs) {
  const ac = String(t.ledgerAccountCode || "").trim();
  const ids = Array.isArray(t.linkedTaxInvoiceIds)
    ? t.linkedTaxInvoiceIds.filter(Boolean)
    : t.linkedTaxInvoiceId
      ? [String(t.linkedTaxInvoiceId)]
      : [];
  if (ac) withAcct += 1;
  if (ids.length) withTi += 1;
}

const sample = txs
  .filter((t) => {
    const ids = Array.isArray(t.linkedTaxInvoiceIds) ? t.linkedTaxInvoiceIds : [];
    return t.ledgerAccountCode || t.linkedTaxInvoiceId || ids.length;
  })
  .slice(0, 5)
  .map((t) => ({
    id: t.id,
    ledgerAccountCode: t.ledgerAccountCode,
    linkedTaxInvoiceIds: t.linkedTaxInvoiceIds,
    linkedTaxInvoiceId: t.linkedTaxInvoiceId,
    memo: String(t.memo || "").slice(0, 40),
  }));

console.log(
  JSON.stringify(
    {
      version: state.version,
      source: "getErpState/domain-rows",
      total: txs.length,
      withLedgerAccountCode: withAcct,
      withTaxInvoiceLink: withTi,
      taxInvoicesTotal: (d.taxInvoices || []).length,
      sample,
    },
    null,
    2,
  ),
);
