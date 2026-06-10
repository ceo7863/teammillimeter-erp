import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const db = new DatabaseSync(dbPath);
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const NAME = "\uB178\uD76C\uC815";
const DATES = ["2026-04-10", "2025-04-10"];

const txs = (d.bankTransactions || []).filter((tx) => {
  const date = String(tx.transactionAt || tx.date || "").slice(0, 10);
  if (!DATES.includes(date)) return false;
  const hay = [tx.counterpartyName, tx.description, tx.memo, tx.linkedSubject].join(" ");
  return hay.includes(NAME);
});

console.log("=== bank txs matching", NAME, "on", DATES.join(" / "), "count:", txs.length);

for (const tx of txs) {
  const expense =
    (d.companyExpenses || []).find((row) => row.id === tx.linkedCompanyExpenseId) ||
    (d.companyExpenses || []).find((row) => row.bankTransactionId === tx.id);
  const payment =
    (d.fixedExpensePayments || []).find((row) => row.id === tx.linkedFixedExpensePaymentId) ||
    (d.fixedExpensePayments || []).find((row) => row.bankTransactionId === tx.id);
  const folder = (d.bankTransactionFolders || []).find((f) => f.id === tx.folderId);
  const rules = (d.bankLedgerRules || []).filter((r) => {
    const hay = [r.counterpartyName, r.description, r.memo, r.keyword].join(" ");
    return hay.includes(NAME) || (r.category && r.category.includes("\uC778\uAC74\uBE44"));
  });

  console.log(JSON.stringify({
    id: tx.id,
    at: tx.transactionAt || tx.date,
    counterparty: tx.counterpartyName,
    desc: tx.description,
    memo: tx.memo,
    linkedSubject: tx.linkedSubject,
    withdrawal: tx.withdrawal,
    deposit: tx.deposit,
    folderId: tx.folderId || "(empty)",
    folderName: folder?.folderName || folder?.name,
    linkedExpenseId: tx.linkedCompanyExpenseId,
    expenseCategory: expense?.category,
    expenseDesc: expense?.description,
    expenseKind: expense?.kind,
    expenseId: expense?.id,
    linkedPaymentId: tx.linkedFixedExpensePaymentId,
    paymentCategory: payment?.category,
    classifiedAt: tx.classifiedAt,
    matchAutoLinked: tx.matchAutoLinked,
  }, null, 2));

  if (rules.length) {
    console.log("  learn rules:", rules.map((r) => ({
      id: r.id,
      category: r.category,
      kind: r.kind,
      counterpartyName: r.counterpartyName,
      keyword: r.keyword,
      fixedExpenseId: r.fixedExpenseId,
    })));
  }
}

// Also search companyExpenses directly
const expenses = (d.companyExpenses || []).filter((row) => {
  const date = String(row.date || "").slice(0, 10);
  if (!DATES.includes(date)) return false;
  const hay = [row.description, row.memo, row.category].join(" ");
  return hay.includes(NAME);
});
console.log("\n=== companyExpenses direct match count:", expenses.length);
for (const e of expenses) {
  console.log(JSON.stringify({ id: e.id, date: e.date, category: e.category, desc: e.description, bankTxId: e.bankTransactionId }, null, 2));
}

// Worker folder txs on those dates
const workerFolder = "bank-folder-worker-default";
const workerTxs = (d.bankTransactions || []).filter((tx) => {
  const date = String(tx.transactionAt || tx.date || "").slice(0, 10);
  return DATES.includes(date) && tx.folderId === workerFolder;
});
console.log("\n=== worker folder txs on those dates:", workerTxs.length);
for (const tx of workerTxs) {
  const hay = [tx.counterpartyName, tx.description, tx.memo, tx.linkedSubject].join(" ");
  if (hay.includes(NAME)) {
    console.log(JSON.stringify({ id: tx.id, counterparty: tx.counterpartyName, linkedSubject: tx.linkedSubject, w: tx.withdrawal }, null, 2));
  }
}
