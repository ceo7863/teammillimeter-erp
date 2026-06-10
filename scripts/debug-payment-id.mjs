import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const paymentId = process.argv[3];
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const p = (d.fixedExpensePayments || []).find((r) => r.id === paymentId || r.id.startsWith(paymentId));
const fe = p ? (d.fixedExpenses || []).find((r) => r.id === p.fixedExpenseId) : null;
console.log(JSON.stringify({ payment: p, fixedExpense: fe }, null, 2));
