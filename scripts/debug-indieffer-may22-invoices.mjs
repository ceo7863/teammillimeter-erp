#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

const DATE = process.argv[2] || "2026-05-22";
const MARKERS = ["\uC778\uB514\uD37C", "\uC778\uB354\uD37C", "\uD648\uB8E8"];

getDb();
const { data } = getErpState();

const invoices = (data.taxInvoices || []).filter((row) => {
  const d = String(row.issueDate || "").slice(0, 10);
  if (d !== DATE) return false;
  const hay = [row.client, row.memo, row.invoiceNo].map((v) => String(v || "")).join(" ");
  return MARKERS.some((m) => hay.includes(m));
});

console.log(
  JSON.stringify(
    {
      date: DATE,
      count: invoices.length,
      invoices: invoices
        .sort((a, b) => Number(b.totalAmount || 0) - Number(a.totalAmount || 0))
        .map((row) => ({
          id: row.id,
          client: row.client,
          businessNo: row.businessNo,
          issueDate: row.issueDate,
          totalAmount: row.totalAmount,
          supplyAmount: row.supplyAmount,
          invoiceNo: row.invoiceNo,
          status: row.status,
          flowType: row.flowType,
          memo: row.memo,
          createdAt: row.createdAt,
          createdBy: row.createdBy,
        })),
      linkedBankTxs: invoices.flatMap((inv) =>
        (data.bankTransactions || [])
          .filter((tx) => tx.linkedTaxInvoiceId === inv.id)
          .map((tx) => ({
            invoiceId: inv.id,
            txId: tx.id,
            at: String(tx.transactionAt).slice(0, 10),
            deposit: tx.deposit,
            counterpartyName: tx.counterpartyName,
          })),
      ),
    },
    null,
    2,
  ),
);
