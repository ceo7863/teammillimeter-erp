#!/usr/bin/env node
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { buildBankTxTaxInvoiceLinkPatch } from "../src/utils/bankTaxInvoiceLink.ts";

const TX_ID = "917011fc-d1c7-407e-8edb-efcd85f2e433";
const INVOICE_ID = "29bda685-8761-4a79-a2ae-07924f623c23";
const CLIENT = "\uD648\uB8E8\uB374\uC2A4";

getDb();
const state = getErpState();
const { data, version } = state;

const tx = (data.bankTransactions || []).find((row) => row.id === TX_ID);
const invoice = (data.taxInvoices || []).find((row) => row.id === INVOICE_ID);
if (!tx || !invoice) {
  console.error("tx or invoice missing");
  process.exit(1);
}

const patched = buildBankTxTaxInvoiceLinkPatch(
  {
    ...tx,
    linkedSubject: CLIENT,
    ledgerClientName: CLIENT,
  },
  invoice,
);

const bankTransactions = (data.bankTransactions || []).map((row) => (row.id === TX_ID ? patched : row));

console.log(
  JSON.stringify(
    {
      before: {
        linkedSubject: tx.linkedSubject,
        ledgerClientName: tx.ledgerClientName,
        linkedTaxInvoiceId: tx.linkedTaxInvoiceId,
      },
      after: {
        linkedSubject: patched.linkedSubject,
        ledgerClientName: patched.ledgerClientName,
        linkedTaxInvoiceId: patched.linkedTaxInvoiceId,
        invoiceClient: invoice.client,
      },
    },
    null,
    2,
  ),
);

saveErpState({ ...data, bankTransactions }, version, "repair-homeludens-jun2-tax");
console.log("saved");
