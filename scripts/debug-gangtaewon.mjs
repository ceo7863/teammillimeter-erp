#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import {
  buildUnlinkedWorkerBankWithdrawals,
  buildWorkerMonthlyObligations,
  resolveWorkerFromBankTx,
} from "../src/utils/workerMonthlyActualPayments.ts";
import {
  buildWorkerBankMatchCandidates,
  listUnlinkedWorkerBankMatchesForWorker,
} from "../src/utils/bankWorkerMonthlyMatch.ts";
import { resolveWorkerNameFromBankTransaction } from "../src/utils/workerPayoutLedger.ts";
import { flattenSalesToWorkerPaymentRows } from "../src/utils/workerPayments.ts";

const WORKER = "\uAC15\uD0DC\uC6D0";
const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(path.resolve(dbPath));
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

const workers = d.workers || [];
const worker = workers.find((w) => w.name === WORKER);
console.log("=== Worker ===");
console.log(worker || "NOT FOUND");

const detailRows = flattenSalesToWorkerPaymentRows(d.sales || []);
const obligations = buildWorkerMonthlyObligations(
  detailRows,
  workers,
  d.workerMonthlyActualVouchers || [],
  d.workerPaymentRecords || [],
  d.workerPayWithVatLearnRules || [],
);

const workerObligations = obligations.filter((o) => o.worker === WORKER);
console.log("\n=== Obligations ===");
for (const o of workerObligations) {
  console.log({
    key: o.key,
    monthKey: o.monthKey,
    expectedAmount: o.expectedAmount,
    expectedFinalAmount: o.expectedFinalAmount,
    payWithVat: o.payWithVat,
    paid: o.paid,
    balance: o.balance,
    voucherId: o.voucher?.id || null,
  });
}

function haystack(tx) {
  return [tx.counterpartyName, tx.description, tx.memo, tx.linkedSubject].filter(Boolean).join(" | ");
}

const allWorkerMention = (d.bankTransactions || []).filter((tx) => {
  const w = Math.round(Number(tx.withdrawal) || 0);
  if (w <= 0) return false;
  const h = haystack(tx);
  return h.includes(WORKER) || String(tx.linkedSubject || "").trim() === WORKER;
});

console.log("\n=== All withdrawals mentioning", WORKER, `(${allWorkerMention.length}) ===`);
for (const tx of allWorkerMention.sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))) {
  const resolved = resolveWorkerNameFromBankTransaction(tx, d.bankTransactionFolders || [], workers);
  const amount = Math.round(Number(tx.withdrawal) || 0);
  const [bestMatch] = buildWorkerBankMatchCandidates(tx, workerObligations, workers, { worker: WORKER });
  console.log({
    id: tx.id.slice(0, 8),
    date: String(tx.transactionAt).slice(0, 10),
    amount,
    counterparty: tx.counterpartyName,
    memo: tx.memo,
    linkedSubject: tx.linkedSubject,
    folderId: tx.folderId,
    resolvedWorker: resolved,
    linkedVoucher: tx.linkedWorkerMonthlyPaymentVoucherId || null,
    linkedFixed: tx.linkedFixedExpensePaymentId || null,
    linkedCompany: tx.linkedCompanyExpenseId || null,
    matchScore: bestMatch?.score ?? null,
    matchReasons: bestMatch?.reasons ?? null,
    matchMonth: bestMatch?.obligation?.monthKey ?? null,
  });
}

const unlinked = buildUnlinkedWorkerBankWithdrawals(
  d.bankTransactions || [],
  d.bankTransactionFolders || [],
  workers,
  d.workerMonthlyActualVouchers || [],
).filter((tx) => resolveWorkerFromBankTx(tx, d.bankTransactionFolders || [], workers) === WORKER);

console.log("\n=== Unlinked worker bank withdrawals (" + unlinked.length + ") ===");
for (const tx of unlinked) {
  console.log({
    id: tx.id.slice(0, 8),
    date: String(tx.transactionAt).slice(0, 10),
    amount: Math.round(Number(tx.withdrawal) || 0),
    counterparty: tx.counterpartyName,
  });
}

const matches = listUnlinkedWorkerBankMatchesForWorker(
  WORKER,
  d.bankTransactions || [],
  d.bankTransactionFolders || [],
  workers,
  workerObligations,
  d.workerMonthlyActualVouchers || [],
);
const rankedTxIds = [...new Set(matches.map((row) => row.bankTransactionId))];
console.log("\n=== UI unlinkedBankForWorker count:", rankedTxIds.length, "===");
for (const id of rankedTxIds) {
  const tx = unlinked.find((t) => t.id === id);
  const m = matches.find((r) => r.bankTransactionId === id);
  console.log({
    id: id.slice(0, 8),
    date: m?.bankDate,
    amount: m?.bankAmount,
    score: m?.score,
    reasons: m?.reasons,
    month: m?.obligation?.monthKey,
  });
}

const excluded = allWorkerMention.filter((tx) => !rankedTxIds.includes(tx.id));
console.log("\n=== Excluded from UI (" + excluded.length + ") ===");
for (const tx of excluded) {
  const resolved = resolveWorkerNameFromBankTransaction(tx, d.bankTransactionFolders || [], workers);
  const inUnlinkedPool = unlinked.some((t) => t.id === tx.id);
  const [bestMatch] = buildWorkerBankMatchCandidates(tx, workerObligations, workers, { worker: WORKER });
  console.log({
    id: tx.id.slice(0, 8),
    date: String(tx.transactionAt).slice(0, 10),
    amount: Math.round(Number(tx.withdrawal) || 0),
    resolvedWorker: resolved,
    inUnlinkedPool,
    linkedVoucher: tx.linkedWorkerMonthlyPaymentVoucherId || null,
    linkedFixed: tx.linkedFixedExpensePaymentId || null,
    linkedCompany: tx.linkedCompanyExpenseId || null,
    matchScore: bestMatch?.score ?? null,
    whyExcluded:
      tx.linkedWorkerMonthlyPaymentVoucherId
        ? "already linked to worker monthly voucher"
        : !resolved
          ? "worker name not resolved"
          : resolved !== WORKER
            ? "resolved to other worker: " + resolved
            : !inUnlinkedPool
              ? "not in unlinked pool"
              : !bestMatch
                ? "amount mismatch with obligations"
                : "unknown",
  });
}
