import type { BankTransaction } from "@/utils/bankTransactions";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import {
  getLinkedCompanyExpenseForBankTx,
  getLinkedFixedPaymentForBankTx,
} from "@/utils/bankCompanyLedger";
import { isNetGroupSuppressed } from "@/utils/bankPreauthNetting";
import type { ParsedTable } from "@/utils/tableExport";
import { formatBankTransactionDateTime } from "@/utils/bankTransactions";
import { formatKRW } from "@/utils/companyLedger";
import { getBankMatchStatusLabel } from "@/utils/bankReceivableMatch";

export type BankTransactionRowDisplay = {
  ledgerCategory: string | null;
  ledgerFromFixed: boolean;
  ledgerSuggestion: string | null;
  canLedger: boolean;
  suppressed: boolean;
};

type BuildRowDisplayCacheInput = {
  rows: BankTransaction[];
  companyExpenses: CompanyExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  fixedExpenses: FixedExpense[];
  memoCategorySuggestionByTxId: Map<string, { category: string }>;
  ledgerSuggestionByTxId: Map<string, { label?: string }>;
  canRegisterLedgerWithConfidence: (tx: BankTransaction) => boolean;
  resolveLedgerCategorySuggestionLabel: (row: BankTransaction) => string | null;
};

function resolveLedgerCategoryLabel(
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

  const linkedPayment = resolveLinkedFixedPaymentFromLookup(
    row,
    fixedPaymentById,
    fixedPaymentByTxId,
  );
  if (linkedPayment) {
    const fixedItem = fixedExpenseById.get(linkedPayment.fixedExpenseId);
    if (fixedItem?.name?.trim()) return fixedItem.name.trim();
    return fixedItem?.category?.trim() || null;
  }
  return null;
}

function isLedgerCategoryFromFixed(
  row: BankTransaction,
  companyExpenseByTxId: Map<string, CompanyExpense>,
  companyExpenseById: Map<string, CompanyExpense>,
  fixedPaymentByTxId: Map<string, FixedExpensePayment>,
  fixedPaymentById: Map<string, FixedExpensePayment>,
): boolean {
  let linkedExpense: CompanyExpense | undefined;
  if (row.linkedCompanyExpenseId) {
    linkedExpense = companyExpenseById.get(row.linkedCompanyExpenseId);
  }
  if (!linkedExpense) {
    linkedExpense = companyExpenseByTxId.get(row.id);
  }
  if (linkedExpense?.kind === "fixed") return true;
  return Boolean(
    resolveLinkedFixedPaymentFromLookup(row, fixedPaymentById, fixedPaymentByTxId),
  );
}

function resolveLinkedFixedPaymentFromLookup(
  row: BankTransaction,
  fixedPaymentById: Map<string, FixedExpensePayment>,
  fixedPaymentByTxId: Map<string, FixedExpensePayment>,
): FixedExpensePayment | undefined {
  if (row.linkedFixedExpensePaymentId) {
    const linked = fixedPaymentById.get(row.linkedFixedExpensePaymentId);
    if (linked) return linked;
  }
  return fixedPaymentByTxId.get(row.id);
}

export function buildBankTransactionRowDisplayCache({
  rows,
  companyExpenses,
  fixedExpensePayments,
  fixedExpenses,
  memoCategorySuggestionByTxId,
  ledgerSuggestionByTxId,
  canRegisterLedgerWithConfidence,
  resolveLedgerCategorySuggestionLabel,
}: BuildRowDisplayCacheInput): Map<string, BankTransactionRowDisplay> {
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
  const cache = new Map<string, BankTransactionRowDisplay>();

  for (const row of rows) {
    const ledgerCategory = resolveLedgerCategoryLabel(
      row,
      companyExpenseByTxId,
      companyExpenseById,
      fixedPaymentByTxId,
      fixedPaymentById,
      fixedExpenseById,
    );
    const ledgerSuggestion = ledgerCategory
      ? null
      : resolveLedgerCategorySuggestionLabel(row);
    cache.set(row.id, {
      ledgerCategory,
      ledgerFromFixed: isLedgerCategoryFromFixed(
        row,
        companyExpenseByTxId,
        companyExpenseById,
        fixedPaymentByTxId,
        fixedPaymentById,
      ),
      ledgerSuggestion,
      canLedger: canRegisterLedgerWithConfidence(row),
      suppressed: isNetGroupSuppressed(row),
    });
  }

  return cache;
}

export type BankTransactionExportLabels = {
  transactionAt: string;
  deposit: string;
  withdrawal: string;
  balance: string;
  description: string;
  accountContent: string;
  category: string;
  fixedExpense: string;
  classification: string;
  matchStatus: string;
  assignFolder: string;
  ledgerSendTo: string;
  unfiled: string;
  accountContentPlaceholder: string;
};

export function buildBankTransactionsExportTable(
  rows: BankTransaction[],
  labels: BankTransactionExportLabels,
  folderMap: Map<string, BankTransactionFolder>,
  rowDisplayById: Map<string, BankTransactionRowDisplay>,
  defaultLedgerFolder?: BankTransactionFolder,
): ParsedTable {
  const headers = [
    labels.transactionAt,
    labels.deposit,
    labels.withdrawal,
    labels.balance,
    labels.description,
    labels.accountContent,
    labels.category,
    labels.fixedExpense,
    labels.classification,
    labels.matchStatus,
    labels.assignFolder,
    labels.ledgerSendTo,
  ];

  const parsedRows = rows.map((row) => {
    const display = rowDisplayById.get(row.id);
    const folder = row.folderId ? folderMap.get(row.folderId) : undefined;
    const ledgerCategory = display?.ledgerCategory || display?.ledgerSuggestion || "";
    const classification =
      folder?.folderName ||
      (ledgerCategory && defaultLedgerFolder ? defaultLedgerFolder.folderName : labels.unfiled);
    const folderLabel = folder?.folderName || labels.unfiled;

    return [
      formatBankTransactionDateTime(row.transactionAt),
      row.deposit > 0 ? formatKRW(row.deposit) : "-",
      row.withdrawal > 0 ? formatKRW(row.withdrawal) : "-",
      formatKRW(row.balanceAfter),
      row.description || "-",
      row.ledgerMemo || row.memo || labels.accountContentPlaceholder,
      ledgerCategory || "-",
      row.ledgerFixedExpenseId || "-",
      classification,
      row.linkedPaymentVoucherId ? getBankMatchStatusLabel(row) : "-",
      folderLabel,
      display?.canLedger ? labels.ledgerSendTo : "-",
    ];
  });

  return { headers, rows: parsedRows };
}
