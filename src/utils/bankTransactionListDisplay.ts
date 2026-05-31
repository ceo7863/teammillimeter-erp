import { getBankMatchStatusLabel } from "@/utils/bankReceivableMatch";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import { getLinkedCompanyExpenseForBankTx, getLinkedFixedPaymentForBankTx } from "@/utils/bankCompanyLedger";
import { isNetGroupSuppressed } from "@/utils/bankPreauthNetting";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import { formatKRW } from "@/utils/companyLedger";
import { formatBankTransactionDateTime, type BankTransaction } from "@/utils/bankTransactions";

export type BankTransactionListRowModel = {
  id: string;
  dateLabel: string;
  depositLabel: string;
  withdrawalLabel: string;
  balanceLabel: string;
  description: string;
  memoLabel: string;
  counterpartyLabel: string;
  ledgerCategoryLabel: string;
  classificationLabel: string;
  counterpartyBank: string;
  matchStatusLabel: string;
  transactionType: string;
  rowTone: "" | "deposit" | "withdrawal" | "suppressed";
};

function resolveLinkedLedgerCategory(
  row: BankTransaction,
  companyExpenseByTxId: Map<string, CompanyExpense>,
  companyExpenseById: Map<string, CompanyExpense>,
  fixedPaymentByTxId: Map<string, FixedExpensePayment>,
  fixedPaymentById: Map<string, FixedExpensePayment>,
  fixedExpenseById: Map<string, FixedExpense>,
): string | null {
  let linkedExpense: CompanyExpense | undefined;
  if (row.linkedCompanyExpenseId) {
    linkedExpense = companyExpenseById.get(row.linkedCompanyExpenseId);
  }
  if (!linkedExpense) {
    linkedExpense = companyExpenseByTxId.get(row.id);
  }
  if (linkedExpense?.category?.trim()) return linkedExpense.category.trim();

  let linkedPayment: FixedExpensePayment | undefined;
  if (row.linkedFixedExpensePaymentId) {
    linkedPayment = fixedPaymentById.get(row.linkedFixedExpensePaymentId);
  }
  if (!linkedPayment) {
    linkedPayment = fixedPaymentByTxId.get(row.id);
  }
  if (linkedPayment) {
    const fixedItem = fixedExpenseById.get(linkedPayment.fixedExpenseId);
    if (fixedItem?.name?.trim()) return fixedItem.name.trim();
    return fixedItem?.category?.trim() || null;
  }
  return null;
}

export function buildBankTransactionListRowModels(
  rows: BankTransaction[],
  folderMap: Map<string, BankTransactionFolder>,
  ledgerCategoryFolder: BankTransactionFolder | undefined,
  companyExpenses: CompanyExpense[],
  fixedExpensePayments: FixedExpensePayment[],
  fixedExpenses: FixedExpense[],
  labels: { unfiled: string; memoPlaceholder: string },
): Map<string, BankTransactionListRowModel> {
  const companyExpenseByTxId = new Map<string, CompanyExpense>();
  const companyExpenseById = new Map<string, CompanyExpense>();
  for (const expense of companyExpenses) {
    companyExpenseById.set(expense.id, expense);
    if (expense.bankTransactionId) {
      companyExpenseByTxId.set(expense.bankTransactionId, expense);
    }
  }

  const fixedPaymentByTxId = new Map<string, FixedExpensePayment>();
  const fixedPaymentById = new Map<string, FixedExpensePayment>();
  for (const payment of fixedExpensePayments) {
    fixedPaymentById.set(payment.id, payment);
    if (payment.bankTransactionId) {
      fixedPaymentByTxId.set(payment.bankTransactionId, payment);
    }
  }

  const fixedExpenseById = new Map(fixedExpenses.map((item) => [item.id, item]));
  const cache = new Map<string, BankTransactionListRowModel>();

  for (const row of rows) {
    const folder = row.folderId ? folderMap.get(row.folderId) : undefined;
    const ledgerCategory = resolveLinkedLedgerCategory(
      row,
      companyExpenseByTxId,
      companyExpenseById,
      fixedPaymentByTxId,
      fixedPaymentById,
      fixedExpenseById,
    );
    const classificationLabel = folder?.folderName || labels.unfiled;

    let matchStatusLabel = "-";
    if (row.linkedPaymentVoucherId) {
      matchStatusLabel = getBankMatchStatusLabel(row);
    } else if (row.deposit > 0) {
      matchStatusLabel = "\uBBF8\uC5F0\uACB0";
    }

    const suppressed = isNetGroupSuppressed(row);
    const rowTone: BankTransactionListRowModel["rowTone"] = suppressed
      ? "suppressed"
      : row.deposit > 0
        ? "deposit"
        : row.withdrawal > 0
          ? "withdrawal"
          : "";

    cache.set(row.id, {
      id: row.id,
      dateLabel: formatBankTransactionDateTime(row.transactionAt),
      depositLabel: row.deposit > 0 ? formatKRW(row.deposit) : "-",
      withdrawalLabel: row.withdrawal > 0 ? formatKRW(row.withdrawal) : "-",
      balanceLabel: formatKRW(row.balanceAfter),
      description: row.description || "-",
      memoLabel: row.memo || labels.memoPlaceholder,
      counterpartyLabel: row.counterpartyName || "-",
      ledgerCategoryLabel: ledgerCategory || "-",
      classificationLabel,
      counterpartyBank: row.counterpartyBank || "-",
      matchStatusLabel,
      transactionType: row.transactionType || "-",
      rowTone,
    });
  }

  return cache;
}
