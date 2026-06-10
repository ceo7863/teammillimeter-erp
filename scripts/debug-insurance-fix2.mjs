import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const raw = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

for (const partial of ["afd6e018", "d87f4cbb", "9657468f"]) {
  const t = (raw.bankTransactions || []).find((x) => x.id.startsWith(partial));
  console.log(partial, t ? { id: t.id, at: t.transactionAt, w: t.withdrawal, desc: t.description, memo: t.memo, linked: t.linkedFixedExpensePaymentId } : "NOT FOUND");
}
