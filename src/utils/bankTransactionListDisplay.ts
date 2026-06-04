import {
  getBankMatchStatusLabel,
  isBankMatchAutoLinked,
  isBankMatchManualLinked,
} from "@/utils/bankReceivableMatch";
import { bankTxHasPartialPaymentVoucher } from "@/utils/bankSentStatementMatch";
import type { BankTransactionFolder, BankTransactionFolderType } from "@/utils/bankTransactionFolders";
import { getLinkedCompanyExpenseForBankTx, getLinkedFixedPaymentForBankTx } from "@/utils/bankCompanyLedger";
import { isNetGroupSuppressed } from "@/utils/bankPreauthNetting";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import { formatKRW } from "@/utils/companyLedger";
import {
  formatBankTransactionDateTime,
  isUnfiledClientDepositLink,
  type BankTransaction,
} from "@/utils/bankTransactions";

export type BankTransactionListRowModel = {
  id: string;
  dateLabel: string;
  depositLabel: string;
  withdrawalLabel: string;
  balanceLabel: string;
  description: string;
  memoLabel: string;
  counterpartyLabel: string;
  ledgerCategory: string | null;
  ledgerFromFixed: boolean;
  folderName: string | null;
  folderType: BankTransactionFolderType | null;
  classificationLabel: string;
  counterpartyBank: string;
  matchLinked: boolean;
  matchStatusLabel: string;
  showAutoLinkBadge: boolean;
  showManualLinkBadge: boolean;
  showPartialPaymentBadge: boolean;
  netGroupRole: BankTransaction["netGroupRole"];
  transactionType: string;
  rowTone: "" | "deposit" | "withdrawal" | "suppressed";
};

function resolveLinkedLedgerCategory(
  row: BankTransaction,
  lookup: BankTransactionListLookupMaps,
): string | null {
  let linkedExpense: CompanyExpense | undefined;
  if (row.linkedCompanyExpenseId) {
    linkedExpense = lookup.companyExpenseById.get(row.linkedCompanyExpenseId);
  }
  if (!linkedExpense) {
    linkedExpense = lookup.companyExpenseByTxId.get(row.id);
  }
  if (linkedExpense?.category?.trim()) return linkedExpense.category.trim();

  let linkedPayment: FixedExpensePayment | undefined;
  if (row.linkedFixedExpensePaymentId) {
    linkedPayment = lookup.fixedPaymentById.get(row.linkedFixedExpensePaymentId);
  }
  if (!linkedPayment) {
    linkedPayment = lookup.fixedPaymentByTxId.get(row.id);
  }
  if (linkedPayment) {
    const fixedItem = lookup.fixedExpenseById.get(linkedPayment.fixedExpenseId);
    if (fixedItem?.name?.trim()) return fixedItem.name.trim();
    return fixedItem?.category?.trim() || null;
  }
  return null;
}

export type BankTransactionListLookupMaps = {
  companyExpenseByTxId: Map<string, CompanyExpense>;
  companyExpenseById: Map<string, CompanyExpense>;
  fixedPaymentByTxId: Map<string, FixedExpensePayment>;
  fixedPaymentById: Map<string, FixedExpensePayment>;
  fixedExpenseById: Map<string, FixedExpense>;
};

export function buildBankTransactionListLookupMaps(
  companyExpenses: CompanyExpense[],
  fixedExpensePayments: FixedExpensePayment[],
  fixedExpenses: FixedExpense[],
): BankTransactionListLookupMaps {
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

  return {
    companyExpenseByTxId,
    companyExpenseById,
    fixedPaymentByTxId,
    fixedPaymentById,
    fixedExpenseById: new Map(fixedExpenses.map((item) => [item.id, item])),
  };
}

function isLedgerCategoryFromFixed(row: BankTransaction, lookup: BankTransactionListLookupMaps) {
  let linkedExpense = row.linkedCompanyExpenseId
    ? lookup.companyExpenseById.get(row.linkedCompanyExpenseId)
    : lookup.companyExpenseByTxId.get(row.id);
  if (linkedExpense?.kind === "fixed") return true;
  const linkedPayment = row.linkedFixedExpensePaymentId
    ? lookup.fixedPaymentById.get(row.linkedFixedExpensePaymentId)
    : lookup.fixedPaymentByTxId.get(row.id);
  return Boolean(linkedPayment);
}

export function buildBankTransactionListRowModels(
  rows: BankTransaction[],
  folderMap: Map<string, BankTransactionFolder>,
  ledgerCategoryFolder: BankTransactionFolder | undefined,
  lookup: BankTransactionListLookupMaps,
  labels: { unfiled: string; memoPlaceholder: string },
  paymentVouchers: Array<{ bankTransactionId?: string | number; isPartialPayment?: boolean }> = [],
): Map<string, BankTransactionListRowModel> {
  const cache = new Map<string, BankTransactionListRowModel>();

  for (const row of rows) {
    const folder = row.folderId ? folderMap.get(row.folderId) : undefined;
    const unfiledClientLink = isUnfiledClientDepositLink(row);
    const linkedSubjectName = String(row.linkedSubject || "").trim();
    const unfiledClientName =
      !folder && row.deposit > 0 && linkedSubjectName && (unfiledClientLink || row.linkedPaymentVoucherId)
        ? linkedSubjectName
        : "";
    const ledgerCategory = resolveLinkedLedgerCategory(row, lookup);
    const classificationLabel =
      folder?.folderName ||
      (unfiledClientName || null) ||
      (ledgerCategory && ledgerCategoryFolder ? ledgerCategoryFolder.folderName : labels.unfiled);

    const matchLinked = Boolean(row.linkedPaymentVoucherId);
    let matchStatusLabel = "-";
    if (matchLinked) {
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
      ledgerCategory,
      ledgerFromFixed: ledgerCategory ? isLedgerCategoryFromFixed(row, lookup) : false,
      folderName: folder?.folderName || unfiledClientName || null,
      folderType: folder?.folderType || (unfiledClientName ? "client" : null),
      classificationLabel,
      counterpartyBank: row.counterpartyBank || "-",
      matchLinked,
      matchStatusLabel,
      showAutoLinkBadge: matchLinked && isBankMatchAutoLinked(row),
      showManualLinkBadge: matchLinked && isBankMatchManualLinked(row),
      showPartialPaymentBadge: matchLinked && bankTxHasPartialPaymentVoucher(row, paymentVouchers),
      netGroupRole: row.netGroupRole,
      transactionType: row.transactionType || "-",
      rowTone,
    });
  }

  return cache;
}
