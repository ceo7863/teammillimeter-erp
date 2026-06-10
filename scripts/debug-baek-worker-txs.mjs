import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);
const CEO = "\uBC30\uC885\uC6D0";
const workerFolder = "bank-folder-worker-default";

for (const tx of d.bankTransactions || []) {
  if (tx.folderId !== workerFolder) continue;
  const hay = [tx.counterpartyName, tx.description, tx.memo, tx.linkedSubject].join(" ");
  if (!hay.includes(CEO)) continue;
  console.log({
    id: tx.id,
    at: tx.transactionAt,
    counterparty: tx.counterpartyName,
    desc: tx.description,
    linkedSubject: tx.linkedSubject,
    w: tx.withdrawal,
    d: tx.deposit,
  });
}
