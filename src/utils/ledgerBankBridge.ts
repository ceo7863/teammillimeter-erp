import type { BankTransaction } from "./bankTransactions";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "./companyLedger";
import { getLinkedCompanyExpenseForBankTx, getLinkedFixedPaymentForBankTx } from "./bankCompanyLedger";
import { isLedgerInboxTransaction } from "./ledgerInboxUtils";
import {
  confirmBankTransactionLedger,
  findAccountCodeByCode,
  findLedgerCategory,
  findLedgerCategoryByName,
  resolveBankTxLedgerStatus,
  type AccountCode,
  type LedgerCategory,
} from "./ledgerSystem";

export type LedgerScopeFilter = "all" | "ledger_pending" | "ledger_done" | "ledger_exempt";

export function isBankTxLegacyLedgerLinked(
  tx: BankTransaction,
  companyExpenses: CompanyExpense[] = [],
  fixedExpensePayments: FixedExpensePayment[] = [],
) {
  return Boolean(
    getLinkedCompanyExpenseForBankTx(tx, companyExpenses) ||
      getLinkedFixedPaymentForBankTx(tx, fixedExpensePayments),
  );
}

export function isBankTxLedgerClassified(
  tx: BankTransaction,
  companyExpenses: CompanyExpense[] = [],
  fixedExpensePayments: FixedExpensePayment[] = [],
) {
  const status = resolveBankTxLedgerStatus(tx);
  if (status === "confirmed") return true;
  return isBankTxLegacyLedgerLinked(tx, companyExpenses, fixedExpensePayments);
}

export function matchesBankTxLedgerScope(
  tx: BankTransaction,
  scope: LedgerScopeFilter,
  companyExpenses: CompanyExpense[] = [],
  fixedExpensePayments: FixedExpensePayment[] = [],
) {
  if (scope === "all") return true;
  if (scope === "ledger_pending") return isLedgerInboxTransaction(tx);
  if (scope === "ledger_done") return isBankTxLedgerClassified(tx, companyExpenses, fixedExpensePayments);
  if (scope === "ledger_exempt") return resolveBankTxLedgerStatus(tx) === "exempt";
  return true;
}

export function getBankTxLedgerCategoryLabel(
  tx: BankTransaction,
  ledgerCategories: LedgerCategory[],
  companyExpenses: CompanyExpense[] = [],
  fixedExpensePayments: FixedExpensePayment[] = [],
  fixedExpenses: FixedExpense[] = [],
): string | null {
  if (resolveBankTxLedgerStatus(tx) === "exempt") return null;

  if (tx.ledgerCategoryId) {
    const category = findLedgerCategory(ledgerCategories, tx.ledgerCategoryId);
    if (category?.name) return category.name;
  }

  const linkedExpense = getLinkedCompanyExpenseForBankTx(tx, companyExpenses);
  if (linkedExpense?.category?.trim()) return linkedExpense.category.trim();

  const linkedPayment = getLinkedFixedPaymentForBankTx(tx, fixedExpensePayments);
  if (linkedPayment) {
    const fixedItem = fixedExpenses.find((item) => item.id === linkedPayment.fixedExpenseId);
    if (fixedItem?.name?.trim()) return fixedItem.name.trim();
    return fixedItem?.category?.trim() || linkedPayment.category?.trim() || null;
  }

  return null;
}

export function getBankTxLedgerAccountCodeLabel(
  tx: BankTransaction,
  ledgerCategories: LedgerCategory[],
): string | null {
  if (tx.ledgerAccountCode?.trim()) return tx.ledgerAccountCode.trim();
  if (tx.ledgerCategoryId) {
    const category = findLedgerCategory(ledgerCategories, tx.ledgerCategoryId);
    if (category?.accountCode) return category.accountCode;
  }
  return null;
}

export function registerBankTxWithCategoryName(input: {
  tx: BankTransaction;
  categoryName: string;
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
  confirmedBy?: string;
  fixedExpenseId?: string;
}): BankTransaction | null {
  const category = findLedgerCategoryByName(input.ledgerCategories, input.categoryName.trim());
  if (!category) return null;
  return confirmBankTransactionLedger({
    tx: input.tx,
    category,
    accountCodes: input.accountCodes,
    confirmedBy: input.confirmedBy,
    fixedExpenseId: input.fixedExpenseId,
  });
}

export function assignBankTransactionAccountCode(input: {
  tx: BankTransaction;
  accountCode: string;
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
  confirmedBy?: string;
}): BankTransaction | null {
  const code = String(input.accountCode || "").trim();
  if (!code) return null;
  const account = findAccountCodeByCode(input.accountCodes, code);
  if (account?.isActive === false) return null;

  const matchingCategory = input.ledgerCategories.find(
    (row) => row.isActive && String(row.accountCode || "").trim() === code,
  );

  if (matchingCategory) {
    return confirmBankTransactionLedger({
      tx: input.tx,
      category: matchingCategory,
      accountCodes: input.accountCodes,
      accountCode: code,
      confirmedBy: input.confirmedBy,
      fixedExpenseId: input.tx.ledgerFixedExpenseId,
      memo: input.tx.ledgerMemo || input.tx.memo,
    });
  }

  return {
    ...input.tx,
    ledgerStatus: "confirmed",
    ledgerCategoryId: null,
    ledgerAccountCode: code,
    ledgerMemo: input.tx.ledgerMemo || input.tx.memo,
    ledgerConfirmedAt: new Date().toISOString(),
    ledgerConfirmedBy: input.confirmedBy,
    linkedCompanyExpenseId: undefined,
    linkedFixedExpensePaymentId: undefined,
  };
}
