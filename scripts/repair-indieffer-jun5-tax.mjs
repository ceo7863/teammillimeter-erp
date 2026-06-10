#!/usr/bin/env node
import { getDb, getErpState, saveErpState } from "../server/db.mjs";

getDb();
const state = getErpState();
const { data, version } = state;

const TX_ID = "936c2f0c-dca0-491d-b5a8-2bb6db1c9813";
const INVOICE_ID = "9afd1ff1-8e6e-4764-a618-544848acdab1";

const tx = (data.bankTransactions || []).find((row) => row.id === TX_ID);
const invoice = (data.taxInvoices || []).find((row) => row.id === INVOICE_ID);

if (!tx || !invoice) {
  console.error("tx or invoice not found", { tx: Boolean(tx), invoice: Boolean(invoice) });
  process.exit(1);
}

if (tx.linkedTaxInvoiceId === INVOICE_ID) {
  console.log("already linked");
  process.exit(0);
}

const bankTransactions = (data.bankTransactions || []).map((row) => {
  if (row.id !== TX_ID) return row;
  return {
    ...row,
    linkedTaxInvoiceId: INVOICE_ID,
    ledgerClientName: invoice.client,
    linkedSubject: String(invoice.client || row.linkedSubject || "").trim() || row.linkedSubject,
  };
});

console.log({
  txAt: tx.transactionAt,
  deposit: tx.deposit,
  invoiceDate: invoice.issueDate,
  invoiceTotal: invoice.totalAmount,
  linkedTaxInvoiceId: INVOICE_ID,
});

saveErpState({
  data: {
    ...data,
    bankTransactions,
  },
  version,
});

console.log("saved");
