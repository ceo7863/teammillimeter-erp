#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";
import {
  scoreTaxInvoiceMatch,
  hasTaxInvoicePartyMatch,
  pickAutoTaxInvoiceMatch,
  searchTaxInvoicesForBankTx,
} from "../src/utils/bankTaxInvoiceLink.ts";

const TX_ID = "917011fc-d1c7-407e-8edb-efcd85f2e433";

getDb();
const { data } = getErpState();
const txRaw = (data.bankTransactions || []).find((t) => t.id === TX_ID);
const tx = {
  ...txRaw,
  linkedSubject: undefined,
  ledgerClientName: undefined,
  linkedTaxInvoiceId: undefined,
};
const context = { clients: data.clients || [], workers: data.workers || [] };

const aptId = "5e891068-c07f-460e-b19b-c00087aa12e9";
const homeludensIds = [
  "363e8b19-1599-47bf-8388-5e61eea9e32f",
  "363d8ea7-c317-45f2-b6f9-b1bfa1818e2a",
  "29bda685-8761-4a79-a2ae-07924f623c23",
];

const invoices = (data.taxInvoices || []).filter((r) => r.id === aptId || homeludensIds.includes(r.id));

console.log(
  JSON.stringify(
    {
      txParty: {
        counterpartyName: tx.counterpartyName,
        description: tx.description,
      },
      ranked: searchTaxInvoicesForBankTx(tx, data.taxInvoices || [], "", context).slice(0, 8),
      candidates: invoices.map((inv) => ({
        id: inv.id,
        client: inv.client,
        issueDate: inv.issueDate,
        totalAmount: inv.totalAmount,
        partyMatch: hasTaxInvoicePartyMatch(tx, inv, context),
        score: scoreTaxInvoiceMatch(tx, inv, context),
      })),
      pick: pickAutoTaxInvoiceMatch(tx, data.taxInvoices || [], new Set(), context),
    },
    null,
    2,
  ),
);
