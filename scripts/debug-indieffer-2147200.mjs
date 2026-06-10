#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

getDb();
const { data } = getErpState();

const TARGET = 2147200;
const INDIEFFER = "\uC778\uB514\uD37C";

function normalizePartyName(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/(\u3231|\(\uC8FC\)|\uC8FC\uC2DD\uD68C\uC0AC|\(\uC720\)|\uC720\uD55C|\uC720\uD55C\uD68C\uC0AC|co\.?ltd|corp|inc)/gi, "")
    .replace(/[\uFF08\uFF09()]/g, "")
    .toLowerCase();
}

function collectNames(tx) {
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

const txs = (data.bankTransactions || []).filter((r) => {
  const amt = Math.max(Number(r.deposit || 0), Number(r.withdrawal || 0));
  if (amt !== TARGET) return false;
  const blob = JSON.stringify(r);
  return blob.includes(INDIEFFER) || blob.toLowerCase().includes("indie");
});

console.log("=== bank txs amount", TARGET, "count", txs.length);
for (const tx of txs) {
  console.log(
    JSON.stringify(
      {
        id: tx.id,
        at: tx.transactionAt,
        deposit: tx.deposit,
        withdrawal: tx.withdrawal,
        counterparty: tx.counterpartyName,
        description: tx.description,
        ledgerClient: tx.ledgerClientName,
        linkedTaxInvoiceId: tx.linkedTaxInvoiceId,
        taxInvoiceAutoLinkDisabled: tx.taxInvoiceAutoLinkDisabled,
        names: collectNames(tx),
      },
      null,
      2,
    ),
  );
}

const invoices = (data.taxInvoices || []).filter((inv) => {
  if (Number(inv.totalAmount) === TARGET) return true;
  return String(inv.client || "").includes(INDIEFFER);
});

console.log("\n=== related tax invoices", invoices.length);
for (const inv of invoices) {
  const linkedSum = (data.bankTransactions || [])
    .filter((r) => r.linkedTaxInvoiceId === inv.id)
    .reduce((s, r) => s + Math.max(0, Number(r.deposit || 0)), 0);
  console.log(
    JSON.stringify({
      id: inv.id,
      issueDate: inv.issueDate,
      client: inv.client,
      businessNo: inv.businessNo,
      flowType: inv.flowType,
      supply: inv.supplyAmount,
      total: inv.totalAmount,
      status: inv.status,
      memo: inv.memo,
      linkedDepositSum: linkedSum,
      remaining: Number(inv.totalAmount || 0) - linkedSum,
    }),
  );
}

const indiefferClient = (data.clients || []).find((c) => String(c.name || "").includes(INDIEFFER));
console.log(
  "\n=== client record",
  indiefferClient
    ? {
        id: indiefferClient.id,
        name: indiefferClient.name,
        businessNo: indiefferClient.businessNo,
        taxInvoiceSplitPayments: indiefferClient.taxInvoiceSplitPayments,
        depositNameAliases: indiefferClient.depositNameAliases,
      }
    : null,
);

for (const tx of txs) {
  console.log("\n=== match candidates for tx", tx.id, tx.transactionAt);
  for (const inv of (data.taxInvoices || []).filter((i) => i.status === "issued" && i.flowType === "sales")) {
    if (Number(inv.totalAmount) !== TARGET && !String(inv.client || "").includes(INDIEFFER)) continue;
    const txAmount = Math.max(Number(tx.deposit || 0), Number(tx.withdrawal || 0));
    const amountDiff = Math.abs(txAmount - Number(inv.totalAmount || 0));
    const invNorm = normalizePartyName(inv.client);
    const nameHit = collectNames(tx).some((n) => {
      const t = normalizePartyName(n);
      return t && invNorm && (t === invNorm || t.includes(invNorm) || invNorm.includes(t));
    });
    console.log({
      invoiceDate: inv.issueDate,
      client: inv.client,
      total: inv.totalAmount,
      amountDiff,
      amountOk: amountDiff <= Math.max(1000, txAmount * 0.02),
      nameHit,
      alreadyLinked: (data.bankTransactions || []).some((r) => r.linkedTaxInvoiceId === inv.id),
    });
  }
}
