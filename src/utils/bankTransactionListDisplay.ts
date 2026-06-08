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
import { getBankTxLedgerCategoryLabel } from "@/utils/ledgerBankBridge";
import {
  formatTaxInvoiceEvidenceLabel,
  getBankTxClassifiedAmount,
  resolveBankTxClientName,
} from "@/utils/bankTaxInvoiceLink";
import type { AccountCode, LedgerCategory } from "@/utils/ledgerSystem";
import { resolveAccountCodeLabel } from "@/utils/ledgerSystem";
import type { TaxInvoice } from "@/utils/taxInvoices";
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
  accountContentLabel: string;
  accountContentEmpty: boolean;
  categoryLabel: string | null;
  fixedExpenseLabel: string | null;
  folderName: string | null;
  folderType: BankTransactionFolderType | null;
  classificationLabel: string;
  matchLinked: boolean;
  matchStatusLabel: string;
  showAutoLinkBadge: boolean;
  showManualLinkBadge: boolean;
  showPartialPaymentBadge: boolean;
  netGroupRole: BankTransaction["netGroupRole"];
  rowTone: "" | "deposit" | "withdrawal" | "suppressed";
  accountLabel: string;
  counterpartyLabel: string;
  signedAmountLabel: string;
  memoLabel: string;
  memoEmpty: boolean;
  accountSubjectLabel: string | null;
  clientLabel: string | null;
  classifiedAmountLabel: string;
  evidenceLabel: string | null;
  evidenceLinked: boolean;
  showVoucherProcessedBadge: boolean;
  partyKind: "client" | "worker" | "none";
  counterpartyPartyKind: "client" | "worker" | "none";
};

export function resolveBankTxPartyKind(
  row: BankTransaction,
  folder: BankTransactionFolder | undefined,
  displayName: string | null,
  clients: Array<{ name?: string }> = [],
  workers: Array<{ name?: string }> = [],
): "client" | "worker" | "none" {
  if (folder?.folderType === "worker") return "worker";
  if (folder?.folderType === "client") return "client";
  if (row.linkedWorkerMonthlyPaymentVoucherId) return "worker";

  const label = String(displayName || row.linkedSubject || "").trim();
  if (label) {
    if (workers.some((worker) => String(worker.name || "").trim() === label)) return "worker";
    if (clients.some((client) => String(client.name || "").trim() === label)) return "client";
  }

  if (row.linkedPaymentVoucherId && row.deposit > 0) return "client";
  return "none";
}

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

function resolveFixedExpenseLabel(
  row: BankTransaction,
  lookup: BankTransactionListLookupMaps,
): string | null {
  if (row.ledgerFixedExpenseId) {
    const item = lookup.fixedExpenseById.get(row.ledgerFixedExpenseId);
    if (item?.name?.trim()) return item.name.trim();
  }
  const linkedPayment = row.linkedFixedExpensePaymentId
    ? lookup.fixedPaymentById.get(row.linkedFixedExpensePaymentId)
    : lookup.fixedPaymentByTxId.get(row.id);
  if (linkedPayment) {
    const item = lookup.fixedExpenseById.get(linkedPayment.fixedExpenseId);
    if (item?.name?.trim()) return item.name.trim();
  }
  return null;
}

export type BankTransactionListRowBuildContext = {
  folderMap: Map<string, BankTransactionFolder>;
  ledgerCategoryFolder: BankTransactionFolder | undefined;
  lookup: BankTransactionListLookupMaps;
  labels: { unfiled: string; accountContentPlaceholder: string };
  paymentVouchers: Array<{ bankTransactionId?: string | number; isPartialPayment?: boolean }>;
  ledgerCategories: LedgerCategory[];
  companyExpenses: CompanyExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  fixedExpenses: FixedExpense[];
  accountCodes: AccountCode[];
  taxInvoiceById: Map<string, TaxInvoice>;
  clients: Array<{ name?: string }>;
  workers: Array<{ name?: string }>;
};

export function buildBankTransactionListRowModel(
  row: BankTransaction,
  context: BankTransactionListRowBuildContext,
): BankTransactionListRowModel {
  const {
    folderMap,
    ledgerCategoryFolder,
    lookup,
    labels,
    paymentVouchers,
    ledgerCategories,
    companyExpenses,
    fixedExpensePayments,
    fixedExpenses,
    accountCodes,
    taxInvoiceById,
    clients,
    workers,
  } = context;

  const folder = row.folderId ? folderMap.get(row.folderId) : undefined;
  const unfiledClientLink = isUnfiledClientDepositLink(row);
  const linkedSubjectName = String(row.linkedSubject || "").trim();
  const unfiledClientName =
    !folder && row.deposit > 0 && linkedSubjectName && (unfiledClientLink || row.linkedPaymentVoucherId)
      ? linkedSubjectName
      : "";
  const legacyCategory = resolveLinkedLedgerCategory(row, lookup);
  const categoryLabel =
    getBankTxLedgerCategoryLabel(
      row,
      ledgerCategories,
      companyExpenses,
      fixedExpensePayments,
      fixedExpenses,
    ) || legacyCategory;
  const fixedExpenseLabel = resolveFixedExpenseLabel(row, lookup);
  const accountContent = String(row.ledgerMemo || row.memo || "").trim();
  const memoOnly = String(row.memo || "").trim();
  const accountCode = String(row.ledgerAccountCode || "").trim();
  const accountSubjectLabel = accountCode
    ? resolveAccountCodeLabel(accountCodes, accountCode) || accountCode
    : null;
  const clientLabel = resolveBankTxClientName(row) || unfiledClientName || null;
  const classifiedAmount = getBankTxClassifiedAmount(row);
  const linkedInvoice = row.linkedTaxInvoiceId ? taxInvoiceById.get(row.linkedTaxInvoiceId) : undefined;
  const evidenceLabel = linkedInvoice ? formatTaxInvoiceEvidenceLabel(linkedInvoice) : null;
  const signedAmountLabel =
    row.deposit > 0
      ? `+${formatKRW(row.deposit)}`
      : row.withdrawal > 0
        ? `-${formatKRW(row.withdrawal)}`
        : "-";
  const accountLabel = `${row.bankName || "IBK"} ${String(row.accountNumber || "").slice(-4) || ""}`.trim();
  const classificationLabel =
    folder?.folderName ||
    (unfiledClientName || null) ||
    (categoryLabel && ledgerCategoryFolder ? ledgerCategoryFolder.folderName : labels.unfiled);

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

  return {
    id: row.id,
    dateLabel: formatBankTransactionDateTime(row.transactionAt),
    depositLabel: row.deposit > 0 ? formatKRW(row.deposit) : "-",
    withdrawalLabel: row.withdrawal > 0 ? formatKRW(row.withdrawal) : "-",
    balanceLabel: formatKRW(row.balanceAfter),
    description: row.description || "-",
    accountContentLabel: accountContent || labels.accountContentPlaceholder,
    accountContentEmpty: !accountContent,
    categoryLabel,
    fixedExpenseLabel,
    folderName: folder?.folderName || unfiledClientName || null,
    folderType: folder?.folderType || (unfiledClientName ? "client" : null),
    classificationLabel,
    matchLinked,
    matchStatusLabel,
    showAutoLinkBadge: matchLinked && isBankMatchAutoLinked(row),
    showManualLinkBadge: matchLinked && isBankMatchManualLinked(row),
    showPartialPaymentBadge: matchLinked && bankTxHasPartialPaymentVoucher(row, paymentVouchers),
    netGroupRole: row.netGroupRole,
    rowTone,
    accountLabel,
    counterpartyLabel: String(row.counterpartyName || "-").trim() || "-",
    signedAmountLabel,
    memoLabel: memoOnly || labels.accountContentPlaceholder,
    memoEmpty: !memoOnly,
    accountSubjectLabel,
    clientLabel,
    classifiedAmountLabel: classifiedAmount > 0 ? formatKRW(classifiedAmount) : "-",
    evidenceLabel,
    evidenceLinked: Boolean(linkedInvoice),
    showVoucherProcessedBadge: Boolean(row.linkedPaymentVoucherId && row.deposit > 0),
    partyKind: resolveBankTxPartyKind(row, folder, clientLabel, clients, workers),
    counterpartyPartyKind: resolveBankTxPartyKind(
      row,
      folder,
      String(row.counterpartyName || "").trim() || null,
      clients,
      workers,
    ),
  };
}

export function buildBankTransactionListRowModels(
  rows: BankTransaction[],
  folderMap: Map<string, BankTransactionFolder>,
  ledgerCategoryFolder: BankTransactionFolder | undefined,
  lookup: BankTransactionListLookupMaps,
  labels: { unfiled: string; accountContentPlaceholder: string },
  paymentVouchers: Array<{ bankTransactionId?: string | number; isPartialPayment?: boolean }> = [],
  ledgerCategories: LedgerCategory[] = [],
  companyExpenses: CompanyExpense[] = [],
  fixedExpensePayments: FixedExpensePayment[] = [],
  fixedExpenses: FixedExpense[] = [],
  accountCodes: AccountCode[] = [],
  taxInvoices: TaxInvoice[] = [],
  clients: Array<{ name?: string }> = [],
  workers: Array<{ name?: string }> = [],
): Map<string, BankTransactionListRowModel> {
  const context: BankTransactionListRowBuildContext = {
    folderMap,
    ledgerCategoryFolder,
    lookup,
    labels,
    paymentVouchers,
    ledgerCategories,
    companyExpenses,
    fixedExpensePayments,
    fixedExpenses,
    accountCodes,
    taxInvoiceById: new Map(taxInvoices.map((row) => [row.id, row])),
    clients,
    workers,
  };
  const cache = new Map<string, BankTransactionListRowModel>();
  for (const row of rows) {
    cache.set(row.id, buildBankTransactionListRowModel(row, context));
  }
  return cache;
}
