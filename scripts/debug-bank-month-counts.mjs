#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { monthRangeISO, todayISO } from "../src/utils/companyLedger.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const txs = d.bankTransactions || [];

console.log("todayISO", todayISO());
console.log("thisMonth", monthRangeISO(0));

const byMonth = {};
for (const tx of txs) {
  const m = String(tx.transactionAt || "").slice(0, 7);
  byMonth[m] = (byMonth[m] || 0) + 1;
}
console.log("bank txs by month", byMonth);
console.log("total", txs.length);

const workerFolder = (d.bankTransactionFolders || []).find((f) => f.id === "bank-folder-worker-default");
const workerTxs = txs.filter((t) => t.folderId === "bank-folder-worker-default");
console.log("worker default folder txs", workerTxs.length);
