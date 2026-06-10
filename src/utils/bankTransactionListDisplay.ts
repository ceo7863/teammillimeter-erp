import {
  getBankMatchStatusLabel,
  isBankMatchAutoLinked,
  isBankMatchManualLinked,
} from "@/utils/bankReceivableMatch";
import { bankTxHasPartialPaymentVoucher } from "@/utils/bankSentStatementMatch";
import type { BankTransactionFolder, BankTransactionFolderType } from "@/utils/bankTransactionFolders";
import { isBankTxExpenseReversal } from "@/utils/bankTxExpenseReversal";
import { isNetGroupSuppressed } from "@/utils/bankPreauthNetting";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import { formatKRW } from "@/utils/companyLedger";
import { getBankTxLedgerCategoryLabel } from "@/utils/ledgerBankBridge";
import {
  formatTaxInvoiceEvidenceLabel,
  getBankTxClassifiedAmount,
  getBankTxLinkedTaxInvoiceIds,
  isBankTxClientHidden,
  resolveBankTxClientName,
} from "@/utils/bankTaxInvoiceLink";
import type { AccountCode, LedgerCategory } from "@/utils/ledgerSystem";
import { resolveAccountCodeLabel } from "@/utils/ledgerSystem";
import type { TaxInvoice, TaxInvoiceCancellationPairInfo } from "@/utils/taxInvoices";
import { buildTaxInvoiceCancellationPairIndex } from "@/utils/taxInvoices";
import {
  formatBankTransactionDateTime,
  formatBankTransactionDateTimeCompact,
  isUnfiledClientDepositLink,
  type BankTransaction,
} from "@/utils/bankTransactions";
import { formatMonthLabel } from "@/utils/workerMonthlyPayments";
import type { WorkerMonthlyActualVoucher } from "@/utils/workerMonthlyActualPayments";
import { resolveBankAccountDisplayLabel } from "@/utils/bankBrandIcon";
import { resolveBankTxLedgerAccountCode } from "@/utils/bankCompanyLedger";

export type BankTransactionListRowModel = {
  id: string;
  dateLabel: string;
  dateTitle: string;
  depositLabel: string;
  withdrawalLabel: string;
  balanceLabel: string;
  transactionTypeLabel: string;
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
  bankName: string;
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
  workerErpLinked: boolean;
  workerErpStatusLabel: string;
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

  const linkedPayment = resolveLinkedFixedPaymentFromLookup(row, lookup);
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

function resolveLinkedFixedPaymentFromLookup(
  row: BankTransaction,
  lookup: BankTransactionListLookupMaps,
): FixedExpensePayment | undefined {
  if (row.linkedFixedExpensePaymentId) {
    const linked = lookup.fixedPaymentById.get(row.linkedFixedExpensePaymentId);
    if (linked) return linked;
  }
  return lookup.fixedPaymentByTxId.get(row.id);
}

function resolveFixedExpenseLabel(
  row: BankTransaction,
  lookup: BankTransactionListLookupMaps,
): string | null {
  const ledgerFixedId = String(row.ledgerFixedExpenseId || "").trim();
  if (ledgerFixedId) {
    const item = lookup.fixedExpenseById.get(ledgerFixedId);
    if (item?.name?.trim()) return item.name.trim();
  }
  const linkedPayment = resolveLinkedFixedPaymentFromLookup(row, lookup);
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
  taxInvoiceCancellationPairIndex: Map<string, TaxInvoiceCancellationPairInfo>;
  clients: Array<{ name?: string }>;
  workers: Array<{ name?: string }>;
  workerMonthlyActualVouchers?: WorkerMonthlyActualVoucher[];
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
    taxInvoiceCancellationPairIndex,
    clients,
    workers,
    workerMonthlyActualVouchers = [],
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
  const accountCode =
    resolveBankTxLedgerAccountCode(row, {
      fixedExpenses,
      fixedExpensePayments,
      ledgerCategories,
    }) || "";
  const accountSubjectLabel = accountCode
    ? resolveAccountCodeLabel(accountCodes, accountCode) || accountCode
    : null;
  const clientHidden = isBankTxClientHidden(row);
  const clientLabel = clientHidden ? null : resolveBankTxClientName(row) || unfiledClientName || null;
  const expenseReversal = isBankTxExpenseReversal(row);
  const classifiedAmount = expenseReversal
    ? -Number(row.deposit || 0)
    : getBankTxClassifiedAmount(row);
  const linkedInvoices = getBankTxLinkedTaxInvoiceIds(row)
    .map((id) => taxInvoiceById.get(id))
    .filter((invoice): invoice is TaxInvoice => Boolean(invoice));
  const linkedInvoice = linkedInvoices[0];
  const linkedInvoiceLabels = linkedInvoices.map((invoice) =>
    formatTaxInvoiceEvidenceLabel(invoice, { cancellationPairIndex: taxInvoiceCancellationPairIndex }),
  );
  const evidenceLabel = linkedInvoiceLabels.length ? linkedInvoiceLabels.join(" · ") : null;
  const signedAmountLabel = expenseReversal
    ? `-${formatKRW(row.deposit)}`
    : row.deposit > 0
      ? `+${formatKRW(row.deposit)}`
      : row.withdrawal > 0
        ? `-${formatKRW(row.withdrawal)}`
        : "-";
  const bankName = String(row.bankName || "IBK").trim() || "IBK";
  const accountLabel = resolveBankAccountDisplayLabel(bankName, row.accountNumber);
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

  const workerErpLinked = Boolean(String(row.linkedWorkerMonthlyPaymentVoucherId || "").trim());
  let workerErpStatusLabel = "-";
  if (workerErpLinked) {
    const linkedVoucher = workerMonthlyActualVouchers.find(
      (voucher) => voucher.id === row.linkedWorkerMonthlyPaymentVoucherId,
    );
    workerErpStatusLabel = linkedVoucher
      ? `${formatMonthLabel(linkedVoucher.monthKey)} ${linkedVoucher.worker}`
      : "\uC2E4\uC9C0\uAE09 \uC5F0\uACB0";
  } else if (row.withdrawal > 0) {
    workerErpStatusLabel = "\uBBF8\uC5F0\uACB0";
  }

  const suppressed = isNetGroupSuppressed(row) && !expenseReversal;
  const rowTone: BankTransactionListRowModel["rowTone"] = suppressed
    ? "suppressed"
    : expenseReversal || row.withdrawal > 0
      ? "withdrawal"
      : row.deposit > 0
        ? "deposit"
        : "";

  return buildBankTransactionListRowModelFromParts(row, {
    folder,
    unfiledClientName,
    categoryLabel,
    fixedExpenseLabel,
    accountContent,
    memoOnly,
    accountSubjectLabel,
    clientLabel,
    classifiedAmount,
    linkedInvoice,
    evidenceLabel,
    signedAmountLabel,
    accountLabel,
    bankName,
    classificationLabel,
    matchLinked,
    matchStatusLabel,
    workerErpLinked,
    workerErpStatusLabel,
    suppressed,
    rowTone,
    labels,
    paymentVouchers,
    clients,
    workers,
  });
}

type BankTransactionListRowModelParts = {
  folder: BankTransactionFolder | undefined;
  unfiledClientName: string;
  categoryLabel: string | null;
  fixedExpenseLabel: string | null;
  accountContent: string;
  memoOnly: string;
  accountSubjectLabel: string | null;
  clientLabel: string | null;
  classifiedAmount: number;
  linkedInvoice: TaxInvoice | undefined;
  evidenceLabel: string | null;
  signedAmountLabel: string;
  accountLabel: string;
  bankName: string;
  classificationLabel: string;
  matchLinked: boolean;
  matchStatusLabel: string;
  workerErpLinked: boolean;
  workerErpStatusLabel: string;
  suppressed: boolean;
  rowTone: BankTransactionListRowModel["rowTone"];
  labels: { accountContentPlaceholder: string };
  paymentVouchers: Array<{ bankTransactionId?: string | number; isPartialPayment?: boolean }>;
  clients: Array<{ name?: string }>;
  workers: Array<{ name?: string }>;
};

function buildBankTransactionListRowModelFromParts(
  row: BankTransaction,
  parts: BankTransactionListRowModelParts,
): BankTransactionListRowModel {
  const {
    folder,
    unfiledClientName,
    categoryLabel,
    fixedExpenseLabel,
    accountContent,
    memoOnly,
    accountSubjectLabel,
    clientLabel,
    classifiedAmount,
    linkedInvoice,
    evidenceLabel,
    signedAmountLabel,
    accountLabel,
    bankName,
    classificationLabel,
    matchLinked,
    matchStatusLabel,
    workerErpLinked,
    workerErpStatusLabel,
    rowTone,
    labels,
    paymentVouchers,
    clients,
    workers,
  } = parts;

  return {
    id: row.id,
    dateLabel: formatBankTransactionDateTimeCompact(row.transactionAt),
    dateTitle: formatBankTransactionDateTime(row.transactionAt),
    depositLabel: row.deposit > 0 ? formatKRW(row.deposit) : "-",
    withdrawalLabel: row.withdrawal > 0 ? formatKRW(row.withdrawal) : "-",
    balanceLabel: formatKRW(row.balanceAfter),
    transactionTypeLabel: String(row.transactionType || "").trim() || "-",
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
    bankName,
    accountLabel,
    counterpartyLabel: String(row.counterpartyName || "-").trim() || "-",
    signedAmountLabel,
    memoLabel: memoOnly || labels.accountContentPlaceholder,
    memoEmpty: !memoOnly,
    accountSubjectLabel,
    clientLabel,
    classifiedAmountLabel: classifiedAmount !== 0 ? formatKRW(classifiedAmount) : "-",
    evidenceLabel,
    evidenceLinked: Boolean(linkedInvoice),
    showVoucherProcessedBadge: Boolean(row.linkedPaymentVoucherId && row.deposit > 0),
    workerErpLinked,
    workerErpStatusLabel,
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

/** Stable fingerprint for per-row model cache invalidation (tx fields + linked enrichment). */
export function buildBankTransactionListRowFingerprint(
  row: BankTransaction,
  context: BankTransactionListRowBuildContext,
  optimisticAccountSubjectLabel = "",
): string {
  const { lookup, folderMap, taxInvoiceById, paymentVouchers, ledgerCategoryFolder } = context;
  const folder = row.folderId ? folderMap.get(row.folderId) : undefined;

  const linked: string[] = [];
  const expense =
    (row.linkedCompanyExpenseId && lookup.companyExpenseById.get(row.linkedCompanyExpenseId)) ||
    lookup.companyExpenseByTxId.get(row.id);
  if (expense) {
    linked.push(`ce:${expense.id}:${expense.category}:${expense.kind}:${expense.amount}`);
  }
  const payment = resolveLinkedFixedPaymentFromLookup(row, lookup);
  if (payment) {
    const fixedItem = lookup.fixedExpenseById.get(payment.fixedExpenseId);
    linked.push(
      `fp:${payment.id}:${payment.fixedExpenseId}:${fixedItem?.name ?? ""}:${fixedItem?.category ?? ""}`,
    );
  }
  for (const invoiceId of getBankTxLinkedTaxInvoiceIds(row)) {
    const invoice = taxInvoiceById.get(invoiceId);
    if (invoice) {
      linked.push(`ti:${invoice.id}:${invoice.issueDate}:${invoice.totalAmount}`);
    }
  }
  if (bankTxHasPartialPaymentVoucher(row, paymentVouchers)) {
    linked.push("pp:1");
  }
  if (row.linkedWorkerMonthlyPaymentVoucherId) {
    const voucher = context.workerMonthlyActualVouchers?.find(
      (item) => item.id === row.linkedWorkerMonthlyPaymentVoucherId,
    );
    linked.push(
      `wm:${row.linkedWorkerMonthlyPaymentVoucherId}:${voucher?.monthKey ?? ""}:${voucher?.worker ?? ""}`,
    );
  }

  const tx = [
    row.transactionAt,
    row.deposit,
    row.withdrawal,
    row.balanceAfter,
    row.description,
    row.memo,
    row.counterpartyName,
    row.folderId,
    folder?.folderName,
    folder?.folderType,
    row.linkedSubject,
    row.linkedPaymentVoucherId,
    row.linkedWorkerMonthlyPaymentVoucherId,
    row.linkedCompanyExpenseId,
    row.linkedFixedExpensePaymentId,
    getBankTxLinkedTaxInvoiceIds(row).join(","),
    row.ledgerAccountCode,
    optimisticAccountSubjectLabel,
    row.ledgerMemo,
    row.ledgerClientName,
    row.ledgerFixedExpenseId,
    row.netGroupRole,
    row.matchAutoLinked,
    row.ledgerStatus,
    row.ledgerCategoryId,
    ledgerCategoryFolder?.folderName,
  ]
    .map((value) => String(value ?? ""))
    .join("\0");

  return `${tx}|${linked.join(",")}`;
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
