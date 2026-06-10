#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import {
  buildWorkerMonthlyObligations,
  sumVoucherPaidAmount,
} from "../src/utils/workerMonthlyActualPayments.ts";
import { flattenSalesToWorkerPaymentRows } from "../src/utils/workerPayments.ts";

const worker = process.argv[3] || "강태원";
const monthKey = process.argv[4] || "2026-04";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const workers = d.workers || [];
const sales = d.sales || [];
const vouchers = d.workerMonthlyActualVouchers || [];
const records = d.workerPaymentRecords || [];
const rules = d.workerPayWithVatLearnRules || [];
const bankTxs = d.bankTransactions || [];

const detailRows = flattenSalesToWorkerPaymentRows(sales);
const obligations = buildWorkerMonthlyObligations(detailRows, workers, vouchers, records, rules);
const rows = obligations.filter((o) => o.worker === worker);

console.log("===", worker, "obligations ===");
for (const o of rows.sort((a, b) => b.monthKey.localeCompare(a.monthKey))) {
  const v = o.voucher;
  console.log({
    month: o.monthKey,
    expected: o.expectedAmount,
    expectedFinal: o.expectedFinalAmount,
    payWithVat: o.payWithVat,
    paid: o.paid,
    balance: o.balance,
    voucherPaid: v ? sumVoucherPaidAmount(v) : null,
    entries: v?.entries?.map((e) => ({
      kind: e.kind,
      amount: e.amount,
      date: e.date,
      bankId: e.kind === "bank" ? e.bankTransactionId?.slice(0, 8) : undefined,
    })),
  });
}

const april = rows.find((o) => o.monthKey === monthKey);
console.log("\n=== April voucher detail ===");
const aprilV = vouchers.filter((v) => v.worker === worker && v.monthKey === monthKey);
console.log(JSON.stringify(aprilV, null, 2));

console.log("\n=== April bank txs linked ===");
for (const tx of bankTxs) {
  if (String(tx.linkedSubject || tx.counterpartyName || "").includes(worker) && String(tx.transactionAt || "").startsWith("2026-04")) {
    console.log({
      date: String(tx.transactionAt).slice(0, 10),
      withdrawal: tx.withdrawal,
      deposit: tx.deposit,
      linkedVoucher: tx.linkedWorkerMonthlyPaymentVoucherId?.slice(0, 20),
    });
  }
}

if (april) {
  console.log("\n=== April summary ===");
  console.log("expectedFinal", april.expectedFinalAmount, "paid", april.paid, "balance", april.balance);
}
