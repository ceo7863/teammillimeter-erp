import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const txs = (d.bankTransactions || []).filter(
  (t) => Math.abs(Number(t.deposit || 0) - 3482600) < 1 && String(t.transactionAt || "").includes("2026-06-08"),
);
console.log(
  "matching txs:",
  JSON.stringify(
    txs.map((t) => ({
      id: t.id,
      at: t.transactionAt,
      cp: t.counterpartyName,
      dep: t.deposit,
      linkedPayment: t.linkedPaymentVoucherId,
      linkedSales: t.linkedSalesId,
      ledgerAcct: t.ledgerAccountCode,
      ledgerClient: t.ledgerClientName,
      memo: t.memo,
      tax: t.linkedTaxInvoiceIds,
    })),
    null,
    2,
  ),
);

const sales = d.sales || [];
console.log("sales count", sales.length);
const filtered = sales.filter(
  (s) =>
    JSON.stringify(s).includes("\uC18C\uC911\uD55C") ||
    JSON.stringify(s).includes("\uD82C\uC778\uC81C\uB2C8\uC2A4"),
);
console.log(
  "filtered sales:",
  JSON.stringify(
    filtered.map((s) => ({
      id: s.id,
      client: s.client,
      site: s.site,
      amount: s.amount,
      paid: s.paid,
      date: s.date,
      unpaid: Math.max(0, Number(s.amount || 0) - Number(s.paid || 0)),
    })),
    null,
    2,
  ),
);
