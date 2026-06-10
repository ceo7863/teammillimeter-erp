#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

const TX_ID = process.argv[2] || "917011fc-d1c7-407e-8edb-efcd85f2e433";

getDb();
const { data } = getErpState();

const tx = (data.bankTransactions || []).find((t) => t.id === TX_ID);
if (!tx) {
  console.error("tx not found");
  process.exit(1);
}

const invoice = tx.linkedTaxInvoiceId
  ? (data.taxInvoices || []).find((r) => r.id === tx.linkedTaxInvoiceId)
  : null;
const voucher = tx.linkedPaymentVoucherId
  ? (data.paymentVouchers || []).find((r) => String(r.id) === String(tx.linkedPaymentVoucherId))
  : null;
const sale = voucher?.salesId
  ? (data.sales || []).find((r) => String(r.id) === String(voucher.salesId))
  : null;

console.log(
  JSON.stringify(
    {
      tx: {
        id: tx.id,
        deposit: tx.deposit,
        description: tx.description,
        counterpartyName: tx.counterpartyName,
        linkedSubject: tx.linkedSubject,
        ledgerClientName: tx.ledgerClientName,
        linkedTaxInvoiceId: tx.linkedTaxInvoiceId,
        linkedPaymentVoucherId: tx.linkedPaymentVoucherId,
        linkedPdfArchiveId: tx.linkedPdfArchiveId,
      },
      invoice: invoice
        ? {
            id: invoice.id,
            client: invoice.client,
            businessNo: invoice.businessNo,
            issueDate: invoice.issueDate,
            totalAmount: invoice.totalAmount,
            flowType: invoice.flowType,
          }
        : null,
      voucher: voucher
        ? {
            id: voucher.id,
            client: voucher.client,
            site: voucher.site,
            finalAmount: voucher.finalAmount,
            salesId: voucher.salesId,
            bankTransactionId: voucher.bankTransactionId,
          }
        : null,
      sale: sale ? { id: sale.id, client: sale.client, site: sale.site, amount: sale.amount, date: sale.date } : null,
      homeludensInvoices110k: (data.taxInvoices || [])
        .filter((r) => Number(r.totalAmount) === 110000 && String(r.client || "").includes("\uD648\uB8E8"))
        .map((r) => ({
          id: r.id,
          client: r.client,
          issueDate: r.issueDate,
          totalAmount: r.totalAmount,
        })),
      aptInvoices110k: (data.taxInvoices || [])
        .filter((r) => Number(r.totalAmount) === 110000 && String(r.client || "").includes("\uC544\uD30C\uD2B8"))
        .map((r) => ({
          id: r.id,
          client: r.client,
          issueDate: r.issueDate,
          totalAmount: r.totalAmount,
        })),
    },
    null,
    2,
  ),
);
