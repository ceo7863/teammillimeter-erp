/**
 * ?? ???(??�??? ??�?? ??�??? ?? ??) ???
 * Usage: node scripts/reset-company-ledger.mjs
 */
import { initDb, getErpState, saveErpState } from "../server/db.mjs";
import { config } from "../server/config.mjs";

initDb();
const { data, version } = getErpState();

const beforeExpenses = Array.isArray(data.companyExpenses) ? data.companyExpenses.length : 0;
const beforePayments = Array.isArray(data.fixedExpensePayments) ? data.fixedExpensePayments.length : 0;
const beforeRules = Array.isArray(data.bankLedgerRules) ? data.bankLedgerRules.length : 0;
const beforeLinkedTx = Array.isArray(data.bankTransactions)
  ? data.bankTransactions.filter(
      (row) => row?.linkedCompanyExpenseId || row?.linkedFixedExpensePaymentId,
    ).length
  : 0;

const next = {
  ...data,
  companyExpenses: [],
  fixedExpensePayments: [],
  bankLedgerRules: (Array.isArray(data.bankLedgerRules) ? data.bankLedgerRules : []).filter(
    (rule) => rule?.kind === "folder",
  ),
  bankTransactions: (Array.isArray(data.bankTransactions) ? data.bankTransactions : []).map((row) => ({
    ...row,
    linkedCompanyExpenseId: undefined,
    linkedFixedExpensePaymentId: undefined,
  })),
};

saveErpState(next, version, "reset-company-ledger");

console.log("company ledger reset complete");
console.log(`db: ${config.dbPath}`);
console.log(`companyExpenses removed: ${beforeExpenses}`);
console.log(`fixedExpensePayments removed: ${beforePayments}`);
console.log(`bankLedgerRules removed (non-folder): ${beforeRules - next.bankLedgerRules.length}`);
console.log(`bankTransactions unlinked: ${beforeLinkedTx}`);
console.log(`fixedExpenses master kept: ${Array.isArray(data.fixedExpenses) ? data.fixedExpenses.length : 0}`);
