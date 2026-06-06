import type { BankTransaction } from "./bankTransactions";
import {
  assignBankTxToFixedExpensePayment,
  getLinkedCompanyExpenseForBankTx,
  getLinkedFixedPaymentForBankTx,
} from "./bankCompanyLedger";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "./companyLedger";
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
  _ledgerCategories: LedgerCategory[] = [],
): string | null {
  const code = String(tx.ledgerAccountCode || "").trim();
  return code || null;
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

  return {
    ...input.tx,
    ledgerStatus: "confirmed",
    ledgerCategoryId: undefined,
    ledgerAccountCode: code,
    ledgerMemo: input.tx.ledgerMemo || input.tx.memo,
    ledgerFixedExpenseId: undefined,
    ledgerConfirmedAt: new Date().toISOString(),
    ledgerConfirmedBy: input.confirmedBy,
    linkedCompanyExpenseId: undefined,
    linkedFixedExpensePaymentId: undefined,
  };
}

export function linkBankTransactionToFixedExpense(input: {
  tx: BankTransaction;
  fixedExpenseId: string;
  fixedExpenses: FixedExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
  confirmedBy?: string;
}):
  | { ok: true; tx: BankTransaction; payments: FixedExpensePayment[] }
  | { ok: false; reason: "missing_item" | "missing_category" } {
  const fixedItem = input.fixedExpenses.find((row) => row.id === input.fixedExpenseId);
  if (!fixedItem) return { ok: false, reason: "missing_item" };

  const categoryName = fixedItem.category?.trim() || fixedItem.name?.trim() || "";
  const category =
    findLedgerCategoryByName(input.ledgerCategories, categoryName) ||
    input.ledgerCategories.find((row) => row.kind === "fixed" && row.isActive);
  if (!category) return { ok: false, reason: "missing_category" };

  let nextPayments = input.fixedExpensePayments;
  let nextRow = confirmBankTransactionLedger({
    tx: input.tx,
    category,
    accountCodes: input.accountCodes,
    confirmedBy: input.confirmedBy,
    fixedExpenseId: fixedItem.id,
    memo: input.tx.ledgerMemo || input.tx.memo,
  });

  if (Number(input.tx.withdrawal || 0) > 0) {
    const assignment = assignBankTxToFixedExpensePayment({
      tx: nextRow,
      resolvedFixedExpenseId: fixedItem.id,
      fixedItem,
      payments: nextPayments,
      fixedExpenses: input.fixedExpenses,
      resolvedCategory: categoryName,
      memo: nextRow.ledgerMemo || nextRow.memo,
      savedBy: input.confirmedBy,
    });
    nextPayments = assignment.payments;
    if (assignment.paymentId) {
      nextRow = {
        ...nextRow,
        linkedFixedExpensePaymentId: assignment.paymentId,
        linkedCompanyExpenseId: undefined,
      };
    }
  }

  return { ok: true, tx: nextRow, payments: nextPayments };
}

export function resolveBankTxFixedExpenseDraft(
  tx: BankTransaction,
  fixedExpensePayments: FixedExpensePayment[],
): string {
  if (tx.ledgerFixedExpenseId) return tx.ledgerFixedExpenseId;
  const linkedPayment = getLinkedFixedPaymentForBankTx(tx, fixedExpensePayments);
  return linkedPayment?.fixedExpenseId || "";
}
