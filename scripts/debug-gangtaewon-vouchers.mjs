#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { refreshVoucherPaidAmount } from "../src/utils/workerMonthlyActualPayments.ts";

const WORKER = "\uAC15\uD0DC\uC6D0";
const db = new DatabaseSync(path.resolve(process.argv[2] || "data/erp.sqlite"));
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

const linkedIds = [
  "worker-monthly-35b439da-8540-4727-ab7a-4a9659f9fb93",
  "worker-monthly-7f28e6bc-dc76-4627-bbef-8c5420b5dc3b",
];

console.log("=== Linked vouchers ===");
for (const id of linkedIds) {
  const v = (d.workerMonthlyActualVouchers || []).find((x) => x.id === id);
  const refreshed = v ? refreshVoucherPaidAmount(v) : null;
  console.log(JSON.stringify({ raw: v, refreshed }, null, 2));
}

console.log("\n=== Bank txs with linkedWorkerMonthlyPaymentVoucherId ===");
for (const tx of d.bankTransactions || []) {
  if (!tx.linkedWorkerMonthlyPaymentVoucherId) continue;
  if (String(tx.linkedSubject || "") !== WORKER && !String(tx.counterpartyName || "").includes(WORKER)) continue;
  console.log({
    id: tx.id,
    date: tx.transactionAt?.slice?.(0, 10),
    amount: tx.withdrawal,
    voucherId: tx.linkedWorkerMonthlyPaymentVoucherId,
  });
}

console.log("\n=== All workerMonthlyActualVouchers for", WORKER, "===");
for (const v of d.workerMonthlyActualVouchers || []) {
  if (v.worker !== WORKER) continue;
  console.log(refreshVoucherPaidAmount(v));
}
