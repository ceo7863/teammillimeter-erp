#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";
import { getTaxInvoiceUnsettledAmount } from "../src/utils/taxInvoiceLinkPanel.ts";

getDb();
const { data } = getErpState();
const txs = data.bankTransactions || [];
const invs = data.taxInvoices || [];

const rows = invs
  .filter((i) => i.status === "issued" && String(i.client || "").includes("\uC778\uB514\uD37C"))
  .map((i) => ({
    id: i.id,
    issueDate: i.issueDate,
    total: i.totalAmount,
    raw: getTaxInvoiceUnsettledAmount(i, txs),
    pooled: getTaxInvoiceUnsettledAmount(i, txs, invs),
    excl517: getTaxInvoiceUnsettledAmount(i, txs, invs, new Set(["517f9b77-01d2-4108-989e-f712c0fb19a6"])),
  }));

console.log(JSON.stringify(rows, null, 2));
