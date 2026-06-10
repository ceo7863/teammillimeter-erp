#!/usr/bin/env node
import { getDb, getErpState, saveErpState } from "../server/db.mjs";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const state = getErpState();
const { data, version } = state;

const TARGET_TOTAL = 9716960;
const TX_IDS = ["517f9b77-01d2-4108-989e-f712c0fb19a6", "2de0e5ca-a90b-4386-b44a-914de7c6ec91"];

const taxInvoices = data.taxInvoices || [];
const invoice =
  taxInvoices.find(
    (row) =>
      String(row.client || "").includes("\uC778\uB514\uD37C") &&
      row.issueDate === "2026-05-22" &&
      Number(row.totalAmount || 0) === TARGET_TOTAL &&
      row.status === "issued",
  ) || null;

if (!invoice) {
  console.error("invoice not found");
  process.exit(1);
}

let bankTransactions = (data.bankTransactions || []).map((row) => {
  if (!TX_IDS.includes(row.id)) return row;
  return {
    ...row,
    linkedTaxInvoiceId: invoice.id,
    ledgerClientName: invoice.client,
    linkedSubject: row.deposit > 0 ? invoice.client : row.linkedSubject,
  };
});

const clients = (data.clients || []).map((client) => {
  if (String(client.name || "").includes("\uC778\uB514\uD37C")) {
    return { ...client, taxInvoiceSplitPayments: true };
  }
  return client;
});

console.log({
  invoiceId: invoice.id,
  invoiceNo: invoice.invoiceNo,
  linkedTxs: bankTransactions
    .filter((row) => TX_IDS.includes(row.id))
    .map((row) => ({ id: row.id, deposit: row.deposit, linkedTaxInvoiceId: row.linkedTaxInvoiceId })),
});

saveErpState({
  data: {
    ...data,
    bankTransactions,
    clients,
  },
  version,
});

console.log("saved");
