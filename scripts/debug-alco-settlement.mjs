#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

const DB = process.argv[2] || "data/erp.sqlite";
const payload = JSON.parse(
  String(new DatabaseSync(DB).prepare("SELECT payload FROM erp_state WHERE id=1").get().payload),
);

const CLIENT_NEEDLE = "\uC54C\uCF54"; // 알코
const AMOUNTS = new Set([2150000, 1183000, 2365000, 968000, 3333000]);

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function isAlcoName(s) {
  return String(s || "").includes(CLIENT_NEEDLE);
}

const clients = (payload.clients || []).filter(
  (c) => isAlcoName(c.name) || isAlcoName(c.displayName) || isAlcoName(c.companyName),
);
console.log("=== clients matching 알코 ===");
console.log(JSON.stringify(clients, null, 2));

const clientIds = new Set(clients.map((c) => c.id));

const bankHits = (payload.bankTransactions || []).filter((tx) => {
  const dep = Number(tx.deposit || 0);
  const wd = Number(tx.withdrawal || 0);
  const amt = dep || wd;
  const date = String(tx.transactionAt || "");
  const nameHit =
    isAlcoName(tx.counterpartyName) ||
    isAlcoName(tx.description) ||
    isAlcoName(tx.memo) ||
    (tx.linkedClientId && clientIds.has(tx.linkedClientId));
  const amtHit = AMOUNTS.has(dep) || AMOUNTS.has(wd);
  const dateHit = date.startsWith("2026-05") || date.startsWith("2026-06");
  return (nameHit && (amtHit || dateHit)) || (amtHit && (date.includes("2026-05-20") || date.includes("2026-06-05")));
});

console.log("\n=== bank transactions (alco / target amounts / dates) ===");
for (const tx of bankHits) {
  const linkedInv = (payload.taxInvoices || []).find((i) => i.id === tx.linkedTaxInvoiceId);
  console.log(
    JSON.stringify(
      {
        ...pick(tx, [
          "id",
          "transactionAt",
          "deposit",
          "withdrawal",
          "counterpartyName",
          "description",
          "memo",
          "linkedTaxInvoiceId",
          "linkedTaxInvoiceIds",
          "linkedClientId",
          "linkedSaleId",
          "linkedPaymentVoucherId",
          "linkedSentStatementArchiveId",
          "importBatchId",
          "createdAt",
        ]),
        linkedInvoice: linkedInv
          ? pick(linkedInv, ["id", "client", "totalAmount", "issueDate", "invoiceNo", "flowType", "status"])
          : null,
      },
      null,
      2,
    ),
  );
}

const invoiceHits = (payload.taxInvoices || []).filter((inv) => {
  const total = Number(inv.totalAmount || 0);
  return isAlcoName(inv.client) || AMOUNTS.has(total);
});

console.log("\n=== tax invoices (alco / target totals) ===");
const linkedIndex = new Map();
for (const tx of payload.bankTransactions || []) {
  const id = tx.linkedTaxInvoiceId;
  if (!id) continue;
  const prev = linkedIndex.get(id) || { sales: 0, purchase: 0, txIds: [] };
  prev.sales += Math.max(0, Number(tx.deposit || 0));
  prev.purchase += Math.max(0, Number(tx.withdrawal || 0));
  prev.txIds.push(tx.id);
  linkedIndex.set(id, prev);
}

for (const inv of invoiceHits) {
  const bucket = linkedIndex.get(inv.id) || { sales: 0, purchase: 0, txIds: [] };
  const linked =
    inv.flowType === "purchase" ? bucket.purchase : bucket.sales;
  const unsettled = Math.max(0, Number(inv.totalAmount || 0) - linked);
  console.log(
    JSON.stringify(
      {
        ...pick(inv, [
          "id",
          "client",
          "businessNo",
          "issueDate",
          "invoiceNo",
          "supplyAmount",
          "vatAmount",
          "totalAmount",
          "flowType",
          "status",
          "memo",
          "barobillMgtKey",
        ]),
        linkedBankSum: linked,
        unsettledAmount: unsettled,
        linkedBankTxIds: bucket.txIds,
      },
      null,
      2,
    ),
  );
}

// bank txs pointing at those invoices even if not in bankHits
const targetInvoiceIds = new Set(invoiceHits.map((i) => i.id));
const txsOnInvoices = (payload.bankTransactions || []).filter((tx) =>
  targetInvoiceIds.has(tx.linkedTaxInvoiceId),
);
console.log("\n=== all bank txs linked to target invoices ===");
console.log(
  JSON.stringify(
    txsOnInvoices.map((tx) =>
      pick(tx, [
        "id",
        "transactionAt",
        "deposit",
        "withdrawal",
        "counterpartyName",
        "linkedTaxInvoiceId",
      ]),
    ),
    null,
    2,
  ),
);

const salesHits = (payload.sales || []).filter(
  (s) =>
    isAlcoName(s.clientName) ||
    isAlcoName(s.client) ||
    (s.clientId && clientIds.has(s.clientId)),
);
console.log("\n=== sales for 알코 (recent) ===");
console.log(
  JSON.stringify(
    salesHits
      .slice(-20)
      .map((s) =>
        pick(s, [
          "id",
          "clientName",
          "clientId",
          "saleDate",
          "totalAmount",
          "linkedTaxInvoiceId",
          "linkedBankTransactionId",
          "status",
        ]),
      ),
    null,
    2,
  ),
);

const voucherKeys = Object.keys(payload).filter((k) => /voucher|payment/i.test(k));
console.log("\n=== payload voucher-like keys ===", voucherKeys.join(", "));

for (const key of ["paymentVouchers", "workerPaymentRecords", "workerPayoutVouchers"]) {
  const rows = payload[key];
  if (!Array.isArray(rows)) continue;
  const hits = rows.filter((r) => JSON.stringify(r).includes(CLIENT_NEEDLE));
  if (hits.length) {
    console.log(`\n=== ${key} mentioning 알코 ===`);
    console.log(JSON.stringify(hits, null, 2));
  }
}

// split link arrays?
const multiLink = (payload.bankTransactions || []).filter(
  (tx) =>
    Array.isArray(tx.linkedTaxInvoiceIds) &&
    tx.linkedTaxInvoiceIds.length &&
    (isAlcoName(tx.counterpartyName) || AMOUNTS.has(Number(tx.deposit || 0))),
);
if (multiLink.length) {
  console.log("\n=== bank txs with linkedTaxInvoiceIds[] ===");
  console.log(JSON.stringify(multiLink, null, 2));
}

console.log("\n=== deposit sum check ===");
const dep215 = bankHits.filter((t) => Number(t.deposit) === 2150000);
const dep1183 = bankHits.filter((t) => Number(t.deposit) === 1183000);
console.log({ dep2150000: dep215.map((t) => t.id), dep1183000: dep1183.map((t) => t.id) });
const invTotals = invoiceHits
  .filter((i) => [2365000, 968000].includes(Number(i.totalAmount)))
  .map((i) => ({ id: i.id, total: i.totalAmount }));
console.log({ invoice2365000_968000: invTotals, sum: invTotals.reduce((a, b) => a + Number(b.total), 0) });
