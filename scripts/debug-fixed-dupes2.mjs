import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const raw = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

const ids = ["123965d1", "a7d8ee01", "f5ce045e", "0d9b73b2", "8436b199", "b828b1b1", "f758f695"];
for (const partial of ids) {
  const p = (raw.fixedExpensePayments || []).find((x) => x.id.startsWith(partial));
  if (!p) continue;
  const fe = (raw.fixedExpenses || []).find((x) => x.id === p.fixedExpenseId);
  console.log(JSON.stringify({ payment: p, fixedName: fe?.name, fixedAmount: fe?.amount }));
}
