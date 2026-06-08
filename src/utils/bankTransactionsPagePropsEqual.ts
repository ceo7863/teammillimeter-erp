import type { ComponentProps } from "react";
import type { BankTransactionsPage } from "@/components/BankTransactionsPage";

export type BankTransactionsPageProps = ComponentProps<typeof BankTransactionsPage>;

const DATA_PROP_KEYS = [
  "bankTransactions",
  "bankTransactionFolders",
  "clients",
  "workers",
  "receivableRows",
  "sales",
  "paymentVouchers",
  "companyExpenses",
  "fixedExpenses",
  "fixedExpensePayments",
  "bankLedgerRules",
  "expenseCategories",
  "fixedExpenseCategories",
  "ledgerCategories",
  "accountCodes",
  "taxInvoices",
  "currentUser",
  "companyProfile",
] as const satisfies readonly (keyof BankTransactionsPageProps)[];

const HANDLER_PROP_KEYS = [
  "setBankTransactions",
  "setBankTransactionFolders",
  "setClients",
  "setPaymentVouchers",
  "setPaymentInputLogs",
  "setCompanyExpenses",
  "setFixedExpenses",
  "setFixedExpensePayments",
  "setBankLedgerRules",
  "setExpenseCategories",
  "setFixedExpenseCategories",
  "setTaxInvoices",
  "onNavigateToCompanyLedger",
  "onNavigateToClassify",
  "onNavigateToFixedExpense",
  "onNavigateToTaxInvoice",
  "onBankSyncBegin",
  "onBankSynced",
  "onRequestImmediateSave",
] as const satisfies readonly (keyof BankTransactionsPageProps)[];

/** Skip parent-driven re-renders when bank data references are unchanged. */
export function bankTransactionsPagePropsAreEqual(
  prev: BankTransactionsPageProps,
  next: BankTransactionsPageProps,
): boolean {
  if (prev.isPageActive !== next.isPageActive) return false;
  if (prev.apiMode !== next.apiMode) return false;

  for (const key of DATA_PROP_KEYS) {
    if (prev[key] !== next[key]) return false;
  }
  for (const key of HANDLER_PROP_KEYS) {
    if (prev[key] !== next[key]) return false;
  }

  if (next.isPageActive) {
    if (prev.bankListRefreshAt !== next.bankListRefreshAt) return false;
    if (prev.erpVersion !== next.erpVersion) return false;
  }

  return true;
}
