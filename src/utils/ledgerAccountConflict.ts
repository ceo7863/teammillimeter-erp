import type { BankTransaction } from "./bankTransactions";
import type { FixedExpense, FixedExpensePayment } from "./companyLedger";
import type { LedgerCategory } from "./ledgerSystem";
import { resolveFixedExpenseAccountCode } from "./ledgerSystem";

export const ACCOUNT_CONFLICT_MESSAGES = {
  fixedExpenseRegistered: "이미 고정비에 등록된 계정입니다.",
  fixedExpenseLinkedDifferentAccount:
    "이미 고정비에 연결된 거래입니다. 계정과목을 변경하면 고정비 연결이 해제됩니다. 계속하시겠습니까?",
  companyExpenseLinkedDifferentAccount:
    "이미 지출 항목에 연결된 거래입니다. 계정과목을 변경하면 지출 연결이 해제됩니다. 계속하시겠습니까?",
} as const;

export type AccountConflictCheckResult = {
  hasConflict: boolean;
  message?: string;
  linkedFixedExpensePaymentId?: string;
  linkedCompanyExpenseId?: string;
  expectedAccountCode?: string;
  nextAccountCode?: string;
  requiresConfirmation: boolean;
};

export function checkBankTxAccountCodeConflict(input: {
  tx: BankTransaction;
  nextAccountCode: string;
  fixedExpensePayments?: FixedExpensePayment[];
  fixedExpenses?: FixedExpense[];
  ledgerCategories?: LedgerCategory[];
}): AccountConflictCheckResult {
  const nextAccountCode = String(input.nextAccountCode || "").trim();
  if (!nextAccountCode) return { hasConflict: false, requiresConfirmation: false };
  const tx = input.tx;
  const linkedFixedExpensePaymentId = String(tx.linkedFixedExpensePaymentId || "").trim();
  const linkedCompanyExpenseId = String(tx.linkedCompanyExpenseId || "").trim();

  if (linkedFixedExpensePaymentId) {
    const payment = (input.fixedExpensePayments || []).find((row) => row.id === linkedFixedExpensePaymentId);
    const fixedItem = payment
      ? (input.fixedExpenses || []).find((row) => row.id === payment.fixedExpenseId)
      : undefined;
    const expectedAccountCode = resolveFixedExpenseAccountCode(fixedItem, input.ledgerCategories || []);
    if (expectedAccountCode === nextAccountCode) {
      return {
        hasConflict: true,
        message: ACCOUNT_CONFLICT_MESSAGES.fixedExpenseRegistered,
        linkedFixedExpensePaymentId,
        expectedAccountCode,
        nextAccountCode,
        requiresConfirmation: false,
      };
    }
    return {
      hasConflict: true,
      message: ACCOUNT_CONFLICT_MESSAGES.fixedExpenseLinkedDifferentAccount,
      linkedFixedExpensePaymentId,
      expectedAccountCode,
      nextAccountCode,
      requiresConfirmation: true,
    };
  }

  if (linkedCompanyExpenseId) {
    return {
      hasConflict: true,
      message: ACCOUNT_CONFLICT_MESSAGES.companyExpenseLinkedDifferentAccount,
      linkedCompanyExpenseId,
      nextAccountCode,
      requiresConfirmation: true,
    };
  }

  return { hasConflict: false, requiresConfirmation: false };
}
