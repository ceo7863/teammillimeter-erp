import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const d = JSON.parse(row.payload);

const fixedByName = Object.fromEntries((d.fixedExpenses || []).map((item) => [String(item.name || ""), item]));
const ray = fixedByName["\uC720\uB8CC\uC8FC\uCC28\uBE44(\uB808\uC774)"];
const st1 = fixedByName["\uC720\uB8CC\uC8FC\uCC28\uBE44(ST1)"];
if (!ray || !st1) {
  console.error("missing fixed expense items", Object.keys(fixedByName).filter((name) => name.includes("ST1") || name.includes("\uB808\uC774")));
  process.exit(1);
}

const assignments = [
  { txId: "ff007e8d-eac1-48d5-b94e-6c4867f9f1df", fixed: ray },
  { txId: "bfa7efa8-c4ce-4c47-a009-b317cd55419f", fixed: st1 },
];

let paymentUpdates = 0;

for (const { txId, fixed } of assignments) {
  const tx = (d.bankTransactions || []).find((row) => row.id === txId);
  if (!tx) continue;
  const payment = (d.fixedExpensePayments || []).find(
    (row) => row.id === tx.linkedFixedExpensePaymentId || row.bankTransactionId === txId,
  );
  if (!payment) {
    console.log("no payment for", txId.slice(0, 8));
    continue;
  }
  if (payment.fixedExpenseId !== fixed.id) {
    payment.fixedExpenseId = fixed.id;
    payment.category = fixed.category;
    paymentUpdates += 1;
    console.log("payment", payment.id.slice(0, 8), "->", fixed.name);
  }
  tx.linkedFixedExpensePaymentId = payment.id;
  payment.bankTransactionId = txId;
}

console.log({ paymentUpdates, dryRun });

if (!dryRun && paymentUpdates > 0) {
  db.prepare("UPDATE erp_state SET payload = ?, updated_at = datetime('now') WHERE id = 1").run(JSON.stringify(d));
  console.log("saved");
}
