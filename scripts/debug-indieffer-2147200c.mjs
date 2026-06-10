#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

getDb();
const { data } = getErpState();

const txId = "936c2f0c-dca0-491d-b5a8-2bb6db1c9813";
const tx = (data.bankTransactions || []).find((r) => r.id === txId);

console.log("full tx fields:", JSON.stringify(tx, null, 2));

// Simulate batchAutoLink candidate collection for this tx only
const invoices = (data.taxInvoices || []).filter((i) => i.status === "issued");
const clients = data.clients || [];
const workers = data.workers || [];

function normalizeBusinessRegistrationNo(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(0, 10);
}

function normalizePartyName(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/(\u3231|\(\uC8FC\)|\uC8FC\uC2DD\uD68C\uC0AC|\(\uC720\)|\uC720\uD55C|\uC720\uD55C\uD68C\uC0AC|co\.?ltd|corp|inc)/gi, "")
    .replace(/[\uFF08\uFF09()]/g, "")
    .toLowerCase();
}

function collectBankTxPartyNames(tx) {
  return [tx.ledgerClientName, tx.linkedSubject, tx.counterpartyName, tx.memo, tx.ledgerMemo, tx.description]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
}

function findClientByDepositSubject(clients, subject) {
  const norm = normalizePartyName(subject);
  return clients.find((c) => {
    const name = normalizePartyName(c.name);
    return name && norm && (name === norm || norm.includes(name) || name.includes(norm));
  });
}

function collectBankTxPartyBusinessNumbers(tx) {
  const numbers = new Set();
  for (const subject of collectBankTxPartyNames(tx)) {
    const client = findClientByDepositSubject(clients, subject);
    const biz = normalizeBusinessRegistrationNo(client?.businessNo);
    if (biz) numbers.add(biz);
  }
  return numbers;
}

function hasTaxInvoiceNameMatch(tx, invoice) {
  const invClient = String(invoice.client || "").trim();
  const normalizedInvoice = normalizePartyName(invClient);
  for (const txName of collectBankTxPartyNames(tx)) {
    const normalizedTx = normalizePartyName(txName);
    if (normalizedTx && normalizedInvoice && (normalizedTx === normalizedInvoice || normalizedTx.includes(normalizedInvoice) || normalizedInvoice.includes(normalizedTx))) {
      return true;
    }
  }
  return false;
}

function hasTaxInvoicePartyMatch(tx, invoice) {
  const invBizNo = normalizeBusinessRegistrationNo(invoice.businessNo);
  const txBizNos = collectBankTxPartyBusinessNumbers(tx);
  if (invBizNo && txBizNos.size > 0) return txBizNos.has(invBizNo);
  return hasTaxInvoiceNameMatch(tx, invoice);
}

function scoreTaxInvoiceMatch(tx, invoice) {
  const txAmount = Math.max(Number(tx.deposit || 0), Number(tx.withdrawal || 0));
  const amountDiff = Math.abs(txAmount - Number(invoice.totalAmount || 0));
  if (txAmount > 0 && amountDiff > Math.max(1000, txAmount * 0.02)) return 0;

  const invBizNo = normalizeBusinessRegistrationNo(invoice.businessNo);
  const txBizNos = collectBankTxPartyBusinessNumbers(tx);
  const bizMatch = Boolean(invBizNo && txBizNos.has(invBizNo));
  const nameMatch = hasTaxInvoiceNameMatch(tx, invoice);
  const txNames = collectBankTxPartyNames(tx);
  if (invBizNo && txBizNos.size > 0 && !bizMatch) return 0;
  if ((txNames.length > 0 || invBizNo) && !nameMatch && !bizMatch) return 0;

  let score = 10;
  const txDate = String(tx.transactionAt || "").slice(0, 10);
  const invDate = String(invoice.issueDate || "").slice(0, 10);
  if (txDate && invDate) {
    const dayDiff = Math.abs(new Date(txDate).getTime() - new Date(invDate).getTime()) / 86400000;
    if (dayDiff <= 7) score += 40;
    else if (dayDiff <= 31) score += 20;
    else if (dayDiff <= 90) score += 8;
  }
  if (bizMatch) score += 45;
  else if (nameMatch) score += 25;
  if (tx.deposit > 0 && invoice.flowType === "sales") score += 15;
  if (txAmount > 0 && amountDiff === 0) score += 30;
  return score;
}

const used = new Set((data.bankTransactions || []).map((r) => r.linkedTaxInvoiceId).filter(Boolean));
console.log("\ntx biz nos", [...collectBankTxPartyBusinessNumbers(tx)]);
console.log("party match 5/31 invoice?", hasTaxInvoicePartyMatch(tx, invoices.find((i) => i.id === "9afd1ff1-8e6e-4764-a618-544848acdab1")));

const ranked = invoices
  .map((invoice) => ({ invoice, score: scoreTaxInvoiceMatch(tx, invoice) }))
  .filter((row) => row.score > 0)
  .sort((a, b) => b.score - a.score);

console.log("\ntop 5 scores:");
for (const row of ranked.slice(0, 5)) {
  console.log({
    date: row.invoice.issueDate,
    client: row.invoice.client,
    total: row.invoice.totalAmount,
    score: row.score,
    used: used.has(row.invoice.id),
    party: hasTaxInvoicePartyMatch(tx, row.invoice),
  });
}

console.log("\ntx imported", tx?.createdAt, "linked?", tx?.linkedTaxInvoiceId);

const inv531 = (data.taxInvoices || []).find((i) => i.id === "9afd1ff1-8e6e-4764-a618-544848acdab1");
console.log("invoice 5/31 createdAt", inv531?.createdAt, "issueDate", inv531?.issueDate);
