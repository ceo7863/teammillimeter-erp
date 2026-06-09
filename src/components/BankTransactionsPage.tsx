import React, { memo, useEffect, useMemo, useRef, useState, useCallback, useDeferredValue, startTransition } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  BookOpen,
  Building2,
  CreditCard,
  FileSpreadsheet,
  FolderPlus,
  FolderTree,
  HardHat,
  Landmark,
  Link2,
  ListChecks,
  Repeat,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BankListRefreshAtSuffix, useBankSyncMeta } from "@/contexts/BankSyncMetaContext";
import { PartialPaymentBadge } from "@/components/AutoLinkBadge";
import { Button } from "@/components/ui/button";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { TableExportSection, TableExportToolbar } from "@/components/TableExportSection";
import { BankTransactionsListShell } from "@/components/BankTransactionsListShell";
import { BankCounterpartyTransactionsDrawer } from "@/components/BankCounterpartyTransactionsDrawer";
import {
  BankTaxInvoiceIssueModal,
  type BankTaxInvoiceIssueResult,
} from "@/components/BankTaxInvoiceIssueModal";
import {
  CompanyLedgerFixedExpenseModalLayer,
  type CompanyLedgerFixedExpenseModalHandle,
} from "@/components/CompanyLedgerFixedExpenseModalLayer";
import {
  buildTaxInvoiceLinkedPaymentIndex,
  EMPTY_TAX_INVOICE_EXCLUDED_IDS,
  EMPTY_TAX_INVOICE_LINKED_INDEX,
  getTaxInvoiceCancellationExcludedIdsCached,
  getTaxInvoiceLinkedPaymentIndexCached,
  invalidateTaxInvoiceLinkPanelCaches,
} from "@/utils/taxInvoiceLinkPanel";
import {
  destroyTaxInvoiceLinkPanel,
  renderTaxInvoiceLinkPanel,
  setTaxInvoiceLinkPanelHandlers,
} from "@/components/taxInvoiceLinkPanelMount";
import type { TaxInvoice } from "@/utils/taxInvoices";
import {
  buildBankTxTaxInvoiceLinkPatch,
  clearBankTxTaxInvoiceLinks,
  addBankTxTaxInvoiceLink,
  removeBankTxTaxInvoiceLink,
  getBankTxLinkedTaxInvoiceIds,
  formatTaxInvoiceEvidenceLabel,
} from "@/utils/bankTaxInvoiceLink";
import {
  batchAutoLinkSplitTaxInvoiceEvidence,
  learnClientTaxInvoiceSplitPayments,
  shouldLearnTaxInvoiceSplitPayment,
} from "@/utils/taxInvoiceSplitLink";
import { runTaxInvoiceEvidenceAutoLink, learnClientTaxInvoiceExactPayments } from "@/utils/taxInvoiceEvidenceAutoLink";
import {
  buildBankTransactionRowDisplayCache,
  buildBankTransactionsExportTable,
} from "@/utils/bankTransactionRowDisplay";
import { useAudit } from "@/context/AuditContext";
import { confirmDelete } from "@/utils/confirmDelete";
import { CLIENT_AUDIT_FIELDS, COMPANY_EXPENSE_AUDIT_FIELDS, BANK_FOLDER_AUDIT_FIELDS, BANK_TRANSACTION_AUDIT_FIELDS, FIXED_EXPENSE_AUDIT_FIELDS, FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS, PAYMENT_AUDIT_FIELDS, snapshotBankFolderForAudit, snapshotBankTransactionForAudit, snapshotClientForAudit, snapshotCompanyExpenseForAudit, snapshotFixedExpenseForAudit, snapshotFixedExpensePaymentForAudit, snapshotPaymentForAudit, type AuditUser } from "@/utils/auditLog";
import {
  applyPreauthNetGroups,
  detectPreauthNetGroups,
  filterPreauthNetGroupsForAutoApply,
  filterPreauthNetGroupsNeedingApply,
  isBankTxExpenseReversal,
  isNetGroupSuppressed,
  preauthNetGroupKey,
} from "@/utils/bankPreauthNetting";
import { removeBankTransactionsByAccountNumber } from "@/utils/bankDataRepair";
import { runBackgroundBankLedgerLearning } from "@/utils/bankBackgroundLearning";
import {
  applyRecurringFixedExpensePatterns,
  detectRecurringFixedExpensePatterns,
  type RecurringFixedExpensePattern,
} from "@/utils/bankRecurringFixedExpense";
import {
  findLinkableFixedExpensePayment,
  listLinkableFixedExpensePayments,
  formatFixedExpensePaymentDay,
  formatKRW,
  getFixedExpensePaymentsForMonth,
  getMonthKey,
  isFixedExpensePaymentSettled,
  linkFixedExpensePaymentToBankTx,
  EXPENSE_CATEGORY_OPTIONS,
  FIXED_CATEGORY_OPTIONS,
  makeLedgerId,
  mergeExpenseCategory,
  mergeFixedExpenseCategory,
  monthRangeISO,
  normalizeExpenseCategories,
  parseLedgerAmount,
  todayISO,
  validateCompanyExpenseInput,
  validateFixedExpensePaymentInput,
  type CompanyExpense,
  type FixedExpense,
  type FixedExpensePayment,
} from "@/utils/companyLedger";
import {
  autoApplyBankLearnRules,
  buildBankLearnRuleFromFixedRegistration,
  buildBankLearnRuleFromFolderAssignment,
  buildBankLearnRuleFromManualRegistration,
  buildBankLedgerMatchRuleFromRegistration,
  buildMemoLearnRulesFromTransactions,
  buildMemoCategorySuggestionMap,
  mergeMemoLearnRules,
  buildBankLearnRuleFromMemoCategory,
  resolveMemoLearnCategory,
  applyMemoCategoryToLedgerDraft,
  resolveCategoryFromMemo,
  isMemoLearnAmountFlexibleCategory,
  buildPreauthNetLearnRule,
  buildCompanyExpensePrefillFromBankTransaction,
  buildLedgerReviewPromptGroups,
  canRegisterBankTxToCompanyLedger,
  clearVariableExpenseLinkForBankTx,
  detachBankTxFromCompanyLedgerLinks,
  createCompanyExpenseFromBankTransaction,
  assignBankTxToFixedExpensePayment,
  findBestBankLearnRuleWithScore,
  findMatchingBankLedgerRule,
  formatBankLearnAutoMessage,
  formatLearnRuleConfidencePercent,
  hasManualLedgerCategoryMemoOverride,
  isBankTransactionLinkedToCompanyLedger,
  isBankTransactionLinkedToVariableExpenseOnly,
  isBankTransactionUnfiled,
  LEDGER_REGISTRATION_MIN_CONFIDENCE_PERCENT,
  getLinkedCompanyExpenseForBankTx,
  getLinkedFixedPaymentForBankTx,
  parseLedgerTargetKey,
  releaseFixedExpensePaymentBankLink,
  resolveBankTxLedgerAmount,
  syncBankTransactionLedgerLinkFields,
  resolveLedgerTargetForBankTransaction,
  upsertBankLearnRule,
  type BankLearnRule,
} from "@/utils/bankCompanyLedger";
import { buildLedgerClassificationMap, classifyBankTransactionForLedger, evaluateBankTxLedgerRegistrationGate } from "@/utils/bankLedgerClassifier";
import {
  batchRegisterHighConfidenceBankTxToLedger,
  countBatchRegisterableLedger,
  formatBatchLedgerRegisterMessage,
  formatSmartLedgerRunMessage,
  runSmartAutoLedger,
} from "@/utils/bankSmartLedger";
import {
  getBankTxLedgerCategoryLabel,
  matchesBankTxLedgerScope,
  assignBankTransactionAccountCode,
  type LedgerScopeFilter,
} from "@/utils/ledgerBankBridge";
import { AccountSubjectPickerPopover } from "@/components/AccountSubjectPickerPopover";
import { buildAccountCodePickerFlatItems, buildAccountCodePickerOptions, findAccountCodeByCode, formatAccountCodeLabel } from "@/utils/accountCodeTree";
import {
  confirmBankTransactionLedger,
  filterAccountCodesByFlow,
  findLedgerCategory,
  findLedgerCategoryByName,
  resolveAccountCodeLabel,
  type AccountCode,
  type LedgerCategory,
} from "@/utils/ledgerSystem";
import {
  AutocompleteInput,
  BufferedTextarea,
  BufferedTextInput,
} from "@/components/AutocompleteInput";
import { createPaymentInputLogsFromVouchers } from "@/utils/paymentInputLogs";
import type { ReceivableRow } from "@/utils/receivables";
import type { ErpUser } from "@/utils/erpApi";
import { BarobillBankSettingsPanel } from "@/components/BarobillBankSettingsPanel";
import {
  buildAllBankDepositSuggestions,
  buildBankDepositMatchCandidates,
  createPaymentVoucherFromBankMatch,
  findBestClientDepositReceivableMatch,
  getBankMatchStatusLabel,
  isBankMatchAutoLinked,
  isBankMatchManualLinked,
  type BankDepositMatchCandidate,
} from "@/utils/bankReceivableMatch";
import {
  buildAllSentStatementDepositSuggestions,
  buildHighConfidenceSentStatementAutoLinks,
  buildSentStatementMatchCandidates,
  createPaymentVouchersFromSentStatementMatch,
  resolveArchivePaymentStatusAfterApply,
  resolveStatementPaidAmount,
  type SentStatementMatchCandidate,
} from "@/utils/bankSentStatementMatch";
import { listSentStatementArchives, updatePdfArchiveMeta, type PdfArchiveMeta } from "@/utils/pdfArchive";
import {
  appendDepositNameAlias,
  findClientByDepositSubject,
  findWorkerForBankTransaction,
  resolveBankDepositMatchSubject,
} from "@/utils/clientDepositAliases";
import {
  UNFILED_FOLDER_KEY,
  autoClassifyBankTransactions,
  buildFolderClassificationSuggestionMap,
  buildBankTransactionFolderStatsMap,
  buildBankTransactionFolderTree,
  canAssignBankTransactionToFolder,
  clearBankTransactionFolderReferences,
  collectDescendantFolderIds,
  createBankTransactionFolder,
  flattenBankTransactionFolderTree,
  flattenCustomCategoryFolderTree,
  listCustomCategoryRoots,
  collectCustomCategoryFolderIds,
  getBankTransactionFolderPath,
  getBankTransactionFolderTone,
  getBankTransactionFolderLabel,
  listAssignableFolders,
  listFolderParentOptions,
  listFoldersByType,
  normalizeBankTransactionFolders,
  removeBankTransactionFolder,
  sanitizeBankTransactionFolderParentId,
  DEFAULT_CLIENT_FOLDER_ID,
  DEFAULT_CARD_SALES_FOLDER_ID,
  DEFAULT_WORKER_FOLDER_ID,
  DEFAULT_LEDGER_CATEGORY_FOLDER_ID,
  ensureDefaultBankTransactionFolders,
  isCardCompanyDeposit,
  syncLedgerLinkedBankTransactionFolders,
  reconcileLedgerFolderWithoutLedgerLink,
  assignDefaultLedgerFolderToBankTransaction,
  applyClientDepositLinkToTransaction,
  type BankTransactionFolder,
  type BankTransactionFolderType,
} from "@/utils/bankTransactionFolders";
import {
  buildBankAccountSummaries,
  buildBankTransactionStats,
  buildImportFingerprint,
  buildTopCounterpartySummaries,
  filterBankTransactions,
  formatBankTransactionDateTime,
  hasManualClientClassificationOverride,
  matchesBankTxCounterpartyFilter,
  normalizeBankTxCounterpartyKey,
  parseBankAmount,
  resolveAutoLinkLinkedSubject,
  sortBankTransactions,
  DEFAULT_BANK_TRANSACTION_SORT,
  type BankTransaction,
  type BankAccountSummary,
  type BankTransactionFlowFilter,
  type BankTransactionSort,
  type BankTransactionSortKey,
} from "@/utils/bankTransactions";
import {
  mergeIbkBankImport,
  parseIbkBankFile,
  type IbkBankImportPreview,
} from "@/utils/ibkBankImport";
import type { BankTransactionAppliedFilters } from "@/components/BankTransactionFilterBar";
import {
  resolveBankTransactionPeriod,
  type BankTransactionPeriodKey,
} from "@/utils/bankTransactionPagePeriod";
import {
  countBankTxStatusTabs,
  matchesBankTxEvidenceFilter,
  matchesBankTxStatusTab,
  type BankTxEvidenceFilter,
  type BankTxGroupFilter,
  type BankTxStatusTab,
} from "@/utils/bankTransactionStatusFilter";
import { resolveBankTxClientName } from "@/utils/bankTaxInvoiceLink";

type PeriodKey = BankTransactionPeriodKey;
type DateFilter = { startDate: string; endDate: string };
type FolderScope = "all" | "client" | "card" | "worker" | "unfiled" | `custom:${string}`;

function parseCustomFolderScope(scope: FolderScope) {
  return scope.startsWith("custom:") ? scope.slice("custom:".length) : "";
}

type PageView = "list" | "reconcile";

type TxAccountContentModal = { tx: BankTransaction; draft: string };
type TxFixedExpenseModal = { tx: BankTransaction; draft: string };
type TxClientModal = { tx: BankTransaction; draft: string };
type TaxInvoiceLinkSession = {
  tx: BankTransaction;
  taxInvoices: TaxInvoice[];
  bankTransactions: BankTransaction[];
  linkedPaymentIndex: ReturnType<typeof buildTaxInvoiceLinkedPaymentIndex>;
  excludedIds: Set<string>;
  preparing: boolean;
};

const EMPTY_TX_SUGGESTION_MAP = new Map<string, never>();
const EMPTY_BANK_TRANSACTION_ROWS: BankTransaction[] = [];

const FLOW_FILTER_OPTIONS: Array<{ key: BankTransactionFlowFilter; label: string; tone: string }> = [
  { key: "all", label: "\uC804\uCCB4", tone: "bg-slate-900 text-white" },
  { key: "deposit", label: "\uC785\uAE08", tone: "bg-emerald-600 text-white" },
  { key: "withdrawal", label: "\uCD9C\uAE08", tone: "bg-red-600 text-white" },
];

const SORT_KEY_OPTIONS: Array<{ key: BankTransactionSortKey; label: string }> = [
  { key: "transactionAt", label: "\uAC70\uB798\uC77C\uC2DC" },
  { key: "deposit", label: "\uC785\uAE08" },
  { key: "withdrawal", label: "\uCD9C\uAE08" },
  { key: "balanceAfter", label: "\uC794\uC561" },
];

type LedgerRegisterKind = "fixed" | "manual";

const LEDGER_KIND_OPTIONS: Array<{ key: LedgerRegisterKind; label: string; tone: string; activeTone: string }> = [
  { key: "manual", label: "\uBCC0\uB3D9 \uC9C0\uCD9C", tone: "border-slate-200 bg-white text-slate-600", activeTone: "border-slate-900 bg-slate-900 text-white" },
  { key: "fixed", label: "\uACE0\uC815\uBE44", tone: "border-slate-200 bg-white text-slate-600", activeTone: "border-amber-600 bg-amber-600 text-white" },
];

const LEDGER_SCOPE_OPTIONS: Array<{ key: LedgerScopeFilter; label: string }> = [
  { key: "all", label: "\uC804\uCCB4" },
  { key: "ledger_pending", label: "\uBBF8\uBD84\uB958" },
  { key: "ledger_done", label: "\uBD84\uB958 \uC644\uB8CC" },
  { key: "ledger_exempt", label: "\uAC00\uACC4\uBD80 \uC81C\uC678" },
];

function resolveExpenseCategoryFromTxAccount(accountCodes: AccountCode[], tx: BankTransaction) {
  const code = String(tx.ledgerAccountCode || "").trim();
  if (!code) return "";
  const row = findAccountCodeByCode(accountCodes, code);
  return row?.name || resolveAccountCodeLabel(accountCodes, code) || "";
}

function resolveFixedExpenseItemCategory(fixedExpenses: FixedExpense[], fixedExpenseId: string) {
  return fixedExpenses.find((row) => row.id === fixedExpenseId)?.category?.trim() || FIXED_CATEGORY_OPTIONS[0];
}

function formatTxAccountSubjectLabel(
  tx: BankTransaction,
  accountCodes: AccountCode[],
  optimisticLabels: Record<string, string>,
) {
  const key = String(tx.id);
  const optimistic = optimisticLabels[key]?.trim();
  if (optimistic) return optimistic;
  const code = String(tx.ledgerAccountCode || "").trim();
  if (!code) return "";
  return resolveAccountCodeLabel(accountCodes, code) || code;
}

const L = {
  pageTitle: "\uD1B5\uC7A5 \u00B7 \uAC00\uACC4\uBD80",
  pageDesc:
    "\uD1B5\uC7A5 \uAC70\uB798\uAC00 \uAC00\uACC4\uBD80\uC785\uB2C8\uB2E4. \uAC70\uB798\uB97C \uBD84\uB958\uD558\uACE0, \uAC00\uACC4\uBD80 \uC870\uD68C \uD0ED\uC5D0\uC11C \uD544\uD130\uB85C \uD655\uC778\uD558\uC138\uC694.",
  ledgerScopeLabel: "\uAC00\uACC4\uBD80 \uC0C1\uD0DC",
  ibkImport: "IBK \uC5D1\uC140 \uAC00\uC838\uC624\uAE30",
  ibkImportTitle: "IBK \uAC70\uB798\uB0B4\uC5ED \uAC00\uC838\uC624\uAE30",
  ibkImportDesc: "\uAE30\uC5C5\uC740\uD589 \uC778\uD130\uB137\uB1B9\uD0B9 \uAC70\uB798\uB0B4\uC5ED \uC870\uD68C \uC5D1\uC140\uC744 \uC120\uD0DD\uD558\uC138\uC694. \uC911\uBCF5 \uAC70\uB798\uB294 \uC790\uB3D9\uC73C\uB85C \uAC74\uB108\uB701\uB2C8\uB2E4.",
  ibkImportConfirm: "\uAC00\uC838\uC624\uAE30",
  ibkImportAdded: "\uAC74 \uCD94\uAC00",
  ibkImportSkipped: "\uAC74 \uC911\uBCF5 \uC81C\uC678",
  ibkImportDone: "\uAC70\uB798\uB0B4\uC5ED \uAC00\uC838\uC624\uAE30\uAC00 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  ibkImportFailed: "\uC5D1\uC140\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  previewRows: "\uC778\uC2DD \uAC74\uC218",
  previewDeposits: "\uC785\uAE08 \uD569\uACC4",
  previewWithdrawals: "\uCD9C\uAE08 \uD569\uACC4",
  search: "\uAC70\uB798\uB0B4\uC6A9, \uC0C1\uB300\uC608\uAE08\uC8FC, \uC740\uD589, \uBA54\uBAA8 \uAC80\uC0C9",
  searchLabel: "\uAC80\uC0C9",
  searchPlaceholder: "\uAC70\uB798\uB0B4\uC6A9, \uC0C1\uB300\uC608\uAE08\uC8FC, \uC740\uD589, \uBA54\uBAA8",
  searchHint: "\uAC80\uC0C9\uC5B4 \uC785\uB825 \uD6C4 \uAC80\uC0C9 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uC801\uC6A9\uD569\uB2C8\uB2E4.",
  searchApply: "\uAC80\uC0C9",
  empty: "\uC870\uD68C \uC870\uAC74\uC5D0 \uB9DE\uB294 \uAC70\uB798\uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyPeriodHint:
    "\uC120\uD0DD\uD55C \uAE30\uAC04\uC5D0 \uAC70\uB798\uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \u300C\uC804\uCCB4\u300D \uB610\uB294 \u300C\uC9C0\uB09C \uB2EC\u300D\uC744 \uC120\uD0DD\uD574 \uBCF4\uC138\uC694.",
  emptyAll: "\uC544\uC9C1 \uAC00\uC838\uC628 \uAC70\uB798\uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyHint: "IBK \uC778\uD130\uB137\uB1B9\uD0B9 \u2192 \uACC4\uC88C\uC870\uD68C \u2192 \uAC70\uB798\uB0B4\uC5ED \uC870\uD68C \u2192 \uC5D1\uC140 \uB2E4\uC6B4\uB85C\uB4DC \uD6C4 \uAC00\uC838\uC624\uAE30\uB97C \uB20C\uB7EC\uC8FC\uC138\uC694.",
  count: "\uAC74",
  periodStart: "\uC2DC\uC791\uC77C",
  periodEnd: "\uC885\uB8CC\uC77C",
  resetFilter: "\uCD08\uAE30\uD654",
  accountFilter: "\uACC4\uC88C",
  allAccounts: "\uC804\uCCB4 \uACC4\uC88C",
  deleteAccountHistory: "\uD1B5\uC7A5 \uB0B4\uC5ED \uC0AD\uC81C",
  deleteAccountHistoryConfirm: (accountNumber: string, count: number) =>
    `${accountNumber} \uACC4\uC88C\uC758 \uD1B5\uC7A5 \uB0B4\uC5ED ${count}\uAC74\uC744 \uC804\uBD80 \uC0AD\uC81C\uD569\uB2C8\uB2E4.\n\uC5F0\uACB0\uB41C \uAC00\uACC4\uBD80 \uD56D\uBAA9\uB3C4 \uD568\uAED8 \uC0AD\uC81C\uB429\uB2C8\uB2E4. \uBCF5\uAD6C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?`,
  deleteAccountHistoryDone: (accountNumber: string, count: number, ledgerRemoved: number) =>
    `${accountNumber} \uACC4\uC88C \uD1B5\uC7A5 \uB0B4\uC5ED ${count}\uAC74\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.${
      ledgerRemoved ? ` (\uAC00\uACC4\uBD80 ${ledgerRemoved}\uAC74 \uC815\uB9AC)` : ""
    }`,
  depositTotal: "\uC785\uAE08 \uD569\uACC4",
  withdrawalTotal: "\uCD9C\uAE08 \uD569\uACC4",
  netTotal: "\uC21C\uC720\uC785",
  transactionAt: "\uAC70\uB798\uC77C\uC2DC",
  deposit: "\uC785\uAE08",
  withdrawal: "\uCD9C\uAE08",
  balance: "\uC794\uC561",
  description: "\uAC70\uB798\uB0B4\uC6A9",
  counterpartyName: "\uC0C1\uB300\uC608\uAE08\uC8FC",
  counterpartyDrawerTitle: (name: string) => `\uAC70\uB798\uC790 "${name}" \uC804\uCCB4 \uB0B4\uC5ED`,
  counterpartyBank: "\uC0C1\uB300\uC740\uD589",
  transactionType: "\uAC70\uB798\uAD6C\uBD84",
  accountNumber: "\uACC4\uC88C\uBC88\uD638",
  bankName: "\uC740\uD589",
  accountHolder: "\uC608\uAE08\uC8FC",
  queryPeriod: "\uC870\uD68C \uAE30\uAC04",
  latestTransactionAt: "\uCD5C\uC2E0 \uAC70\uB798\uC77C\uC2DC",
  dataAsOf: "\uB370\uC774\uD130 \uAE30\uC900",
  transactionRange: "\uAC70\uB798 \uAE30\uAC04",
  cancel: "\uCDE8\uC18C",
  periodLabel: "\uAE30\uAC04",
  flowLabel: "\uAD6C\uBD84",
  sortLabel: "\uC815\uB840",
  sortAsc: "\uC624\uB984\uCC28\uC21C",
  sortDesc: "\uB0B4\uB984\uCC28\uC21C",
  latestBalance: "\uCD5C\uC2E0 \uC794\uC561",
  topCounterparties: "\uC8FC\uC694 \uAC70\uB798\uCC98",
  flowRatio: "\uC785\uCD9C\uAE08 \uBE44\uC728",
  filteredSummary: "\uC120\uD0DD \uAE30\uAC04 \uC694\uC57D",
  foldersTitle: "\uBD84\uB958 \uD3F4\uB354",
  foldersHint:
    "\uAC70\uB798\uCC98 \uC785\uAE08\u00B7\uCE74\uB4DC\uB9E4\uCD9C\u00B7\uC2DC\uACF5\uC790 \uC9C0\uCD9C \uC678\uC5D0\uB3C4 \uAD6C\uBD84\uC744 \uCD94\uAC00\uD560 \uC218 \uC788\uACE0, \uAC01 \uAC70\uB798\uB97C \uD3F4\uB354\uC5D0 \uB123\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uAC00\uACC4\uBD80\uC5D0 \uC5F0\uB3D9\uB41C \uAC70\uB798\uB294 \u300C\uAC00\uACC4\uBD80\u300D \uBD84\uB958 \uD3F4\uB354\uC5D0 \uC790\uB3D9 \uC800\uC7A5\uB429\uB2C8\uB2E4.",
  clientFolders: "\uAC70\uB798\uCC98 \uC785\uAE08",
  cardFolders: "\uCE74\uB4DC\uB9E4\uCD9C",
  workerFolders: "\uC2DC\uACF5\uC790 \uC9C0\uCD9C",
  unfiled: "\uBBF8\uBD84\uB958",
  allFolders: "\uC804\uCCB4 \uBAA9\uB85D",
  createFolder: "\uD3F4\uB354 \uC0DD\uC131",
  folderName: "\uD3F4\uB354 \uC774\uB984",
  parentFolder: "\uC0C1\uC704 \uD3F4\uB354 (\uC120\uD0DD)",
  parentFolderSectionRoot: (label: string) => `${label} \uCD5C\uC0C1\uC704 (\uAE30\uBCF8 \uBD84\uB958\uC640 \uAC19\uC740 \uB2E8\uACC4)`,
  parentFolderHint:
    "\uCD5C\uC0C1\uC704\uB97C \uC120\uD0DD\uD558\uBA74 \uAC70\uB798\uCC98 \uC785\uAE08\uB7EC \uAE30\uBCF8 \uBD84\uB958 \uD3F4\uB354\uC640 \uAC19\uC740 \uB2E8\uACC4\uC5D0 \uC0DD\uC131\uB429\uB2C8\uB2E4. \uC0C1\uC704 \uD3F4\uB354\uB97C \uACE0\uB974\uBA74 \uD558\uC704 \uD3F4\uB354\uAC00 \uB429\uB2C8\uB2E4.",
  defaultFolderBadge: "\uAE30\uBCF8",
  createFolderInSection: "\uD3F4\uB354 \uCD94\uAC00",
  createCategory: "\uAD6C\uBD84 \uCD94\uAC00",
  createCategoryHint:
    "\uAC70\uB798\uCC98 \uC785\uAE08\u00B7\uCE74\uB4DC\uB9E4\uCD9C\u00B7\uC2DC\uACF5\uC790 \uC9C0\uCD9C\uACFC \uAC19\uC740 \uC0C8 \uCD5C\uC0C1\uC704 \uBD84\uB958\uB97C \uB9CC\uB463\uB2C8\uB2E4.",
  deleteCategoryConfirm:
    "\uAD6C\uBD84\uACFC \uC548\uC758 \uD558\uC704 \uD3F4\uB354\u00B7\uAC70\uB798\uAC00 \uD568\uAED8 \uC0AD\uC81C\uB429\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?",
  createSubfolder: "\uD558\uC704 \uD3F4\uB354 \uC0DD\uC131",
  folderType: "\uD3F4\uB354 \uAD6C\uBD84",
  saveFolder: "\uC0DD\uC131",
  deleteFolder: "\uD3F4\uB354 \uC0AD\uC81C",
  deleteFolderConfirm: "\uD3F4\uB354\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694? \uC548\uC758 \uAC70\uB798\uB294 \uBBF8\uBD84\uB958\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4.",
  assignFolder: "\uD3F4\uB354",
  memo: "\uBA54\uBAA8",
  memoPlaceholder: "\uBA54\uBAA8 \uC785\uB825",
  accountContent: "\uACC4\uC815\uB0B4\uC6A9",
  accountContentPlaceholder: "\uACC4\uC815\uB0B4\uC6A9 \uC785\uB825",
  fixedExpenseColumn: "\uACE0\uC815\uBE44\uD56D\uBAA9",
  fixedExpensePlaceholder: "\uACE0\uC815\uBE44 \uC120\uD0DD",
  addFixedExpense: "\uACE0\uC815\uBE44 \uD56D\uBAA9 \uCD94\uAC00",
  addFixedExpenseTitle: "\uACE0\uC815\uBE44 \uD56D\uBAA9 \uCD94\uAC00",
  unsettledFixedBanner: (count: number, amount: number) =>
    `\uC774\uBC88 \uB2EC \uBBF8\uC5F0\uACB0 \uACE0\uC815\uBE44 ${count}\uAC74 \u00B7 ${formatKRW(amount)}\uC6D0`,
  goFixedExpenseTab: "\uAC00\uACC4\uBD80 \uACE0\uC815\uBE44\uB85C \uC774\uB3D9",
  editAccountContentTitle: "\uACC4\uC815\uB0B4\uC6A9 \uC218\uC815",
  editAccountSubjectTitle: "\uACC4\uC815 \uC218\uC815",
  editFixedExpenseTitle: "\uACE0\uC815\uBE44 \uD56D\uBAA9 \uC218\uC815",
  newFixedExpenseName: "\uD56D\uBAA9 \uC774\uB984",
  accountSubjectRequired: "\uACC4\uC815\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  fixedExpenseRequired: "\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  cellSaveDone: "\uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.",
  bankSection: "\uD1B5\uC7A5 \uB0B4\uC5ED",
  classifySection: "\uBD84\uB958 \uB0B4\uC5ED",
  account: "\uACC4\uC88C",
  counterparty: "\uAC70\uB798\uC790\uBA85",
  amount: "\uC785\uCD9C\uAE08\uC561",
  evidence: "\uC99D\uBE59",
  accountSubject: "\uACC4\uC815",
  clientColumn: "\uAC70\uB798\uCC98",
  classifiedAmount: "\uBD84\uB958 \uAE08\uC561",
  erpProcess: "ERP \uCC98\uB9AC",
  taxInvoiceIssue: "\uACC4\uC0B0\uC11C\uBC1C\uD589",
  taxInvoiceIssueButton: "\uBC1C\uD589",
  evidenceFind: "\uC99D\uBE59 \uCC3E\uAE30",
  evidenceAutoLinked: (label: string) => `\uC99D\uBE59\uC774 \uC790\uB3D9 \uC5F0\uACB0\uB418\uC5C8\uC2B5\uB2C8\uB2E4: ${label}`,
  evidenceAutoMatch: "\uC99D\uBE59 \uC790\uB3D9\uB9E4\uCE6D",
  evidenceBatchAutoLinked: (count: number) => `\uC99D\uBE59 ${count}\uAC74 \uC790\uB3D9 \uC5F0\uACB0\uD588\uC2B5\uB2C8\uB2E4.`,
  evidenceBatchAutoLinkedNone: "\uC790\uB3D9 \uB9E4\uCE6D\uB418\uB294 \uC99D\uBE59\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  evidencePlaceholder: "\uC138\uAE08\uACC4\uC0B0\uC11C \uC5F0\uACB0",
  accountSubjectPlaceholder: "\uACC4\uC815 \uC120\uD0DD",
  accountSubjectSearchPlaceholder: "\uACC4\uC815 \uAC80\uC0C9",
  accountSubjectEmpty: "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  addAccountCode: "\uACC4\uC815 \uCD94\uAC00",
  clientPlaceholder: "\uAC70\uB798\uCC98 \uC120\uD0DD",
  voucherProcessedBadge: "\uC804\uD45C\uCC98\uB9AC\uC785\uAE08",
  editMemoTitle: "\uBA54\uBAA8 \uC218\uC815",
  editClientTitle: "\uAC70\uB798\uCC98 \uC218\uC815",
  clientRequired: "\uAC70\uB798\uCC98\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  detailTitle: "\uD1B5\uC7A5 \uAC70\uB798 \uC804\uD45C",
  detailInfoSection: "\uAC70\uB798 \uC815\uBCF4",
  detailEditSection: "\uC218\uC815 \uD56D\uBAA9",
  detailSave: "\uC800\uC7A5",
  detailSaveDone: "\uAC70\uB798 \uC815\uBCF4\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.",
  detailFixedItemRequired: "\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  detailLedgerRegisterFailed: "\uAC00\uACC4\uBD80 \uB4F1\uB85D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uACC4\uC815\uC774 \uC9C0\uC815\uB418\uC5C8\uB294\uC9C0 \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  accountSubjectSaveFailed: "\uACC4\uC815\uACFC\uBAA9\uC744 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uBE44\uD65C\uC131 \uACC4\uC815\uC774\uAC70\uB098 \uAC70\uB798\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  detailLedgerFolderRequiresRegistration:
    "\uAC00\uACC4\uBD80 \uD3F4\uB354\uB85C \uC800\uC7A5\uD558\uB824\uBA74 \uACC4\uC815 \uB610\uB294 \uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uB4F1\uB85D\uD574 \uC8FC\uC138\uC694.",
  ledgerFolderRequiresRegistration:
    "\uAC00\uACC4\uBD80 \uD3F4\uB354\uB85C \uC774\uB3D9\uD558\uB824\uBA74 \uC9C0\uCD9C\u00B7\uACE0\uC815\uBE44 \uB4F1\uB85D\uC744 \uBAFC\uC800 \uC644\uB8CC\uD574 \uC8FC\uC138\uC694.",
  memoEditHint: "\uBA54\uBAA8 \u00B7 \uBD84\uB958 \u00B7 \uAC00\uACC4\uBD80 \uD56D\uBAA9\uC744 \uC218\uC815\uD55C \uB92C \uC800\uC7A5\uC744 \uB204\uB974\uBA74 \uBC18\uC601\uB429\uB2C8\uB2E4.",
  detailLedgerKindHint: "\uBCC0\uB3D9 \uC9C0\uCD9C\uC740 \uACC4\uC815\uC744, \uACE0\uC815\uBE44\uB294 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD569\uB2C8\uB2E4.",
  classification: "\uBD84\uB958",
  ledgerCategoryColumn: "\uAC00\uACC4\uBD80",
  linkedSubject: "\uC5F0\uACB0 \uC774\uB984",
  workerFolderAssignBlocked: "\uC2DC\uACF5\uC790 \uBAA9\uB85D\uC5D0 \uB4F1\uB85D\uB41C \uC0C1\uB300\uC608\uAE08\uC8FC \uC774\uB984\uC778 \uCD9C\uAE08\uB9CC \uC2DC\uACF5\uC790 \uC9C0\uCD9C\uB85C \uBD84\uB958\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  autoClassify: "\uC790\uB3D9 \uBD84\uB958",
  autoClassifyDone: "\uAC74\uC744 \uC790\uB3D9 \uBD84\uB958\uD588\uC2B5\uB2C8\uB2E4.",
  folderScopeClient: "\uAC70\uB798\uCC98",
  folderScopeCard: "\uCE74\uB4DC\uB9E4\uCD9C",
  folderScopeWorker: "\uC2DC\uACF5\uC790",
  viewList: "\uAC70\uB798 \uBAA9\uB85D",
  viewReconcile: "\uC785\uAE08 \uB300\uC0AC",
  reconcileTitle: "\uD1B5\uC7A5 \uC785\uAE08 \u2194 \uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uB9E4\uCE69",
  reconcileDesc:
    "\uB9C1\uD06C\uB85C \uBCF4\uB0B8 \uAC70\uB798\uCC98 \uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C\uC640 \uC785\uAE08 \uAE08\uC561\u00B7\uAC70\uB798\uCC98\uBA85\uC774 \uC77C\uCE58\uD558\uBA74 \uAC74\uBCC4 \uC785\uAE08 \uCC98\uB9AC\uB97C \uCD94\uCC9C\uD569\uB2C8\uB2E4. \uB0B4\uC5ED\uC11C\uAC00 \uC5C6\uC73C\uBA74 \uBBF8\uC218 \uB9E4\uCD9C\uACFC \uBE44\uAD50\uD569\uB2C8\uB2E4.",
  reconcileBanner: (count: number) =>
    `\uC785\uAE08 ${count}\uAC74\uC774 \uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uB610\uB294 \uBBF8\uC218 \uB9E4\uCD9C\uACFC \uB9E4\uCE69\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`,
  reconcileOpen: "\uC785\uAE08 \uB300\uC0AC \uC5F4\uAE30",
  matchScore: "\uC77C\uCE58\uB3C4",
  matchConfirm: "\uAC74\uBCC4 \uC785\uAE08\uCC98\uB9AC",
  matchConfirmHint: "\uCD94\uCC9C \uB0B4\uC6A9\uC73C\uB85C \uC785\uAE08 \uC804\uD45C \uC0DD\uC131",
  matchManual: "\uC9C1\uC811 \uC120\uD0DD",
  matchDone: "\uC785\uAE08 \uC804\uD45C\uAC00 \uC0DD\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  matchBulk: "\uACE0\uC2E0\uB8B0 \uC790\uB3D9 \uC5F0\uACB0",
  matchBulkDone: "\uAC74\uC744 \uC790\uB3D9 \uC785\uAE08 \uC5F0\uACB0\uD588\uC2B5\uB2C8\uB2E4.",
  autoLinkBadge: "\uC790\uB3D9\uC785\uAE08",
  autoLinkBadgeTitle: "\uACE0\uC2E0\uB8B0 \uC790\uB3D9 \uC785\uAE08",
  manualLinkBadge: "\uAC74\uBCC4\uC785\uAE08",
  manualLinkBadgeTitle: "\uAC74\uBCC4 \uC785\uAE08\uCC98\uB9AC\uB85C \uC5F0\uACB0",
  partialPaymentBadgeTitle: "\uBD80\uBD84 \uC785\uAE08 \uC804\uD45C (\uB0B4\uC5ED\uC11C \uC794\uC561 \uBBF8\uC218)",
  partialStatementMatchHint: (amount: number, remaining: number) =>
    `\uBD80\uBD84\uC785\uAE08 ${formatKRW(amount)} \u00B7 \uC794\uC561 ${formatKRW(Math.max(0, remaining - amount))}`,
  matchEmpty: "\uCD94\uCC9C\uD560 \uBBF8\uC5F0\uACB0 \uC785\uAE08\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  matchStatus: "\uBBF8\uC218 \uC5F0\uACB0",
  linkedSale: "\uC5F0\uACB0 \uB9E4\uCD9C",
  saleDate: "\uB9E4\uCD9C\uC77C",
  unpaidAmount: "\uBBF8\uC218\uAE08",
  selectReceivable: "\uBBF8\uC218 \uB9E4\uCD9C \uC120\uD0DD",
  selectSentStatement: "\uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uC120\uD0DD",
  sentStatementMatch: "\uBCF4\uB0B8\uB0B4\uC5ED\uC11C",
  statementTotal: "\uB0B4\uC5ED\uC11C \uAE08\uC561",
  sentAt: "\uB9C1\uD06C \uBC1C\uC1A1",
  ledgerRegister: "\uAC00\uACC4\uBD80 \uB4F1\uB85D",
  ledgerSendTo: "\uAC00\uACC4\uBD80\uB85C \uBCF4\uB0B4\uAE30",
  ledgerRegisterTitle: "\uD68C\uC0AC \uAC00\uACC4\uBD80 \uC9C0\uCD9C \uB4F1\uB85D",
  ledgerRegisterDesc: "\uBBF8\uBD84\uB958 \uCD9C\uAE08 \uB0B4\uC5ED\uC744 \uD68C\uC0AC \uAC00\uACC4\uBD80 \uC9C0\uCD9C\uB85C \uB4F1\uB85D\uD569\uB2C8\uB2E4.",
  ledgerRegistered: "\uAC00\uACC4\uBD80 \uB4F1\uB85D\uC74C",
  ledgerManualRegistered: "\uBCC0\uB3D9 \uC9C0\uCD9C \uB4F1\uB85D\uC74C",
  ledgerFixedRegistered: "\uACE0\uC815\uBE44 \uB4F1\uB85D\uC74C",
  ledgerRegisterDone: "\uD68C\uC0AC \uAC00\uACC4\uBD80\uC5D0 \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  ledgerAlreadyRegistered: "\uC774\uBBF8 \uAC00\uACC4\uBD80\uC5D0 \uB4F1\uB85D\uB41C \uD1B5\uC7A5 \uB0B4\uC5ED\uC785\uB2C8\uB2E4.",
  ledgerFixedRegisterDone: "\uACE0\uC815\uBE44 \uB0A9\uBD80\uB85C \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  ledgerFixedLinkDone: "\uAE30\uC874 \uACE0\uC815\uBE44 \uB0A9\uBD80\uC5D0 \uD1B5\uC7A5 \uB0B4\uC5ED\uC774 \uC5F0\uACB0\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  ledgerLinkExistingTitle: "\uBBF8\uC5F0\uACB0 \uB0A9\uBD80 \uC788\uC74C",
  ledgerLinkExistingDesc: (count: number) =>
    `\uC774\uBC88 \uB2EC \uB4F1\uB85D\uB41C \uBBF8\uC5F0\uACB0 \uB0A9\uBD80 ${count}\uAC74\uC774 \uC788\uC2B5\uB2C8\uB2E4. \uC911\uBCF5 \uC0DD\uC131 \uC5C6\uC774 \uAE30\uC874 \uB0A9\uBD80\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`,
  ledgerLinkModeLink: "\uAE30\uC874 \uB0A9\uBD80\uC5D0 \uC5F0\uACB0",
  ledgerLinkModeCreate: "\uC0C8 \uB0A9\uBD80 \uB4F1\uB85D",
  ledgerLinkPaymentPick: "\uC5F0\uACB0\uD560 \uB0A9\uBD80",
  ledgerSaveLink: "\uAE30\uC874 \uB0A9\uBD80\uC5D0 \uC5F0\uACB0",
  ledgerEditTitle: "\uAC00\uACC4\uBD80 \uB4F1\uB85D \uC218\uC815",
  ledgerEditDesc: "\uBD84\uB958\uB41C \uCD9C\uAE08 \uB4F1\uB85D \uB0B4\uC6A9\uC744 \uC218\uC815\uD569\uB2C8\uB2E4.",
  ledgerEditSave: "\uC218\uC815 \uC800\uC7A5",
  ledgerEditDone: "\uAC00\uACC4\uBD80 \uB4F1\uB85D\uC774 \uC218\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  ledgerFixedEditDone: "\uACE0\uC815\uBE44 \uB4F1\uB85D\uC774 \uC218\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  ledgerKindChangeDone: "\uB4F1\uB85D \uC720\uD615\uC774 \uBCC0\uACBD\uB418\uC5B4 \uAE30\uC874 \uC5F0\uACB0\uC744 \uD574\uC81C\uD55C \uB4A4 \uB2E4\uC2DC \uB4F1\uB85D\uD588\uC2B5\uB2C8\uB2E4.",
  ledgerKindChangeSaveManual: "\uC720\uD615 \uBCC0\uACBD \u00B7 \uBCC0\uB3D9\uC9C0\uCD9C\uB85C \uC800\uC7A5",
  ledgerKindChangeSaveFixed: "\uC720\uD615 \uBCC0\uACBD \u00B7 \uACE0\uC815\uBE44\uB85C \uC800\uC7A5",
  ledgerBadgeEditHint: "\uD074\uB9AD\uD558\uBA74 \uB4F1\uB85D \uB0B4\uC6A9\uC744 \uC218\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  ledgerAutoRegisterDone: (count: number) => `\uACE0\uC815\uBE44 ${count}\uAC74\uC774 \uC790\uB3D9 \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`,
  ledgerAutoLearnDone: formatBankLearnAutoMessage,
  smartLedgerRun: "자동 가계부",
  smartLedgerRunHint: "폴더 분류·학습 규칙·AI 추정으로 출금을 가계부에 자동 등록합니다.",
  smartLedgerRunning: "자동 가계부 처리 중…",
  smartLedgerBanner: (eligible: number, high: number) =>
    `미등록 출금 ${eligible}건 · 자동 등록 가능 ${high}건`,
  ledgerSuggestionBadge: (label: string, confidence: number) => `추천 ${label} (${confidence}%)`,
  folderSuggestionBadge: (label: string, subject?: string) =>
    subject ? `추천 ${label}: ${subject}` : `추천 ${label}`,
  ledgerLearnRuleBadge: (confidence: number) => `학습규칙 ${confidence}%`,
  ledgerConfidenceBlocked: (confidence: number | null) =>
    confidence != null
      ? `매칭 신뢰도 ${Math.round(confidence)}%입니다. 회사 가계부 등록에는 ${LEDGER_REGISTRATION_MIN_CONFIDENCE_PERCENT}% 이상이 필요합니다. 계정을 지정하면 등록할 수 있습니다.`
      : `매칭 신뢰도가 확인되지 않아 회사 가계부로 등록할 수 없습니다. 계정을 지정하거나 학습 규칙을 추가해 주세요.`,
  ledgerSaveManualHint: "\uB2E8\uC21C\uC9C0\uCD9C\uB85C \uC800\uC7A5",
  ledgerSaveFixedHint: "\uAE08\uC561\uC774 \uB9DE\uB294 \uBBF8\uC5F0\uACB0 \uB0A9\uBD80\uAC00 \uC788\uC73C\uBA74 \uC790\uB3D9 \uC5F0\uACB0\uD569\uB2C8\uB2E4",
  ledgerKind: "\uB4F1\uB85D \uC720\uD615",
  ledgerFixedItem: "\uACE0\uC815\uBE44 \uD56D\uBAA9",
  ledgerDescription: "\uB0B4\uC6A9",
  ledgerAmount: "\uAE08\uC561",
  ledgerMemo: "\uBA54\uBAA8",
  ledgerSave: "\uAC00\uACC4\uBD80\uB85C \uBCF4\uB0B4\uAE30",
  ledgerBatchSend: "\uAC00\uACC4\uBD80\uB85C \uBCF4\uB0B4\uAE30",
  ledgerBatchSendHint:
    "\uD604\uC7AC \uD544\uD130 \uC911 \uC2E0\uB8B0\uB3C4 90% \uC774\uC0C1(\uACC4\uC815 \uC9C0\uC815 \uD3EC\uD568) \uCD9C\uAE08\uC744 \uD655\uC778 \uC5C6\uC774 \uAC00\uACC4\uBD80\uC5D0 \uB4F1\uB85D\uD569\uB2C8\uB2E4. \uACE0\uC815\uBE44\uB294 \uAE08\uC561 \uC77C\uCE58 \uB0A9\uBD80\uAC00 \uC788\uC73C\uBA74 \uC790\uB3D9 \uC5F0\uACB0\uD569\uB2C8\uB2E4.",
  ledgerBatchSending: "\uAC00\uACC4\uBD80 \uB4F1\uB85D \uC911\u2026",
  ledgerBatchBanner: (registerable: number) =>
    `\uD544\uD130 \uCD9C\uAE08 \uC911 \uAC00\uACC4\uBD80 \uB4F1\uB85D \uAC00\uB2A5 ${registerable}\uAC74`,
  ledgerDate: "\uC9C0\uCD9C\uC77C",
  ledgerClickHint: "\uBBF8\uBD84\uB958 \uCD9C\uAE08 \uB0B4\uC6A9 \uD074\uB9AD \u2192 \uAC00\uACC4\uBD80\uB85C \uBCF4\uB0B4\uAE30",
  categoryPromptTitle: "\uAC00\uACC4\uBD80 \uC5F0\uB3D9 \uD655\uC778",
  categoryPromptDesc:
    "\uCD9C\uAE08 \uB0B4\uC5ED\uC744 \uACE0\uC815\uBE44 \uB610\uB294 \uBCC0\uB3D9\uC9C0\uCD9C\uB85C \uB4F1\uB85D\uD569\uB2C8\uB2E4. \uD655\uC778\uD558\uBA74 \uBE44\uC2B7\uD55C \uAC70\uB798\uC5D0 \uD559\uC2B5\uB429\uB2C8\uB2E4.",
  categoryPromptPattern: (label: string, count: number) =>
    count > 1 ? `${label} \u00B7 \uBE44\uC2B7 ${count}\uAC74` : label,
  categoryPromptSave: "\uB4F1\uB85D \uBC0F \uD559\uC2B5",
  categoryPromptSkip: "\uAC74\uB108\uB700\uAE30",
  categoryPromptLater: "\uB098\uC911\uC5D0",
  categoryPromptRequired: "\uACC4\uC815\uC744 \uC9C0\uC815\uD574 \uC8FC\uC138\uC694.",
  categoryPromptFixedRequired: "\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  categoryPromptDone: (count: number) => `\uAC00\uACC4\uBD80 \uD655\uC778 \uD6C4 ${count}\uAC74 \uB4F1\uB85D`,
  categoryPromptSuggestion: (label: string, confidence: number) => `\uCD94\uCC9C: ${label} (${confidence}%)`,
  recurringFixedTitle: "\uBC18\uBCF5 \uCD9C\uAE08 \u2192 \uACE0\uC815\uBE44",
  recurringFixedDesc:
    "\uB9E4\uC6D4 \uBE44\uC2B7\uD55C \uCD9C\uAE08\uC774 2\uAC1C\uC6D4 \uC774\uC0C1 \uBC18\uBCF5\uB418\uBA74 \uACE0\uC815\uBE44\uB85C \uC778\uC2DD\uD569\uB2C8\uB2E4. \uC608\uAE08\uC8FC\u00B7\uAC70\uB798\uB0B4\uC6A9 \uC811\uB450\uC0AC\u00B7\uAE08\uC561 \uC77C\uBD80 \uCC28\uC774(\uC790\uB3D9\uC774\uCC28 \uB4F1)\u00B7\uB0A9\uBD80\uC77C 2~3\uC77C \uCC28\uC774\uB3C4 \uD568\uAED8 \uBB36\uC2B5\uB2C8\uB2E4.",
  recurringFixedOpen: "\uBC18\uBCF5 \uCD9C\uAE08 \u2192 \uACE0\uC815\uBE44",
  recurringFixedApply: "\uACE0\uC815\uBE44 \uC0DD\uC131 \uBC0F \uC5F0\uACB0",
  recurringFixedEmpty: "\uC778\uC2DD\uD560 \uBC18\uBCF5 \uCD9C\uAE08 \uD328\uD134\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  recurringFixedPattern: (
    name: string,
    day: number,
    amount: number,
    months: number,
    txCount: number,
    daySpread = 0,
    amountFlexible = false,
  ) =>
    `${name} \u00B7 \uB9E4\uC6D4 ${daySpread > 0 ? `${day}\uC77C(\u00B1${daySpread}\uC77C)` : `${day}\uC77C`} \u00B7 ${amountFlexible ? `\uC57D ${formatKRW(amount)}` : formatKRW(amount)} \u00B7 ${months}\uAC1C\uC6D4 \u00B7 ${txCount}\uAC74`,
  recurringFixedExisting: "\uAE30\uC874 \uACE0\uC815\uBE44 \uC788\uC74C",
  recurringFixedNew: "\uC2E0\uADDC \uACE0\uC815\uBE44",
  recurringFixedDone: (created: number, linked: number) =>
    `\uACE0\uC815\uBE44 ${created}\uAC1C \uC0DD\uC131 \u00B7 \uB0A9\uBD80 ${linked}\uAC74 \uC5F0\uACB0`,
  preauthNetOpen: "\uC120\uACB0\uC81C \uC815\uB9AC",
  preauthNetTitle: "\uC8FC\uC720\uC18C \uC120\uACB0\uC81C \uC815\uB9AC",
  preauthNetDesc:
    "\uC120\uACB0\uC778 \uCD9C\uAE08 \u2192 \uB3D9\uC77C \uAE08\uC561 \uD658\uBD88 \uC785\uAE08 \u2192 \uC2E4\uACB0\uC81C \uCD9C\uAE08 \uC138 \uAC74\uC744 \uD558\uB098\uC758 \uC9C0\uCD9C\uB85C \uC815\uB9AC\uD569\uB2C8\uB2E4.",
  preauthNetApply: "\uC815\uB9AC \uC801\uC6A9",
  preauthNetLearn: "\uD559\uC2B5\uD558\uC5EC \uB2E4\uC74C\uBD80\uD130 \uC790\uB3D9 \uC801\uC6A9",
  preauthNetDone: (count: number) => `\uC120\uACB0\uC81C \uC815\uB9AC ${count}\uAC74 \uADF8\uB8F9 \uC801\uC6A9`,
  preauthNetBadge: "\uC120\uACB0\uC81C",
  preauthNetSuppressedBadge: "\uC120\uACB0\uC81C(\uBBF8\uC801\uC6A9)",
  preauthNetRefundBadge: "\uC120\uACB0\uC81C \uD658\uBD88",
  preauthNetSettlementBadge: "\uC2E4\uACB0\uC81C",
  preauthNetEmpty: "\uC815\uB9AC\uD560 \uC120\uACB0\uC81C \uD328\uD134\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  preauthNetPattern: (name: string, date: string, preauth: number, settlement: number) =>
    settlement > 0
      ? `${name} \u00B7 ${date} \u00B7 \uC120\uACB0 ${formatKRW(preauth)} \u2192 \uC2E4\uACB0 ${formatKRW(settlement)}`
      : `${name} \u00B7 ${date} \u00B7 \uC120\uACB0 ${formatKRW(preauth)} \u2192 \uCDE8\uC18C\uB9CC`,
  backgroundLearnDone: (parts: string[]) =>
    parts.length ? `\uBC18\uB3D9 \uD559\uC2B5 \u00B7 ${parts.join(" \u00B7 ")}` : "",
  clientLinkTitle: "\uAC70\uB798\uCC98 \uC5F0\uACB0",
  clientLinkDesc:
    "\uD1B5\uC7A5 \uC785\uAE08 \uC2DC \uD45C\uC2DC\uB41C \uC774\uB984\uC744 \uAC70\uB798\uCC98 \uC608\uAE08\uC8FC \uBCC4\uCE59\uC5D0 \uCD94\uAC00\uD569\uB2C8\uB2E4. \uC774\uD6C4 \uB3D9\uC77C \uC774\uB984 \uC785\uAE08\uC740 \uC790\uB3D9 \uBD84\uB958\uB429\uB2C8\uB2E4.",
  clientLinkSelectClient: "\uAC70\uB798\uCC98 \uAC80\uC0C9",
  clientLinkDepositSubject: "\uD1B5\uC7A5 \uD45C\uC2DC \uC774\uB984",
  clientLinkSave: "\uC5F0\uACB0 \uC800\uC7A5",
  clientLinkDone: "\uAC70\uB798\uCC98 \uC608\uAE08\uC8FC \uBCC4\uCE59\uC744 \uD559\uC2B5\uD588\uC2B5\uB2C8\uB2E4. \uAC70\uB798\uCC98 \uD3F4\uB354\uB85C \uBD84\uB958\uD588\uC2B5\uB2C8\uB2E4.",
  clientLinkMissingSubject: "\uC0C1\uB300\uC608\uAE08\uC8FC \uB610\uB294 \uAC70\uB798\uB0B4\uC6A9\uC774 \uC5C6\uC5B4 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  clientLinkMissingClient: "\uAC70\uB798\uCC98\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  clientLinkClickHint: "\uBBF8\uBD84\uB958 \uC785\uAE08 \uD074\uB9AD \u2192 \uAC70\uB798\uCC98 \uC5F0\uACB0",
};

type DepositSuggestion =
  | {
      tx: BankTransaction;
      kind: "sentStatement";
      candidates: SentStatementMatchCandidate[];
    }
  | {
      tx: BankTransaction;
      kind: "receivable";
      candidates: BankDepositMatchCandidate[];
    };

function resolveActivePeriod(periodKey: PeriodKey, dateFilter: DateFilter): DateFilter {
  return resolveBankTransactionPeriod(periodKey, dateFilter);
}

function StatCard({
  label,
  value,
  icon,
  tone,
  compact = true,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "deposit" | "withdrawal" | "net-positive" | "net-negative" | "neutral";
  compact?: boolean;
}) {
  const toneClass =
    tone === "deposit"
      ? "is-deposit"
      : tone === "withdrawal"
        ? "is-withdrawal"
        : tone === "net-positive"
          ? "is-net-positive"
          : tone === "net-negative"
            ? "is-net-negative"
            : "";

  const valueClass =
    tone === "deposit"
      ? "text-emerald-700"
      : tone === "withdrawal"
        ? "text-red-600"
        : tone === "net-positive"
          ? "text-emerald-700"
          : tone === "net-negative"
            ? "text-red-600"
            : "text-slate-900";

  if (compact) {
    return (
      <div className={`erp-bank-stat-card is-compact ${toneClass}`}>
        <span className="erp-bank-stat-compact-icon">{icon}</span>
        <div className="min-w-0">
          <div className="erp-bank-stat-compact-label">{label}</div>
          <div className={`erp-bank-stat-compact-value ${valueClass}`}>{value}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-bank-stat-card ${toneClass}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="erp-text-caption font-semibold text-slate-500">{label}</span>
        <span className="text-slate-400">{icon}</span>
      </div>
      <div className={`text-xl font-black tracking-tight ${valueClass}`}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function BankTransactionSearchBar({
  appliedValue,
  onApply,
  resetKey,
}: {
  appliedValue: string;
  onApply: (value: string) => void;
  resetKey?: string | number;
}) {
  const [draftValue, setDraftValue] = useState(appliedValue);

  useEffect(() => {
    setDraftValue(appliedValue);
  }, [appliedValue, resetKey]);

  const applySearch = () => {
    onApply(draftValue.trim());
  };

  const clearSearch = () => {
    setDraftValue("");
    onApply("");
  };

  return (
    <div className="erp-bank-search">
      <label className="erp-bank-search__label" htmlFor="bank-transaction-search">
        {L.searchLabel}
      </label>
      <div className="erp-bank-search__row">
        <div className="erp-bank-search__field">
          <Search size={18} className="erp-bank-search__icon" aria-hidden="true" />
          <input
            id="bank-transaction-search"
            lang="ko"
            type="text"
            className="erp-bank-search__input"
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applySearch();
              }
            }}
            placeholder={L.searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
          />
          {draftValue ? (
            <button
              type="button"
              className="erp-bank-search__clear"
              onClick={clearSearch}
              aria-label="검색어 지우기"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <Button type="button" className="erp-bank-search__submit shrink-0 rounded-xl" onClick={applySearch}>
          {L.searchApply}
        </Button>
      </div>
      <p className="erp-bank-search__hint">{L.searchHint}</p>
    </div>
  );
}

function canLinkUnclassifiedClientDeposit(row: BankTransaction) {
  return row.deposit > 0 && !row.folderId && !isCardCompanyDeposit(row);
}

function parseLedgerConfirmedAtMs(value: string | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Keep freshly assigned manual account codes when ledger sync effects run on stale prev. */
function mergeManualLedgerAccountFieldsFromRef(
  prev: BankTransaction[],
  refRows: BankTransaction[],
): BankTransaction[] {
  const refById = new Map(refRows.map((row) => [String(row.id), row]));
  return prev.map((row) => {
    const refRow = refById.get(String(row.id));
    if (!refRow) return row;
    const refCode = String(refRow.ledgerAccountCode || "").trim();
    const prevCode = String(row.ledgerAccountCode || "").trim();
    const refMs = parseLedgerConfirmedAtMs(refRow.ledgerConfirmedAt);
    const prevMs = parseLedgerConfirmedAtMs(row.ledgerConfirmedAt);
    if (!(refMs > prevMs || (refCode && refCode !== prevCode))) return row;
    return {
      ...row,
      ledgerStatus: refRow.ledgerStatus,
      ledgerCategoryId: refRow.ledgerCategoryId,
      ledgerAccountCode: refRow.ledgerAccountCode,
      ledgerMemo: refRow.ledgerMemo,
      ledgerFixedExpenseId: refRow.ledgerFixedExpenseId,
      ledgerConfirmedAt: refRow.ledgerConfirmedAt,
      ledgerConfirmedBy: refRow.ledgerConfirmedBy,
      ledgerClientName: refRow.ledgerClientName,
    };
  });
}

function buildLedgerLinkDefaults(
  tx: BankTransaction,
  fixedExpenseId: string,
  payments: FixedExpensePayment[],
  fixedExpenses: FixedExpense[],
) {
  const linkable = listLinkableFixedExpensePayments(tx, fixedExpenseId, payments, fixedExpenses);
  if (!linkable.length) {
    return { linkMode: "create" as const, linkPaymentId: "" };
  }
  return { linkMode: "link" as const, linkPaymentId: linkable[0].id };
}

function BankTransactionsPageComponent({
  bankTransactions,
  setBankTransactions,
  bankTransactionFolders,
  setBankTransactionFolders,
  clients,
  setClients,
  workers,
  receivableRows,
  sales,
  paymentVouchers,
  setPaymentVouchers,
  setPaymentInputLogs,
  companyExpenses,
  setCompanyExpenses,
  fixedExpenses,
  setFixedExpenses,
  fixedExpensePayments,
  setFixedExpensePayments,
  bankLedgerRules,
  setBankLedgerRules,
  expenseCategories,
  setExpenseCategories,
  fixedExpenseCategories,
  setFixedExpenseCategories,
  ledgerCategories = [],
  accountCodes = [],
  taxInvoices = [],
  setTaxInvoices,
  currentUser,
  onNavigateToCompanyLedger,
  onNavigateToClassify,
  onNavigateToFixedExpense,
  onNavigateToTaxInvoice,
  companyProfile,
  apiMode = false,
  onBankSyncBegin,
  onBankSynced,
  isPageActive = true,
  onRequestImmediateSave,
}: {
  bankTransactions: BankTransaction[];
  setBankTransactions: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  bankTransactionFolders: BankTransactionFolder[];
  setBankTransactionFolders: React.Dispatch<React.SetStateAction<BankTransactionFolder[]>>;
  clients: Array<{ id?: number | string; name?: string; manager?: string; businessNo?: string; depositNameAliases?: string }>;
  setClients: React.Dispatch<React.SetStateAction<Array<{ id?: number | string; name?: string; manager?: string; businessNo?: string; depositNameAliases?: string; [key: string]: unknown }>>>;
  workers: Array<{ name?: string; businessNo?: string; depositNameAliases?: string }>;
  receivableRows: ReceivableRow[];
  sales: Array<{ id?: number | string; workers?: unknown[]; worker?: string; amount?: number }>;
  paymentVouchers: Array<{ id?: number | string; bankTransactionId?: string }>;
  setPaymentVouchers: React.Dispatch<React.SetStateAction<unknown[]>>;
  setPaymentInputLogs: React.Dispatch<React.SetStateAction<unknown[]>>;
  companyExpenses: CompanyExpense[];
  setCompanyExpenses: React.Dispatch<React.SetStateAction<CompanyExpense[]>>;
  fixedExpenses: FixedExpense[];
  setFixedExpenses: React.Dispatch<React.SetStateAction<FixedExpense[]>>;
  fixedExpensePayments: FixedExpensePayment[];
  setFixedExpensePayments: React.Dispatch<React.SetStateAction<FixedExpensePayment[]>>;
  bankLedgerRules: BankLearnRule[];
  setBankLedgerRules: React.Dispatch<React.SetStateAction<BankLearnRule[]>>;
  expenseCategories: string[];
  setExpenseCategories: React.Dispatch<React.SetStateAction<string[]>>;
  fixedExpenseCategories: string[];
  setFixedExpenseCategories: React.Dispatch<React.SetStateAction<string[]>>;
  ledgerCategories?: LedgerCategory[];
  accountCodes?: AccountCode[];
  taxInvoices?: TaxInvoice[];
  setTaxInvoices?: React.Dispatch<React.SetStateAction<TaxInvoice[]>>;
  currentUser: ErpUser | null;
  onNavigateToCompanyLedger?: () => void;
  onNavigateToClassify?: () => void;
  onNavigateToFixedExpense?: () => void;
  onNavigateToTaxInvoice?: () => void;
  companyProfile?: import("@/utils/companyProfile").CompanyProfile;
  apiMode?: boolean;
  onBankSyncBegin?: () => void;
  onBankSynced?: (result?: {
    version?: number;
    bankTransactions?: unknown[];
    bankTransactionFolders?: unknown[];
    bankSyncMeta?: { lastImportAt?: string | null } | null;
  }) => void | Promise<{ totalCount?: number; addedCount?: number; applied?: boolean } | void>;
  isPageActive?: boolean;
  onRequestImmediateSave?: (patch?: {
    bankTransactions?: BankTransaction[];
    companyExpenses?: CompanyExpense[];
    fixedExpenses?: FixedExpense[];
    fixedExpensePayments?: FixedExpensePayment[];
    fixedExpenseCategories?: string[];
    bankTransactionFolders?: BankTransactionFolder[];
    bankLedgerRules?: BankLearnRule[];
    expenseCategories?: string[];
    clients?: typeof clients;
    paymentVouchers?: unknown[];
    taxInvoices?: TaxInvoice[];
  }) => void | Promise<void>;
}) {
  const { erpVersion } = useBankSyncMeta();
  const [pageView, setPageView] = useState<PageView>("list");
  const [periodKey, setPeriodKey] = useState<PeriodKey>("thisMonth");
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => ({ startDate: "", endDate: "" }));
  const [flowFilter, setFlowFilter] = useState<BankTransactionFlowFilter>("all");
  const [ledgerScopeFilter, setLedgerScopeFilter] = useState<LedgerScopeFilter>("all");
  const [statusTab, setStatusTab] = useState<BankTxStatusTab>("all");
  const [clientNameFilter, setClientNameFilter] = useState("");
  const [counterpartyDrawer, setCounterpartyDrawer] = useState<{ key: string; label: string } | null>(null);
  const [accountSubjectFilter, setAccountSubjectFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState<BankTxGroupFilter>("all");
  const [evidenceFilter, setEvidenceFilter] = useState<BankTxEvidenceFilter>("all");
  const [accountFilter, setAccountFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterResetKey, setFilterResetKey] = useState(0);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [folderScope, setFolderScope] = useState<FolderScope>("all");
  const [sort, setSort] = useState<BankTransactionSort>(DEFAULT_BANK_TRANSACTION_SORT);
  const taxInvoiceMatchContext = useMemo(() => ({ clients, workers }), [clients, workers]);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderType, setNewFolderType] = useState<BankTransactionFolderType>("client");
  const [newFolderParentId, setNewFolderParentId] = useState("");
  const [folderError, setFolderError] = useState("");
  const [importPreview, setImportPreview] = useState<IbkBankImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [smartLedgerLoading, setSmartLedgerLoading] = useState(false);
  const [batchLedgerLoading, setBatchLedgerLoading] = useState(false);
  const [linkModalTx, setLinkModalTx] = useState<BankTransaction | null>(null);
  const [clientLinkModalTx, setClientLinkModalTx] = useState<BankTransaction | null>(null);
  const [clientLinkClientName, setClientLinkClientName] = useState("");
  const { recordAudit, recordSummaryAudit } = useAudit();
  const [ledgerModal, setLedgerModal] = useState<{
    mode: "create" | "edit";
    tx: BankTransaction;
    kind: LedgerRegisterKind;
    fixedExpenseId: string;
    category: string;
    date: string;
    description: string;
    amount: string;
    memo: string;
    editPaymentId?: string;
    editExpenseId?: string;
    linkMode?: "link" | "create";
    linkPaymentId?: string;
  } | null>(null);
  const [ledgerFormError, setLedgerFormError] = useState("");
  const [ledgerReviewPrompt, setLedgerReviewPrompt] = useState<{
    key: string;
    label: string;
    transactions: BankTransaction[];
    kind: LedgerRegisterKind;
    fixedExpenseId: string;
    category: string;
    date: string;
    description: string;
    amount: string;
    memo: string;
    linkMode: "link" | "create";
    linkPaymentId: string;
    suggestionLabel?: string;
    suggestionConfidence?: number;
  } | null>(null);
  const [ledgerReviewPromptError, setLedgerReviewPromptError] = useState("");
  const [recurringFixedModalOpen, setRecurringFixedModalOpen] = useState(false);
  const [selectedRecurringPatternKeys, setSelectedRecurringPatternKeys] = useState<string[]>([]);
  const [preauthNetModalOpen, setPreauthNetModalOpen] = useState(false);
  const [selectedPreauthGroupKeys, setSelectedPreauthGroupKeys] = useState<string[]>([]);
  const [learnPreauthMerchants, setLearnPreauthMerchants] = useState(true);
  const [accountContentModal, setAccountContentModal] = useState<TxAccountContentModal | null>(null);
  const [accountSubjectPicker, setAccountSubjectPicker] = useState<{
    txId: string;
    selectedCode: string;
    flow: "income" | "expense";
  } | null>(null);
  const accountSubjectPickerTxIdRef = useRef<string | null>(null);
  const [accountSubjectLabels, setAccountSubjectLabels] = useState<Record<string, string>>({});
  const accountSubjectIgnoreOpenUntilRef = useRef(0);
  const bankAccountSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bankAccountSavePatchRef = useRef<{
    bankTransactions: BankTransaction[];
    companyExpenses?: typeof companyExpenses;
    fixedExpensePayments?: typeof fixedExpensePayments;
  } | null>(null);
  const bankTransactionsRef = useRef(bankTransactions);
  useEffect(() => {
    bankTransactionsRef.current = bankTransactions;
  }, [bankTransactions]);
  const taxInvoicesRef = useRef(taxInvoices);
  taxInvoicesRef.current = taxInvoices;
  const [fixedExpenseModal, setFixedExpenseModal] = useState<TxFixedExpenseModal | null>(null);
  const fixedExpenseItemModalRef = useRef<CompanyLedgerFixedExpenseModalHandle>(null);
  const [clientModal, setClientModal] = useState<TxClientModal | null>(null);
  const [taxInvoiceLinkSession, setTaxInvoiceLinkSession] = useState<TaxInvoiceLinkSession | null>(null);
  const [taxInvoiceIssueTx, setTaxInvoiceIssueTx] = useState<BankTransaction | null>(null);
  const openCounterpartyDrawer = useCallback((label: string) => {
    const trimmed = String(label || "").trim();
    if (!trimmed || trimmed === "-") return;
    setCounterpartyDrawer({
      key: normalizeBankTxCounterpartyKey(trimmed),
      label: trimmed,
    });
  }, []);
  const taxInvoiceLinkSessionRef = useRef<TaxInvoiceLinkSession | null>(null);
  taxInvoiceLinkSessionRef.current = taxInvoiceLinkSession;
  const taxInvoicePanelUiRef = useRef({
    companyProfile,
    onNavigateToTaxInvoice,
  });
  taxInvoicePanelUiRef.current = {
    companyProfile,
    onNavigateToTaxInvoice,
  };
  const [txCellModalError, setTxCellModalError] = useState("");
  const importLedgerBatchIdsRef = useRef<Set<string>>(new Set());
  const ledgerMemoDraftRef = useRef("");
  const ledgerReviewMemoDraftRef = useRef("");
  const [sentArchives, setSentArchives] = useState<PdfArchiveMeta[]>([]);
  const ibkInputRef = useRef<HTMLInputElement>(null);
  const savedBy = currentUser?.name || currentUser?.loginId || "";

  const resolveFolderLabel = React.useCallback(
    (folderId?: string) => {
      if (!folderId) return "-";
      const folder = bankTransactionFolders.find((row) => row.id === folderId);
      if (!folder) return folderId;
      const path = getBankTransactionFolderPath(bankTransactionFolders, folderId);
      return path || folder.folderName;
    },
    [bankTransactionFolders],
  );

  const bankTxLabel = (tx: BankTransaction) =>
    `${String(tx.transactionAt || "").slice(0, 10)} \u00B7 ${tx.description || tx.counterpartyName || "-"}`;

  const bankTxAuditSnapshot = React.useCallback(
    (row: BankTransaction) =>
      snapshotBankTransactionForAudit({
        ...row,
        folderLabel: resolveFolderLabel(row.folderId),
      }),
    [resolveFolderLabel],
  );

  const auditBankTxUpdate = (before: BankTransaction, after: BankTransaction) => {
    recordAudit({
      entityType: "bankTransaction",
      entityId: before.id,
      entityLabel: bankTxLabel(before),
      screen: L.pageTitle,
      action: "update",
      before: bankTxAuditSnapshot(before),
      after: bankTxAuditSnapshot(after),
      fields: BANK_TRANSACTION_AUDIT_FIELDS,
      user: currentUser,
    });
  };
  const ledgerRegistrationContext = useMemo(
    () => ({ companyExpenses, fixedExpensePayments }),
    [companyExpenses, fixedExpensePayments],
  );

  const ledgerSyncedTransactions = useMemo(() => {
    if (!isPageActive) return bankTransactions;
    const folders = ensureDefaultBankTransactionFolders(bankTransactionFolders);
    const synced = syncBankTransactionLedgerLinkFields(
      bankTransactions,
      companyExpenses,
      fixedExpensePayments,
    );
    return syncLedgerLinkedBankTransactionFolders(synced, folders, ledgerRegistrationContext).transactions;
  }, [bankTransactions, bankTransactionFolders, companyExpenses, fixedExpensePayments, ledgerRegistrationContext, isPageActive]);

  const accountPickerFlatItemsByFlow = useMemo(
    () => ({
      income: buildAccountCodePickerFlatItems(accountCodes, "income"),
      expense: buildAccountCodePickerFlatItems(accountCodes, "expense"),
    }),
    [accountCodes],
  );

  const accountSubjectPickerLabels = useMemo(
    () => ({
      searchPlaceholder: L.accountSubjectSearchPlaceholder,
      empty: L.accountSubjectEmpty,
      addAccount: L.addAccountCode,
    }),
    [],
  );

  useEffect(() => {
    return () => {
      if (bankAccountSaveDebounceRef.current) {
        window.clearTimeout(bankAccountSaveDebounceRef.current);
      }
    };
  }, []);

  const queueBankAccountSubjectSave = useCallback(
    (patch: {
      bankTransactions: BankTransaction[];
      companyExpenses?: typeof companyExpenses;
      fixedExpensePayments?: typeof fixedExpensePayments;
    }) => {
      bankAccountSavePatchRef.current = patch;
      if (bankAccountSaveDebounceRef.current) {
        window.clearTimeout(bankAccountSaveDebounceRef.current);
      }
      bankAccountSaveDebounceRef.current = window.setTimeout(() => {
        bankAccountSaveDebounceRef.current = null;
        const pending = bankAccountSavePatchRef.current;
        bankAccountSavePatchRef.current = null;
        if (!pending) return;
        void onRequestImmediateSave?.(pending);
      }, 400);
    },
    [onRequestImmediateSave],
  );

  useEffect(() => {
    setAccountSubjectLabels((prev) => {
      if (!Object.keys(prev).length) return prev;
      let changed = false;
      const next: Record<string, string> = {};
      for (const txId of Object.keys(prev)) {
        const label = prev[txId];
        const tx = bankTransactions.find((row) => String(row.id) === txId);
        const code = String(tx?.ledgerAccountCode || "").trim();
        if (!code) {
          changed = true;
          continue;
        }
        const resolved = resolveAccountCodeLabel(accountCodes, code) || code;
        if (resolved !== label) {
          next[txId] = label;
          continue;
        }
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [bankTransactions, accountCodes]);

  React.useEffect(() => {
    if (!isPageActive) return;
    const timer = window.setTimeout(() => {
      setBankTransactions((prev) => {
        const seeded = mergeManualLedgerAccountFieldsFromRef(prev, bankTransactionsRef.current);
        const folders = ensureDefaultBankTransactionFolders(bankTransactionFolders);
        const synced = syncBankTransactionLedgerLinkFields(
          seeded,
          companyExpenses,
          fixedExpensePayments,
        );
        const reconciled = reconcileLedgerFolderWithoutLedgerLink(synced, ledgerRegistrationContext);
        const folderSync = syncLedgerLinkedBankTransactionFolders(
          reconciled.transactions,
          folders,
          ledgerRegistrationContext,
        );
        if (folderSync.updated <= 0 && reconciled.cleared <= 0) {
          const seededChanged = seeded.some(
            (row, index) =>
              row !== prev[index] ||
              String(row.ledgerAccountCode || "") !== String(prev[index]?.ledgerAccountCode || ""),
          );
          return seededChanged ? seeded : prev;
        }
        return folderSync.transactions;
      });
      setBankTransactionFolders((prev) => {
        const folders = ensureDefaultBankTransactionFolders(prev);
        if (folders.length === prev.length) return prev;
        return folders;
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [companyExpenses, fixedExpensePayments, bankTransactionFolders, ledgerRegistrationContext, setBankTransactions, setBankTransactionFolders, isPageActive]);

  const needsHeavyBankClassification = Boolean(
    ledgerModal ||
      ledgerReviewPrompt ||
      linkModalTx ||
      clientLinkModalTx ||
      batchLedgerLoading ||
      smartLedgerLoading ||
      importPreview,
  );

  const memoLearnRules = useMemo(
    () =>
      needsHeavyBankClassification
        ? buildMemoLearnRulesFromTransactions(bankTransactions, expenseCategories, savedBy)
        : [],
    [needsHeavyBankClassification, bankTransactions, expenseCategories, savedBy],
  );

  const effectiveBankLedgerRules = useMemo(
    () => mergeMemoLearnRules(bankLedgerRules, memoLearnRules),
    [bankLedgerRules, memoLearnRules],
  );

  const memoCategorySuggestionByTxId = useMemo(
    () =>
      needsHeavyBankClassification
        ? buildMemoCategorySuggestionMap(bankTransactions, memoLearnRules, expenseCategories)
        : EMPTY_TX_SUGGESTION_MAP,
    [needsHeavyBankClassification, bankTransactions, memoLearnRules, expenseCategories],
  );

  const ledgerSuggestionByTxId = useMemo(
    () =>
      needsHeavyBankClassification
        ? buildLedgerClassificationMap(bankTransactions, {
            rules: effectiveBankLedgerRules,
            fixedExpenses,
            expenseCategories,
            companyExpenses,
            workers,
            clients,
            canRegister: (tx) => canRegisterBankTxToCompanyLedger(tx, ledgerRegistrationContext),
          })
        : EMPTY_TX_SUGGESTION_MAP,
    [
      needsHeavyBankClassification,
      bankTransactions,
      effectiveBankLedgerRules,
      fixedExpenses,
      expenseCategories,
      companyExpenses,
      workers,
      clients,
      ledgerRegistrationContext,
    ],
  );

  const folderSuggestionByTxId = useMemo(
    () =>
      needsHeavyBankClassification
        ? buildFolderClassificationSuggestionMap(bankTransactions, clients, workers)
        : EMPTY_TX_SUGGESTION_MAP,
    [needsHeavyBankClassification, bankTransactions, clients, workers],
  );

  const canRegisterLedger = (tx: BankTransaction) =>
    (isBankTxExpenseReversal(tx) || !isNetGroupSuppressed(tx)) &&
    canRegisterBankTxToCompanyLedger(tx, ledgerRegistrationContext);

  const isVariableExpenseLinkedOnly = (tx: BankTransaction) =>
    isBankTransactionLinkedToVariableExpenseOnly(tx, ledgerRegistrationContext);

  const canRegisterFixedLedger = (tx: BankTransaction) =>
    (isBankTxExpenseReversal(tx) || !isNetGroupSuppressed(tx)) &&
    canRegisterBankTxToCompanyLedger(tx, ledgerRegistrationContext, { allowVariableLinked: true });

  const evaluateLedgerRegistrationGate = React.useCallback(
    (tx: BankTransaction) =>
      evaluateBankTxLedgerRegistrationGate(tx, {
        rules: effectiveBankLedgerRules,
        fixedExpenses,
        expenseCategories,
        companyExpenses,
        workers,
        clients,
        memoCategorySuggestion: memoCategorySuggestionByTxId.get(tx.id) || null,
      }),
    [
      effectiveBankLedgerRules,
      fixedExpenses,
      expenseCategories,
      companyExpenses,
      workers,
      clients,
      memoCategorySuggestionByTxId,
    ],
  );

  const canRegisterLedgerWithConfidence = (tx: BankTransaction) =>
    canRegisterLedger(tx) && evaluateLedgerRegistrationGate(tx).allowed;

  const resolveLedgerRegistrationSuggestion = React.useCallback(
    (tx: BankTransaction) => {
      const memoSuggestion = memoCategorySuggestionByTxId.get(tx.id);
      if (memoSuggestion) {
        return {
          kind: "manual" as LedgerRegisterKind,
          fixedExpenseId: "",
          category: memoSuggestion.category,
        };
      }

      const suggestion = ledgerSuggestionByTxId.get(tx.id);
      const targetKey = suggestion?.targetKey || resolveLedgerTargetForBankTransaction(tx, bankLedgerRules, fixedExpenses);
      const parsed = parseLedgerTargetKey(targetKey);
      const learnMatch = findBestBankLearnRuleWithScore(tx, bankLedgerRules, fixedExpenses, ["fixed", "manual"]);
      const ledgerRule = learnMatch?.rule || findMatchingBankLedgerRule(tx, bankLedgerRules, fixedExpenses);
      const kind: LedgerRegisterKind = parsed?.kind === "fixed" ? "fixed" : "manual";
      const fixedItem =
        parsed?.kind === "fixed" && parsed.fixedExpenseId
          ? fixedExpenses.find((row) => row.id === parsed.fixedExpenseId)
          : undefined;
      const defaultFixedId =
        fixedItem?.id ||
        suggestion?.fixedExpenseId ||
        fixedExpenses.find((row) => row.isActive)?.id ||
        "";
      const defaultManualCategory = expenseCategories[0] || EXPENSE_CATEGORY_OPTIONS[0];
      const defaultFixedCategory = fixedItem?.category?.trim() || FIXED_CATEGORY_OPTIONS[0];
      const resolvedCategory =
        kind === "manual"
          ? suggestion?.category ||
            (ledgerRule && "category" in ledgerRule ? ledgerRule.category : "") ||
            (parsed?.kind === "manual" ? parsed.category || "" : "")
          : fixedItem?.category ||
            suggestion?.category ||
            (ledgerRule && "category" in ledgerRule ? ledgerRule.category : "") ||
            "";

      return {
        kind,
        fixedExpenseId: kind === "fixed" ? defaultFixedId : "",
        category:
          kind === "fixed"
            ? resolvedCategory.trim() || defaultFixedCategory
            : resolvedCategory.trim() || defaultManualCategory,
      };
    },
    [
      bankLedgerRules,
      expenseCategories,
      fixedExpenses,
      ledgerSuggestionByTxId,
      memoCategorySuggestionByTxId,
    ],
  );

  const isManualLedgerRegistrationOverride = React.useCallback(
    (
      tx: BankTransaction,
      input: { kind: LedgerRegisterKind; category: string; fixedExpenseId: string },
    ) => {
      if (hasManualLedgerCategoryMemoOverride(tx, expenseCategories)) return true;
      const suggestion = resolveLedgerRegistrationSuggestion(tx);
      if (input.kind !== suggestion.kind) return true;
      if (input.kind === "fixed" && input.fixedExpenseId.trim() !== suggestion.fixedExpenseId.trim()) {
        return true;
      }
      if (input.kind === "manual") {
        const actual = resolveExpenseCategoryFromTxAccount(accountCodes, tx) || input.category.trim();
        return actual !== suggestion.category.trim();
      }
      const expected = resolveFixedExpenseItemCategory(fixedExpenses, input.fixedExpenseId.trim());
      return expected !== input.category.trim();
    },
    [accountCodes, expenseCategories, fixedExpenses, resolveLedgerRegistrationSuggestion],
  );

  const isLedgerEditModal = (modal: NonNullable<typeof ledgerModal>) =>
    modal.mode === "edit" || Boolean(modal.editPaymentId || modal.editExpenseId);

  const isLedgerKindSwitch = (modal: NonNullable<typeof ledgerModal>) =>
    (Boolean(modal.editPaymentId) && modal.kind === "manual") ||
    (Boolean(modal.editExpenseId) && modal.kind === "fixed");

  const resolveLinkedCompanyExpenseForBankTx = (tx: BankTransaction) =>
    getLinkedCompanyExpenseForBankTx(tx, companyExpenses);

  const resolveLinkedFixedPaymentForBankTx = (tx: BankTransaction) =>
    getLinkedFixedPaymentForBankTx(tx, fixedExpensePayments);

  const getLedgerCategoryLabel = (row: BankTransaction) =>
    getBankTxLedgerCategoryLabel(
      row,
      ledgerCategories,
      companyExpenses,
      fixedExpensePayments,
      fixedExpenses,
    );

  const isLedgerCategoryFromFixed = (row: BankTransaction) => {
    const linkedExpense = resolveLinkedCompanyExpenseForBankTx(row);
    if (linkedExpense?.kind === "fixed") return true;
    return Boolean(resolveLinkedFixedPaymentForBankTx(row));
  };

  const resolveLedgerCategorySuggestionLabel = (row: BankTransaction) => {
    if (getLedgerCategoryLabel(row)) return null;
    const memoSuggestion = memoCategorySuggestionByTxId.get(row.id);
    if (memoSuggestion?.category?.trim()) return memoSuggestion.category.trim();
    const suggestion = ledgerSuggestionByTxId.get(row.id);
    if (suggestion?.label) {
      return suggestion.label.replace(/^\[[^\]]+\]\s*/, "").split(" \u00B7 ")[0]?.trim() || null;
    }
    return null;
  };

  const applyAutoLearnRules = React.useCallback(
    (
      transactions: BankTransaction[],
      payments: FixedExpensePayment[],
      expenses: CompanyExpense[],
      rules: BankLearnRule[],
      options: {
        onlyTransactionIds?: Set<string>;
        showMessage?: boolean;
        auditUser?: AuditUser | null;
        applyKinds?: Array<"fixed" | "manual" | "folder">;
      } = {},
    ) => {
      const result = autoApplyBankLearnRules(transactions, payments, expenses, rules, fixedExpenses, {
        createdBy: savedBy || undefined,
        onlyTransactionIds: options.onlyTransactionIds,
        workers,
        bankTransactionFolders,
        applyKinds: options.applyKinds,
      });
      const total = result.fixedCount + result.manualCount + result.folderCount;
      if (total <= 0) {
        return {
          transactions,
          payments,
          expenses,
          fixedCount: 0,
          manualCount: 0,
          folderCount: 0,
        };
      }
      if (result.allPayments) {
        setFixedExpensePayments(result.allPayments);
      } else if (result.newPayments.length) {
        setFixedExpensePayments((prev) => [...result.newPayments, ...prev]);
      }
      if (result.newExpenses.length) {
        setCompanyExpenses((prev) => [...result.newExpenses, ...prev]);
      }
      setBankTransactions(result.transactions);
      if (result.bankTransactionFolders) {
        setBankTransactionFolders(result.bankTransactionFolders);
      }
      if (options.auditUser !== false) {
        recordSummaryAudit({
          entityType: "bankTransaction",
          entityId: "auto-learn",
          entityLabel: "\uC790\uB3D9 \uD559\uC2B5 \uC5F0\uACB0",
          screen: L.pageTitle,
          action: "import",
          fieldLabel: options.auditUser === null ? "\uC790\uB3D9 \uCC98\uB9AC" : "\uC790\uB3D9 \uD559\uC2B5",
          after: `\uACE0\uC815\uBE44 ${result.fixedCount}\u00B7\uC218\uB3D9 ${result.manualCount}\u00B7\uD3F4\uB354 ${result.folderCount}`,
          user: options.auditUser === null ? null : currentUser,
        });
      }
      if (options.showMessage !== false) {
        const message = L.ledgerAutoLearnDone({
          fixed: result.fixedCount,
          manual: result.manualCount,
          folder: result.folderCount,
        });
        if (message) setImportMessage(message);
      }
      return {
        transactions: result.transactions,
        payments: [...result.newPayments, ...payments],
        expenses: [...result.newExpenses, ...expenses],
        fixedCount: result.fixedCount,
        manualCount: result.manualCount,
        folderCount: result.folderCount,
      };
    },
    [fixedExpenses, savedBy, setFixedExpensePayments, setCompanyExpenses, setBankTransactions, setBankTransactionFolders, recordSummaryAudit, currentUser, workers, bankTransactionFolders],
  );

  const backgroundLearningTimerRef = useRef<number | null>(null);
  const learningSnapshotRef = useRef({
    bankTransactions,
    fixedExpensePayments,
    companyExpenses,
    effectiveBankLedgerRules,
    fixedExpenses,
    bankTransactionFolders,
    expenseCategories,
    memoLearnRules,
    clients,
    workers,
    savedBy,
  });
  learningSnapshotRef.current = {
    bankTransactions,
    fixedExpensePayments,
    companyExpenses,
    effectiveBankLedgerRules,
    fixedExpenses,
    bankTransactionFolders,
    expenseCategories,
    memoLearnRules,
    clients,
    workers,
    savedBy,
  };

  const applyBackgroundLearning = React.useCallback(
    (options: { onlyTransactionIds?: Set<string>; showMessage?: boolean } = {}) => {
      const snap = learningSnapshotRef.current;
      if (!snap.bankTransactions.length) return null;
      const result = runBackgroundBankLedgerLearning({
        bankTransactions: snap.bankTransactions,
        fixedExpensePayments: snap.fixedExpensePayments,
        companyExpenses: snap.companyExpenses,
        bankLedgerRules: snap.effectiveBankLedgerRules,
        fixedExpenses: snap.fixedExpenses,
        bankTransactionFolders: snap.bankTransactionFolders,
        expenseCategories: snap.expenseCategories,
        memoLearnRules: snap.memoLearnRules,
        clients: snap.clients,
        workers: snap.workers,
        createdBy: snap.savedBy || undefined,
        onlyTransactionIds: options.onlyTransactionIds,
      });
      if (!result.changed) {
        if (result.bankTransactionFolders) {
          setBankTransactionFolders(result.bankTransactionFolders);
        }
        return result;
      }

      setBankTransactions(result.bankTransactions);
      setFixedExpensePayments(result.fixedExpensePayments);
      setCompanyExpenses(result.companyExpenses);
      if (result.bankTransactionFolders) {
        setBankTransactionFolders(result.bankTransactionFolders);
      }

      const parts: string[] = [];
      if (result.preauthGroups) parts.push(`\uC120\uACB0\uC81C ${result.preauthGroups}\uAC74`);
      if (result.learnFixed) parts.push(`\uACE0\uC815\uBE44 ${result.learnFixed}\uAC74`);
      if (result.learnManual) parts.push(`\uC9C0\uCD9C ${result.learnManual}\uAC74`);
      if (result.learnFolder) parts.push(`\uD3F4\uB354 ${result.learnFolder}\uAC74`);
      if (result.ledgerFolderSync) parts.push(`\uAC00\uACC4\uBD80 \uD3F4\uB354 ${result.ledgerFolderSync}\uAC74`);
      if (result.highConfidenceRegistered) parts.push(`\uACE0\uC2E0\uB3C4 ${result.highConfidenceRegistered}\uAC74`);
      if (result.removedExpenses + result.removedDuplicatePayments > 0) {
        parts.push(`\uC911\uBCF5 \uC815\uB9AC ${result.removedExpenses + result.removedDuplicatePayments}\uAC74`);
      }

      if (parts.length) {
        recordSummaryAudit({
          entityType: "bankTransaction",
          entityId: "background-learn",
          entityLabel: "\uBC18\uB3D9 \uD559\uC2B5",
          screen: L.pageTitle,
          action: "import",
          fieldLabel: "\uBC18\uB3D9 \uD559\uC2B5",
          after: parts.join(" \u00B7 "),
          user: null,
        });
      }

      if (options.showMessage && parts.length) {
        setImportMessage(L.backgroundLearnDone(parts));
      }
      return result;
    },
    [
      setBankTransactions,
      setBankTransactionFolders,
      setFixedExpensePayments,
      setCompanyExpenses,
      recordSummaryAudit,
    ],
  );

  const applyBackgroundLearningRef = useRef(applyBackgroundLearning);
  applyBackgroundLearningRef.current = applyBackgroundLearning;

  const scheduleBackgroundLearning = React.useCallback(
    (options: { onlyTransactionIds?: Set<string>; showMessage?: boolean } = {}) => {
      if (!isPageActive) return;
      if (backgroundLearningTimerRef.current) {
        window.clearTimeout(backgroundLearningTimerRef.current);
      }
      backgroundLearningTimerRef.current = window.setTimeout(() => {
        applyBackgroundLearningRef.current(options);
      }, 350);
    },
    [isPageActive],
  );

  const buildReviewPromptFromTx = React.useCallback(
    (tx: BankTransaction, group: { key: string; label: string; transactions: BankTransaction[] }) => {
      const prefill = buildCompanyExpensePrefillFromBankTransaction(tx);
      const suggestion = ledgerSuggestionByTxId.get(tx.id) || classifyBankTransactionForLedger(tx, {
        rules: bankLedgerRules,
        fixedExpenses,
        expenseCategories,
        companyExpenses,
        workers,
        clients,
      });
      const targetKey =
        suggestion?.targetKey || resolveLedgerTargetForBankTransaction(tx, bankLedgerRules, fixedExpenses);
      const parsed = parseLedgerTargetKey(targetKey);
      const learnMatch = findBestBankLearnRuleWithScore(tx, bankLedgerRules, fixedExpenses, ["fixed", "manual"]);
      const ledgerRule = learnMatch?.rule || findMatchingBankLedgerRule(tx, bankLedgerRules, fixedExpenses);
      const kind: LedgerRegisterKind = parsed?.kind === "fixed" ? "fixed" : "manual";
      const fixedItem =
        parsed?.kind === "fixed" && parsed.fixedExpenseId
          ? fixedExpenses.find((row) => row.id === parsed.fixedExpenseId)
          : undefined;
      const defaultFixedId =
        fixedItem?.id || suggestion?.fixedExpenseId || fixedExpenses.find((row) => row.isActive)?.id || "";
      const defaultManualCategory = expenseCategories[0] || EXPENSE_CATEGORY_OPTIONS[0];
      const defaultFixedCategory = fixedItem?.category?.trim() || FIXED_CATEGORY_OPTIONS[0];
      const resolvedCategory =
        kind === "manual"
          ? suggestion?.category ||
            (ledgerRule && "category" in ledgerRule ? ledgerRule.category : "") ||
            (parsed?.kind === "manual" ? parsed.category || "" : "")
          : fixedItem?.category ||
            suggestion?.category ||
            (ledgerRule && "category" in ledgerRule ? ledgerRule.category : "") ||
            "";
      const linkDefaults =
        kind === "fixed" && defaultFixedId
          ? buildLedgerLinkDefaults(tx, defaultFixedId, fixedExpensePayments, fixedExpenses)
          : { linkMode: "create" as const, linkPaymentId: "" };

      return {
        ...group,
        kind,
        fixedExpenseId: kind === "fixed" ? defaultFixedId : "",
        category:
          kind === "fixed"
            ? resolvedCategory.trim() || defaultFixedCategory
            : resolvedCategory.trim() || defaultManualCategory,
        date: prefill.date,
        description: fixedItem?.name || prefill.description,
        amount: prefill.amount,
        memo: prefill.memo,
        ...linkDefaults,
        suggestionLabel: suggestion?.label,
        suggestionConfidence: suggestion?.confidence,
      };
    },
    [
      bankLedgerRules,
      clients,
      companyExpenses,
      expenseCategories,
      fixedExpensePayments,
      fixedExpenses,
      ledgerSuggestionByTxId,
      workers,
    ],
  );

  const openNextLedgerReviewPrompt = React.useCallback(
    (transactions: BankTransaction[]) => {
      const groups = buildLedgerReviewPromptGroups(transactions, ledgerRegistrationContext, {
        onlyTransactionIds: importLedgerBatchIdsRef.current,
      });
      const next = groups[0];
      if (!next) {
        setLedgerReviewPrompt(null);
        setLedgerReviewPromptError("");
        return;
      }
      const prompt = buildReviewPromptFromTx(next.transactions[0], next);
      ledgerReviewMemoDraftRef.current = prompt.memo;
      setLedgerReviewPrompt(prompt);
      setLedgerReviewPromptError("");
    },
    [buildReviewPromptFromTx, ledgerRegistrationContext],
  );

  const runSmartAutoLedgerFlow = React.useCallback(async () => {
    if (smartLedgerLoading) return;
    setSmartLedgerLoading(true);
    setImportError("");
    try {
      const result = await runSmartAutoLedger({
        bankTransactions,
        bankTransactionFolders,
        fixedExpensePayments,
        companyExpenses,
        bankLedgerRules,
        fixedExpenses,
        expenseCategories,
        clients,
        workers,
        createdBy: savedBy || undefined,
        skipLedgerRegistration: true,
      });

      setBankTransactions(result.bankTransactions);
      setBankTransactionFolders(result.bankTransactionFolders);
      setFixedExpensePayments(result.fixedExpensePayments);
      setCompanyExpenses(result.companyExpenses);
      setBankLedgerRules(result.bankLedgerRules);
      if (result.expenseCategories.length) {
        setExpenseCategories(result.expenseCategories);
      }

      recordSummaryAudit({
        entityType: "bankTransaction",
        entityId: "smart-ledger",
        entityLabel: L.smartLedgerRun,
        screen: L.pageTitle,
        action: "import",
        fieldLabel: L.smartLedgerRun,
        after: formatSmartLedgerRunMessage(result),
        user: currentUser,
      });

      setImportMessage(formatSmartLedgerRunMessage(result));
      importLedgerBatchIdsRef.current = new Set(
        result.bankTransactions
          .filter((tx) => canRegisterBankTxToCompanyLedger(tx, ledgerRegistrationContext))
          .map((row) => row.id),
      );
      scheduleBackgroundLearning({ showMessage: true });
      openNextLedgerReviewPrompt(result.bankTransactions);
    } catch (error) {
      console.error(error);
      setImportMessage("자동 가계부 처리 중 오류가 발생했습니다.");
    } finally {
      setSmartLedgerLoading(false);
    }
  }, [
    smartLedgerLoading,
    bankTransactions,
    bankTransactionFolders,
    fixedExpensePayments,
    companyExpenses,
    bankLedgerRules,
    fixedExpenses,
    expenseCategories,
    clients,
    workers,
    savedBy,
    ledgerRegistrationContext,
    setBankTransactions,
    setBankTransactionFolders,
    setFixedExpensePayments,
    setCompanyExpenses,
    setBankLedgerRules,
    setExpenseCategories,
    recordSummaryAudit,
    currentUser,
    openNextLedgerReviewPrompt,
    scheduleBackgroundLearning,
  ]);

  const skipLedgerReviewPrompt = React.useCallback(() => {
    if (!ledgerReviewPrompt) return;
    const skippedIds = new Set(ledgerReviewPrompt.transactions.map((row) => row.id));
    for (const id of skippedIds) importLedgerBatchIdsRef.current.delete(id);
    openNextLedgerReviewPrompt(bankTransactions);
  }, [bankTransactions, ledgerReviewPrompt, openNextLedgerReviewPrompt]);

  const setReviewPromptKind = (kind: LedgerRegisterKind) => {
    setLedgerReviewPrompt((prev) => {
      if (!prev || prev.kind === kind) return prev;
      const next = { ...prev, kind };
      if (kind === "fixed") {
        if (!next.fixedExpenseId) {
          next.fixedExpenseId = fixedExpenses.find((row) => row.isActive)?.id || "";
        }
        const fixedItem = fixedExpenses.find((row) => row.id === next.fixedExpenseId);
        if (fixedItem) {
          next.category = fixedItem.category?.trim() || next.category;
          if (!prev.description.trim()) {
            next.description = fixedItem.name;
          }
        }
        Object.assign(
          next,
          buildLedgerLinkDefaults(prev.transactions[0], next.fixedExpenseId, fixedExpensePayments, fixedExpenses),
        );
      } else {
        next.category =
          resolveExpenseCategoryFromTxAccount(accountCodes, prev.transactions[0]!) ||
          expenseCategories[0] ||
          EXPENSE_CATEGORY_OPTIONS[0];
        next.fixedExpenseId = "";
        next.linkMode = "create";
        next.linkPaymentId = "";
      }
      return next;
    });
  };

  const saveLedgerReviewPrompt = React.useCallback(() => {
    if (!ledgerReviewPrompt) return;
    const firstTx = ledgerReviewPrompt.transactions[0];
    if (!firstTx) return;

    const gate = evaluateLedgerRegistrationGate(firstTx);
    const manualOverride = isManualLedgerRegistrationOverride(firstTx, {
      kind: ledgerReviewPrompt.kind,
      category: ledgerReviewPrompt.category,
      fixedExpenseId: ledgerReviewPrompt.fixedExpenseId,
    });
    if (!gate.allowed && !manualOverride) {
      setLedgerReviewPromptError(L.ledgerConfidenceBlocked(gate.confidence));
      return;
    }

    if (ledgerReviewPrompt.kind === "fixed") {
      const fixedExpenseId = ledgerReviewPrompt.fixedExpenseId.trim();
      if (!fixedExpenseId) {
        setLedgerReviewPromptError(L.categoryPromptFixedRequired);
        return;
      }
      const category = resolveFixedExpenseItemCategory(fixedExpenses, fixedExpenseId);
      const error = validateFixedExpensePaymentInput({
        date: ledgerReviewPrompt.date,
        fixedExpenseId,
        amount: ledgerReviewPrompt.amount,
      });
      if (error) {
        setLedgerReviewPromptError(error);
        return;
      }

      let nextPayments = fixedExpensePayments;
      let nextTransactions = [...bankTransactions];
      const amount = parseLedgerAmount(ledgerReviewPrompt.amount);
      let registeredCount = 0;

      for (const tx of ledgerReviewPrompt.transactions) {
        const linkable = listLinkableFixedExpensePayments(tx, fixedExpenseId, nextPayments, fixedExpenses);
        let existingPayment: FixedExpensePayment | null = null;
        if (ledgerReviewPrompt.linkMode === "link" && ledgerReviewPrompt.linkPaymentId) {
          existingPayment = linkable.find((row) => row.id === ledgerReviewPrompt.linkPaymentId) || null;
        } else if (ledgerReviewPrompt.linkMode !== "create") {
          existingPayment = findLinkableFixedExpensePayment(tx, fixedExpenseId, nextPayments, fixedExpenses);
        }

        let paymentId = existingPayment?.id || "";
        if (existingPayment) {
          nextPayments = linkFixedExpensePaymentToBankTx(nextPayments, existingPayment.id, tx.id, tx);
        } else {
          paymentId = makeLedgerId();
          const prefill = buildCompanyExpensePrefillFromBankTransaction(tx);
          const fixedRow = fixedExpenses.find((row) => row.id === fixedExpenseId);
          nextPayments = [
            {
              id: paymentId,
              fixedExpenseId,
              date: prefill.date,
              amount: parseLedgerAmount(prefill.amount),
              memo: prefill.memo || fixedRow?.name || prefill.description,
              bankTransactionId: tx.id,
              createdBy: savedBy || undefined,
              createdAt: new Date().toISOString(),
            },
            ...nextPayments,
          ];
        }

        nextTransactions = nextTransactions.map((row) =>
          row.id === tx.id
            ? { ...row, linkedFixedExpensePaymentId: paymentId, linkedCompanyExpenseId: undefined }
            : row,
        );
        auditBankTxUpdate(tx, nextTransactions.find((row) => row.id === tx.id) || tx);
        importLedgerBatchIdsRef.current.delete(tx.id);
        registeredCount += 1;
      }

      let nextRules = upsertBankLearnRule(
        bankLedgerRules,
        buildBankLedgerMatchRuleFromRegistration(firstTx, fixedExpenseId, savedBy || undefined, amount),
      );

      const autoLearn = autoApplyBankLearnRules(
        nextTransactions,
        nextPayments,
        companyExpenses,
        nextRules,
        fixedExpenses,
        {
          createdBy: savedBy || undefined,
          onlyTransactionIds: importLedgerBatchIdsRef.current.size ? importLedgerBatchIdsRef.current : undefined,
          workers,
          bankTransactionFolders,
        },
      );

      if (autoLearn.allPayments) nextPayments = autoLearn.allPayments;
      else if (autoLearn.newPayments.length) nextPayments = [...autoLearn.newPayments, ...nextPayments];
      nextTransactions = autoLearn.transactions;
      registeredCount += autoLearn.fixedCount;

      setFixedExpenseCategories((prev) => mergeFixedExpenseCategory(prev, category, fixedExpenses));
      setFixedExpensePayments(nextPayments);
      setBankTransactions(nextTransactions);
      if (autoLearn.bankTransactionFolders) {
        setBankTransactionFolders(autoLearn.bankTransactionFolders);
      }
      setBankLedgerRules(nextRules);

      if (registeredCount > 0) {
        setImportMessage(L.categoryPromptDone(registeredCount));
      }
      openNextLedgerReviewPrompt(nextTransactions);
      return;
    }

    const accountCode = String(firstTx.ledgerAccountCode || "").trim();
    const category = resolveExpenseCategoryFromTxAccount(accountCodes, firstTx);
    if (!accountCode || !category) {
      setLedgerReviewPromptError(L.accountSubjectRequired);
      return;
    }

    let nextRules = upsertBankLearnRule(
      bankLedgerRules,
      buildBankLearnRuleFromManualRegistration(firstTx, category, savedBy || undefined),
    );
    let nextExpenses = [...companyExpenses];
    let nextTransactions = [...bankTransactions];

    for (const tx of ledgerReviewPrompt.transactions) {
      const txAccountCode = String(tx.ledgerAccountCode || "").trim();
      if (!txAccountCode) continue;
      const confirmedTx = assignBankTransactionAccountCode({
        tx,
        accountCode: txAccountCode,
        ledgerCategories,
        accountCodes,
        confirmedBy: savedBy || undefined,
      });
      if (confirmedTx) {
        nextTransactions = nextTransactions.map((row) => (row.id === tx.id ? confirmedTx : row));
        auditBankTxUpdate(tx, confirmedTx);
        importLedgerBatchIdsRef.current.delete(tx.id);
        continue;
      }

      const txCategory = resolveExpenseCategoryFromTxAccount(accountCodes, tx) || category;
      const expense = createCompanyExpenseFromBankTransaction(tx, txCategory, savedBy || undefined);
      nextExpenses = [expense, ...nextExpenses];
      nextTransactions = nextTransactions.map((row) =>
        row.id === tx.id
          ? { ...row, linkedCompanyExpenseId: expense.id, linkedFixedExpensePaymentId: undefined }
          : row,
      );
      recordAudit({
        entityType: "companyExpense",
        entityId: expense.id,
        entityLabel: `${expense.date} \u00B7 ${expense.description || expense.category}`,
        screen: L.pageTitle,
        action: "create",
        after: snapshotCompanyExpenseForAudit(expense),
        fields: COMPANY_EXPENSE_AUDIT_FIELDS,
        user: currentUser,
      });
      auditBankTxUpdate(tx, nextTransactions.find((row) => row.id === tx.id) || tx);
      importLedgerBatchIdsRef.current.delete(tx.id);
    }

    const autoLearn = autoApplyBankLearnRules(
      nextTransactions,
      fixedExpensePayments,
      nextExpenses,
      nextRules,
      fixedExpenses,
      {
        createdBy: savedBy || undefined,
        onlyTransactionIds: importLedgerBatchIdsRef.current.size ? importLedgerBatchIdsRef.current : undefined,
        workers,
        bankTransactionFolders,
      },
    );

    if (autoLearn.newPayments.length) {
      setFixedExpensePayments((prev) => [...autoLearn.newPayments, ...prev]);
    }
    if (autoLearn.newExpenses.length) {
      for (const expense of autoLearn.newExpenses) {
        recordAudit({
          entityType: "companyExpense",
          entityId: expense.id,
          entityLabel: `${expense.date} \u00B7 ${expense.description || expense.category}`,
          screen: L.pageTitle,
          action: "create",
          after: snapshotCompanyExpenseForAudit(expense),
          fields: COMPANY_EXPENSE_AUDIT_FIELDS,
          user: null,
        });
      }
      nextExpenses = [...autoLearn.newExpenses, ...nextExpenses];
    }

    nextTransactions = autoLearn.transactions;

    setExpenseCategories((prev) => mergeExpenseCategory(prev, category));
    setCompanyExpenses(nextExpenses);
    setBankTransactions(nextTransactions);
    if (autoLearn.bankTransactionFolders) {
      setBankTransactionFolders(autoLearn.bankTransactionFolders);
    }
    setBankLedgerRules(nextRules);

    const learnedCount = ledgerReviewPrompt.transactions.length + autoLearn.manualCount + autoLearn.fixedCount;
    if (learnedCount > 0) {
      setImportMessage(L.categoryPromptDone(learnedCount));
    }

    openNextLedgerReviewPrompt(nextTransactions);
  }, [
    auditBankTxUpdate,
    bankLedgerRules,
    bankTransactionFolders,
    bankTransactions,
    companyExpenses,
    currentUser,
    fixedExpensePayments,
    fixedExpenses,
    ledgerReviewPrompt,
    openNextLedgerReviewPrompt,
    recordAudit,
    savedBy,
    accountCodes,
    evaluateLedgerRegistrationGate,
    isManualLedgerRegistrationOverride,
    setBankLedgerRules,
    setBankTransactions,
    setCompanyExpenses,
    setExpenseCategories,
    setFixedExpenseCategories,
    setFixedExpensePayments,
    workers,
  ]);

  const loadSentArchives = React.useCallback(async () => {
    try {
      const records = await listSentStatementArchives();
      setSentArchives(records);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    if (!isPageActive) return;
    void loadSentArchives();
  }, [loadSentArchives, isPageActive]);

  useEffect(() => {
    if (!isPageActive) return;
    if (!bankLedgerRules.length && !memoLearnRules.length) return;
    scheduleBackgroundLearning();
    return () => {
      if (backgroundLearningTimerRef.current) {
        window.clearTimeout(backgroundLearningTimerRef.current);
      }
    };
    // Background learning when rules or memo patterns change — not on every tx edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankLedgerRules, memoLearnRules]);

  useEffect(() => {
    if (!isPageActive) return;
    if (!bankTransactions.length) return;
    scheduleBackgroundLearning();
    return () => {
      if (backgroundLearningTimerRef.current) {
        window.clearTimeout(backgroundLearningTimerRef.current);
      }
    };
    // One pass when the page opens with existing bank data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleArchiveUpdated = () => {
      void loadSentArchives();
    };
    window.addEventListener("pdf-archive-updated", handleArchiveUpdated);
    return () => window.removeEventListener("pdf-archive-updated", handleArchiveUpdated);
  }, [loadSentArchives]);

  const clientFolders = useMemo(() => listFoldersByType(bankTransactionFolders, "client"), [bankTransactionFolders]);
  const cardFolders = useMemo(() => listFoldersByType(bankTransactionFolders, "card"), [bankTransactionFolders]);
  const workerFolders = useMemo(() => listFoldersByType(bankTransactionFolders, "worker"), [bankTransactionFolders]);
  const clientFolderTree = useMemo(
    () => flattenBankTransactionFolderTree(buildBankTransactionFolderTree(bankTransactionFolders, "client")),
    [bankTransactionFolders],
  );
  const cardFolderTree = useMemo(
    () => flattenBankTransactionFolderTree(buildBankTransactionFolderTree(bankTransactionFolders, "card")),
    [bankTransactionFolders],
  );
  const workerFolderTree = useMemo(
    () => flattenBankTransactionFolderTree(buildBankTransactionFolderTree(bankTransactionFolders, "worker")),
    [bankTransactionFolders],
  );
  const customCategoryRoots = useMemo(
    () => listCustomCategoryRoots(bankTransactionFolders),
    [bankTransactionFolders],
  );
  const customCategoryTrees = useMemo(
    () =>
      Object.fromEntries(
        customCategoryRoots.map((root) => [root.id, flattenCustomCategoryFolderTree(bankTransactionFolders, root.id)]),
      ),
    [bankTransactionFolders, customCategoryRoots],
  );
  const assignableClientFolders = useMemo(
    () => listAssignableFolders(bankTransactionFolders, "client"),
    [bankTransactionFolders],
  );
  const assignableCardFolders = useMemo(
    () => listAssignableFolders(bankTransactionFolders, "card"),
    [bankTransactionFolders],
  );
  const assignableWorkerFolders = useMemo(
    () => listAssignableFolders(bankTransactionFolders, "worker"),
    [bankTransactionFolders],
  );
  const assignableCustomFolders = useMemo(
    () => listAssignableFolders(bankTransactionFolders, "custom"),
    [bankTransactionFolders],
  );

  const formatFolderSelectLabel = React.useCallback(
    (folder: BankTransactionFolder) => {
      const path = getBankTransactionFolderPath(bankTransactionFolders, folder.id);
      const depth = path.split(" / ").length - 1;
      const prefix = depth > 0 ? `${"— ".repeat(depth)}` : "";
      return `${prefix}${folder.folderName}`;
    },
    [bankTransactionFolders],
  );

  const parentFolderOptions = useMemo(
    () => listFolderParentOptions(bankTransactionFolders, newFolderType),
    [bankTransactionFolders, newFolderType],
  );
  const selectedFolderScopeIds = useMemo(() => {
    if (!selectedFolderId) return null;
    return new Set(collectDescendantFolderIds(bankTransactionFolders, selectedFolderId));
  }, [bankTransactionFolders, selectedFolderId]);
  const folderStatsById = useMemo(
    () => buildBankTransactionFolderStatsMap(ledgerSyncedTransactions, bankTransactionFolders, ledgerRegistrationContext),
    [ledgerSyncedTransactions, bankTransactionFolders, ledgerRegistrationContext],
  );
  const unfiledStats = useMemo(
    () => folderStatsById.get(UNFILED_FOLDER_KEY) ?? { count: 0, deposits: 0, withdrawals: 0 },
    [folderStatsById],
  );

  const accountSummaries = useMemo(() => buildBankAccountSummaries(bankTransactions), [bankTransactions]);

  const accountSubjectFilterOptions = useMemo(() => {
    const flow = flowFilter === "deposit" ? "income" : flowFilter === "withdrawal" ? "expense" : undefined;
    return buildAccountCodePickerOptions(
      accountCodes.filter((row) => row.isActive),
      flow,
    ).map((row) => ({
      code: row.code,
      name: row.depth ? `\u3000\u3000${row.label}` : row.label,
    }));
  }, [accountCodes, flowFilter]);

  useEffect(() => {
    if (!accountSubjectFilter) return;
    if (!accountSubjectFilterOptions.some((row) => row.code === accountSubjectFilter)) {
      setAccountSubjectFilter("");
    }
  }, [accountSubjectFilter, accountSubjectFilterOptions]);

  const clientAutocompleteOptions = useMemo(
    () =>
      [...clients]
        .filter((client) => String(client.name || "").trim())
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))
        .map((client) => ({
          label: String(client.name),
          value: String(client.name),
          raw: client,
        })),
    [clients]
  );

  const clientModalAutocompleteOptions = useMemo(
    () => [{ label: "\ube44\uc6b0\uae30", value: "", raw: null }, ...clientAutocompleteOptions],
    [clientAutocompleteOptions],
  );

  const fixedExpenseSelectOptions = useMemo(
    () =>
      fixedExpenses
        .filter((row) => row.isActive)
        .map((row) => ({
          value: row.id,
          label: `${row.name} \u00B7 ${row.category} \u00B7 ${formatFixedExpensePaymentDay(row.paymentDayOfMonth)}`,
          raw: { kind: "fixed" as const, fixedExpense: row },
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "ko")),
    [fixedExpenses],
  );

  const resolveTxAccountCodeDraft = useCallback((tx: BankTransaction) => String(tx.ledgerAccountCode || "").trim(), []);

  const resolveTxFixedExpenseDraft = useCallback(
    (tx: BankTransaction) => {
      if (tx.ledgerFixedExpenseId) return tx.ledgerFixedExpenseId;
      const linkedPayment = resolveLinkedFixedPaymentForBankTx(tx);
      return linkedPayment?.fixedExpenseId || "";
    },
    [fixedExpensePayments],
  );

  const openMemoModal = useCallback((tx: BankTransaction) => {
    setTxCellModalError("");
    setAccountContentModal({
      tx,
      draft: String(tx.memo || "").trim(),
    });
  }, []);

  const openAccountSubjectModal = useCallback((tx: BankTransaction) => {
    if (Date.now() < accountSubjectIgnoreOpenUntilRef.current) return;
    setTxCellModalError("");
    const txId = String(tx.id);
    setAccountSubjectPicker((prev) => {
      if (prev?.txId === txId) {
        accountSubjectPickerTxIdRef.current = null;
        return null;
      }
      accountSubjectPickerTxIdRef.current = txId;
      return {
        txId,
        selectedCode: String(tx.ledgerAccountCode || "").trim(),
        flow: isBankTxExpenseReversal(tx) ? "expense" : tx.deposit > 0 ? "income" : "expense",
      };
    });
  }, []);

  const closeAccountSubjectPicker = useCallback(() => {
    accountSubjectPickerTxIdRef.current = null;
    setAccountSubjectPicker(null);
  }, []);

  const openFixedExpenseModal = useCallback(
    (tx: BankTransaction) => {
      setTxCellModalError("");
      setFixedExpenseModal({ tx, draft: resolveTxFixedExpenseDraft(tx) });
    },
    [resolveTxFixedExpenseDraft],
  );

  const openClientModal = useCallback((tx: BankTransaction) => {
    setTxCellModalError("");
    setClientModal({
      tx,
      draft:
        tx.ledgerClientName === ""
          ? ""
          : String(tx.ledgerClientName || tx.linkedSubject || "").trim(),
    });
  }, []);

  const applyTaxInvoiceLink = useCallback(
    (
      tx: BankTransaction,
      invoiceId: string | undefined,
      invoiceOverride?: TaxInvoice,
      mode: "add" | "remove" | "clear" = invoiceId ? "add" : "clear",
    ) => {
      const invoice =
        invoiceOverride || (invoiceId ? taxInvoices.find((row) => row.id === invoiceId) : undefined);
      const prev = bankTransactionsRef.current;
      const liveTx = prev.find((row) => row.id === tx.id) ?? tx;
      let nextRow: BankTransaction;
      if (mode === "clear" || !invoiceId) {
        nextRow = clearBankTxTaxInvoiceLinks(liveTx, { manual: true, taxInvoices });
      } else if (mode === "remove") {
        nextRow = removeBankTxTaxInvoiceLink(liveTx, invoiceId, { manual: true, taxInvoices });
      } else if (invoice) {
        nextRow = addBankTxTaxInvoiceLink(liveTx, invoice, { manual: true });
      } else {
        return null;
      }
      auditBankTxUpdate(liveTx, nextRow);
      let nextTransactions = prev.map((row) => (row.id === tx.id ? nextRow : row));
      let nextClients = clients;

      if (invoice) {
        nextClients = learnClientTaxInvoiceExactPayments(nextClients, invoice, nextRow);
        if (shouldLearnTaxInvoiceSplitPayment(liveTx, invoice, prev)) {
          nextClients = learnClientTaxInvoiceSplitPayments(nextClients, invoice);
        }
        if (nextClients !== clients) {
          setClients(nextClients);
        }
      }

      const invoicesForSplit =
        invoice && !taxInvoices.some((row) => row.id === invoice.id)
          ? [invoice, ...taxInvoices]
          : taxInvoices;
      const splitResult = batchAutoLinkSplitTaxInvoiceEvidence(
        nextTransactions,
        invoicesForSplit,
        taxInvoiceMatchContext,
        nextClients,
      );
      if (splitResult.linkedCount > 0) {
        for (const before of nextTransactions) {
          const after = splitResult.transactions.find((row) => row.id === before.id);
          if (after && getBankTxLinkedTaxInvoiceIds(after).join("|") !== getBankTxLinkedTaxInvoiceIds(before).join("|")) {
            auditBankTxUpdate(before, after);
          }
        }
        nextTransactions = splitResult.transactions;
        if (splitResult.clients !== nextClients) {
          nextClients = splitResult.clients;
          setClients(nextClients);
        }
      }

      bankTransactionsRef.current = nextTransactions;
      setBankTransactions(nextTransactions);
      return { nextRow, invoice, nextTransactions, nextClients };
    },
    [
      auditBankTxUpdate,
      clients,
      setBankTransactions,
      setClients,
      taxInvoices,
      taxInvoiceMatchContext,
    ],
  );

  const persistTaxInvoiceLink = useCallback(
    async (nextTransactions: BankTransaction[], nextClients: typeof clients) => {
      await onRequestImmediateSave?.({
        bankTransactions: nextTransactions,
        ...(nextClients !== clients ? { clients: nextClients } : {}),
      });
    },
    [clients, onRequestImmediateSave],
  );

  const openTaxInvoiceIssueModal = useCallback((tx: BankTransaction) => {
    if (tx.deposit <= 0) return;
    setTaxInvoiceIssueTx(tx);
  }, []);

  const handleTaxInvoiceIssued = useCallback(
    async (result: BankTaxInvoiceIssueResult) => {
      const tx = taxInvoiceIssueTx;
      if (!tx || !setTaxInvoices) {
        setTaxInvoiceIssueTx(null);
        return;
      }

      const mergedTaxInvoices =
        result.taxInvoices ||
        (taxInvoices.some((row) => row.id === result.invoice.id)
          ? taxInvoices
          : [result.invoice, ...taxInvoices]);
      const { nextTransactions, nextClients } = applyTaxInvoiceLink(tx, result.invoice.id, result.invoice);

      await onRequestImmediateSave?.({
        bankTransactions: nextTransactions,
        taxInvoices: mergedTaxInvoices,
        ...(nextClients !== clients ? { clients: nextClients } : {}),
      });

      setTaxInvoiceIssueTx(null);
      setImportMessage(result.message || L.cellSaveDone);
    },
    [
      applyTaxInvoiceLink,
      clients,
      onRequestImmediateSave,
      setTaxInvoices,
      taxInvoiceIssueTx,
      taxInvoices,
    ],
  );

  const openTaxInvoiceModal = useCallback((tx: BankTransaction) => {
    const txId = tx.id;
    const latestTaxInvoices = taxInvoicesRef.current;
    setTaxInvoiceLinkSession({
      tx,
      taxInvoices: latestTaxInvoices,
      bankTransactions: bankTransactionsRef.current,
      linkedPaymentIndex: EMPTY_TAX_INVOICE_LINKED_INDEX,
      excludedIds: EMPTY_TAX_INVOICE_EXCLUDED_IDS,
      preparing: true,
    });
    window.requestAnimationFrame(() => {
      setTaxInvoiceLinkSession((prev) => {
        if (!prev || prev.tx.id !== txId || !prev.preparing) return prev;
        const latest = bankTransactionsRef.current;
        const liveTx = latest.find((row) => row.id === txId) ?? prev.tx;
        const invoices = taxInvoicesRef.current;
        return {
          tx: liveTx,
          taxInvoices: invoices,
          bankTransactions: latest,
          linkedPaymentIndex: getTaxInvoiceLinkedPaymentIndexCached(latest),
          excludedIds: getTaxInvoiceCancellationExcludedIdsCached(invoices),
          preparing: false,
        };
      });
    });
  }, []);

  const closeTaxInvoicePanel = useCallback(() => {
    setTaxInvoiceLinkSession(null);
  }, []);

  const saveTaxInvoiceLink = useCallback(
    (invoiceId: string | undefined, mode: "add" | "remove" | "clear" = invoiceId ? "add" : "clear") => {
      const session = taxInvoiceLinkSessionRef.current;
      if (!session) return;
      const liveTx =
        bankTransactionsRef.current.find((row) => row.id === session.tx.id) ?? session.tx;
      const result = applyTaxInvoiceLink(liveTx, invoiceId, undefined, mode);
      if (!result?.nextRow || !result.nextTransactions) return;
      invalidateTaxInvoiceLinkPanelCaches();
      setTaxInvoiceLinkSession({
        tx: result.nextRow,
        taxInvoices: session.taxInvoices,
        bankTransactions: result.nextTransactions,
        linkedPaymentIndex: buildTaxInvoiceLinkedPaymentIndex(result.nextTransactions),
        excludedIds: session.excludedIds,
        preparing: false,
      });
      setImportMessage(L.cellSaveDone);
      void persistTaxInvoiceLink(result.nextTransactions, result.nextClients);
    },
    [applyTaxInvoiceLink, persistTaxInvoiceLink],
  );

  React.useEffect(() => {
    setTaxInvoiceLinkPanelHandlers({
      onClose: closeTaxInvoicePanel,
      onLink: (invoiceId) => saveTaxInvoiceLink(invoiceId, "add"),
      onUnlink: (invoiceId) => saveTaxInvoiceLink(invoiceId, "remove"),
      onUnlinkAll: () => saveTaxInvoiceLink(undefined, "clear"),
      onNavigateToTaxInvoice: taxInvoicePanelUiRef.current.onNavigateToTaxInvoice,
    });
  }, [closeTaxInvoicePanel, saveTaxInvoiceLink, onNavigateToTaxInvoice]);

  React.useEffect(() => {
    if (!taxInvoiceLinkSession) {
      destroyTaxInvoiceLinkPanel();
      return;
    }
    const ui = taxInvoicePanelUiRef.current;
    renderTaxInvoiceLinkPanel({
      tx: taxInvoiceLinkSession.tx,
      taxInvoices: taxInvoiceLinkSession.taxInvoices,
      bankTransactions: taxInvoiceLinkSession.bankTransactions,
      linkedPaymentIndex: taxInvoiceLinkSession.linkedPaymentIndex,
      excludedIds: taxInvoiceLinkSession.excludedIds,
      preparing: taxInvoiceLinkSession.preparing,
      companyProfile: ui.companyProfile,
      linkedInvoiceIds: getBankTxLinkedTaxInvoiceIds(taxInvoiceLinkSession.tx),
      clients,
      workers,
    });
  }, [taxInvoiceLinkSession, clients, workers]);

  React.useEffect(() => () => destroyTaxInvoiceLinkPanel(), []);
  const saveAccountContentModal = () => {
    if (!accountContentModal) return;
    const { tx, draft } = accountContentModal;
    const nextMemo = draft.trim() || undefined;
    const nextRow: BankTransaction = {
      ...tx,
      memo: nextMemo,
    };
    auditBankTxUpdate(tx, nextRow);
    const nextTransactions = bankTransactions.map((row) => (row.id === tx.id ? nextRow : row));
    setBankTransactions(nextTransactions);
    setAccountContentModal(null);
    setImportMessage(L.cellSaveDone);
    void onRequestImmediateSave?.({ bankTransactions: nextTransactions });
  };

  const saveClientModal = () => {
    if (!clientModal) return;
    const clientName = clientModal.draft.trim();
    const { tx } = clientModal;
    const confirmedAt = new Date().toISOString();
    const nextRow: BankTransaction = clientName
      ? {
          ...tx,
          ledgerClientName: clientName,
          ledgerConfirmedAt: confirmedAt,
          linkedSubject: tx.deposit > 0 ? clientName : tx.linkedSubject,
        }
      : {
          ...tx,
          ledgerClientName: "",
          ledgerConfirmedAt: confirmedAt,
        };
    auditBankTxUpdate(tx, nextRow);
    const nextTransactions = bankTransactions.map((row) => (row.id === tx.id ? nextRow : row));
    setBankTransactions(nextTransactions);
    setClientModal(null);
    setTxCellModalError("");
    setImportMessage(L.cellSaveDone);
    void onRequestImmediateSave?.({ bankTransactions: nextTransactions });
  };

  const saveAccountSubjectSelection = useCallback(
    (txId: string, accountCode: string): boolean => {
      accountSubjectIgnoreOpenUntilRef.current = Date.now() + 800;

      const code = String(accountCode || "").trim();
      if (!code) {
        setTxCellModalError(L.accountSubjectSaveFailed);
        setImportMessage(L.accountSubjectSaveFailed);
        return false;
      }

      const txKey = String(txId);
      const prev = bankTransactionsRef.current;
      const tx = prev.find((row) => String(row.id) === txKey);
      if (!tx) {
        setTxCellModalError(L.accountSubjectSaveFailed);
        setImportMessage(L.accountSubjectSaveFailed);
        return false;
      }

      const nextRow = assignBankTransactionAccountCode({
        tx,
        accountCode: code,
        ledgerCategories,
        accountCodes,
        confirmedBy: savedBy,
      });
      if (!nextRow) {
        setTxCellModalError(L.accountSubjectSaveFailed);
        setImportMessage(L.accountSubjectSaveFailed);
        return false;
      }

      auditBankTxUpdate(tx, nextRow);
      const mappedTransactions = prev.map((row) => (String(row.id) === txKey ? nextRow : row));
      const detached = detachBankTxFromCompanyLedgerLinks(
        txKey,
        mappedTransactions,
        companyExpenses,
        fixedExpensePayments,
      );
      const nextTransactions = detached.transactions.map((row) =>
        String(row.id) === txKey ? nextRow : row,
      );
      const optimisticLabel = (() => {
        const row = findAccountCodeByCode(accountCodes, code);
        return row ? formatAccountCodeLabel(row, accountCodes) : code;
      })();
      bankTransactionsRef.current = nextTransactions;
      setAccountSubjectLabels((labels) => ({ ...labels, [txKey]: optimisticLabel }));
      setBankTransactions(nextTransactions);
      setCompanyExpenses(detached.expenses);
      setFixedExpensePayments(detached.payments);
      setAccountSubjectPicker(null);
      accountSubjectPickerTxIdRef.current = null;
      setTxCellModalError("");
      setImportMessage(L.cellSaveDone);
      queueBankAccountSubjectSave({
        bankTransactions: nextTransactions,
        companyExpenses: detached.expenses,
        fixedExpensePayments: detached.payments,
      });
      return true;
    },
    [
      accountCodes,
      auditBankTxUpdate,
      companyExpenses,
      fixedExpensePayments,
      ledgerCategories,
      queueBankAccountSubjectSave,
      savedBy,
      setBankTransactions,
      setCompanyExpenses,
      setFixedExpensePayments,
    ],
  );

  const handleAccountSubjectPickerSelect = useCallback(
    (accountCode: string) => {
      const txId = accountSubjectPickerTxIdRef.current;
      if (!txId) return false;
      return saveAccountSubjectSelection(txId, accountCode);
    },
    [saveAccountSubjectSelection],
  );

  const handleNavigateToClassifyFromPicker = useCallback(() => {
    closeAccountSubjectPicker();
    onNavigateToClassify?.();
  }, [closeAccountSubjectPicker, onNavigateToClassify]);

  const saveFixedExpenseModal = () => {
    if (!fixedExpenseModal) return;
    const fixedExpenseId = fixedExpenseModal.draft.trim();
    if (!fixedExpenseId) {
      setTxCellModalError(L.fixedExpenseRequired);
      return;
    }
    const { tx } = fixedExpenseModal;
    const fixedItem = fixedExpenses.find((row) => row.id === fixedExpenseId);
    if (!fixedItem) {
      setTxCellModalError(L.fixedExpenseRequired);
      return;
    }
    const categoryName = fixedItem.category?.trim() || fixedItem.name?.trim() || "";
    const category =
      findLedgerCategoryByName(ledgerCategories, categoryName) ||
      ledgerCategories.find((row) => row.kind === "fixed" && row.isActive);
    if (!category) {
      setTxCellModalError(L.detailLedgerRegisterFailed);
      return;
    }

    let nextPayments = fixedExpensePayments;
    let nextRow = confirmBankTransactionLedger({
      tx,
      category,
      accountCodes,
      confirmedBy: savedBy,
      fixedExpenseId: fixedItem.id,
      memo: tx.ledgerMemo || tx.memo,
    });

    if (Number(tx.withdrawal || 0) > 0) {
      const assignment = assignBankTxToFixedExpensePayment({
        tx: nextRow,
        resolvedFixedExpenseId: fixedItem.id,
        fixedItem,
        payments: nextPayments,
        fixedExpenses,
        resolvedCategory: categoryName,
        memo: nextRow.ledgerMemo || nextRow.memo,
        savedBy,
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

    auditBankTxUpdate(tx, nextRow);
    const nextTransactions = bankTransactions.map((row) => (row.id === tx.id ? nextRow : row));
    setBankTransactions(nextTransactions);
    setFixedExpensePayments(nextPayments);
    setFixedExpenseModal(null);
    setTxCellModalError("");
    setImportMessage(L.cellSaveDone);
    void onRequestImmediateSave?.({
      bankTransactions: nextTransactions,
      fixedExpensePayments: nextPayments,
    });
  };

  const openCreateFixedExpenseItem = useCallback(() => {
    fixedExpenseItemModalRef.current?.openCreateFixedExpense(
      FIXED_CATEGORY_OPTIONS[0] || fixedExpenseCategories[0] || "",
    );
  }, [fixedExpenseCategories]);

  const unsettledFixedSummary = useMemo(() => {
    const monthKey = getMonthKey(todayISO());
    const monthPayments = getFixedExpensePaymentsForMonth(fixedExpensePayments, monthKey);
    let count = 0;
    let amount = 0;
    for (const payment of monthPayments) {
      if (
        isFixedExpensePaymentSettled(
          payment,
          fixedExpensePayments,
          bankTransactions,
          fixedExpenses,
        )
      ) {
        continue;
      }
      count += 1;
      amount += Number(payment.amount) || 0;
    }
    return { count, amount };
  }, [bankTransactions, fixedExpensePayments, fixedExpenses]);

  const reviewLinkablePayments = useMemo(() => {
    if (!ledgerReviewPrompt || ledgerReviewPrompt.kind !== "fixed") return [];
    const fixedExpenseId = ledgerReviewPrompt.fixedExpenseId.trim();
    if (!fixedExpenseId || !ledgerReviewPrompt.transactions[0]) return [];
    return listLinkableFixedExpensePayments(
      ledgerReviewPrompt.transactions[0],
      fixedExpenseId,
      fixedExpensePayments,
      fixedExpenses,
    );
  }, [fixedExpensePayments, fixedExpenses, ledgerReviewPrompt]);

  const ledgerLinkablePayments = useMemo(() => {
    if (!ledgerModal || ledgerModal.kind !== "fixed") return [];
    if (isLedgerEditModal(ledgerModal) && !ledgerModal.editExpenseId) return [];
    const fixedExpenseId = ledgerModal.fixedExpenseId.trim();
    if (!fixedExpenseId) return [];
    return listLinkableFixedExpensePayments(
      ledgerModal.tx,
      fixedExpenseId,
      fixedExpensePayments,
      fixedExpenses,
    );
  }, [fixedExpensePayments, fixedExpenses, ledgerModal]);

  const activePeriod = useMemo(
    () => resolveActivePeriod(periodKey, dateFilter),
    [periodKey, dateFilter.startDate, dateFilter.endDate]
  );

  const deferredSort = useDeferredValue(sort);

  const statusFilterContext = useMemo(
    () => ({
      ledgerCategories,
      companyExpenses,
      fixedExpensePayments,
      fixedExpenses,
      ledgerRegistrationContext,
    }),
    [ledgerCategories, companyExpenses, fixedExpensePayments, fixedExpenses, ledgerRegistrationContext],
  );

  const periodScopedRows = useMemo(
    () =>
      filterBankTransactions(ledgerSyncedTransactions, {
        search: "",
        dateFrom: activePeriod.startDate,
        dateTo: activePeriod.endDate,
        flowType: "all",
        accountNumber: "",
      }),
    [ledgerSyncedTransactions, activePeriod.startDate, activePeriod.endDate],
  );

  const statusCounts = useMemo(
    () => countBankTxStatusTabs(periodScopedRows, statusFilterContext),
    [periodScopedRows, statusFilterContext],
  );

  const filteredRows = useMemo(() => {
    if (!isPageActive) return EMPTY_BANK_TRANSACTION_ROWS;

    let scoped = filterBankTransactions(ledgerSyncedTransactions, {
      search: searchQuery,
      dateFrom: activePeriod.startDate,
      dateTo: activePeriod.endDate,
      flowType: flowFilter,
      accountNumber: accountFilter,
    });

    if (selectedFolderScopeIds) {
      scoped = scoped.filter((row) => row.folderId && selectedFolderScopeIds.has(row.folderId));
    } else if (folderScope === "unfiled") {
      scoped = scoped.filter((row) => isBankTransactionUnfiled(row, ledgerRegistrationContext));
    } else if (folderScope === "client") {
      const ids = new Set(clientFolders.map((folder) => folder.id));
      scoped = scoped.filter((row) => row.folderId && ids.has(row.folderId));
    } else if (folderScope === "card") {
      const ids = new Set(cardFolders.map((folder) => folder.id));
      scoped = scoped.filter((row) => row.folderId && ids.has(row.folderId));
    } else if (folderScope === "worker") {
      const ids = new Set(workerFolders.map((folder) => folder.id));
      scoped = scoped.filter((row) => row.folderId && ids.has(row.folderId));
    } else {
      const customRootId = parseCustomFolderScope(folderScope);
      if (customRootId) {
        const ids = new Set(collectCustomCategoryFolderIds(bankTransactionFolders, customRootId));
        scoped = scoped.filter((row) => row.folderId && ids.has(row.folderId));
      }
    }

    if (ledgerScopeFilter !== "all") {
      scoped = scoped.filter((row) =>
        matchesBankTxLedgerScope(row, ledgerScopeFilter, companyExpenses, fixedExpensePayments),
      );
    }

    if (statusTab !== "all") {
      scoped = scoped.filter((row) => matchesBankTxStatusTab(row, statusTab, statusFilterContext));
    }

    if (clientNameFilter) {
      scoped = scoped.filter((row) => {
        const name = resolveBankTxClientName(row) || String(row.linkedSubject || "").trim();
        return name === clientNameFilter;
      });
    }

    if (accountSubjectFilter) {
      scoped = scoped.filter((row) => String(row.ledgerAccountCode || "").trim() === accountSubjectFilter);
    }

    if (evidenceFilter !== "all") {
      scoped = scoped.filter((row) => matchesBankTxEvidenceFilter(row, evidenceFilter));
    }

    return sortBankTransactions(scoped, { key: deferredSort.key, direction: deferredSort.direction });
  }, [
    isPageActive,
    ledgerSyncedTransactions,
    searchQuery,
    periodKey,
    activePeriod.startDate,
    activePeriod.endDate,
    flowFilter,
    ledgerScopeFilter,
    statusTab,
    statusFilterContext,
    clientNameFilter,
    accountSubjectFilter,
    evidenceFilter,
    companyExpenses,
    fixedExpensePayments,
    fixedExpenses,
    ledgerCategories,
    accountFilter,
    selectedFolderScopeIds,
    folderScope,
    clientFolders,
    cardFolders,
    workerFolders,
    bankTransactionFolders,
    ledgerRegistrationContext,
    deferredSort,
  ]);

  const counterpartyDrawerRows = useMemo(() => {
    if (!counterpartyDrawer) return [];
    const scoped = ledgerSyncedTransactions.filter((row) =>
      matchesBankTxCounterpartyFilter(row, counterpartyDrawer.key),
    );
    return sortBankTransactions(scoped, { key: sort.key, direction: sort.direction });
  }, [ledgerSyncedTransactions, counterpartyDrawer, sort]);

  const runBatchEvidenceAutoLink = useCallback(
    () => {
      if (!taxInvoices.length) return 0;

      const result = runTaxInvoiceEvidenceAutoLink({
        bankTransactions,
        taxInvoices,
        clients,
        workers,
      });
      if (!result.linkedCount) return 0;

      for (const before of bankTransactions) {
        const after = result.transactions.find((row) => row.id === before.id);
        if (after && after.linkedTaxInvoiceId !== before.linkedTaxInvoiceId) {
          auditBankTxUpdate(before, after);
        }
      }

      setBankTransactions(result.transactions);
      if (result.clientsChanged) {
        setClients(result.clients);
      }
      void onRequestImmediateSave?.({
        bankTransactions: result.transactions,
        ...(result.clientsChanged ? { clients: result.clients } : {}),
      });
      return result.linkedCount;
    },
    [
      auditBankTxUpdate,
      bankTransactions,
      clients,
      onRequestImmediateSave,
      setBankTransactions,
      setClients,
      taxInvoices,
      workers,
    ],
  );

  const handleBatchEvidenceAutoLink = useCallback(() => {
    const linkedCount = runBatchEvidenceAutoLink();
    setImportMessage(
      linkedCount > 0 ? L.evidenceBatchAutoLinked(linkedCount) : L.evidenceBatchAutoLinkedNone,
    );
  }, [runBatchEvidenceAutoLink]);

  const stats = useMemo(() => buildBankTransactionStats(filteredRows), [filteredRows]);
  const topCounterparties = useMemo(() => buildTopCounterpartySummaries(filteredRows, 5), [filteredRows]);

  const runBatchLedgerRegister = React.useCallback(() => {
    const pendingBatchLedger = countBatchRegisterableLedger(bankTransactions, {
      fixedExpensePayments,
      companyExpenses,
      bankLedgerRules: effectiveBankLedgerRules,
      fixedExpenses,
      expenseCategories,
      workers,
      clients,
      onlyTransactionIds: new Set(filteredRows.map((row) => row.id)),
      memoCategorySuggestions: memoCategorySuggestionByTxId,
    });
    if (batchLedgerLoading || pendingBatchLedger <= 0) return;
    setBatchLedgerLoading(true);
    setImportError("");
    try {
      const scopedIds = new Set(filteredRows.map((row) => row.id));
      const result = batchRegisterHighConfidenceBankTxToLedger({
        bankTransactions,
        fixedExpensePayments,
        companyExpenses,
        bankLedgerRules: effectiveBankLedgerRules,
        fixedExpenses,
        expenseCategories,
        clients,
        workers,
        createdBy: savedBy || undefined,
        onlyTransactionIds: scopedIds,
        memoCategorySuggestions: memoCategorySuggestionByTxId,
      });

      setBankTransactions(result.bankTransactions);
      setFixedExpensePayments(result.fixedExpensePayments);
      setCompanyExpenses(result.companyExpenses);
      setBankLedgerRules(result.bankLedgerRules);
      if (result.expenseCategories.length) {
        setExpenseCategories(result.expenseCategories);
      }

      recordSummaryAudit({
        entityType: "bankTransaction",
        entityId: "batch-ledger",
        entityLabel: L.ledgerBatchSend,
        screen: L.pageTitle,
        action: "import",
        fieldLabel: L.ledgerBatchSend,
        after: formatBatchLedgerRegisterMessage(result),
        user: currentUser,
      });
      setImportMessage(formatBatchLedgerRegisterMessage(result));
    } catch (error) {
      console.error(error);
      setImportMessage("가계부 일괄 등록 중 오류가 발생했습니다.");
    } finally {
      setBatchLedgerLoading(false);
    }
  }, [
    batchLedgerLoading,
    filteredRows,
    bankTransactions,
    fixedExpensePayments,
    companyExpenses,
    effectiveBankLedgerRules,
    fixedExpenses,
    expenseCategories,
    clients,
    workers,
    savedBy,
    memoCategorySuggestionByTxId,
    recordSummaryAudit,
    currentUser,
  ]);

  const deferredBankTransactions = useDeferredValue(bankTransactions);

  const depositSuggestions = useMemo(() => {
    if (pageView !== "reconcile") return [];
    const sentByTxId = new Map(
      buildAllSentStatementDepositSuggestions(deferredBankTransactions, sentArchives, clients, paymentVouchers).map(
        (row) => [row.tx.id, row.candidates],
      ),
    );
    const receivableSuggestions = buildAllBankDepositSuggestions(deferredBankTransactions, receivableRows, clients);

    const merged: DepositSuggestion[] = [];

    for (const [txId, candidates] of sentByTxId.entries()) {
      const tx = deferredBankTransactions.find((row) => row.id === txId);
      if (tx && candidates.length) {
        merged.push({ tx, kind: "sentStatement", candidates });
      }
    }

    for (const item of receivableSuggestions) {
      if (sentByTxId.has(item.tx.id)) continue;
      merged.push({ tx: item.tx, kind: "receivable", candidates: item.candidates });
    }

    return merged.sort((a, b) => {
      const scoreA = a.candidates[0]?.score || 0;
      const scoreB = b.candidates[0]?.score || 0;
      return scoreB - scoreA;
    });
  }, [pageView, deferredBankTransactions, receivableRows, sentArchives, clients, paymentVouchers]);

  const unmatchedDepositCount = useMemo(
    () => bankTransactions.filter((row) => row.deposit > 0 && !row.linkedPaymentVoucherId).length,
    [bankTransactions]
  );

  const flowTotal = stats.deposits + stats.withdrawals;
  const depositRatio = flowTotal > 0 ? (stats.deposits / flowTotal) * 100 : 50;
  const withdrawalRatio = flowTotal > 0 ? (stats.withdrawals / flowTotal) * 100 : 50;

  const hasAnyData = bankTransactions.length > 0;

  const showEmptyPeriodHint = useMemo(() => {
    if (filteredRows.length > 0) return false;
    if (periodKey === "all" && !activePeriod.startDate && !activePeriod.endDate) return false;
    return bankTransactions.length > 0;
  }, [
    activePeriod.endDate,
    activePeriod.startDate,
    bankTransactions.length,
    filteredRows.length,
    periodKey,
  ]);

  const appliedFilters = useMemo(
    (): BankTransactionAppliedFilters => ({
      periodKey,
      startDate: dateFilter.startDate,
      endDate: dateFilter.endDate,
      statusTab,
      flowFilter,
      accountFilter,
      accountSubjectFilter,
      clientFilter: clientNameFilter,
      groupFilter,
      evidenceFilter,
      searchQuery,
    }),
    [
      periodKey,
      dateFilter.startDate,
      dateFilter.endDate,
      statusTab,
      flowFilter,
      accountFilter,
      accountSubjectFilter,
      clientNameFilter,
      groupFilter,
      evidenceFilter,
      searchQuery,
    ],
  );

  const handleApplySearch = useCallback((value: string) => {
    setSearchQuery(String(value || "").trim());
  }, []);

  const handleApplyFilters = useCallback((filters: BankTransactionAppliedFilters) => {
    setPeriodKey(filters.periodKey);
    setDateFilter({ startDate: filters.startDate, endDate: filters.endDate });
    setStatusTab(filters.statusTab);
    setFlowFilter(filters.flowFilter);
    setAccountFilter(filters.accountFilter);
    setAccountSubjectFilter(filters.accountSubjectFilter);
    setClientNameFilter(filters.clientFilter);
    setGroupFilter(filters.groupFilter);
    setSelectedFolderId("");
    setFolderScope(filters.groupFilter === "all" ? "all" : filters.groupFilter);
    setEvidenceFilter(filters.evidenceFilter);
    setSearchQuery(filters.searchQuery);
  }, []);

  const handleResetFilters = useCallback(() => {
    setPeriodKey("thisMonth");
    setDateFilter({ startDate: "", endDate: "" });
    setFlowFilter("all");
    setLedgerScopeFilter("all");
    setStatusTab("all");
    setAccountFilter("");
    setAccountSubjectFilter("");
    setClientNameFilter("");
    setGroupFilter("all");
    setFolderScope("all");
    setSelectedFolderId("");
    setEvidenceFilter("all");
    setSearchQuery("");
    setFilterResetKey((key) => key + 1);
    setSort(DEFAULT_BANK_TRANSACTION_SORT);
  }, []);

  const preauthNetActionCount = useMemo(() => {
    if (!isPageActive || pageView !== "list") return 0;
    return detectPreauthNetGroups(bankTransactions, bankLedgerRules).length;
  }, [isPageActive, pageView, bankTransactions, bankLedgerRules]);

  const recurringFixedActionCount = useMemo(() => {
    if (!isPageActive || pageView !== "list") return 0;
    return detectRecurringFixedExpensePatterns(bankTransactions, fixedExpenses).length;
  }, [isPageActive, pageView, bankTransactions, fixedExpenses]);

  const recurringFixedPatterns = useMemo(
    () =>
      recurringFixedModalOpen
        ? detectRecurringFixedExpensePatterns(bankTransactions, fixedExpenses)
        : [],
    [recurringFixedModalOpen, bankTransactions, fixedExpenses],
  );

  const preauthNetGroups = useMemo(
    () => (preauthNetModalOpen ? detectPreauthNetGroups(bankTransactions, bankLedgerRules) : []),
    [preauthNetModalOpen, bankTransactions, bankLedgerRules],
  );

  const openPreauthNetModal = useCallback(() => {
    const groups = detectPreauthNetGroups(bankTransactions, bankLedgerRules);
    if (!groups.length) {
      setImportMessage(L.preauthNetEmpty);
      return;
    }
    setSelectedPreauthGroupKeys(groups.map((row) => preauthNetGroupKey(row)));
    setPreauthNetModalOpen(true);
  }, [bankTransactions, bankLedgerRules]);

  const togglePreauthNetGroup = (key: string) => {
    setSelectedPreauthGroupKeys((prev) =>
      prev.includes(key) ? prev.filter((row) => row !== key) : [...prev, key],
    );
  };

  const applyPreauthNet = () => {
    const groups = preauthNetGroups.filter((row) => selectedPreauthGroupKeys.includes(preauthNetGroupKey(row)));
    if (!groups.length) {
      setImportMessage(L.preauthNetEmpty);
      return;
    }

    const nextTransactions = applyPreauthNetGroups(bankTransactions, groups);
    let nextRules = bankLedgerRules;
    if (learnPreauthMerchants) {
      for (const group of groups) {
        if (!group.settlementTx) continue;
        nextRules = upsertBankLearnRule(
          nextRules,
          buildPreauthNetLearnRule(group.settlementTx, savedBy || undefined),
        );
      }
      setBankLedgerRules(nextRules);
    }

    setBankTransactions(nextTransactions);
    recordSummaryAudit({
      entityType: "bankTransaction",
      entityId: "preauth-net",
      entityLabel: L.preauthNetTitle,
      screen: L.pageTitle,
      action: "update",
      fieldLabel: L.preauthNetApply,
      after: L.preauthNetDone(groups.length),
      user: currentUser,
    });

    setPreauthNetModalOpen(false);
    setImportMessage(L.preauthNetDone(groups.length));
  };

  const openRecurringFixedModal = useCallback(() => {
    const patterns = detectRecurringFixedExpensePatterns(bankTransactions, fixedExpenses);
    if (!patterns.length) {
      setImportMessage(L.recurringFixedEmpty);
      return;
    }
    setSelectedRecurringPatternKeys(patterns.map((row) => row.key));
    setRecurringFixedModalOpen(true);
  }, [bankTransactions, fixedExpenses]);

  const toggleRecurringPattern = (key: string) => {
    setSelectedRecurringPatternKeys((prev) =>
      prev.includes(key) ? prev.filter((row) => row !== key) : [...prev, key],
    );
  };

  const applyRecurringFixed = () => {
    const patterns = recurringFixedPatterns.filter((row) => selectedRecurringPatternKeys.includes(row.key));
    if (!patterns.length) {
      setImportMessage(L.recurringFixedEmpty);
      return;
    }

    const beforeFixedIds = new Set(fixedExpenses.map((row) => row.id));
    const result = applyRecurringFixedExpensePatterns({
      patterns,
      fixedExpenses,
      fixedExpensePayments,
      bankTransactions,
      bankLedgerRules,
      companyExpenses,
      createdBy: savedBy,
    });

    setFixedExpenses(result.fixedExpenses);
    setFixedExpensePayments(result.fixedExpensePayments);
    setBankTransactions(result.bankTransactions);
    setBankLedgerRules(result.bankLedgerRules);
    setFixedExpenseCategories((prev) => {
      let next = prev;
      for (const expense of result.fixedExpenses) {
        if (beforeFixedIds.has(expense.id)) continue;
        next = mergeFixedExpenseCategory(next, expense.category, result.fixedExpenses);
      }
      return next;
    });

    for (const expense of result.fixedExpenses) {
      if (beforeFixedIds.has(expense.id)) continue;
      recordAudit({
        entityType: "fixedExpense",
        entityId: expense.id,
        entityLabel: expense.name,
        screen: L.pageTitle,
        action: "create",
        after: snapshotFixedExpenseForAudit(expense),
        fields: FIXED_EXPENSE_AUDIT_FIELDS,
        user: currentUser,
      });
    }

    recordSummaryAudit({
      entityType: "fixedExpense",
      entityId: "recurring-fixed-expense",
      entityLabel: L.recurringFixedTitle,
      screen: L.pageTitle,
      action: "import",
      fieldLabel: L.recurringFixedApply,
      after: L.recurringFixedDone(result.createdFixedCount, result.linkedPaymentCount),
      user: currentUser,
    });

    setRecurringFixedModalOpen(false);
    setImportMessage(L.recurringFixedDone(result.createdFixedCount, result.linkedPaymentCount));
  };

  const handleIbkFile = async (file: File) => {
    setImportLoading(true);
    setImportError("");
    setImportMessage("");
    try {
      const preview = await parseIbkBankFile(file);
      setImportPreview(preview);
    } catch (error) {
      setImportPreview(null);
      setImportError(error instanceof Error ? error.message : L.ibkImportFailed);
    } finally {
      setImportLoading(false);
    }
  };

  const confirmImport = () => {
    if (!importPreview) return;
    const result = mergeIbkBankImport(bankTransactions, importPreview);
    const classified = autoClassifyBankTransactions(result.next, clients, workers, bankTransactionFolders);
    const addedIds = new Set(
      classified.next
        .filter((row) => !bankTransactions.some((existing) => existing.id === row.id))
        .map((row) => row.id),
    );
    importLedgerBatchIdsRef.current = addedIds;
    let nextTransactions = classified.next;
    const preauthGroups = detectPreauthNetGroups(nextTransactions, bankLedgerRules);
    const autoPreauthGroups = filterPreauthNetGroupsNeedingApply(preauthGroups, nextTransactions).filter((group) =>
      [group.preauthWithdrawalTx.id, group.refundTx.id, group.settlementTx?.id].some(
        (id) => id && addedIds.has(id),
      ),
    );
    if (autoPreauthGroups.length) {
      nextTransactions = applyPreauthNetGroups(nextTransactions, autoPreauthGroups);
    }
    setBankTransactions(nextTransactions);
    setBankTransactionFolders(classified.folders);
    setImportPreview(null);
    void onRequestImmediateSave?.({
      bankTransactions: nextTransactions,
      bankTransactionFolders: classified.folders,
    });
    recordSummaryAudit({
      entityType: "bankTransaction",
      entityId: importPreview.importBatchId || "ibk-import",
      entityLabel: "IBK \uD1B5\uC7A5 \uAC00\uC838\uC624\uAE30",
      screen: L.pageTitle,
      action: "import",
      fieldLabel: "\uAC00\uC838\uC624\uAE30",
      after: `${result.added}\uAC74 \uCD94\uAC00${result.skipped ? ` \u00B7 ${result.skipped}\uAC74 \uC81C\uC678` : ""}${classified.updated ? ` \u00B7 ${classified.updated}\uAC74 \uBD84\uB958` : ""}`,
      user: currentUser,
    });
    const latestLabel = importPreview.latestTransactionAt
      ? ` \u00B7 ${L.dataAsOf} ${formatBankTransactionDateTime(importPreview.latestTransactionAt)}`
      : "";
    const sentSuggestions = buildAllSentStatementDepositSuggestions(classified.next, sentArchives, clients);
    const sentTxIds = new Set(sentSuggestions.map((row) => row.tx.id));
    const receivableSuggestionCount = buildAllBankDepositSuggestions(classified.next, receivableRows, clients).filter(
      (row) => !sentTxIds.has(row.tx.id)
    ).length;
    const matchSuggestionCount = sentSuggestions.length + receivableSuggestionCount;
    const matchHint =
      matchSuggestionCount > 0 ? ` \u00B7 ${L.reconcileBanner(matchSuggestionCount)} (${L.viewReconcile})` : "";

    const preauthHint = autoPreauthGroups.length
      ? ` \u00B7 ${L.preauthNetDone(autoPreauthGroups.length)}`
      : "";
    setImportMessage(
      `${L.ibkImportDone} (${result.added}${L.ibkImportAdded}${result.skipped ? `, ${result.skipped}${L.ibkImportSkipped}` : ""}${classified.updated ? `, ${classified.updated}\uAC74 \uBD84\uB958` : ""})${latestLabel}${matchHint}${preauthHint}`
    );

    if (addedIds.size > 0) {
      void (async () => {
        try {
          const smart = await runSmartAutoLedger({
            bankTransactions: nextTransactions,
            bankTransactionFolders: classified.folders,
            fixedExpensePayments,
            companyExpenses,
            bankLedgerRules,
            fixedExpenses,
            expenseCategories,
            clients,
            workers,
            createdBy: savedBy || undefined,
            onlyTransactionIds: addedIds,
            skipLedgerRegistration: true,
          });
          setBankTransactionFolders(smart.bankTransactionFolders);
          setFixedExpensePayments(smart.fixedExpensePayments);
          setCompanyExpenses(smart.companyExpenses);
          setBankLedgerRules(smart.bankLedgerRules);
          if (smart.expenseCategories.length) setExpenseCategories(smart.expenseCategories);
          const freshSentArchives = await listSentStatementArchives();
          setSentArchives(freshSentArchives);
          const savedByForAutoLink = currentUser?.name || currentUser?.loginId || "";
          const autoLinks = buildHighConfidenceSentStatementAutoLinks({
            bankTransactions: smart.bankTransactions,
            archives: freshSentArchives,
            clients,
            sales,
            paymentVouchers,
            onlyTransactionIds: addedIds,
          });
          let bankTransactionsForSave = smart.bankTransactions;
          let paymentVouchersForSave = paymentVouchers;
          if (autoLinks.length) {
            const autoVouchers = autoLinks.flatMap((row) => row.vouchers);
            const autoLogs = createPaymentInputLogsFromVouchers(autoVouchers, savedByForAutoLink);
            const linkByTxId = new Map(autoLinks.map((item) => [item.txId, item]));
            bankTransactionsForSave = smart.bankTransactions.map((row) => {
              const linked = linkByTxId.get(row.id);
              if (!linked) return row;
              return {
                ...row,
                linkedPaymentVoucherId: linked.primaryVoucherId,
                linkedPdfArchiveId: linked.pdfArchiveId,
                linkedSubject: resolveAutoLinkLinkedSubject(row, linked.client),
                linkedSalesId: linked.primarySalesId,
                matchConfirmedAt: new Date().toISOString(),
                matchConfirmedBy: savedByForAutoLink,
                matchAutoLinked: true,
                folderId:
                  row.folderId ||
                  (isCardCompanyDeposit(row) ? DEFAULT_CARD_SALES_FOLDER_ID : DEFAULT_CLIENT_FOLDER_ID),
              };
            });
            paymentVouchersForSave = [...autoVouchers, ...(paymentVouchers as typeof autoVouchers)];
            setPaymentInputLogs((prevLogs) => [...autoLogs, ...(prevLogs as typeof autoLogs)]);
            setPaymentVouchers(paymentVouchersForSave);
            void Promise.all(
              autoLinks.map((linked) =>
                updatePdfArchiveMeta(linked.pdfArchiveId, {
                  paymentStatus: linked.paymentStatus,
                  linkedBankTransactionId: linked.txId,
                  linkedPaymentVoucherId: linked.primaryVoucherId,
                }),
              ),
            )
              .then(() => loadSentArchives())
              .catch((error) => console.error(error));
            setImportMessage((prev) =>
              prev.includes("\uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uC790\uB3D9 \uC785\uAE08")
                ? prev
                : `${prev} \u00B7 \uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uC790\uB3D9 \uC785\uAE08 ${autoLinks.length}\uAC74`,
            );
          }
          setBankTransactions(bankTransactionsForSave);
          const hint = formatSmartLedgerRunMessage(smart);
          if (hint && !hint.includes("\uC5C6\uC2B5\uB2C8\uB2E4")) {
            setImportMessage((prev) => `${prev} · ${hint}`);
          }
          void onRequestImmediateSave?.({
            bankTransactions: bankTransactionsForSave,
            paymentVouchers: paymentVouchersForSave,
            bankTransactionFolders: smart.bankTransactionFolders,
            fixedExpensePayments: smart.fixedExpensePayments,
            companyExpenses: smart.companyExpenses,
            bankLedgerRules: smart.bankLedgerRules,
            ...(smart.expenseCategories.length ? { expenseCategories: smart.expenseCategories } : {}),
          });
          scheduleBackgroundLearning({ onlyTransactionIds: addedIds, showMessage: true });
          openNextLedgerReviewPrompt(smart.bankTransactions);
        } catch (error) {
          console.error(error);
          openNextLedgerReviewPrompt(nextTransactions);
        }
      })();
    }
  };

  const assignTransactionFolder = (transactionId: string, folderId: string) => {
    if (backgroundLearningTimerRef.current) {
      window.clearTimeout(backgroundLearningTimerRef.current);
      backgroundLearningTimerRef.current = null;
    }
    const tx = bankTransactions.find((row) => row.id === transactionId);
    if (!tx) return;
    if (
      folderId === DEFAULT_LEDGER_CATEGORY_FOLDER_ID &&
      !isBankTransactionLinkedToCompanyLedger(tx, ledgerRegistrationContext)
    ) {
      openAccountSubjectModal(tx);
      setImportMessage(L.ledgerFolderRequiresRegistration);
      return;
    }
    if (folderId && !canAssignBankTransactionToFolder(tx, folderId, bankTransactionFolders, workers)) {
      setImportMessage(L.workerFolderAssignBlocked);
      return;
    }
    const nextRow = !folderId
      ? { ...tx, folderId: undefined, linkedSubject: undefined, classifiedAt: undefined }
      : {
          ...tx,
          folderId,
          classifiedAt: new Date().toISOString(),
          linkedSubject: tx.linkedSubject || tx.counterpartyName || tx.description || undefined,
        };

    auditBankTxUpdate(tx, nextRow);

    const nextTransactions = bankTransactions.map((row) => (row.id !== transactionId ? row : nextRow));

    setBankTransactions(nextTransactions);

    if (!folderId) return;

    const nextRules = upsertBankLearnRule(
      bankLedgerRules,
      buildBankLearnRuleFromFolderAssignment(tx, folderId, savedBy || undefined),
    );
    setBankLedgerRules(nextRules);
    void onRequestImmediateSave?.({
      bankTransactions: nextTransactions,
      bankLedgerRules: nextRules,
    });
    applyAutoLearnRules(nextTransactions, fixedExpensePayments, companyExpenses, nextRules, {
      showMessage: true,
      applyKinds: ["folder"],
    });
  };


  const runAutoClassify = useCallback(() => {
    const result = autoClassifyBankTransactions(bankTransactions, clients, workers, bankTransactionFolders);
    setBankTransactions(result.next);
    setBankTransactionFolders(result.folders);
    if (result.updated > 0) {
      recordSummaryAudit({
        entityType: "bankTransaction",
        entityId: "auto-classify",
        entityLabel: "\uC790\uB3D9 \uBD84\uB958",
        screen: L.pageTitle,
        action: "import",
        fieldLabel: "\uBD84\uB958",
        after: `${result.updated}\uAC74 \uC790\uB3D9 \uBD84\uB958`,
        user: currentUser,
      });
    }
    setImportMessage(`${result.updated}${L.autoClassifyDone}`);
  }, [
    bankTransactions,
    bankTransactionFolders,
    clients,
    workers,
    currentUser,
    recordSummaryAudit,
  ]);

  const openCreateFolderModal = (folderType: BankTransactionFolderType, parentId = "") => {
    setNewFolderType(folderType);
    setNewFolderParentId(sanitizeBankTransactionFolderParentId(parentId) || "");
    setNewFolderName("");
    setFolderError("");
    setCreateFolderOpen(true);
  };

  const handleCreateFolder = () => {
    const result = createBankTransactionFolder(bankTransactionFolders, {
      folderName: newFolderName,
      folderType: newFolderType,
      parentId: newFolderParentId || undefined,
    });
    if (result.error) {
      setFolderError(result.error);
      return;
    }
    if (result.folder) {
      recordAudit({
        entityType: "bankFolder",
        entityId: result.folder.id,
        entityLabel: result.folder.folderName,
        screen: L.pageTitle,
        action: "create",
        after: snapshotBankFolderForAudit(result.folder),
        fields: BANK_FOLDER_AUDIT_FIELDS,
        user: currentUser,
      });
    }
    setBankTransactionFolders(normalizeBankTransactionFolders(result.next));
    if (result.folder) setSelectedFolderId(result.folder.id);
    setCreateFolderOpen(false);
    setNewFolderName("");
    setNewFolderParentId("");
    setFolderError("");
  };

  const handleDeleteFolder = (folder: BankTransactionFolder) => {
    const isCategoryRoot = folder.folderType === "custom" && !folder.parentId;
    if (!confirmDelete(isCategoryRoot ? L.deleteCategoryConfirm : L.deleteFolderConfirm)) return;
    const removed = removeBankTransactionFolder(bankTransactionFolders, folder.id);
    if (removed.error) {
      setFolderError(removed.error);
      return;
    }
    recordAudit({
      entityType: "bankFolder",
      entityId: folder.id,
      entityLabel: folder.folderName,
      screen: L.pageTitle,
      action: "delete",
      before: snapshotBankFolderForAudit(folder),
      fields: BANK_FOLDER_AUDIT_FIELDS,
      user: currentUser,
    });
    setBankTransactionFolders(normalizeBankTransactionFolders(removed.next));
    setBankTransactions((prev) => clearBankTransactionFolderReferences(prev, removed.removedFolderIds || [folder.id]));
    if (selectedFolderId && (removed.removedFolderIds || [folder.id]).includes(selectedFolderId)) {
      setSelectedFolderId("");
    }
    if (isCategoryRoot && folderScope === `custom:${folder.id}`) {
      setFolderScope("all");
    }
    setFolderError("");
  };

  const handleDeleteAccountHistory = (account: BankAccountSummary) => {
    if (!account.count) return;
    if (!confirmDelete(L.deleteAccountHistoryConfirm(account.accountNumber, account.count))) return;

    const result = removeBankTransactionsByAccountNumber(
      bankTransactions,
      companyExpenses,
      fixedExpensePayments,
      account.accountNumber,
    );

    setPaymentVouchers((prev) =>
      (prev as Array<{ bankTransactionId?: string; [key: string]: unknown }>).map((voucher) =>
        voucher.bankTransactionId && result.removedIds.has(String(voucher.bankTransactionId))
          ? { ...voucher, bankTransactionId: undefined }
          : voucher,
      ),
    );

    setBankTransactions(result.transactions);
    setCompanyExpenses(result.expenses);
    setFixedExpensePayments(result.payments);

    if (accountFilter === account.accountNumber) {
      setAccountFilter("");
    }

    recordSummaryAudit({
      entityType: "bankTransaction",
      entityId: account.accountNumber,
      entityLabel: account.accountNumber,
      screen: L.pageTitle,
      action: "delete",
      fieldLabel: L.deleteAccountHistory,
      after: `${result.removedCount}\uAC74 \u00B7 \uAC00\uACC4\uBD80 ${result.removedExpenses + result.removedPayments}\uAC74`,
      user: currentUser,
    });

    setImportError("");
    setImportMessage(
      L.deleteAccountHistoryDone(
        account.accountNumber,
        result.removedCount,
        result.removedExpenses + result.removedPayments,
      ),
    );
  };

  const confirmSentStatementMatch = async (tx: BankTransaction, candidate: SentStatementMatchCandidate) => {
    if (paymentVouchers.some((voucher) => voucher.bankTransactionId === tx.id)) {
      setImportMessage("\uC774\uBBF8 \uC5F0\uACB0\uB41C \uD1B5\uC7A5 \uAC70\uB798\uC785\uB2C8\uB2E4.");
      return;
    }

    const archive = sentArchives.find((row) => row.id === candidate.pdfArchiveId);
    const paidSoFar = resolveStatementPaidAmount(candidate.pdfArchiveId, paymentVouchers, bankTransactions);
    const vouchers = createPaymentVouchersFromSentStatementMatch(tx, candidate, {
      sales,
      clients,
      archive,
      paymentVouchers,
    });
    const appliedAmount = vouchers.reduce((sum, voucher) => sum + Number(voucher.finalAmount || 0), 0);
    const paymentStatus = resolveArchivePaymentStatusAfterApply(
      candidate.statementTotalAmount,
      paidSoFar,
      appliedAmount,
    );
    const primaryVoucher = vouchers[0];
    const savedBy = currentUser?.name || currentUser?.loginId || "";
    const logs = createPaymentInputLogsFromVouchers(vouchers, savedBy);

    vouchers.forEach((voucher) => {
      recordAudit({
        entityType: "paymentVoucher",
        entityId: voucher.id,
        entityLabel: `${voucher.client} \u00B7 ${voucher.site}`,
        screen: L.pageTitle,
        action: "create",
        after: snapshotPaymentForAudit(voucher),
        fields: PAYMENT_AUDIT_FIELDS,
        user: currentUser,
      });
    });
    auditBankTxUpdate(tx, {
      ...tx,
      linkedPaymentVoucherId: primaryVoucher.id,
      linkedPdfArchiveId: candidate.pdfArchiveId,
      linkedSubject: candidate.client,
      linkedSalesId: vouchers.length === 1 ? primaryVoucher.salesId : undefined,
      matchConfirmedAt: new Date().toISOString(),
      matchConfirmedBy: savedBy,
      matchAutoLinked: false,
      folderId:
        tx.folderId ||
        (isCardCompanyDeposit(tx) ? DEFAULT_CARD_SALES_FOLDER_ID : DEFAULT_CLIENT_FOLDER_ID),
    });

    setPaymentVouchers((prev) => [...vouchers, ...(prev as typeof vouchers)]);
    setPaymentInputLogs((prev) => [...logs, ...(prev as typeof logs)]);
    setBankTransactions((prev) =>
      prev.map((row) =>
        row.id === tx.id
          ? {
              ...row,
              linkedPaymentVoucherId: primaryVoucher.id,
              linkedPdfArchiveId: candidate.pdfArchiveId,
              linkedSubject: candidate.client,
              linkedSalesId: vouchers.length === 1 ? primaryVoucher.salesId : undefined,
              matchConfirmedAt: new Date().toISOString(),
              matchConfirmedBy: savedBy,
              matchAutoLinked: false,
              folderId:
                row.folderId ||
                (isCardCompanyDeposit(row) ? DEFAULT_CARD_SALES_FOLDER_ID : DEFAULT_CLIENT_FOLDER_ID),
            }
          : row
      )
    );

    const statementSalesIds = vouchers[0]?.statementSalesIds;

    try {
      await updatePdfArchiveMeta(candidate.pdfArchiveId, {
        paymentStatus,
        linkedBankTransactionId: tx.id,
        linkedPaymentVoucherId: primaryVoucher.id,
        ...(statementSalesIds?.length ? { statementSalesIds } : {}),
      });
      setSentArchives((prev) =>
        prev.map((row) =>
          row.id === candidate.pdfArchiveId
            ? {
                ...row,
                paymentStatus,
                linkedBankTransactionId: tx.id,
                linkedPaymentVoucherId: primaryVoucher.id,
                ...(statementSalesIds?.length ? { statementSalesIds } : {}),
              }
            : row
        )
      );
    } catch (error) {
      console.error(error);
    }

    setLinkModalTx(null);
    setImportMessage(L.matchDone);
  };

  const openLedgerRegister = (tx: BankTransaction) => {
    const variableOnlyLinked = isVariableExpenseLinkedOnly(tx);
    if (!canRegisterLedger(tx) && !variableOnlyLinked) return;
    if (!variableOnlyLinked) {
      const gate = evaluateLedgerRegistrationGate(tx);
      if (!gate.allowed) {
        setImportMessage(L.ledgerConfidenceBlocked(gate.confidence));
        return;
      }
    }
    const prefill = buildCompanyExpensePrefillFromBankTransaction(tx);
    const suggestion = ledgerSuggestionByTxId.get(tx.id);
    const targetKey = suggestion?.targetKey || resolveLedgerTargetForBankTransaction(tx, bankLedgerRules, fixedExpenses);
    const parsed = parseLedgerTargetKey(targetKey);
    const learnMatch = findBestBankLearnRuleWithScore(tx, bankLedgerRules, fixedExpenses, ["fixed", "manual"]);
    const ledgerRule = learnMatch?.rule || findMatchingBankLedgerRule(tx, bankLedgerRules, fixedExpenses);
    const kind: LedgerRegisterKind = variableOnlyLinked
      ? "fixed"
      : parsed?.kind === "fixed"
        ? "fixed"
        : "manual";
    const fixedItem =
      parsed?.kind === "fixed" && parsed.fixedExpenseId
        ? fixedExpenses.find((row) => row.id === parsed.fixedExpenseId)
        : undefined;
    const defaultFixedId =
      fixedItem?.id ||
      fixedExpenses.find((row) => row.isActive)?.id ||
      "";
    const defaultManualCategory = expenseCategories[0] || EXPENSE_CATEGORY_OPTIONS[0];
    const defaultFixedCategory = fixedItem?.category?.trim() || FIXED_CATEGORY_OPTIONS[0];
    const resolvedCategory =
      kind === "manual"
        ? suggestion?.category ||
          (ledgerRule && "category" in ledgerRule ? ledgerRule.category : "") ||
          (parsed?.kind === "manual" ? parsed.category || "" : "")
        : fixedItem?.category ||
          suggestion?.category ||
          (ledgerRule && "category" in ledgerRule ? ledgerRule.category : "") ||
          "";
    setLedgerFormError("");
    const linkDefaults =
      kind === "fixed" && defaultFixedId
        ? buildLedgerLinkDefaults(tx, defaultFixedId, fixedExpensePayments, fixedExpenses)
        : { linkMode: "create" as const, linkPaymentId: "" };
    ledgerMemoDraftRef.current = prefill.memo;
    setLedgerModal({
      mode: "create",
      tx,
      kind,
      fixedExpenseId: kind === "fixed" ? defaultFixedId : "",
      category:
        kind === "fixed"
          ? resolvedCategory.trim() || defaultFixedCategory
          : resolvedCategory.trim() || defaultManualCategory,
      date: prefill.date,
      description: fixedItem?.name || prefill.description,
      amount: prefill.amount,
      memo: prefill.memo,
      ...linkDefaults,
    });
  };

  const openLedgerEdit = (tx: BankTransaction) => {
    const linkedPayment = resolveLinkedFixedPaymentForBankTx(tx);
    if (linkedPayment) {
      const fixedItem = fixedExpenses.find((row) => row.id === linkedPayment.fixedExpenseId);
      setLedgerFormError("");
      ledgerMemoDraftRef.current = linkedPayment.memo || "";
      setLedgerModal({
        mode: "edit",
        editPaymentId: linkedPayment.id,
        tx,
        kind: "fixed",
        fixedExpenseId: linkedPayment.fixedExpenseId,
        category: linkedPayment.category?.trim() || fixedItem?.category?.trim() || "",
        date: linkedPayment.date || tx.transactionAt.slice(0, 10),
        description: fixedItem?.name || tx.description || "",
        amount: String(linkedPayment.amount ?? tx.withdrawal ?? ""),
        memo: linkedPayment.memo || "",
      });
      return;
    }

    const linkedExpense = resolveLinkedCompanyExpenseForBankTx(tx);
    if (!linkedExpense) return;

    setLedgerFormError("");
    ledgerMemoDraftRef.current = linkedExpense.memo || "";
    setLedgerModal({
      mode: "edit",
      editExpenseId: linkedExpense.id,
      tx,
      kind: "manual",
      fixedExpenseId: "",
      category: linkedExpense.category || "",
      date: linkedExpense.date || tx.transactionAt.slice(0, 10),
      description: linkedExpense.description || tx.description || "",
      amount: String(linkedExpense.amount ?? tx.withdrawal ?? ""),
      memo: linkedExpense.memo || "",
    });
  };


  const setLedgerKind = (kind: LedgerRegisterKind) => {
    setLedgerModal((prev) => {
      if (!prev || prev.kind === kind) return prev;
      const next = { ...prev, kind };
      if (kind === "fixed") {
        if (!next.fixedExpenseId) {
          next.fixedExpenseId = fixedExpenses.find((row) => row.isActive)?.id || "";
        }
        const fixedItem = fixedExpenses.find((row) => row.id === next.fixedExpenseId);
        if (fixedItem) {
          next.category = fixedItem.category?.trim() || next.category;
          if (!prev.description.trim()) {
            next.description = fixedItem.name;
          }
        }
        Object.assign(
          next,
          buildLedgerLinkDefaults(next.tx, next.fixedExpenseId, fixedExpensePayments, fixedExpenses),
        );
      } else {
        next.category =
          resolveExpenseCategoryFromTxAccount(accountCodes, next.tx) ||
          expenseCategories[0] ||
          EXPENSE_CATEGORY_OPTIONS[0];
      }
      return next;
    });
  };

  const saveLedgerEdit = () => {
    if (!ledgerModal || !isLedgerEditModal(ledgerModal)) return;
    const savedBy = currentUser?.name || currentUser?.loginId || "";
    const kindChanged =
      (Boolean(ledgerModal.editPaymentId) && ledgerModal.kind === "manual") ||
      (Boolean(ledgerModal.editExpenseId) && ledgerModal.kind === "fixed");

    if (kindChanged && ledgerModal.editPaymentId && ledgerModal.kind === "manual") {
      const category = resolveExpenseCategoryFromTxAccount(accountCodes, ledgerModal.tx);
      if (!String(ledgerModal.tx.ledgerAccountCode || "").trim() || !category) {
        setLedgerFormError(L.accountSubjectRequired);
        return;
      }
      const error = validateCompanyExpenseInput({
        date: ledgerModal.date,
        category,
        description: ledgerModal.description,
        amount: ledgerModal.amount,
      });
      if (error) {
        setLedgerFormError(error);
        return;
      }

      const paymentId = ledgerModal.editPaymentId;
      const beforePayment = fixedExpensePayments.find((row) => row.id === paymentId);
      const nextPayments = fixedExpensePayments.filter((row) => row.id !== paymentId);
      const expenseId = makeLedgerId();
      const expense: CompanyExpense = {
        id: expenseId,
        date: ledgerModal.date,
        category,
        description: ledgerModal.description.trim(),
        amount: parseLedgerAmount(ledgerModal.amount),
        memo: ledgerMemoDraftRef.current.trim(),
        kind: "variable",
        bankTransactionId: ledgerModal.tx.id,
        createdBy: savedBy,
        createdAt: new Date().toISOString(),
      };
      const nextExpenses = [expense, ...companyExpenses];
      const nextTransactions = bankTransactions.map((row) => {
        if (row.id === ledgerModal.tx.id) {
          return { ...row, linkedCompanyExpenseId: expenseId, linkedFixedExpensePaymentId: undefined };
        }
        if (row.linkedFixedExpensePaymentId === paymentId) {
          return { ...row, linkedFixedExpensePaymentId: undefined };
        }
        return row;
      });
      const nextCategories = mergeExpenseCategory(expenseCategories, category);
      const nextRules = upsertBankLearnRule(
        bankLedgerRules,
        buildBankLearnRuleFromManualRegistration(ledgerModal.tx, category, savedBy),
      );
      if (beforePayment) {
        const fixedItem = fixedExpenses.find((row) => row.id === beforePayment.fixedExpenseId);
        recordAudit({
          entityType: "fixedExpensePayment",
          entityId: paymentId,
          entityLabel: fixedItem?.name || paymentId,
          screen: L.pageTitle,
          action: "delete",
          before: snapshotFixedExpensePaymentForAudit(beforePayment),
          fields: FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS,
          user: currentUser,
        });
      }
      recordAudit({
        entityType: "companyExpense",
        entityId: expenseId,
        entityLabel: `${expense.date} \u00B7 ${expense.description || expense.category}`,
        screen: L.pageTitle,
        action: "create",
        after: snapshotCompanyExpenseForAudit(expense),
        fields: COMPANY_EXPENSE_AUDIT_FIELDS,
        user: currentUser,
      });
      auditBankTxUpdate(ledgerModal.tx, nextTransactions.find((row) => row.id === ledgerModal.tx.id) || ledgerModal.tx);
      setFixedExpensePayments(nextPayments);
      setCompanyExpenses(nextExpenses);
      setBankTransactions(nextTransactions);
      setExpenseCategories(nextCategories);
      setBankLedgerRules(nextRules);
      setLedgerModal(null);
      setLedgerFormError("");
      setImportMessage(L.ledgerKindChangeDone);
      return;
    }

    if (kindChanged && ledgerModal.editExpenseId && ledgerModal.kind === "fixed") {
      const fixedExpenseId = ledgerModal.fixedExpenseId.trim();
      const category = resolveFixedExpenseItemCategory(fixedExpenses, fixedExpenseId);
      if (!fixedExpenseId) {
        setLedgerFormError("\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
        return;
      }
      const error = validateFixedExpensePaymentInput({
        date: ledgerModal.date,
        fixedExpenseId,
        amount: ledgerModal.amount,
      });
      if (error) {
        setLedgerFormError(error);
        return;
      }

      const expenseId = ledgerModal.editExpenseId;
      const beforeExpense = companyExpenses.find((row) => row.id === expenseId);
      const nextExpenses = companyExpenses.filter((row) => row.id !== expenseId);
      const amount = parseLedgerAmount(ledgerModal.amount);
      const linkable = listLinkableFixedExpensePayments(
        ledgerModal.tx,
        fixedExpenseId,
        fixedExpensePayments,
        fixedExpenses,
      );
      let existingPayment: FixedExpensePayment | null = null;
      if (ledgerModal.linkMode === "link" && ledgerModal.linkPaymentId) {
        existingPayment = linkable.find((row) => row.id === ledgerModal.linkPaymentId) || null;
      } else if (ledgerModal.linkMode !== "create") {
        existingPayment = findLinkableFixedExpensePayment(
          ledgerModal.tx,
          fixedExpenseId,
          fixedExpensePayments,
          fixedExpenses,
        );
      }

      let nextPayments = fixedExpensePayments;
      let paymentId = existingPayment?.id || "";
      if (existingPayment) {
        nextPayments = linkFixedExpensePaymentToBankTx(nextPayments, existingPayment.id, ledgerModal.tx.id, ledgerModal.tx);
        paymentId = existingPayment.id;
      } else {
        paymentId = makeLedgerId();
        nextPayments = [
          {
            id: paymentId,
            fixedExpenseId,
            date: ledgerModal.date,
            amount,
            memo: ledgerMemoDraftRef.current.trim() || ledgerModal.description.trim(),
            bankTransactionId: ledgerModal.tx.id,
            createdBy: savedBy,
            createdAt: new Date().toISOString(),
          },
          ...nextPayments,
        ];
      }

      const nextTransactions = bankTransactions.map((row) =>
        row.id === ledgerModal.tx.id
          ? { ...row, linkedFixedExpensePaymentId: paymentId, linkedCompanyExpenseId: undefined }
          : row.linkedCompanyExpenseId === expenseId
            ? { ...row, linkedCompanyExpenseId: undefined }
            : row,
      );
      const existingFixed = fixedExpenses.find((row) => row.id === fixedExpenseId);
      if (existingFixed && existingFixed.category !== category) {
        setFixedExpenses((prev) =>
          prev.map((row) => (row.id === fixedExpenseId ? { ...row, category } : row)),
        );
        recordAudit({
          entityType: "fixedExpense",
          entityId: fixedExpenseId,
          entityLabel: existingFixed.name,
          screen: L.pageTitle,
          action: "update",
          before: snapshotFixedExpenseForAudit(existingFixed),
          after: snapshotFixedExpenseForAudit({ ...existingFixed, category }),
          fields: FIXED_EXPENSE_AUDIT_FIELDS,
          user: currentUser,
        });
      }
      const nextRules = upsertBankLearnRule(
        bankLedgerRules,
        buildBankLedgerMatchRuleFromRegistration(ledgerModal.tx, fixedExpenseId, savedBy, amount),
      );
      if (beforeExpense) {
        recordAudit({
          entityType: "companyExpense",
          entityId: expenseId,
          entityLabel: `${beforeExpense.date} \u00B7 ${beforeExpense.description || beforeExpense.category}`,
          screen: L.pageTitle,
          action: "delete",
          before: snapshotCompanyExpenseForAudit(beforeExpense),
          fields: COMPANY_EXPENSE_AUDIT_FIELDS,
          user: currentUser,
        });
      }
      const linkedPayment = nextPayments.find((row) => row.id === paymentId);
      if (linkedPayment && !existingPayment) {
        const fixedItem = fixedExpenses.find((row) => row.id === fixedExpenseId);
        recordAudit({
          entityType: "fixedExpensePayment",
          entityId: paymentId,
          entityLabel: fixedItem?.name || paymentId,
          screen: L.pageTitle,
          action: "create",
          after: snapshotFixedExpensePaymentForAudit(linkedPayment),
          fields: FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS,
          user: currentUser,
        });
      }
      setFixedExpenseCategories((prev) => mergeFixedExpenseCategory(prev, category, fixedExpenses));
      auditBankTxUpdate(ledgerModal.tx, nextTransactions.find((row) => row.id === ledgerModal.tx.id) || ledgerModal.tx);
      setCompanyExpenses(nextExpenses);
      setFixedExpensePayments(nextPayments);
      setBankTransactions(nextTransactions);
      setBankLedgerRules(nextRules);
      setLedgerModal(null);
      setLedgerFormError("");
      setImportMessage(L.ledgerKindChangeDone);
      return;
    }

    if (ledgerModal.kind === "fixed" && ledgerModal.editPaymentId) {
      const fixedExpenseId = ledgerModal.fixedExpenseId.trim();
      const category = resolveFixedExpenseItemCategory(fixedExpenses, fixedExpenseId);
      if (!fixedExpenseId) {
        setLedgerFormError("\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
        return;
      }
      const error = validateFixedExpensePaymentInput({
        date: ledgerModal.date,
        fixedExpenseId,
        amount: ledgerModal.amount,
      });
      if (error) {
        setLedgerFormError(error);
        return;
      }

      const paymentId = ledgerModal.editPaymentId;
      const beforePayment = fixedExpensePayments.find((row) => row.id === paymentId);
      const amount = parseLedgerAmount(ledgerModal.amount);
      const nextPayments = fixedExpensePayments.map((row) =>
        row.id === paymentId
          ? {
              ...row,
              fixedExpenseId,
              date: ledgerModal.date,
              amount,
              memo: ledgerMemoDraftRef.current.trim() || ledgerModal.description.trim(),
              bankTransactionId: ledgerModal.tx.id,
            }
          : row,
      );
      const nextTransactions = bankTransactions.map((row) =>
        row.id === ledgerModal.tx.id
          ? { ...row, linkedFixedExpensePaymentId: paymentId, linkedCompanyExpenseId: undefined }
          : row,
      );
      const existingFixed = fixedExpenses.find((row) => row.id === fixedExpenseId);
      if (existingFixed && existingFixed.category !== category) {
        setFixedExpenses((prev) =>
          prev.map((row) => (row.id === fixedExpenseId ? { ...row, category } : row)),
        );
        recordAudit({
          entityType: "fixedExpense",
          entityId: fixedExpenseId,
          entityLabel: existingFixed.name,
          screen: L.pageTitle,
          action: "update",
          before: snapshotFixedExpenseForAudit(existingFixed),
          after: snapshotFixedExpenseForAudit({ ...existingFixed, category }),
          fields: FIXED_EXPENSE_AUDIT_FIELDS,
          user: currentUser,
        });
      }
      if (beforePayment) {
        const fixedItem = fixedExpenses.find((row) => row.id === fixedExpenseId);
        recordAudit({
          entityType: "fixedExpensePayment",
          entityId: paymentId,
          entityLabel: fixedItem?.name || paymentId,
          screen: L.pageTitle,
          action: "update",
          before: snapshotFixedExpensePaymentForAudit(beforePayment),
          after: snapshotFixedExpensePaymentForAudit(nextPayments.find((row) => row.id === paymentId) || beforePayment),
          fields: FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS,
          user: currentUser,
        });
      }
      setFixedExpenseCategories((prev) => mergeFixedExpenseCategory(prev, category, fixedExpenses));
      const nextRules = upsertBankLearnRule(
        bankLedgerRules,
        buildBankLedgerMatchRuleFromRegistration(ledgerModal.tx, fixedExpenseId, savedBy, amount),
      );
      auditBankTxUpdate(ledgerModal.tx, nextTransactions.find((row) => row.id === ledgerModal.tx.id) || ledgerModal.tx);
      setFixedExpensePayments(nextPayments);
      setBankTransactions(nextTransactions);
      setBankLedgerRules(nextRules);
      setLedgerModal(null);
      setLedgerFormError("");
      setImportMessage(L.ledgerFixedEditDone);
      return;
    }

    if (ledgerModal.kind === "manual" && ledgerModal.editExpenseId) {
      const category = resolveExpenseCategoryFromTxAccount(accountCodes, ledgerModal.tx);
      if (!String(ledgerModal.tx.ledgerAccountCode || "").trim() || !category) {
        setLedgerFormError(L.accountSubjectRequired);
        return;
      }
      const error = validateCompanyExpenseInput({
        date: ledgerModal.date,
        category,
        description: ledgerModal.description,
        amount: ledgerModal.amount,
      });
      if (error) {
        setLedgerFormError(error);
        return;
      }

      const expenseId = ledgerModal.editExpenseId;
      const beforeExpense = companyExpenses.find((row) => row.id === expenseId);
      const updatedExpense: CompanyExpense = {
        ...(beforeExpense || {
          id: expenseId,
          kind: "variable",
          createdBy: savedBy,
          createdAt: new Date().toISOString(),
        }),
        date: ledgerModal.date,
        category,
        description: ledgerModal.description.trim(),
        amount: parseLedgerAmount(ledgerModal.amount),
        memo: ledgerMemoDraftRef.current.trim(),
        bankTransactionId: ledgerModal.tx.id,
      };
      const nextExpenses = companyExpenses.map((row) => (row.id === expenseId ? updatedExpense : row));
      const nextTransactions = bankTransactions.map((row) =>
        row.id === ledgerModal.tx.id
          ? { ...row, linkedCompanyExpenseId: expenseId, linkedFixedExpensePaymentId: undefined }
          : row,
      );
      const nextCategories = mergeExpenseCategory(expenseCategories, category);
      const nextRules = upsertBankLearnRule(
        bankLedgerRules,
        buildBankLearnRuleFromManualRegistration(ledgerModal.tx, category, savedBy),
      );
      if (beforeExpense) {
        recordAudit({
          entityType: "companyExpense",
          entityId: expenseId,
          entityLabel: `${updatedExpense.date} \u00B7 ${updatedExpense.description || updatedExpense.category}`,
          screen: L.pageTitle,
          action: "update",
          before: snapshotCompanyExpenseForAudit(beforeExpense),
          after: snapshotCompanyExpenseForAudit(updatedExpense),
          fields: COMPANY_EXPENSE_AUDIT_FIELDS,
          user: currentUser,
        });
      }
      auditBankTxUpdate(ledgerModal.tx, nextTransactions.find((row) => row.id === ledgerModal.tx.id) || ledgerModal.tx);
      setExpenseCategories(nextCategories);
      setCompanyExpenses(nextExpenses);
      setBankTransactions(nextTransactions);
      setBankLedgerRules(nextRules);
      setLedgerModal(null);
      setLedgerFormError("");
      setImportMessage(L.ledgerEditDone);
    }
  };

  const saveLedgerRegister = () => {
    if (!ledgerModal) return;
    if (isLedgerEditModal(ledgerModal)) {
      saveLedgerEdit();
      return;
    }
    if (!canRegisterLedger(ledgerModal.tx)) {
      if (ledgerModal.kind !== "fixed" || !canRegisterFixedLedger(ledgerModal.tx)) {
        setLedgerFormError(L.ledgerAlreadyRegistered);
        return;
      }
    }
    const variableOnlyLinked = isVariableExpenseLinkedOnly(ledgerModal.tx);
    const gate = evaluateLedgerRegistrationGate(ledgerModal.tx);
    const manualOverride = isManualLedgerRegistrationOverride(ledgerModal.tx, {
      kind: ledgerModal.kind,
      category: ledgerModal.category,
      fixedExpenseId: ledgerModal.fixedExpenseId,
    });
    if (!variableOnlyLinked && !gate.allowed && !manualOverride) {
      setLedgerFormError(L.ledgerConfidenceBlocked(gate.confidence));
      return;
    }
    const savedBy = currentUser?.name || currentUser?.loginId || "";

    if (ledgerModal.kind === "fixed") {
      const fixedExpenseId = ledgerModal.fixedExpenseId.trim();
      const category = resolveFixedExpenseItemCategory(fixedExpenses, fixedExpenseId);

      if (!fixedExpenseId) {
        setLedgerFormError("\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
        return;
      }

      const error = validateFixedExpensePaymentInput({
        date: ledgerModal.date,
        fixedExpenseId,
        amount: ledgerModal.amount,
      });
      if (error) {
        setLedgerFormError(error);
        return;
      }

      const amount = parseLedgerAmount(ledgerModal.amount);
      const linkable = listLinkableFixedExpensePayments(
        ledgerModal.tx,
        fixedExpenseId,
        fixedExpensePayments,
        fixedExpenses,
      );
      let existingPayment: FixedExpensePayment | null = null;
      if (ledgerModal.linkMode === "link" && ledgerModal.linkPaymentId) {
        existingPayment = linkable.find((row) => row.id === ledgerModal.linkPaymentId) || null;
      } else if (ledgerModal.linkMode !== "create") {
        existingPayment = findLinkableFixedExpensePayment(
          ledgerModal.tx,
          fixedExpenseId,
          fixedExpensePayments,
          fixedExpenses,
        );
      }

      let nextExpenses = companyExpenses;
      let workingTransactions = bankTransactions;
      let removedExpense: CompanyExpense | null = null;
      if (variableOnlyLinked) {
        const cleared = clearVariableExpenseLinkForBankTx(
          ledgerModal.tx.id,
          companyExpenses,
          bankTransactions,
        );
        nextExpenses = cleared.expenses;
        workingTransactions = cleared.transactions;
        removedExpense = cleared.removedExpense;
        if (removedExpense) {
          recordAudit({
            entityType: "companyExpense",
            entityId: removedExpense.id,
            entityLabel: `${removedExpense.date} \u00B7 ${removedExpense.description || removedExpense.category}`,
            screen: L.pageTitle,
            action: "delete",
            before: snapshotCompanyExpenseForAudit(removedExpense),
            fields: COMPANY_EXPENSE_AUDIT_FIELDS,
            user: currentUser,
          });
        }
      }

      let nextPayments = fixedExpensePayments;
      let paymentId = existingPayment?.id || "";

      if (existingPayment) {
        nextPayments = linkFixedExpensePaymentToBankTx(nextPayments, existingPayment.id, ledgerModal.tx.id, ledgerModal.tx);
        paymentId = existingPayment.id;
      } else {
        paymentId = makeLedgerId();
        nextPayments = [
          {
            id: paymentId,
            fixedExpenseId,
            date: ledgerModal.date,
            amount,
            memo: ledgerMemoDraftRef.current.trim() || ledgerModal.description.trim(),
            bankTransactionId: ledgerModal.tx.id,
            createdBy: savedBy,
            createdAt: new Date().toISOString(),
          },
          ...nextPayments,
        ];
      }

      const nextTransactions = workingTransactions.map((row) =>
        row.id === ledgerModal.tx.id
          ? {
              ...row,
              linkedFixedExpensePaymentId: paymentId,
              linkedCompanyExpenseId: undefined,
            }
          : row,
      );
      const existingFixed = fixedExpenses.find((row) => row.id === fixedExpenseId);
      if (existingFixed && existingFixed.category !== category) {
        setFixedExpenses((prev) =>
          prev.map((row) => (row.id === fixedExpenseId ? { ...row, category } : row)),
        );
        recordAudit({
          entityType: "fixedExpense",
          entityId: fixedExpenseId,
          entityLabel: existingFixed.name,
          screen: L.pageTitle,
          action: "update",
          before: snapshotFixedExpenseForAudit(existingFixed),
          after: snapshotFixedExpenseForAudit({ ...existingFixed, category }),
          fields: FIXED_EXPENSE_AUDIT_FIELDS,
          user: currentUser,
        });
      }
      setFixedExpenseCategories((prev) => mergeFixedExpenseCategory(prev, category, fixedExpenses));
      const nextRules = upsertBankLearnRule(
        bankLedgerRules,
        buildBankLedgerMatchRuleFromRegistration(ledgerModal.tx, fixedExpenseId, savedBy, amount),
      );

      auditBankTxUpdate(ledgerModal.tx, nextTransactions.find((row) => row.id === ledgerModal.tx.id) || ledgerModal.tx);

      if (removedExpense) {
        setCompanyExpenses(nextExpenses);
      }
      const ledgerFolderSync = syncLedgerLinkedBankTransactionFolders(
        syncBankTransactionLedgerLinkFields(
          nextTransactions.map((row) =>
            row.id === ledgerModal.tx.id ? assignDefaultLedgerFolderToBankTransaction(row) : row,
          ),
          nextExpenses,
          nextPayments,
        ),
        ensureDefaultBankTransactionFolders(bankTransactionFolders),
        { companyExpenses: nextExpenses, fixedExpensePayments: nextPayments },
      );
      setFixedExpensePayments(nextPayments);
      setBankTransactions(ledgerFolderSync.transactions);
      setBankLedgerRules(nextRules);
      void onRequestImmediateSave?.({
        bankTransactions: ledgerFolderSync.transactions,
        companyExpenses: nextExpenses,
        fixedExpensePayments: nextPayments,
        bankLedgerRules: nextRules,
      });
      applyAutoLearnRules(ledgerFolderSync.transactions, nextPayments, nextExpenses, nextRules, {
        showMessage: true,
      });
      setLedgerModal(null);
      setLedgerFormError("");
      setImportMessage(existingPayment ? L.ledgerFixedLinkDone : L.ledgerFixedRegisterDone);
      return;
    }

    const accountCode = String(ledgerModal.tx.ledgerAccountCode || "").trim();
    const category = resolveExpenseCategoryFromTxAccount(accountCodes, ledgerModal.tx);
    if (!accountCode || !category) {
      setLedgerFormError(L.accountSubjectRequired);
      return;
    }

    const error = validateCompanyExpenseInput({
      date: ledgerModal.date,
      category,
      description: ledgerModal.description,
      amount: ledgerModal.amount,
    });
    if (error) {
      setLedgerFormError(error);
      return;
    }

    const expenseId = makeLedgerId();
    const expense: CompanyExpense = {
      id: expenseId,
      date: ledgerModal.date,
      category,
      description: ledgerModal.description.trim(),
      amount: parseLedgerAmount(ledgerModal.amount),
      memo: ledgerMemoDraftRef.current.trim(),
      kind: "variable",
      bankTransactionId: ledgerModal.tx.id,
      createdBy: savedBy,
      createdAt: new Date().toISOString(),
    };

    const nextTransactions = bankTransactions.map((row) =>
      row.id === ledgerModal.tx.id
        ? {
            ...row,
            linkedCompanyExpenseId: expenseId,
            linkedFixedExpensePaymentId: undefined,
          }
        : row,
    );
    const nextExpenses = [expense, ...companyExpenses];
    const nextCategories = mergeExpenseCategory(expenseCategories, category);
    const nextRules = upsertBankLearnRule(
      bankLedgerRules,
      buildBankLearnRuleFromManualRegistration(ledgerModal.tx, category, savedBy),
    );

    recordAudit({
      entityType: "companyExpense",
      entityId: expense.id,
      entityLabel: `${expense.date} \u00B7 ${expense.description || expense.category}`,
      screen: L.pageTitle,
      action: "create",
      after: snapshotCompanyExpenseForAudit(expense),
      fields: COMPANY_EXPENSE_AUDIT_FIELDS,
      user: currentUser,
    });
    auditBankTxUpdate(ledgerModal.tx, nextTransactions.find((row) => row.id === ledgerModal.tx.id) || ledgerModal.tx);

    setExpenseCategories(nextCategories);
    const ledgerFolderSync = syncLedgerLinkedBankTransactionFolders(
      syncBankTransactionLedgerLinkFields(
        nextTransactions.map((row) =>
          row.id === ledgerModal.tx.id ? assignDefaultLedgerFolderToBankTransaction(row) : row,
        ),
        nextExpenses,
        fixedExpensePayments,
      ),
      ensureDefaultBankTransactionFolders(bankTransactionFolders),
      { companyExpenses: nextExpenses, fixedExpensePayments },
    );
    setCompanyExpenses(nextExpenses);
    setBankTransactions(ledgerFolderSync.transactions);
    setBankLedgerRules(nextRules);
    void onRequestImmediateSave?.({
      bankTransactions: ledgerFolderSync.transactions,
      companyExpenses: nextExpenses,
      bankLedgerRules: nextRules,
      expenseCategories: nextCategories,
    });
    applyAutoLearnRules(ledgerFolderSync.transactions, fixedExpensePayments, nextExpenses, nextRules, {
      showMessage: true,
    });
    setLedgerModal(null);
    setLedgerFormError("");
    setImportMessage(L.ledgerRegisterDone);
  };

  const openClientLinkModal = (tx: BankTransaction) => {
    setClientLinkClientName("");
    setClientLinkModalTx(tx);
  };

  const confirmClientDepositLink = () => {
    const tx = clientLinkModalTx;
    if (!tx) return;

    const clientName = clientLinkClientName.trim();
    if (!clientName) {
      setImportMessage(L.clientLinkMissingClient);
      return;
    }

    const subject = resolveBankDepositMatchSubject(tx);
    if (!subject) {
      setImportMessage(L.clientLinkMissingSubject);
      return;
    }

    const client = clients.find((row) => String(row.name || "").trim() === clientName);
    if (!client?.id) {
      setImportMessage(L.clientLinkMissingClient);
      return;
    }

    const nextAliases = appendDepositNameAlias(client.depositNameAliases, subject);
    const updatedClient = { ...client, depositNameAliases: nextAliases };

    recordAudit({
      entityType: "client",
      entityId: client.id,
      entityLabel: String(client.name || ""),
      screen: L.pageTitle,
      action: "update",
      before: snapshotClientForAudit(client),
      after: snapshotClientForAudit(updatedClient),
      fields: CLIENT_AUDIT_FIELDS,
      user: currentUser,
    });

    const nextClients = clients.map((row) => (row.id === client.id ? updatedClient : row));
    setClients(nextClients);

    const linkedTransactions = bankTransactions.map((row) =>
      row.id === tx.id ? applyClientDepositLinkToTransaction(row, clientName) : row,
    );
    const classified = autoClassifyBankTransactions(linkedTransactions, nextClients, workers, bankTransactionFolders);
    setBankTransactions(classified.next);
    setBankTransactionFolders(classified.folders);

    setClientLinkModalTx(null);
    setClientLinkClientName("");
    const classifyNote = classified.updated > 0 ? ` (\uAE30\uD0C0 ${classified.updated}\uAC74 \uC790\uB3D9 \uBD84\uB958)` : "";
    setImportMessage(`${L.clientLinkDone}${classifyNote}`);
  };

  const confirmDepositMatch = (tx: BankTransaction, candidate: BankDepositMatchCandidate) => {
    if (paymentVouchers.some((voucher) => voucher.bankTransactionId === tx.id)) {
      setImportMessage("\uC774\uBBF8 \uC5F0\uACB0\uB41C \uD1B5\uC7A5 \uAC70\uB798\uC785\uB2C8\uB2E4.");
      return;
    }
    const receivable = receivableRows.find((row) => String(row.id) === String(candidate.salesId));
    if (!receivable) return;
    const sale = sales.find((row) => String(row.id) === String(candidate.salesId));
    const voucher = createPaymentVoucherFromBankMatch(tx, candidate, receivable, sale);
    const savedBy = currentUser?.name || currentUser?.loginId || "";
    const logs = createPaymentInputLogsFromVouchers([voucher], savedBy);

    recordAudit({
      entityType: "paymentVoucher",
      entityId: voucher.id,
      entityLabel: `${voucher.client} \u00B7 ${voucher.site}`,
      screen: L.pageTitle,
      action: "create",
      after: snapshotPaymentForAudit(voucher),
      fields: PAYMENT_AUDIT_FIELDS,
      user: currentUser,
    });
    auditBankTxUpdate(tx, {
      ...tx,
      linkedSalesId: receivable.id,
      linkedPaymentVoucherId: voucher.id,
      linkedSubject: receivable.client,
      matchConfirmedAt: new Date().toISOString(),
      matchConfirmedBy: savedBy,
      matchAutoLinked: false,
      folderId:
        tx.folderId ||
        (isCardCompanyDeposit(tx) ? DEFAULT_CARD_SALES_FOLDER_ID : DEFAULT_CLIENT_FOLDER_ID),
    });

    setPaymentVouchers((prev) => [voucher, ...(prev as typeof voucher[])]);
    setPaymentInputLogs((prev) => [...logs, ...(prev as typeof logs)]);
    setBankTransactions((prev) =>
      prev.map((row) =>
        row.id === tx.id
          ? {
              ...row,
              linkedSalesId: receivable.id,
              linkedPaymentVoucherId: voucher.id,
              linkedSubject: receivable.client,
              matchConfirmedAt: new Date().toISOString(),
              matchConfirmedBy: savedBy,
              matchAutoLinked: false,
              folderId:
                row.folderId ||
                (isCardCompanyDeposit(row) ? DEFAULT_CARD_SALES_FOLDER_ID : DEFAULT_CLIENT_FOLDER_ID),
            }
          : row
      )
    );
    setLinkModalTx(null);
    setImportMessage(L.matchDone);
  };

  const confirmHighConfidenceMatches = () => {
    const savedBy = currentUser?.name || currentUser?.loginId || "";
    const existingBankIds = new Set(
      paymentVouchers.map((voucher) => String(voucher.bankTransactionId || "")).filter(Boolean)
    );
    const newVouchers: ReturnType<typeof createPaymentVoucherFromBankMatch>[] = [];
    const sentVouchers: ReturnType<typeof createPaymentVouchersFromSentStatementMatch>[number][] = [];
    let workingPaymentVouchers = paymentVouchers as Array<{
      salesId?: number | string;
      finalAmount?: number;
      amount?: number;
      bankTransactionId?: string | number;
      linkedPdfArchiveId?: string;
      isPartialPayment?: boolean;
    }>;
    const linkedByTxId = new Map<
      string,
      { salesId?: number | string; voucherId: number; client: string; pdfArchiveId?: string; paymentStatus?: "confirmed" | "partial" }
    >();

    for (const item of depositSuggestions) {
      const candidate = item.candidates[0];
      if (!candidate || candidate.score < 75) continue;
      if (item.tx.linkedPaymentVoucherId || existingBankIds.has(item.tx.id)) continue;
      if (hasManualClientClassificationOverride(item.tx)) continue;

      if (item.kind === "sentStatement") {
        const sentCandidate = candidate as SentStatementMatchCandidate;
        const archive = sentArchives.find((row) => row.id === sentCandidate.pdfArchiveId);
        const paidSoFar = resolveStatementPaidAmount(
          sentCandidate.pdfArchiveId,
          workingPaymentVouchers,
          bankTransactions,
        );
        const vouchers = createPaymentVouchersFromSentStatementMatch(item.tx, sentCandidate, {
          sales,
          clients,
          archive,
          paymentVouchers: workingPaymentVouchers,
        });
        const appliedAmount = vouchers.reduce((sum, voucher) => sum + Number(voucher.finalAmount || 0), 0);
        const paymentStatus = resolveArchivePaymentStatusAfterApply(
          sentCandidate.statementTotalAmount,
          paidSoFar,
          appliedAmount,
        );
        sentVouchers.push(...vouchers);
        workingPaymentVouchers = [...workingPaymentVouchers, ...vouchers];
        existingBankIds.add(item.tx.id);
        linkedByTxId.set(item.tx.id, {
          voucherId: vouchers[0].id,
          client: sentCandidate.client,
          pdfArchiveId: sentCandidate.pdfArchiveId,
          paymentStatus,
          salesId: vouchers.length === 1 ? vouchers[0].salesId : undefined,
        });
        continue;
      }

      const receivableCandidate = candidate as BankDepositMatchCandidate;
      const receivable = receivableRows.find((row) => String(row.id) === String(receivableCandidate.salesId));
      if (!receivable) continue;
      const sale = sales.find((row) => String(row.id) === String(receivableCandidate.salesId));
      const voucher = createPaymentVoucherFromBankMatch(item.tx, receivableCandidate, receivable, sale);
      newVouchers.push(voucher);
      existingBankIds.add(item.tx.id);
      linkedByTxId.set(item.tx.id, {
        salesId: receivable.id,
        voucherId: voucher.id,
        client: receivable.client,
      });
    }

    const allVouchers = [...sentVouchers, ...newVouchers];
    if (!allVouchers.length) return;

    const logs = createPaymentInputLogsFromVouchers(allVouchers, savedBy);
    allVouchers.forEach((voucher) => {
      recordAudit({
        entityType: "paymentVoucher",
        entityId: voucher.id,
        entityLabel: `${voucher.client} \u00B7 ${voucher.site}`,
        screen: L.pageTitle,
        action: "create",
        after: snapshotPaymentForAudit(voucher),
        fields: PAYMENT_AUDIT_FIELDS,
        user: currentUser,
      });
    });
    recordSummaryAudit({
      entityType: "bankTransaction",
      entityId: "bulk-match",
      entityLabel: "\uACE0\uC2E0\uB8B0 \uC790\uB3D9 \uC785\uAE08 \uC5F0\uACB0",
      screen: L.pageTitle,
      action: "import",
      fieldLabel: "\uC77C\uAD04 \uC785\uAE08",
      after: `${allVouchers.length}\uAC74 \uC790\uB3D9 \uC785\uAE08 \uC5F0\uACB0`,
      user: currentUser,
    });

    setPaymentVouchers((prev) => [...allVouchers, ...(prev as typeof allVouchers)]);
    setPaymentInputLogs((prev) => [...logs, ...(prev as typeof logs)]);
    setBankTransactions((prev) =>
      prev.map((row) => {
        const linked = linkedByTxId.get(row.id);
        if (!linked) return row;
        return {
          ...row,
          linkedSalesId: linked.salesId,
          linkedPaymentVoucherId: linked.voucherId,
          linkedPdfArchiveId: linked.pdfArchiveId,
          linkedSubject: resolveAutoLinkLinkedSubject(row, linked.client),
          matchConfirmedAt: new Date().toISOString(),
          matchConfirmedBy: savedBy,
          matchAutoLinked: true,
          folderId:
            row.folderId || (isCardCompanyDeposit(row) ? DEFAULT_CARD_SALES_FOLDER_ID : DEFAULT_CLIENT_FOLDER_ID),
        };
      })
    );

    void Promise.all(
      [...linkedByTxId.entries()]
        .filter(([, linked]) => linked.pdfArchiveId)
        .map(([txId, linked]) =>
          updatePdfArchiveMeta(linked.pdfArchiveId!, {
            paymentStatus: linked.paymentStatus || "confirmed",
            linkedBankTransactionId: txId,
            linkedPaymentVoucherId: linked.voucherId,
          })
        )
    )
      .then(() => loadSentArchives())
      .catch((error) => console.error(error));

    setImportMessage(`${allVouchers.length}${L.matchBulkDone}`);
  };

  const folderMap = useMemo(
    () => new Map(bankTransactionFolders.map((folder) => [folder.id, folder])),
    [bankTransactionFolders]
  );

  const ledgerCategoryFolder = useMemo(
    () => folderMap.get(DEFAULT_LEDGER_CATEGORY_FOLDER_ID),
    [folderMap],
  );

  const listSectionLabels = useMemo(
    () => ({
      empty: L.empty,
      unfiled: L.unfiled,
      accountContentPlaceholder: L.accountContentPlaceholder,
      categoryPlaceholder: L.accountSubjectPlaceholder,
      fixedExpensePlaceholder: L.fixedExpensePlaceholder,
      transactionAt: L.transactionAt,
      deposit: L.deposit,
      withdrawal: L.withdrawal,
      balance: L.balance,
      description: L.description,
      accountContent: L.accountContent,
      category: L.accountSubject,
      fixedExpense: L.fixedExpenseColumn,
      classification: L.classification,
      matchStatus: L.matchStatus,
      autoLinkBadgeTitle: L.autoLinkBadgeTitle,
      manualLinkBadgeTitle: L.manualLinkBadgeTitle,
      partialPaymentBadgeTitle: L.partialPaymentBadgeTitle,
      preauthNetSettlementBadge: L.preauthNetSettlementBadge,
      preauthNetRefundBadge: L.preauthNetRefundBadge,
      preauthNetSuppressedBadge: L.preauthNetSuppressedBadge,
      bankSection: L.bankSection,
      classifySection: L.classifySection,
      account: L.account,
      counterparty: L.counterparty,
      amount: L.amount,
      memo: L.memo,
      evidence: L.evidence,
      accountSubject: L.accountSubject,
      client: L.clientColumn,
      classifiedAmount: L.classifiedAmount,
      erpProcess: L.erpProcess,
      taxInvoiceIssue: L.taxInvoiceIssue,
      taxInvoiceIssueButton: L.taxInvoiceIssueButton,
      evidenceFind: L.evidenceFind,
      evidencePlaceholder: L.evidencePlaceholder,
      accountSubjectPlaceholder: L.accountSubjectPlaceholder,
      clientPlaceholder: L.clientPlaceholder,
      memoPlaceholder: L.memoPlaceholder,
      voucherProcessedBadge: L.voucherProcessedBadge,
    }),
    [],
  );

  const getBankTransactionsExportParsed = useCallback(
    () => {
      const exportMemoLearnRules = buildMemoLearnRulesFromTransactions(
        bankTransactions,
        expenseCategories,
        savedBy,
      );
      const exportEffectiveRules = mergeMemoLearnRules(bankLedgerRules, exportMemoLearnRules);
      const exportMemoSuggestions = buildMemoCategorySuggestionMap(
        bankTransactions,
        exportMemoLearnRules,
        expenseCategories,
      );
      const exportLedgerSuggestions = buildLedgerClassificationMap(bankTransactions, {
        rules: exportEffectiveRules,
        fixedExpenses,
        expenseCategories,
        companyExpenses,
        workers,
        clients,
        canRegister: (tx) => canRegisterBankTxToCompanyLedger(tx, ledgerRegistrationContext),
      });
      const exportRowDisplayById = buildBankTransactionRowDisplayCache({
        rows: filteredRows,
        companyExpenses,
        fixedExpensePayments,
        fixedExpenses,
        memoCategorySuggestionByTxId: exportMemoSuggestions,
        ledgerSuggestionByTxId: exportLedgerSuggestions,
        canRegisterLedgerWithConfidence,
        resolveLedgerCategorySuggestionLabel,
      });
      return buildBankTransactionsExportTable(
        filteredRows,
        {
          transactionAt: L.transactionAt,
          deposit: L.deposit,
          withdrawal: L.withdrawal,
          balance: L.balance,
          description: L.description,
          accountContent: L.accountContent,
          category: L.accountSubject,
          fixedExpense: L.fixedExpenseColumn,
          classification: L.classification,
          matchStatus: L.matchStatus,
          assignFolder: L.assignFolder,
          ledgerSendTo: L.ledgerSendTo,
          unfiled: L.unfiled,
          accountContentPlaceholder: L.accountContentPlaceholder,
        },
        folderMap,
        exportRowDisplayById,
        ledgerCategoryFolder,
      );
    },
    [
      bankTransactions,
      expenseCategories,
      savedBy,
      bankLedgerRules,
      fixedExpenses,
      companyExpenses,
      workers,
      clients,
      ledgerRegistrationContext,
      filteredRows,
      folderMap,
      ledgerCategoryFolder,
      canRegisterLedgerWithConfidence,
      resolveLedgerCategorySuggestionLabel,
    ],
  );

  const renderFolderTreeRows = (
    treeItems: Array<{ folder: BankTransactionFolder; depth: number }>,
    amountLabel: string,
    amountField: "deposits" | "withdrawals",
    activeClass: string,
    inactiveClass: string,
    amountMode: "single" | "both" = "single",
  ) =>
    treeItems.map(({ folder, depth }) => {
      const folderStats = folderStatsById.get(folder.id) ?? { count: 0, deposits: 0, withdrawals: 0 };
      const active = selectedFolderId === folder.id;
      const isCategoryRoot = folder.folderType === "custom" && !folder.parentId;
      const subfolderParentId = folder.isDefault ? "" : folder.id;
      const amountText =
        amountMode === "both"
          ? `${L.deposit} ${formatKRW(folderStats.deposits)} \u00B7 ${L.withdrawal} ${formatKRW(folderStats.withdrawals)}`
          : `${amountLabel} ${formatKRW(folderStats[amountField])}`;
      return (
        <div
          key={folder.id}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
            folder.isDefault
              ? "border-dashed bg-white/90"
              : active
                ? activeClass
                : inactiveClass
          }`}
          style={{ marginLeft: depth * 12 }}
        >
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => {
              setSelectedFolderId(active ? "" : folder.id);
              setFolderScope("all");
            }}
          >
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold text-slate-900">{folder.folderName}</span>
              {folder.isDefault ? (
                <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {L.defaultFolderBadge}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-slate-500">
              {folderStats.count}
              {L.count}
              {" \u00B7 "}
              {amountText}
            </div>
          </button>
          <button
            type="button"
            className="rounded-lg px-1.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100"
            title={folder.isDefault ? L.createFolder : L.createSubfolder}
            onClick={() => openCreateFolderModal(folder.folderType, subfolderParentId)}
          >
            +
          </button>
          {!folder.isDefault && !isCategoryRoot ? (
            <button
              type="button"
              className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              onClick={() => handleDeleteFolder(folder)}
            >
              <Trash2 size={14} />
            </button>
          ) : isCategoryRoot ? (
            <button
              type="button"
              className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              title={L.deleteFolder}
              onClick={() => handleDeleteFolder(folder)}
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      );
    });

  const countSkippedInPreview = importPreview
    ? importPreview.rows.filter((row) =>
        bankTransactions.some(
          (existing) =>
            buildImportFingerprint({
              accountNumber: importPreview.accountNumber || existing.accountNumber,
              transactionAt: row.transactionAt,
              withdrawal: row.withdrawal,
              deposit: row.deposit,
              balanceAfter: row.balanceAfter,
              description: row.description,
            }) ===
            buildImportFingerprint({
              accountNumber: existing.accountNumber,
              transactionAt: existing.transactionAt,
              withdrawal: existing.withdrawal,
              deposit: existing.deposit,
              balanceAfter: existing.balanceAfter,
              description: existing.description,
            })
        )
      ).length
    : 0;

  const resolveFolderSuggestionLabel = (folderType: BankTransactionFolderType) => {
    if (folderType === "client") return L.clientFolders;
    if (folderType === "worker") return L.workerFolders;
    if (folderType === "card") return L.cardFolders;
    return L.classification;
  };

  return (
    <div className={`erp-page erp-bank-transactions-page${taxInvoiceLinkSession ? " erp-bank-transactions-page--tax-link-open" : ""}`}>
      <Card className="erp-bank-hub-card mb-3 rounded-xl shadow-sm">
        <CardContent className="flex flex-col gap-2 p-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="erp-bank-hub-icon erp-bank-hub-icon--slim shrink-0">
              <Landmark size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="erp-text-section font-bold text-slate-900">{L.pageTitle}</h1>
              <p className="mt-0.5 max-w-2xl text-xs leading-snug text-slate-500">{L.pageDesc}</p>
              {hasAnyData ? (
                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                  {"전체 "}
                  {bankTransactions.length}
                  {"건 · 표시 "}
                  {filteredRows.length}
                  {"건"}
                  <BankListRefreshAtSuffix />
                </p>
              ) : null}
              {apiMode ? (
                <div className="mt-2">
                  <BarobillBankSettingsPanel
                    apiMode={apiMode}
                    isAdmin={currentUser?.role === "admin"}
                    onSyncBegin={onBankSyncBegin}
                    onSynced={async (result) => await onBankSynced?.(result)}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-auto sm:items-end">
            {hasAnyData && pageView === "list" ? (
              <TableExportToolbar
                className="erp-bank-header-export"
                getTable={() => null}
                getParsedTable={getBankTransactionsExportParsed}
                fileName={`bank-transactions-${todayISO()}`}
                title={L.pageTitle}
                disabled={!filteredRows.length}
              />
            ) : null}
            <Button
              type="button"
              size="sm"
              className="w-full rounded-xl px-3 shadow-sm sm:w-auto"
              disabled={importLoading}
              onClick={() => ibkInputRef.current?.click()}
            >
              {importLoading ? (
                <Upload size={14} className="mr-1.5 animate-pulse" />
              ) : (
                <FileSpreadsheet size={14} className="mr-1.5" />
              )}
              {L.ibkImport}
            </Button>
          </div>
          <input
            ref={ibkInputRef}
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleIbkFile(file);
              event.target.value = "";
            }}
          />
        </CardContent>
      </Card>

      {importMessage ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 erp-text-body font-semibold text-emerald-700">
          {importMessage}
        </div>
      ) : null}
      {importError ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 erp-text-body font-semibold text-red-600">
          {importError}
        </div>
      ) : null}

      {hasAnyData ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={pageView === "list" ? "default" : "outline"}
            className="rounded-xl"
            onClick={() => setPageView("list")}
          >
            {L.viewList}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={pageView === "reconcile" ? "default" : "outline"}
            className="rounded-xl"
            onClick={() => setPageView("reconcile")}
          >
            {L.viewReconcile}
            {unmatchedDepositCount > 0 ? ` (${unmatchedDepositCount})` : ""}
          </Button>
        </div>
      ) : null}

      {hasAnyData && pageView === "reconcile" ? (
        <Card className="mb-4 rounded-2xl border-blue-200 shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="erp-text-section font-bold text-slate-900">{L.reconcileTitle}</div>
                <p className="mt-1 erp-text-caption text-slate-500">{L.reconcileDesc}</p>
              </div>
              <Button type="button" variant="outline" className="rounded-xl" onClick={confirmHighConfidenceMatches}>
                <Sparkles size={14} className="mr-1" />
                {L.matchBulk}
              </Button>
            </div>

            {depositSuggestions.length ? (
              <div className="space-y-3">
                {depositSuggestions.slice(0, 12).map((item) => {
                  const top = item.candidates[0];
                  if (!top) return null;
                  const tx = item.tx;
                  const isSentStatement = item.kind === "sentStatement";
                  const sentTop = isSentStatement ? (top as SentStatementMatchCandidate) : null;
                  const receivableTop = !isSentStatement ? (top as BankDepositMatchCandidate) : null;
                  return (
                    <div key={tx.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="font-bold text-emerald-700">{formatKRW(tx.deposit)}</div>
                          <div className="text-sm text-slate-700">
                            {formatBankTransactionDateTime(tx.transactionAt)}
                            {" \u00B7 "}
                            {tx.counterpartyName || tx.description}
                          </div>
                        </div>
                        <div className="flex-1 rounded-xl bg-slate-50 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {isSentStatement ? sentTop?.client : receivableTop?.client}
                            </span>
                            {isSentStatement ? (
                              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                                {L.sentStatementMatch}
                              </span>
                            ) : receivableTop?.site ? (
                              <span className="text-sm text-slate-500">{receivableTop.site}</span>
                            ) : null}
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                              {L.matchScore} {top.score}
                            </span>
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {isSentStatement ? (
                              <>
                                {L.statementTotal} {formatKRW(sentTop?.statementTotalAmount || 0)}
                                {" \u00B7 "}
                                {L.sentAt} {String(sentTop?.sentAt || "").slice(0, 10)}
                              </>
                            ) : (
                              <>
                                {L.saleDate} {receivableTop?.saleDate}
                                {" \u00B7 "}
                                {L.unpaidAmount} {formatKRW(receivableTop?.unpaid || 0)}
                                {" \u00B7 "}
                                {receivableTop?.voucherNo || receivableTop?.salesId}
                              </>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{top.reasons.join(" \u00B7 ")}</div>
                          {isSentStatement && sentTop?.paymentStatus === "partial" ? (
                            <div className="mt-1 text-xs font-semibold text-amber-700">
                              {L.partialStatementMatchHint(sentTop.paymentAmount, sentTop.statementRemainingAmount)}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            className="rounded-xl"
                            onClick={() =>
                              isSentStatement
                                ? void confirmSentStatementMatch(tx, sentTop!)
                                : confirmDepositMatch(tx, receivableTop!)
                            }
                          >
                            <Link2 size={14} className="mr-1" />
                            {L.matchConfirm}
                          </Button>
                          <Button type="button" variant="outline" className="rounded-xl" onClick={() => setLinkModalTx(tx)}>
                            {L.matchManual}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-slate-500">{L.matchEmpty}</div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!hasAnyData ? (
        <Card className="mb-4 rounded-2xl border-dashed border-slate-300 shadow-sm">
          <CardContent className="erp-bank-empty-body">
            <div className="erp-bank-empty-icon">
              <Wallet size={28} />
            </div>
            <div className="text-lg font-bold text-slate-900">{L.emptyAll}</div>
            <p className="max-w-md erp-text-body text-slate-500">{L.emptyHint}</p>
            <Button type="button" className="mt-2 rounded-2xl" onClick={() => ibkInputRef.current?.click()}>
              <FileSpreadsheet size={16} className="mr-2" />
              {L.ibkImport}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {hasAnyData && pageView === "list" ? (
        <BankTransactionsListShell
          appliedFilters={appliedFilters}
          filterResetKey={filterResetKey}
          statusCounts={statusCounts}
          accountSummaries={accountSummaries}
          accountSubjectFilterOptions={accountSubjectFilterOptions}
          clients={clients}
          onApplySearch={handleApplySearch}
          onApplyFilters={handleApplyFilters}
          onResetFilters={handleResetFilters}
          rows={filteredRows}
          isListActive={isPageActive && pageView === "list"}
          showEmptyPeriodHint={showEmptyPeriodHint}
          emptyPeriodHint={L.emptyPeriodHint}
          exportFileName={`bank-transactions-${todayISO()}`}
          exportTitle={L.pageTitle}
          accountSubjectLabels={accountSubjectLabels}
          folderMap={folderMap}
          ledgerCategoryFolder={ledgerCategoryFolder}
          companyExpenses={companyExpenses}
          fixedExpensePayments={fixedExpensePayments}
          fixedExpenses={fixedExpenses}
          ledgerCategories={ledgerCategories}
          accountCodes={accountCodes}
          taxInvoices={taxInvoices}
          workers={workers}
          paymentVouchers={paymentVouchers}
          labels={listSectionLabels}
          stats={stats}
          onEditMemo={openMemoModal}
          onEditAccountSubject={openAccountSubjectModal}
          onEditClient={openClientModal}
          onEditFixedExpense={openFixedExpenseModal}
          onFindEvidence={openTaxInvoiceModal}
          onIssueTaxInvoice={setTaxInvoices ? openTaxInvoiceIssueModal : undefined}
          onFilterCounterparty={openCounterpartyDrawer}
          onBatchEvidenceAutoLink={handleBatchEvidenceAutoLink}
          onOpenPreauthNet={openPreauthNetModal}
          onOpenRecurringFixed={openRecurringFixedModal}
          onAutoClassify={runAutoClassify}
          onCreateFixedExpenseItem={openCreateFixedExpenseItem}
          preauthNetActionCount={preauthNetActionCount}
          recurringFixedActionCount={recurringFixedActionCount}
          evidenceAutoMatchLabel={L.evidenceAutoMatch}
          preauthNetOpenLabel={L.preauthNetOpen}
          recurringFixedOpenLabel={L.recurringFixedOpen}
          autoClassifyLabel={L.autoClassify}
          addFixedExpenseLabel={L.addFixedExpense}
          getBankTransactionsExportParsed={getBankTransactionsExportParsed}
        />
      ) : null}

      {importPreview ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setImportPreview(null)}>
          <div
            className="erp-ledger-modal max-w-3xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                  <FileSpreadsheet size={14} />
                  IBK
                </div>
                <h2 className="erp-text-section font-bold">{L.ibkImportTitle}</h2>
                <p className="mt-1 erp-text-caption text-slate-500">{L.ibkImportDesc}</p>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setImportPreview(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4">
                <div className="erp-text-caption text-slate-500">{L.accountNumber}</div>
                <div className="mt-1 font-mono text-lg font-black text-slate-900">{importPreview.accountNumber || "-"}</div>
                {importPreview.accountHolder ? (
                  <div className="mt-2 erp-text-caption text-slate-500">
                    {L.accountHolder}: {importPreview.accountHolder}
                  </div>
                ) : null}
                <div className="mt-2 truncate erp-text-caption text-slate-400">{importPreview.sourceFile}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="erp-text-caption text-slate-500">{L.previewRows}</div>
                <div className="mt-1 text-2xl font-black text-slate-900">
                  {importPreview.rows.length}
                  {L.count}
                </div>
                {countSkippedInPreview > 0 ? (
                  <div className="mt-2 erp-text-caption font-semibold text-amber-700">
                    {countSkippedInPreview}
                    {L.ibkImportSkipped}
                  </div>
                ) : null}
              </div>
            </div>

            {importPreview.latestTransactionAt ? (
              <div className="mb-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-wide text-blue-600">{L.latestTransactionAt}</div>
                <div className="mt-1 text-lg font-black text-slate-900">
                  {formatBankTransactionDateTime(importPreview.latestTransactionAt)}
                </div>
                {importPreview.earliestTransactionAt &&
                importPreview.earliestTransactionAt !== importPreview.latestTransactionAt ? (
                  <div className="mt-1 text-sm text-slate-500">
                    {L.transactionRange}: {formatBankTransactionDateTime(importPreview.earliestTransactionAt)}
                    {" \u2192 "}
                    {formatBankTransactionDateTime(importPreview.latestTransactionAt)}
                  </div>
                ) : null}
              </div>
            ) : null}

            {importPreview.dateFrom || importPreview.dateTo ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                {L.queryPeriod}: {importPreview.dateFrom || "?"} ~ {importPreview.dateTo || "?"}
              </div>
            ) : null}

            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs font-semibold text-emerald-700">{L.previewDeposits}</div>
                  <div className="text-lg font-black text-emerald-700">{formatKRW(importPreview.parsedTotals.deposits)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-red-600">{L.previewWithdrawals}</div>
                  <div className="text-lg font-black text-red-600">{formatKRW(importPreview.parsedTotals.withdrawals)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">{L.previewRows}</div>
                  <div className="text-lg font-black text-slate-900">
                    {importPreview.parsedTotals.count}
                    {L.count}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4 max-h-64 overflow-auto rounded-2xl border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="p-2 text-left">{L.transactionAt}</th>
                    <th className="p-2 text-left">{L.description}</th>
                    <th className="p-2 text-right">{L.deposit}</th>
                    <th className="p-2 text-right">{L.withdrawal}</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.slice(0, 8).map((row, index) => (
                    <tr key={`${row.transactionAt}-${index}`} className="border-t">
                      <td className="p-2 whitespace-nowrap">{formatBankTransactionDateTime(row.transactionAt)}</td>
                      <td className="p-2">{row.description || "-"}</td>
                      <td className="p-2 text-right text-emerald-700">{row.deposit > 0 ? formatKRW(row.deposit) : "-"}</td>
                      <td className="p-2 text-right text-red-600">{row.withdrawal > 0 ? formatKRW(row.withdrawal) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importPreview.errors.length ? (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {importPreview.errors.slice(0, 3).join(" ")}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setImportPreview(null)}>
                {L.cancel}
              </Button>
              <Button type="button" className="rounded-2xl" onClick={confirmImport}>
                <ArrowLeftRight size={16} className="mr-2" />
                {L.ibkImportConfirm}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {clientLinkModalTx ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setClientLinkModalTx(null)}>
          <div
            className="erp-ledger-modal max-w-lg"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                  <Building2 size={14} />
                  {L.clientLinkTitle}
                </div>
                <h2 className="erp-text-section font-bold">{L.clientLinkTitle}</h2>
                <p className="mt-1 erp-text-caption text-slate-500">{L.clientLinkDesc}</p>
                <p className="mt-2 text-sm font-semibold text-emerald-700">
                  {formatKRW(clientLinkModalTx.deposit)}
                  {" \u00B7 "}
                  {formatBankTransactionDateTime(clientLinkModalTx.transactionAt)}
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setClientLinkModalTx(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3">
              <Field label={L.clientLinkDepositSubject}>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
                  {resolveBankDepositMatchSubject(clientLinkModalTx) || "-"}
                </div>
              </Field>
              <Field label={L.clientLinkSelectClient}>
                <AutocompleteInput
                  value={clientLinkClientName}
                  onChange={(value) => setClientLinkClientName(String(value || ""))}
                  options={clientAutocompleteOptions}
                  placeholder={L.clientLinkSelectClient}
                  freeSolo={false}
                  showOptionsOnFocus
                  compact={false}
                  renderSub={(raw) => {
                    const client = raw as { manager?: string; depositNameAliases?: string };
                    const manager = String(client?.manager || "").trim();
                    const aliases = String(client?.depositNameAliases || "").trim();
                    if (!manager && !aliases) return null;
                    return (
                      <span className="text-xs text-slate-500">
                        {[manager, aliases].filter(Boolean).join(" \u00B7 ")}
                      </span>
                    );
                  }}
                />
              </Field>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setClientLinkModalTx(null)}>
                {L.cancel}
              </Button>
              <Button type="button" className="rounded-2xl" onClick={confirmClientDepositLink}>
                <Link2 size={16} className="mr-2" />
                {L.clientLinkSave}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {linkModalTx ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setLinkModalTx(null)}>
          <div
            className="erp-ledger-modal max-w-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="erp-text-section font-bold">{L.selectSentStatement}</h2>
                <p className="mt-1 text-sm text-emerald-700">
                  {formatKRW(linkModalTx.deposit)}
                  {" \u00B7 "}
                  {formatBankTransactionDateTime(linkModalTx.transactionAt)}
                </p>
              </div>
              <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={() => setLinkModalTx(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="max-h-96 space-y-2 overflow-auto">
              {buildSentStatementMatchCandidates(linkModalTx, sentArchives, {
                minScore: 0,
                limit: 30,
                clients,
                paymentVouchers,
                bankTransactions,
              }).map((candidate) => (
                <button
                  key={candidate.pdfArchiveId}
                  type="button"
                  className="w-full rounded-xl border border-violet-200 bg-violet-50/40 px-4 py-3 text-left hover:border-violet-300 hover:bg-violet-50"
                  onClick={() => void confirmSentStatementMatch(linkModalTx, candidate)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{candidate.client}</span>
                    <span className="flex items-center gap-1">
                      {candidate.paymentStatus === "partial" ? <PartialPaymentBadge /> : null}
                      <span className="text-xs font-bold text-violet-700">
                        {L.matchScore} {candidate.score}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {L.statementTotal} {formatKRW(candidate.statementTotalAmount)}
                    {" \u00B7 "}
                    {L.sentAt} {String(candidate.sentAt || "").slice(0, 10)}
                  </div>
                  {candidate.paymentStatus === "partial" ? (
                    <div className="mt-1 text-xs font-semibold text-amber-700">
                      {L.partialStatementMatchHint(candidate.paymentAmount, candidate.statementRemainingAmount)}
                    </div>
                  ) : null}
                </button>
              ))}
              {buildSentStatementMatchCandidates(linkModalTx, sentArchives, {
                minScore: 0,
                limit: 30,
                clients,
                paymentVouchers,
                bankTransactions,
              }).length > 0 &&
              buildBankDepositMatchCandidates(linkModalTx, receivableRows, { minScore: 0, limit: 30, clients }).length > 0 ? (
                <div className="py-2 text-center text-xs font-semibold text-slate-400">{L.selectReceivable}</div>
              ) : null}
              {buildBankDepositMatchCandidates(linkModalTx, receivableRows, { minScore: 0, limit: 30, clients }).map((candidate) => (
                <button
                  key={String(candidate.salesId)}
                  type="button"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50"
                  onClick={() => confirmDepositMatch(linkModalTx, candidate)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{candidate.client}</span>
                    <span className="text-xs font-bold text-blue-700">
                      {L.matchScore} {candidate.score}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {candidate.site || "-"}
                    {" \u00B7 "}
                    {L.unpaidAmount} {formatKRW(candidate.unpaid)}
                    {" \u00B7 "}
                    {candidate.voucherNo || candidate.salesId}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {ledgerModal ? (
        <div className="erp-ledger-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLedgerModal(null); }}>
          <div
            className="erp-ledger-modal max-w-lg"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                  <BookOpen size={14} />
                  {isLedgerEditModal(ledgerModal) ? L.ledgerEditTitle : L.ledgerSendTo}
                </div>
                <h2 className="erp-text-section font-bold">
                  {isLedgerEditModal(ledgerModal) ? L.ledgerEditTitle : L.ledgerRegisterTitle}
                </h2>
                <p className="mt-1 erp-text-caption text-slate-500">
                  {isLedgerEditModal(ledgerModal) ? L.ledgerEditDesc : L.ledgerRegisterDesc}
                </p>
                <p className="mt-2 text-sm font-semibold text-red-600">
                  {formatKRW(ledgerModal.tx.withdrawal)}
                  {" \u00B7 "}
                  {formatBankTransactionDateTime(ledgerModal.tx.transactionAt)}
                </p>
              </div>
              <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={() => setLedgerModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={L.ledgerKind}>
                  <div className="grid grid-cols-2 gap-2">
                    {LEDGER_KIND_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                          ledgerModal.kind === option.key ? option.activeTone : option.tone
                        }`}
                        onClick={() => setLedgerKind(option.key)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              {ledgerModal.kind === "fixed" ? (
                <div className="sm:col-span-2">
                  <Field label={L.ledgerFixedItem}>
                    <AutocompleteInput
                      value={ledgerModal.fixedExpenseId}
                      options={fixedExpenseSelectOptions}
                      placeholder={L.ledgerFixedItem}
                      freeSolo={false}
                      showOptionsOnFocus
                      commitFreeSoloOnBlur
                      keepOpenUntilSelect
                      compact={false}
                      limit={24}
                      inputProps={{ className: "rounded-xl" }}
                      onChange={(value) => {
                        const fixedExpenseId = String(value || "").trim();
                        const fixedItem = fixedExpenses.find((row) => row.id === fixedExpenseId);
                        setLedgerModal((prev) => {
                          if (!prev) return prev;
                          const next = {
                            ...prev,
                            fixedExpenseId,
                            category: fixedItem?.category?.trim() || prev.category,
                            description: prev.description.trim() || fixedItem?.name || prev.description,
                          };
                          if (prev.kind === "fixed" && !isLedgerEditModal(prev)) {
                            Object.assign(
                              next,
                              buildLedgerLinkDefaults(prev.tx, fixedExpenseId, fixedExpensePayments, fixedExpenses),
                            );
                          }
                          return next;
                        });
                      }}
                    />
                  </Field>
                </div>
              ) : null}
              {(!isLedgerEditModal(ledgerModal) || ledgerModal.editExpenseId) &&
              ledgerModal.kind === "fixed" &&
              ledgerLinkablePayments.length ? (
                <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm font-bold text-emerald-900">{L.ledgerLinkExistingTitle}</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-800">
                    {L.ledgerLinkExistingDesc(ledgerLinkablePayments.length)}
                  </p>
                  <div className="mt-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                      <input
                        type="radio"
                        name="ledger-link-mode"
                        checked={ledgerModal.linkMode !== "create"}
                        onChange={() =>
                          setLedgerModal((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  linkMode: "link",
                                  linkPaymentId: ledgerLinkablePayments[0]?.id || "",
                                }
                              : prev,
                          )
                        }
                      />
                      {L.ledgerLinkModeLink}
                    </label>
                    {ledgerModal.linkMode !== "create" && ledgerLinkablePayments.length > 1 ? (
                      <select
                        className="erp-input w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                        value={ledgerModal.linkPaymentId || ledgerLinkablePayments[0]?.id || ""}
                        onChange={(event) =>
                          setLedgerModal((prev) =>
                            prev ? { ...prev, linkMode: "link", linkPaymentId: event.target.value } : prev,
                          )
                        }
                      >
                        {ledgerLinkablePayments.map((payment) => {
                          const fixedItem = fixedExpenses.find((row) => row.id === payment.fixedExpenseId);
                          const label = `${payment.date} · ${formatKRW(payment.amount)}\uC6D0${
                            payment.memo ? ` · ${payment.memo}` : fixedItem?.name ? ` · ${fixedItem.name}` : ""
                          }`;
                          return (
                            <option key={payment.id} value={payment.id}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                    ) : null}
                    <label className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                      <input
                        type="radio"
                        name="ledger-link-mode"
                        checked={ledgerModal.linkMode === "create"}
                        onChange={() =>
                          setLedgerModal((prev) =>
                            prev ? { ...prev, linkMode: "create", linkPaymentId: "" } : prev,
                          )
                        }
                      />
                      {L.ledgerLinkModeCreate}
                    </label>
                  </div>
                </div>
              ) : null}
              <Field label={L.ledgerDate}>
                <KoreanDateInput value={ledgerModal.date} onChange={(event) => setLedgerModal((prev) => (prev ? { ...prev, date: event.target.value } : prev))} />
              </Field>
              {ledgerModal.kind === "manual" ? (
                <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                  <span className="font-semibold text-slate-600">{L.accountSubject}: </span>
                  <span className="font-bold text-slate-900">
                    {formatTxAccountSubjectLabel(ledgerModal.tx, accountCodes, accountSubjectLabels) ||
                      L.accountSubjectPlaceholder}
                  </span>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{L.ledgerSaveManualHint}</p>
                </div>
              ) : (
                <p className="sm:col-span-2 text-xs font-semibold text-slate-500">{L.ledgerSaveFixedHint}</p>
              )}
              <div className="sm:col-span-2">
                <Field label={L.ledgerDescription}>
                  <input
                    className="erp-input w-full rounded-xl"
                    value={ledgerModal.description}
                    onChange={(event) => setLedgerModal((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
                  />
                </Field>
              </div>
              <Field label={L.ledgerAmount}>
                <input
                  className="erp-input w-full rounded-xl"
                  inputMode="numeric"
                  value={ledgerModal.amount}
                  onChange={(event) => setLedgerModal((prev) => (prev ? { ...prev, amount: event.target.value } : prev))}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label={L.ledgerMemo}>
                  <BufferedTextInput
                    value={ledgerModal.memo}
                    className="w-full rounded-xl"
                    onDraftChange={(next) => {
                      ledgerMemoDraftRef.current = next;
                    }}
                  />
                </Field>
              </div>
            </div>

            {ledgerFormError ? <p className="mt-3 text-sm font-semibold text-red-600">{ledgerFormError}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setLedgerModal(null)}>
                {L.cancel}
              </Button>
              <Button type="button" className="rounded-2xl" onClick={saveLedgerRegister}>
                <BookOpen size={16} className="mr-2" />
                {isLedgerKindSwitch(ledgerModal)
                  ? ledgerModal.kind === "fixed"
                    ? ledgerModal.linkMode !== "create" && ledgerLinkablePayments.length
                      ? L.ledgerSaveLink
                      : L.ledgerKindChangeSaveFixed
                    : L.ledgerKindChangeSaveManual
                  : isLedgerEditModal(ledgerModal)
                    ? L.ledgerEditSave
                    : ledgerModal.kind === "fixed" &&
                        ledgerModal.linkMode !== "create" &&
                        ledgerLinkablePayments.length
                      ? L.ledgerSaveLink
                      : L.ledgerSave}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {preauthNetModalOpen ? (
        <div
          className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreauthNetModalOpen(false);
          }}
        >
          <div
            className="erp-ledger-modal max-w-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={L.preauthNetTitle}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="erp-text-section font-bold">{L.preauthNetTitle}</h2>
                <p className="mt-1 erp-text-caption text-slate-500">{L.preauthNetDesc}</p>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setPreauthNetModalOpen(false)}
                aria-label={L.cancel}
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[min(420px,60vh)] space-y-2 overflow-y-auto pr-1">
              {preauthNetGroups.map((group) => {
                const key = preauthNetGroupKey(group);
                const checked = selectedPreauthGroupKeys.includes(key);
                return (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                      checked ? "border-violet-300 bg-violet-50/70" : "border-slate-200 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => togglePreauthNetGroup(key)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900">
                        {L.preauthNetPattern(
                          group.counterpartyName,
                          group.date,
                          group.preauthAmount,
                          group.settlementAmount,
                        )}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        {formatBankTransactionDateTime(group.preauthWithdrawalTx.transactionAt)} \u2192{" "}
                        {formatBankTransactionDateTime(group.refundTx.transactionAt)}
                        {group.settlementTx
                          ? ` \u2192 ${formatBankTransactionDateTime(group.settlementTx.transactionAt)}`
                          : ""}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={learnPreauthMerchants}
                onChange={(event) => setLearnPreauthMerchants(event.target.checked)}
              />
              {L.preauthNetLearn}
            </label>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setPreauthNetModalOpen(false)}>
                {L.cancel}
              </Button>
              <Button
                type="button"
                className="rounded-2xl"
                disabled={!selectedPreauthGroupKeys.length}
                onClick={applyPreauthNet}
              >
                <ArrowLeftRight size={16} className="mr-2" />
                {L.preauthNetApply}
                {selectedPreauthGroupKeys.length ? ` (${selectedPreauthGroupKeys.length})` : ""}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {recurringFixedModalOpen ? (
        <div
          className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRecurringFixedModalOpen(false);
          }}
        >
          <div
            className="erp-ledger-modal max-w-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={L.recurringFixedTitle}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="erp-text-section font-bold">{L.recurringFixedTitle}</h2>
                <p className="mt-1 erp-text-caption text-slate-500">{L.recurringFixedDesc}</p>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setRecurringFixedModalOpen(false)}
                aria-label={L.cancel}
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[min(420px,60vh)] space-y-2 overflow-y-auto pr-1">
              {recurringFixedPatterns.map((pattern) => {
                const checked = selectedRecurringPatternKeys.includes(pattern.key);
                return (
                  <label
                    key={pattern.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                      checked ? "border-amber-300 bg-amber-50/70" : "border-slate-200 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggleRecurringPattern(pattern.key)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900">
                        {L.recurringFixedPattern(
                          pattern.name,
                          pattern.paymentDayOfMonth,
                          pattern.amount,
                          pattern.monthCount,
                          pattern.transactions.length,
                          pattern.daySpread,
                          pattern.amountFlexible,
                        )}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        {pattern.monthKeys.join(", ")}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-amber-700">
                        {pattern.existingFixedExpenseId ? L.recurringFixedExisting : L.recurringFixedNew}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setRecurringFixedModalOpen(false)}>
                {L.cancel}
              </Button>
              <Button
                type="button"
                className="rounded-2xl"
                disabled={!selectedRecurringPatternKeys.length}
                onClick={applyRecurringFixed}
              >
                <Repeat size={16} className="mr-2" />
                {L.recurringFixedApply}
                {selectedRecurringPatternKeys.length ? ` (${selectedRecurringPatternKeys.length})` : ""}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {ledgerReviewPrompt ? (
        <div
          className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) skipLedgerReviewPrompt();
          }}
        >
          <div
            className="erp-ledger-modal max-w-lg"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={L.categoryPromptTitle}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                  <BookOpen size={14} />
                  {L.categoryPromptTitle}
                </div>
                <p className="mt-1 erp-text-caption text-slate-500">{L.categoryPromptDesc}</p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {L.categoryPromptPattern(ledgerReviewPrompt.label, ledgerReviewPrompt.transactions.length)}
                </p>
                {ledgerReviewPrompt.transactions[0] ? (
                  <p className="mt-1 text-sm font-semibold text-red-600">
                    {formatKRW(ledgerReviewPrompt.transactions[0].withdrawal)}
                    {" \u00B7 "}
                    {formatBankTransactionDateTime(ledgerReviewPrompt.transactions[0].transactionAt)}
                  </p>
                ) : null}
                {ledgerReviewPrompt.suggestionLabel && ledgerReviewPrompt.suggestionConfidence ? (
                  <p className="mt-1 text-xs font-semibold text-sky-700">
                    {L.categoryPromptSuggestion(
                      ledgerReviewPrompt.suggestionLabel,
                      ledgerReviewPrompt.suggestionConfidence,
                    )}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={skipLedgerReviewPrompt}
                aria-label={L.categoryPromptSkip}
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={L.ledgerKind}>
                  <div className="grid grid-cols-2 gap-2">
                    {LEDGER_KIND_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                          ledgerReviewPrompt.kind === option.key ? option.activeTone : option.tone
                        }`}
                        onClick={() => setReviewPromptKind(option.key)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              {ledgerReviewPrompt.kind === "fixed" ? (
                <div className="sm:col-span-2">
                  <Field label={L.ledgerFixedItem}>
                    <AutocompleteInput
                      value={ledgerReviewPrompt.fixedExpenseId}
                      options={fixedExpenseSelectOptions}
                      placeholder={L.ledgerFixedItem}
                      freeSolo={false}
                      showOptionsOnFocus
                      commitFreeSoloOnBlur
                      keepOpenUntilSelect
                      compact={false}
                      limit={24}
                      inputProps={{ className: "rounded-xl" }}
                      onChange={(value) => {
                        const fixedExpenseId = String(value || "").trim();
                        const fixedItem = fixedExpenses.find((row) => row.id === fixedExpenseId);
                        setLedgerReviewPrompt((prev) => {
                          if (!prev) return prev;
                          const next = {
                            ...prev,
                            fixedExpenseId,
                            category: fixedItem?.category?.trim() || prev.category,
                            description: prev.description.trim() || fixedItem?.name || prev.description,
                          };
                          Object.assign(
                            next,
                            buildLedgerLinkDefaults(
                              prev.transactions[0],
                              fixedExpenseId,
                              fixedExpensePayments,
                              fixedExpenses,
                            ),
                          );
                          return next;
                        });
                        setLedgerReviewPromptError("");
                      }}
                    />
                  </Field>
                </div>
              ) : null}
              {ledgerReviewPrompt.kind === "fixed" && reviewLinkablePayments.length ? (
                <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm font-bold text-emerald-900">{L.ledgerLinkExistingTitle}</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-800">
                    {L.ledgerLinkExistingDesc(reviewLinkablePayments.length)}
                  </p>
                  <div className="mt-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                      <input
                        type="radio"
                        name="review-ledger-link-mode"
                        checked={ledgerReviewPrompt.linkMode !== "create"}
                        onChange={() =>
                          setLedgerReviewPrompt((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  linkMode: "link",
                                  linkPaymentId: reviewLinkablePayments[0]?.id || "",
                                }
                              : prev,
                          )
                        }
                      />
                      {L.ledgerLinkModeLink}
                    </label>
                    {ledgerReviewPrompt.linkMode !== "create" && reviewLinkablePayments.length > 1 ? (
                      <select
                        className="erp-input w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold text-slate-900"
                        value={ledgerReviewPrompt.linkPaymentId || reviewLinkablePayments[0]?.id || ""}
                        onChange={(event) =>
                          setLedgerReviewPrompt((prev) =>
                            prev ? { ...prev, linkMode: "link", linkPaymentId: event.target.value } : prev,
                          )
                        }
                      >
                        {reviewLinkablePayments.map((payment) => {
                          const fixedItem = fixedExpenses.find((row) => row.id === payment.fixedExpenseId);
                          const label = `${payment.date} · ${formatKRW(payment.amount)}\uC6D0${
                            payment.memo ? ` · ${payment.memo}` : fixedItem?.name ? ` · ${fixedItem.name}` : ""
                          }`;
                          return (
                            <option key={payment.id} value={payment.id}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                    ) : null}
                    <label className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                      <input
                        type="radio"
                        name="review-ledger-link-mode"
                        checked={ledgerReviewPrompt.linkMode === "create"}
                        onChange={() =>
                          setLedgerReviewPrompt((prev) =>
                            prev ? { ...prev, linkMode: "create", linkPaymentId: "" } : prev,
                          )
                        }
                      />
                      {L.ledgerLinkModeCreate}
                    </label>
                  </div>
                </div>
              ) : null}
              <Field label={L.ledgerDate}>
                <KoreanDateInput
                  value={ledgerReviewPrompt.date}
                  onChange={(event) =>
                    setLedgerReviewPrompt((prev) => (prev ? { ...prev, date: event.target.value } : prev))
                  }
                />
              </Field>
              {ledgerReviewPrompt.kind === "manual" ? (
                <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                  <span className="font-semibold text-slate-600">{L.accountSubject}: </span>
                  <span className="font-bold text-slate-900">
                    {formatTxAccountSubjectLabel(
                      ledgerReviewPrompt.transactions[0]!,
                      accountCodes,
                      accountSubjectLabels,
                    ) || L.accountSubjectPlaceholder}
                  </span>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <Field label={L.ledgerDescription}>
                  <input
                    className="erp-input w-full rounded-xl"
                    value={ledgerReviewPrompt.description}
                    onChange={(event) =>
                      setLedgerReviewPrompt((prev) =>
                        prev ? { ...prev, description: event.target.value } : prev,
                      )
                    }
                  />
                </Field>
              </div>
              <Field label={L.ledgerAmount}>
                <input
                  className="erp-input w-full rounded-xl"
                  inputMode="numeric"
                  value={ledgerReviewPrompt.amount}
                  onChange={(event) =>
                    setLedgerReviewPrompt((prev) => (prev ? { ...prev, amount: event.target.value } : prev))
                  }
                />
              </Field>
              <Field label={L.ledgerMemo}>
                <BufferedTextInput
                  value={ledgerReviewPrompt.memo}
                  className="w-full rounded-xl"
                  onDraftChange={(next) => {
                    ledgerReviewMemoDraftRef.current = next;
                  }}
                />
              </Field>
            </div>

            {ledgerReviewPromptError ? (
              <p className="mt-3 text-sm font-semibold text-red-600">{ledgerReviewPromptError}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={skipLedgerReviewPrompt}>
                {L.categoryPromptSkip}
              </Button>
              <Button type="button" className="rounded-2xl" onClick={saveLedgerReviewPrompt}>
                <BookOpen size={16} className="mr-2" />
                {L.categoryPromptSave}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {createFolderOpen ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setCreateFolderOpen(false)}>
          <div
            className="erp-ledger-modal max-w-md"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="erp-text-section font-bold">{L.createFolder}</h2>
              <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={() => setCreateFolderOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <Field label={L.folderType}>
                <select
                  className="erp-input w-full rounded-xl"
                  value={newFolderType}
                  onChange={(event) => {
                    setNewFolderType(event.target.value as BankTransactionFolderType);
                    setNewFolderParentId("");
                  }}
                >
                  <option value="client">{L.clientFolders}</option>
                  <option value="card">{L.cardFolders}</option>
                  <option value="worker">{L.workerFolders}</option>
                  {newFolderType === "custom" ? (
                    <option value="custom">{getBankTransactionFolderLabel("custom")}</option>
                  ) : null}
                </select>
              </Field>
              <Field label={L.parentFolder}>
                <select
                  className="erp-input w-full rounded-xl"
                  value={newFolderParentId}
                  onChange={(event) => setNewFolderParentId(event.target.value)}
                >
                  <option value="">{L.parentFolderSectionRoot(getBankTransactionFolderLabel(newFolderType))}</option>
                  {parentFolderOptions.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {formatFolderSelectLabel(folder)}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="text-xs text-slate-500">{L.parentFolderHint}</p>
              <Field label={L.folderName}>
                <input
                  className="erp-input w-full rounded-xl"
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  placeholder={newFolderType === "client" ? "\uC608: \uD0DC\uAD11, \uB86F\uB370\uCE74\uB4DC" : "\uC608: \uC2E0\uD765\uC219, \uBB38\uC815\uD559"}
                />
              </Field>
              {folderError ? <div className="text-sm font-semibold text-red-600">{folderError}</div> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setCreateFolderOpen(false)}>
                {L.cancel}
              </Button>
              <Button type="button" className="rounded-2xl" onClick={handleCreateFolder}>
                <FolderPlus size={16} className="mr-2" />
                {L.saveFolder}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {accountContentModal ? (
        <div
          className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAccountContentModal(null);
          }}
        >
          <div
            className="erp-ledger-modal max-w-lg"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={L.editMemoTitle}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="erp-text-section font-bold">{L.editMemoTitle}</h2>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setAccountContentModal(null)}
                aria-label={L.cancel}
              >
                <X size={18} />
              </button>
            </div>
            <Field label={L.memo}>
              <BufferedTextInput
                value={accountContentModal.draft}
                className="w-full rounded-xl"
                onDraftChange={(next) => setAccountContentModal((prev) => (prev ? { ...prev, draft: next } : prev))}
              />
            </Field>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setAccountContentModal(null)}>
                {L.cancel}
              </Button>
              <Button type="button" className="rounded-2xl" onClick={saveAccountContentModal}>
                {L.detailSave}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {accountSubjectPicker ? (
        <AccountSubjectPickerPopover
          triggerId={accountSubjectPicker.txId}
          selectedCode={accountSubjectPicker.selectedCode}
          items={accountPickerFlatItemsByFlow[accountSubjectPicker.flow]}
          labels={accountSubjectPickerLabels}
          onSelect={handleAccountSubjectPickerSelect}
          onClose={closeAccountSubjectPicker}
          onAddAccount={onNavigateToClassify ? handleNavigateToClassifyFromPicker : undefined}
        />
      ) : null}

      {fixedExpenseModal ? (
        <div
          className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFixedExpenseModal(null);
          }}
        >
          <div
            className="erp-ledger-modal max-w-lg"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={L.editFixedExpenseTitle}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="erp-text-section font-bold">{L.editFixedExpenseTitle}</h2>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setFixedExpenseModal(null)}
                aria-label={L.cancel}
              >
                <X size={18} />
              </button>
            </div>
            <Field label={L.fixedExpenseColumn}>
              <select
                className="erp-input w-full rounded-xl"
                value={fixedExpenseModal.draft}
                onChange={(event) => {
                  setTxCellModalError("");
                  setFixedExpenseModal((prev) => (prev ? { ...prev, draft: event.target.value } : prev));
                }}
              >
                <option value="">{L.fixedExpensePlaceholder}</option>
                {fixedExpenseSelectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            {txCellModalError ? <p className="mt-3 text-sm font-semibold text-red-600">{txCellModalError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setFixedExpenseModal(null)}>
                {L.cancel}
              </Button>
              <Button type="button" className="rounded-2xl" onClick={saveFixedExpenseModal}>
                {L.detailSave}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {clientModal ? (
        <div
          className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setClientModal(null);
          }}
        >
          <div
            className="erp-ledger-modal max-w-lg"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={L.editClientTitle}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="erp-text-section font-bold">{L.editClientTitle}</h2>
              <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={() => setClientModal(null)}>
                <X size={18} />
              </button>
            </div>
            <Field label={L.clientColumn}>
              <AutocompleteInput
                value={clientModal.draft}
                onChange={(value) => {
                  setTxCellModalError("");
                  setClientModal((prev) => (prev ? { ...prev, draft: String(value || "") } : prev));
                }}
                options={clientModalAutocompleteOptions}
                placeholder={L.clientPlaceholder}
                freeSolo={false}
                showOptionsOnFocus
                compact={false}
                limit={20}
                renderSub={(raw) => {
                  const client = raw as { manager?: string; depositNameAliases?: string };
                  const manager = String(client?.manager || "").trim();
                  const aliases = String(client?.depositNameAliases || "").trim();
                  if (!manager && !aliases) return null;
                  return (
                    <span className="text-xs text-slate-500">
                      {[manager, aliases].filter(Boolean).join(" \u00B7 ")}
                    </span>
                  );
                }}
              />
            </Field>
            {txCellModalError ? <p className="mt-3 text-sm font-semibold text-red-600">{txCellModalError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setClientModal(null)}>
                {L.cancel}
              </Button>
              <Button type="button" className="rounded-2xl" onClick={saveClientModal}>
                {L.detailSave}
              </Button>
            </div>
          </div>
        </div>
      ) : null}


      {counterpartyDrawer ? (
        <BankCounterpartyTransactionsDrawer
          counterpartyLabel={counterpartyDrawer.label}
          rows={counterpartyDrawerRows}
          onClose={() => setCounterpartyDrawer(null)}
          accountSubjectLabels={accountSubjectLabels}
          folderMap={folderMap}
          ledgerCategoryFolder={ledgerCategoryFolder}
          companyExpenses={companyExpenses}
          fixedExpensePayments={fixedExpensePayments}
          fixedExpenses={fixedExpenses}
          ledgerCategories={ledgerCategories}
          accountCodes={accountCodes}
          taxInvoices={taxInvoices}
          clients={clients}
          workers={workers}
          paymentVouchers={paymentVouchers}
          labels={listSectionLabels}
          onEditMemo={openMemoModal}
          onEditAccountSubject={openAccountSubjectModal}
          onEditClient={openClientModal}
          onEditFixedExpense={openFixedExpenseModal}
          onFindEvidence={openTaxInvoiceModal}
          onIssueTaxInvoice={setTaxInvoices ? openTaxInvoiceIssueModal : undefined}
        />
      ) : null}

      {taxInvoiceIssueTx && setTaxInvoices ? (
        <BankTaxInvoiceIssueModal
          tx={taxInvoiceIssueTx}
          clients={clients}
          currentUser={currentUser}
          companyProfile={companyProfile}
          erpVersion={erpVersion}
          taxInvoices={taxInvoices}
          setTaxInvoices={setTaxInvoices}
          onClose={() => setTaxInvoiceIssueTx(null)}
          onIssued={handleTaxInvoiceIssued}
        />
      ) : null}

      <CompanyLedgerFixedExpenseModalLayer
        ref={fixedExpenseItemModalRef}
        fixedExpenses={fixedExpenses}
        setFixedExpenses={setFixedExpenses}
        fixedExpenseCategories={fixedExpenseCategories}
        setFixedExpenseCategories={setFixedExpenseCategories}
        fixedExpensePayments={fixedExpensePayments}
        setFixedExpensePayments={setFixedExpensePayments}
        bankTransactions={bankTransactions}
        setBankTransactions={setBankTransactions}
        setBankLedgerRules={setBankLedgerRules}
        currentUser={currentUser}
        onOpenBankLinkView={() => {}}
        onRequestImmediateSave={onRequestImmediateSave}
      />

    </div>
  );
}

type BankTransactionsPageProps = React.ComponentProps<typeof BankTransactionsPageComponent>;

const BANK_PAGE_DATA_PROP_KEYS = [
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

const BANK_PAGE_HANDLER_PROP_KEYS = [
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

function bankTransactionsPagePropsAreEqual(
  prev: BankTransactionsPageProps,
  next: BankTransactionsPageProps,
): boolean {
  if (prev.isPageActive !== next.isPageActive) return false;
  if (prev.apiMode !== next.apiMode) return false;

  for (const key of BANK_PAGE_DATA_PROP_KEYS) {
    if (prev[key] !== next[key]) return false;
  }
  for (const key of BANK_PAGE_HANDLER_PROP_KEYS) {
    if (prev[key] !== next[key]) return false;
  }

  return true;
}

export const BankTransactionsPage = memo(BankTransactionsPageComponent, bankTransactionsPagePropsAreEqual);
