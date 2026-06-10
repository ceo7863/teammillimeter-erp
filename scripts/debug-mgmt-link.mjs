import { DatabaseSync } from "node:sqlite";
import path from "path";

const dbPath = process.argv[2] || path.join(process.cwd(), "data", "erp.sqlite");
const db = new DatabaseSync(dbPath);
const raw = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const ids = ["389a79f4-c339-4b5a-aa17-0f15fbf9f3ca", "fe4658bf-832b-4912-9988-0b637d962ed3"];
for (const id of ids) {
  const exp = (raw.companyExpenses || []).find((e) => e.id === id);
  const tx = (raw.bankTransactions || []).find((t) => t.linkedCompanyExpenseId === id);
  console.log(JSON.stringify({ expense: exp, tx }, null, 2));
}

const paymentId = "a95744fd-d4d6-4cd1-8f97-ebba8a3c3d64";
const payment = (raw.fixedExpensePayments || []).find((p) => p.id === paymentId);
console.log("\nPAYMENT", payment);

function haystack(tx) {
  return [tx.counterpartyName, tx.description, tx.memo, String(tx.withdrawal || "")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const keyword = "\uAD00\uB9AC\uBE44";
for (const tx of raw.bankTransactions || []) {
  if (!String(tx.transactionAt || "").startsWith("2026-05")) continue;
  if (!haystack(tx).includes(keyword)) continue;
  console.log("\nMATCH", {
    id: tx.id,
    haystack: haystack(tx),
    withdrawal: tx.withdrawal,
    folderId: tx.folderId,
    linkedCompanyExpenseId: tx.linkedCompanyExpenseId,
    netGroupId: tx.netGroupId,
    netGroupRole: tx.netGroupRole,
  });
}
