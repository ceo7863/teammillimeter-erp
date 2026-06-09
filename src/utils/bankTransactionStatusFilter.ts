import type { BankTransaction } from "@/utils/bankTransactions";
import { isBankTransactionUnfiled } from "@/utils/bankCompanyLedger";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import { isLedgerInboxTransaction } from "@/utils/ledgerInboxUtils";
import { getBankTxLedgerCategoryLabel } from "@/utils/ledgerBankBridge";
import { resolveBankTxLedgerStatus, type LedgerCategory } from "@/utils/ledgerSystem";

export type BankTxStatusTab = "all" | "no_account" | "no_client" | "no_group" | "other_opex";

export type BankTxStatusFilterContext = {
  ledgerCategories: LedgerCategory[];
  companyExpenses: CompanyExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  fixedExpenses: FixedExpense[];
  ledgerRegistrationContext: Parameters<typeof isBankTransactionUnfiled>[1];
};

export function bankTxMissingAccountCategory(
  tx: BankTransaction,
  context: BankTxStatusFilterContext,
) {
  if (resolveBankTxLedgerStatus(tx) === "exempt") return false;
  if (isLedgerInboxTransaction(tx)) return true;
  const label = getBankTxLedgerCategoryLabel(
    tx,
    context.ledgerCategories,
    context.companyExpenses,
    context.fixedExpensePayments,
    context.fixedExpenses,
  );
  return !String(label || "").trim();
}

export function bankTxMissingClient(tx: BankTransaction) {
  if (tx.deposit <= 0) return false;
  return !String(tx.linkedSubject || "").trim();
}

export function bankTxMissingGroup(
  tx: BankTransaction,
  context: BankTxStatusFilterContext,
) {
  return isBankTransactionUnfiled(tx, context.ledgerRegistrationContext);
}

export function bankTxOtherOperatingExpense(
  tx: BankTransaction,
  context: BankTxStatusFilterContext,
) {
  const label = getBankTxLedgerCategoryLabel(
    tx,
    context.ledgerCategories,
    context.companyExpenses,
    context.fixedExpensePayments,
    context.fixedExpenses,
  );
  const normalized = String(label || "").replace(/\s+/g, "");
  return normalized.includes("\uAE30\uD0C0\uC601\uC5C5\uBE44\uC6A9") || (normalized.includes("\uAE30\uD0C0") && normalized.includes("\uC601\uC5C5"));
}

export function matchesBankTxStatusTab(
  tx: BankTransaction,
  tab: BankTxStatusTab,
  context: BankTxStatusFilterContext,
) {
  if (tab === "all") return true;
  if (tab === "no_account") return bankTxMissingAccountCategory(tx, context);
  if (tab === "no_client") return bankTxMissingClient(tx);
  if (tab === "no_group") return bankTxMissingGroup(tx, context);
  if (tab === "other_opex") return bankTxOtherOperatingExpense(tx, context);
  return true;
}

export function countBankTxStatusTabs(
  rows: BankTransaction[],
  context: BankTxStatusFilterContext,
): Record<Exclude<BankTxStatusTab, "all">, number> {
  let no_account = 0;
  let no_client = 0;
  let no_group = 0;
  let other_opex = 0;
  for (const row of rows) {
    if (bankTxMissingAccountCategory(row, context)) no_account += 1;
    if (bankTxMissingClient(row)) no_client += 1;
    if (bankTxMissingGroup(row, context)) no_group += 1;
    if (bankTxOtherOperatingExpense(row, context)) other_opex += 1;
  }
  return { no_account, no_client, no_group, other_opex };
}

export type BankTxEvidenceFilter = "all" | "linked" | "missing";

import { bankTxHasLinkedTaxInvoice } from "@/utils/bankTaxInvoiceLink";

export function matchesBankTxEvidenceFilter(tx: BankTransaction, filter: BankTxEvidenceFilter) {
  if (filter === "all") return true;
  const linked = bankTxHasLinkedTaxInvoice(tx);
  return filter === "linked" ? linked : !linked;
}

export type BankTxGroupFilter = "all" | "unfiled" | "client" | "worker" | "card";

export function matchesBankTxGroupFilter(
  tx: BankTransaction,
  filter: BankTxGroupFilter,
  options: {
    clientFolderIds: Set<string>;
    workerFolderIds: Set<string>;
    cardFolderIds: Set<string>;
    ledgerRegistrationContext: Parameters<typeof isBankTransactionUnfiled>[1];
  },
) {
  if (filter === "all") return true;
  if (filter === "unfiled") return isBankTransactionUnfiled(tx, options.ledgerRegistrationContext);
  const folderId = String(tx.folderId || "");
  if (filter === "client") return folderId && options.clientFolderIds.has(folderId);
  if (filter === "worker") return folderId && options.workerFolderIds.has(folderId);
  if (filter === "card") return folderId && options.cardFolderIds.has(folderId);
  return true;
}
