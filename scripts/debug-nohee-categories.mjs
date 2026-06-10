import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

console.log("expenseCategories:", d.expenseCategories);
console.log("fixedExpenseCategories:", d.fixedExpenseCategories);

const labor = "\uC778\uAC74\uBE44";
const hasLabor = (d.expenseCategories || []).some((c) => String(c).includes(labor));
console.log("has ??? in expenseCategories:", hasLabor);

// expenses with ??? category
const laborExpenses = (d.companyExpenses || []).filter((e) => String(e.category || "").includes(labor));
console.log("companyExpenses with ???:", laborExpenses.length);
if (laborExpenses.length) console.log(laborExpenses.slice(0, 3));

// rules with ???
const laborRules = (d.bankLedgerRules || []).filter((r) => String(r.category || "").includes(labor));
console.log("bankLedgerRules with ???:", laborRules.length);
if (laborRules.length) console.log(laborRules.slice(0, 5));
