import { getDb, getErpState } from "../server/db.mjs";

const TX_ID = "4e4098b8-4b56-4af6-8e50-c0be050bc975";
process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data, version } = getErpState();
const tx = (data.bankTransactions || []).find((r) => r.id === TX_ID);
const sale3599 = (data.sales || []).find((s) => String(s.id) === "3599");
const vouchers = (data.paymentVouchers || []).filter((v) => String(v.bankTransactionId) === TX_ID);
const expense = (data.companyExpenses || []).find((e) => e.id === tx?.linkedCompanyExpenseId);
const client = (data.clients || []).find((c) => String(c.name || "").trim() === String(tx?.linkedSubject || "").trim());

console.log(JSON.stringify({ version, tx, sale3599, vouchers, expense, client }, null, 2));
