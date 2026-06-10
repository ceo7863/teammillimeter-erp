#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { listWorkerBankTransactions } from "../src/utils/workerMonthlyActualPayments.ts";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const workerName = process.argv[3] || "???";
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const bankTransactions = d.bankTransactions || [];
const folders = d.bankTransactionFolders || [];
const workers = d.workers || [];

const listed = listWorkerBankTransactions(workerName, bankTransactions, folders, workers);
console.log("listWorkerBankTransactions", workerName, listed.length);
for (const tx of listed) {
  console.log({
    date: String(tx.transactionAt || "").slice(0, 10),
    withdrawal: tx.withdrawal,
    linkedSubject: tx.linkedSubject,
    folderId: tx.folderId,
    counterparty: tx.counterpartyName,
  });
}

const workerFolderIds = new Set(folders.filter((f) => f.folderType === "worker").map((f) => f.id));
const raw = bankTransactions.filter((tx) => {
  const amount = Math.round(Number(tx.withdrawal) || 0) || Math.round(Number(tx.deposit) || 0);
  return amount > 0 && tx.folderId && workerFolderIds.has(tx.folderId);
});
console.log("\nall worker-folder txs:", raw.length);
console.log("linkedSubject counts:", Object.fromEntries(
  [...raw.reduce((m, tx) => {
    const k = String(tx.linkedSubject || "(none)");
    m.set(k, (m.get(k) || 0) + 1);
    return m;
  }, new Map())],
));
