#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";
import { buildTaxInvoiceCancellationExcludedIds } from "../src/utils/taxInvoices.ts";

getDb();
const { data } = getErpState();

const txId = "936c2f0c-dca0-491d-b5a8-2bb6db1c9813";
const invoiceId = "9afd1ff1-8e6e-4764-a618-544848acdab1";

const tx = (data.bankTransactions || []).find((r) => r.id === txId);
const invoice = (data.taxInvoices || []).find((r) => r.id === invoiceId);

const excluded = buildTaxInvoiceCancellationExcludedIds(data.taxInvoices || []);
console.log("invoice excluded?", excluded.has(invoiceId));
console.log("tx linked?", tx?.linkedTaxInvoiceId);
console.log("tx auto disabled?", tx?.taxInvoiceAutoLinkDisabled);

const used = new Set(
  (data.bankTransactions || []).map((r) => r.linkedTaxInvoiceId).filter(Boolean),
);
console.log("invoice already used?", used.has(invoiceId));

// import scoring from compiled - use dynamic import of src utils via ts? 
// inline score from bankTaxInvoiceLink logic
function normalizeBusinessRegistrationNo(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(0, 10);
}

function getBankTxClassifiedAmount(tx) {
  return Math.max(Number(tx.deposit || 0), Number(tx.withdrawal || 0));
}

function normalizePartyName(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/(\u3231|\(\uC8FC\)|\uC8FC\uC2DD\uD68C\uC0AC|\(\uC720\)|\uC720\uD55C|\uC720\uD55C\uD68C\uC0AC|co\.?ltd|corp|inc)/gi, "")
    .replace(/[\uFF08\uFF09()]/g, "")
    .toLowerCase();
}

function collectBankTxPartyNames(tx) {
  return [
    tx.ledgerClientName,
    tx.linkedSubject,
    tx.counterpartyName,
    tx.memo,
    tx.ledgerMemo,
    tx.description,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
}

function hasTaxInvoiceNameMatch(tx, invoice) {
  const invClient = String(invoice.client || "").trim();
  const txNames = collectBankTxPartyNames(tx);
  const normalizedInvoice = normalizePartyName(invClient);
  for (const txName of txNames) {
    if (txName === invClient) return true;
    const normalizedTx = normalizePartyName(txName);
    if (!normalizedTx || !normalizedInvoice) continue;
    if (normalizedTx === normalizedInvoice) return true;
    if (normalizedTx.includes(normalizedInvoice) || normalizedInvoice.includes(normalizedTx)) return true;
  }
  return false;
}

const txAmount = getBankTxClassifiedAmount(tx);
const amountDiff = Math.abs(txAmount - Number(invoice.totalAmount || 0));
const nameMatch = hasTaxInvoiceNameMatch(tx, invoice);
console.log({ txAmount, invoiceTotal: invoice.totalAmount, amountDiff, nameMatch });

const invBiz = normalizeBusinessRegistrationNo(invoice.businessNo);
const client = (data.clients || []).find((c) => String(c.name || "").includes("\uC778\uB514\uD37C"));
console.log("client biz", client?.businessNo, "invoice biz", invoice.businessNo);

// check if tx has biz no from client lookup
console.log("tx createdAt", tx?.createdAt, "invoice issueDate", invoice?.issueDate);

// duplicates same amount/date invoices
const dupes = (data.taxInvoices || []).filter(
  (i) => i.issueDate === "2026-05-31" && Number(i.totalAmount) === 2147200,
);
console.log("may31 2147200 invoice count", dupes.length, dupes.map((d) => d.id));

const may22dupes = (data.taxInvoices || []).filter(
  (i) => i.issueDate === "2026-05-22" && Number(i.totalAmount) === 9716960,
);
console.log("may22 9716960 invoice count", may22dupes.length);

// any bank tx linked to may invoices?
for (const inv of (data.taxInvoices || []).filter((i) => String(i.client || "").includes("\uC778\uB514\uD37C") && i.issueDate >= "2026-05-01")) {
  const linked = (data.bankTransactions || []).filter((r) => r.linkedTaxInvoiceId === inv.id);
  console.log(inv.issueDate, inv.totalAmount, "linked txs", linked.length, linked.map((r) => ({ at: r.transactionAt, dep: r.deposit })));
}
