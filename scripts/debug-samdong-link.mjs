import { DatabaseSync } from "node:sqlite";

const SAMDONG = "\uC0BC\uB3D9\uC18C\uBC14";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const raw = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

const txIds = ["53249da0", "3e855c42", "ef2fe3ca"];
for (const partial of txIds) {
  const tx = (raw.bankTransactions || []).find((t) => t.id.startsWith(partial) || t.id === partial);
  if (!tx) continue;
  console.log("TX", tx.id, tx.netGroupRole, tx.linkedCompanyExpenseId);
  const exp = (raw.companyExpenses || []).find(
    (e) => e.id === tx.linkedCompanyExpenseId || e.bankTransactionId === tx.id,
  );
  console.log("EXP", exp ? { id: exp.id, bankTransactionId: exp.bankTransactionId, amount: exp.amount } : null);
}
