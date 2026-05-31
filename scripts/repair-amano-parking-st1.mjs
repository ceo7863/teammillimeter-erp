import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const dbPath = process.argv[2] || "data/erp.sqlite";
const targetFixedName = process.argv[3] || "\uC720\uB8CC\uC8FC\uCC28\uBE44(ST1)";
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const d = JSON.parse(row.payload);

const targetFixed = (d.fixedExpenses || []).find((item) => String(item.name || "") === targetFixedName);
if (!targetFixed) {
  console.error("fixed expense not found:", targetFixedName);
  process.exit(1);
}

const txIds = [
  "ff007e8d-eac1-48d5-b94e-6c4867f9f1df",
  "bfa7efa8-c4ce-4c47-a009-b317cd55419f",
];

let paymentUpdates = 0;
let ruleUpdates = 0;

for (const txId of txIds) {
  const tx = (d.bankTransactions || []).find((row) => row.id === txId);
  if (!tx) continue;
  const payment = (d.fixedExpensePayments || []).find(
    (row) => row.id === tx.linkedFixedExpensePaymentId || row.bankTransactionId === txId,
  );
  if (payment && payment.fixedExpenseId !== targetFixed.id) {
    payment.fixedExpenseId = targetFixed.id;
    payment.category = targetFixed.category;
    paymentUpdates += 1;
    console.log("payment", payment.id, "->", targetFixed.name);
  }
}

for (const rule of d.bankLedgerRules || []) {
  const hay = [rule.counterpartyName, ...(Array.isArray(rule.descriptionTokens) ? rule.descriptionTokens : [])].join(" ");
  if (rule.kind === "fixed" && hay.includes("\uC544\uB9C8\uB178") && rule.fixedExpenseId !== targetFixed.id) {
    rule.fixedExpenseId = targetFixed.id;
    ruleUpdates += 1;
    console.log("rule", rule.id, "->", targetFixed.id);
  }
}

console.log({ paymentUpdates, ruleUpdates, dryRun });

if (!dryRun && (paymentUpdates > 0 || ruleUpdates > 0)) {
  db.prepare("UPDATE erp_state SET payload = ?, updated_at = datetime('now') WHERE id = 1").run(JSON.stringify(d));
  console.log("saved");
}
