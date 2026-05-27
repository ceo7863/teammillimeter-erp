import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  CreditCard,
  FileSpreadsheet,
  FolderPlus,
  HardHat,
  Landmark,
  Link2,
  ListChecks,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { TableExportSection } from "@/components/TableExportSection";
import { DesktopTableWrap, MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import { useAudit } from "@/context/AuditContext";
import { confirmDelete } from "@/utils/confirmDelete";
import { CLIENT_AUDIT_FIELDS, snapshotClientForAudit } from "@/utils/auditLog";
import { appendDepositNameAlias, resolveBankDepositMatchSubject } from "@/utils/clientDepositAliases";
import { formatKRW, monthRangeISO, todayISO, makeLedgerId, mergeExpenseCategory, parseLedgerAmount, validateCompanyExpenseInput, validateFixedExpensePaymentInput, type CompanyExpense, type FixedExpense, type FixedExpensePayment } from "@/utils/companyLedger";
import {
  autoApplyBankLearnRules,
  buildBankLedgerMatchRuleFromRegistration,
  buildBankLearnRuleFromFolderAssignment,
  buildBankLearnRuleFromManualRegistration,
  buildCompanyExpensePrefillFromBankTransaction,
  canRegisterBankTxToCompanyLedger,
  formatBankLearnAutoMessage,
  parseLedgerTargetKey,
  resolveLedgerTargetForBankTransaction,
  upsertBankLearnRule,
  type BankLearnRule,
} from "@/utils/bankCompanyLedger";
import { AutocompleteInput, AutocompleteSelect } from "@/components/AutocompleteInput";
import { createPaymentInputLogsFromVouchers } from "@/utils/paymentInputLogs";
import type { ReceivableRow } from "@/utils/receivables";
import type { ErpUser } from "@/utils/erpApi";
import {
  buildAllBankDepositSuggestions,
  buildBankDepositMatchCandidates,
  createPaymentVoucherFromBankMatch,
  getBankMatchStatusLabel,
  type BankDepositMatchCandidate,
} from "@/utils/bankReceivableMatch";
import {
  buildAllSentStatementDepositSuggestions,
  buildSentStatementMatchCandidates,
  createPaymentVouchersFromSentStatementMatch,
  type SentStatementMatchCandidate,
} from "@/utils/bankSentStatementMatch";
import { listSentStatementArchives, updatePdfArchiveMeta, type PdfArchiveMeta } from "@/utils/pdfArchive";
import { DEFAULT_CLIENT_FOLDER_ID, DEFAULT_CARD_SALES_FOLDER_ID, isCardCompanyDeposit } from "@/utils/bankTransactionFolders";
import {
  buildBankAccountSummaries,
  buildBankTransactionStats,
  buildImportFingerprint,
  buildTopCounterpartySummaries,
  filterBankTransactions,
  formatBankTransactionDateTime,
  sortBankTransactions,
  type BankTransaction,
  type BankTransactionFlowFilter,
} from "@/utils/bankTransactions";
import {
  mergeIbkBankImport,
  parseIbkBankFile,
  type IbkBankImportPreview,
} from "@/utils/ibkBankImport";
import {
  UNFILED_FOLDER_KEY,
  autoClassifyBankTransactions,
  buildBankTransactionFolderStats,
  clearBankTransactionFolderReferences,
  createBankTransactionFolder,
  getBankTransactionFolderTone,
  listFoldersByType,
  removeBankTransactionFolder,
  type BankTransactionFolder,
  type BankTransactionFolderType,
} from "@/utils/bankTransactionFolders";

type PeriodKey = "thisMonth" | "lastMonth" | "all" | "custom";
type DateFilter = { startDate: string; endDate: string };
type FolderScope = "all" | "client" | "card" | "worker" | "unfiled";
type PageView = "list" | "reconcile";

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: "thisMonth", label: "\uC774\uBC88 \uB2EC" },
  { key: "lastMonth", label: "\uC9C0\uB09C \uB2EC" },
  { key: "all", label: "\uC804\uCCB4" },
];

const FLOW_FILTER_OPTIONS: Array<{ key: BankTransactionFlowFilter; label: string; tone: string }> = [
  { key: "all", label: "\uC804\uCCB4", tone: "bg-slate-900 text-white" },
  { key: "deposit", label: "\uC785\uAE08", tone: "bg-emerald-600 text-white" },
  { key: "withdrawal", label: "\uCD9C\uAE08", tone: "bg-red-600 text-white" },
];

type LedgerRegisterKind = "fixed" | "manual";

const LEDGER_KIND_OPTIONS: Array<{ key: LedgerRegisterKind; label: string; tone: string; activeTone: string }> = [
  { key: "manual", label: "\uB2E8\uC21C\uC9C0\uCD9C", tone: "border-slate-200 bg-white text-slate-600", activeTone: "border-slate-900 bg-slate-900 text-white" },
  { key: "fixed", label: "\uACE0\uC815\uBE44", tone: "border-slate-200 bg-white text-slate-600", activeTone: "border-amber-600 bg-amber-600 text-white" },
];

const L = {
  pageTitle: "\uD1B5\uC7A5 \uAC70\uB798\uB0B4\uC5ED",
  pageDesc: "IBK \uAE30\uC5C5\uC740\uD589 \uAC70\uB798\uB0B4\uC870 \uC5D1\uC140\uC744 \uAC00\uC838\uC640 \uC785\uCD9C\uAE08 \uD750\uB984\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.",
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
  empty: "\uC870\uD68C \uC870\uAC74\uC5D0 \uB9DE\uB294 \uAC70\uB798\uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyAll: "\uC544\uC9C1 \uAC00\uC838\uC628 \uAC70\uB798\uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyHint: "IBK \uC778\uD130\uB137\uB1B9\uD0B9 \u2192 \uACC4\uC88C\uC870\uD68C \u2192 \uAC70\uB798\uB0B4\uC5ED \uC870\uD68C \u2192 \uC5D1\uC140 \uB2E4\uC6B4\uB85C\uB4DC \uD6C4 \uAC00\uC838\uC624\uAE30\uB97C \uB20C\uB7EC\uC8FC\uC138\uC694.",
  count: "\uAC74",
  periodStart: "\uC2DC\uC791\uC77C",
  periodEnd: "\uC885\uB8CC\uC77C",
  resetFilter: "\uCD08\uAE30\uD654",
  accountFilter: "\uACC4\uC88C",
  allAccounts: "\uC804\uCCB4 \uACC4\uC88C",
  depositTotal: "\uC785\uAE08 \uD569\uACC4",
  withdrawalTotal: "\uCD9C\uAE08 \uD569\uACC4",
  netTotal: "\uC21C\uC720\uC785",
  transactionAt: "\uAC70\uB798\uC77C\uC2DC",
  deposit: "\uC785\uAE08",
  withdrawal: "\uCD9C\uAE08",
  balance: "\uC794\uC561",
  description: "\uAC70\uB798\uB0B4\uC6A9",
  counterpartyName: "\uC0C1\uB300\uC608\uAE08\uC8FC",
  counterpartyBank: "\uC0C1\uB300\uC740\uD589",
  transactionType: "\uAC70\uB798\uAD6C\uBD84",
  accountNumber: "\uACC4\uC88C\uBC88\uD638",
  accountHolder: "\uC608\uAE08\uC8FC",
  queryPeriod: "\uC870\uD68C \uAE30\uAC04",
  latestTransactionAt: "\uCD5C\uC2E0 \uAC70\uB798\uC77C\uC2DC",
  dataAsOf: "\uB370\uC774\uD130 \uAE30\uC900",
  transactionRange: "\uAC70\uB798 \uAE30\uAC04",
  cancel: "\uCDE8\uC18C",
  periodLabel: "\uAE30\uAC04",
  flowLabel: "\uAD6C\uBD84",
  latestBalance: "\uCD5C\uC2E0 \uC794\uC561",
  topCounterparties: "\uC8FC\uC694 \uAC70\uB798\uCC98",
  flowRatio: "\uC785\uCD9C\uAE08 \uBE44\uC728",
  filteredSummary: "\uC120\uD0DD \uAE30\uAC04 \uC694\uC57D",
  foldersTitle: "\uBD84\uB958 \uD3F4\uB354",
  foldersHint: "\uAC70\uB798\uCC98 \uC785\uAE08\uACFC \uC2DC\uACF5\uC790 \uC9C0\uCD9C\uC744 \uD3F4\uB354\uB85C \uB098\uB204\uACE0 \uAC01 \uAC70\uB798\uB97C \uB123\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  clientFolders: "\uAC70\uB798\uCC98 \uC785\uAE08",
  cardFolders: "\uCE74\uB4DC\uB9E4\uCD9C",
  workerFolders: "\uC2DC\uACF5\uC790 \uC9C0\uCD9C",
  unfiled: "\uBBF8\uBD84\uB958",
  allFolders: "\uC804\uCCB4 \uBAA9\uB85D",
  createFolder: "\uD3F4\uB354 \uC0DD\uC131",
  folderName: "\uD3F4\uB354 \uC774\uB984",
  folderType: "\uD3F4\uB354 \uAD6C\uBD84",
  saveFolder: "\uC0DD\uC131",
  deleteFolder: "\uD3F4\uB354 \uC0AD\uC81C",
  deleteFolderConfirm: "\uD3F4\uB354\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694? \uC548\uC758 \uAC70\uB798\uB294 \uBBF8\uBD84\uB958\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4.",
  assignFolder: "\uD3F4\uB354",
  memo: "\uBA54\uBAA8",
  memoPlaceholder: "\uBA54\uBAA8 \uC785\uB825",
  classification: "\uBD84\uB958",
  linkedSubject: "\uC5F0\uACB0 \uC774\uB984",
  autoClassify: "\uC790\uB3D9 \uBD84\uB958",
  autoClassifyDone: "\uAC74\uC744 \uC790\uB3D9 \uBD84\uB958\uD588\uC2B5\uB2C8\uB2E4.",
  folderScopeClient: "\uAC70\uB798\uCC98",
  folderScopeCard: "\uCE74\uB4DC\uB9E4\uCD9C",
  folderScopeWorker: "\uC2DC\uACF5\uC790",
  viewList: "\uAC70\uB798 \uBAA9\uB85D",
  viewReconcile: "\uC785\uAE08 \uB300\uC0AC",
  reconcileTitle: "\uD1B5\uC7A5 \uC785\uAE08 \u2194 \uBBF8\uC218\uAE08 \uC5F0\uACB0",
  reconcileDesc: "\uAC70\uB798\uCC98\uBA85\u00B7\uAE08\uC561\u00B7\uC785\uAE08\uC77C\uC744 \uAE30\uC900\uC73C\uB85C \uBBF8\uC218 \uB9E4\uCD9C\uACFC \uC785\uAE08 \uC804\uD45C\uB97C \uC790\uB3D9 \uCD94\uCC9C\uD569\uB2C8\uB2E4.",
  matchScore: "\uC77C\uCE58\uB3C4",
  matchConfirm: "\uC785\uAE08 \uC5F0\uACB0",
  matchManual: "\uC9C1\uC811 \uC120\uD0DD",
  matchDone: "\uC785\uAE08 \uC804\uD45C\uAC00 \uC0DD\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  matchBulk: "\uACE0\uC2E0\uB8B0 \uC790\uB3D9 \uC5F0\uACB0",
  matchBulkDone: "\uAC74\uC744 \uC790\uB3D9 \uC785\uAE08 \uC5F0\uACB0\uD588\uC2B5\uB2C8\uB2E4.",
  matchEmpty: "\uCD94\uCC9C\uD560 \uBBF8\uC5F0\uACB0 \uC785\uAE08\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  matchStatus: "\uBBF8\uC218 \uC5F0\uACB0",
  linkedSale: "\uC5F0\uACB0 \uB9E4\uCD9C",
  saleDate: "\uB9E4\uCD9C\uC77C",
  unpaidAmount: "\uBBF8\uC218\uAE08",
  selectReceivable: "\uBBF8\uC218 \uB9E4\uCD9C \uC120\uD0DD",
  selectSentStatement: "\uBCF4\uB0B4\uB0B4\uC5ED\uC11C \uC120\uD0DD",
  sentStatementMatch: "\uBCF4\uB0B4\uB0B4\uC5ED\uC11C",
  statementTotal: "\uB0B4\uC5ED\uC11C \uAE08\uC561",
  sentAt: "\uB9C1\uD06C \uBC1C\uC1A1",
  ledgerRegister: "\uAC00\uACC4\uBD80 \uB4F1\uB85D",
  ledgerRegisterTitle: "\uD68C\uC0AC \uAC00\uACC4\uBD80 \uC9C0\uCD9C \uB4F1\uB85D",
  ledgerRegisterDesc: "\uBBF8\uBD84\uB958 \uCD9C\uAE08 \uB0B4\uC5ED\uC744 \uD68C\uC0AC \uAC00\uACC4\uBD80 \uC9C0\uCD9C\uB85C \uB4F1\uB85D\uD569\uB2C8\uB2E4.",
  ledgerRegistered: "\uAC00\uACC4\uBD80 \uB4F1\uB85D\uC74C",
  ledgerManualRegistered: "\uB2E8\uC21C\uC9C0\uCD9C \uB4F1\uB85D\uC74C",
  ledgerFixedRegistered: "\uACE0\uC815\uBE44 \uB4F1\uB85D\uC74C",
  ledgerRegisterDone: "\uD68C\uC0AC \uAC00\uACC4\uBD80\uC5D0 \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  ledgerFixedRegisterDone: "\uACE0\uC815\uBE44 \uB0A9\uBD80\uB85C \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  ledgerAutoRegisterDone: (count: number) => `\uACE0\uC815\uBE44 ${count}\uAC74\uC774 \uC790\uB3D9 \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`,
  ledgerAutoLearnDone: formatBankLearnAutoMessage,
  ledgerSaveManualHint: "\uB2E8\uC21C\uC9C0\uCD9C\uB85C \uC800\uC7A5",
  ledgerCategoryAddHint: "\uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uCE74\uD14C\uACE0\uB9AC\uB294 \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694.",
  ledgerSaveFixedHint: "\uACE0\uC815\uBE44 \uB0A9\uBD80\uB85C \uC800\uC7A5 (\uB3D9\uC77C \uAE08\uC561\uC77C \uB54C \uC790\uB3D9 \uACE0\uC815\uBE44)",
  ledgerKind: "\uB4F1\uB85D \uC720\uD615",
  ledgerFixedItem: "\uACE0\uC815\uBE44 \uD56D\uBAA9",
  ledgerManualCategory: "\uC9C0\uCD9C \uCE74\uD14C\uACE0\uB9AC",
  ledgerCategory: "\uCE74\uD14C\uACE0\uB9AC",
  ledgerDescription: "\uB0B4\uC6A9",
  ledgerAmount: "\uAE08\uC561",
  ledgerMemo: "\uBA54\uBAA8",
  ledgerSave: "\uAC00\uACC4\uBD80 \uB4F1\uB85D",
  ledgerDate: "\uC9C0\uCD9C\uC77C",
  ledgerClickHint: "\uBBF8\uBD84\uB958 \uCD9C\uAE08 \uB0B4\uC6A9 \uD074\uB9AD \u2192 \uAC00\uACC4\uBD80",
  clientLinkTitle: "\uAC70\uB798\uCC98 \uC5F0\uACB0",
  clientLinkDesc:
    "\uD1B5\uC7A5 \uC785\uAE08 \uC2DC \uD45C\uC2DC\uB41C \uC774\uB984\uC744 \uAC70\uB798\uCC98 \uC608\uAE08\uC8FC \uBCC4\uCE59\uC5D0 \uCD94\uAC00\uD569\uB2C8\uB2E4. \uC774\uD6C4 \uB3D9\uC77C \uC774\uB984 \uC785\uAE08\uC740 \uC790\uB3D9 \uBD84\uB958\uB429\uB2C8\uB2E4.",
  clientLinkSelectClient: "\uAC70\uB798\uCC98 \uAC80\uC0C9",
  clientLinkDepositSubject: "\uD1B5\uC7A5 \uD45C\uC2DC \uC774\uB984",
  clientLinkSave: "\uC5F0\uACB0 \uC800\uC7A5",
  clientLinkDone: "\uAC70\uB798\uCC98 \uC5F0\uACB0 \uBC0F \uC790\uB3D9 \uBD84\uB958\uAC00 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
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
  if (periodKey === "thisMonth") return monthRangeISO(0);
  if (periodKey === "lastMonth") return monthRangeISO(-1);
  if (periodKey === "all") return { startDate: "", endDate: "" };
  return dateFilter;
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "deposit" | "withdrawal" | "net-positive" | "net-negative" | "neutral";
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

function canLinkUnclassifiedClientDeposit(row: BankTransaction) {
  return row.deposit > 0 && !row.folderId && !isCardCompanyDeposit(row);
}

export function BankTransactionsPage({
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
  fixedExpensePayments,
  setFixedExpensePayments,
  bankLedgerRules,
  setBankLedgerRules,
  expenseCategories,
  setExpenseCategories,
  currentUser,
}: {
  bankTransactions: BankTransaction[];
  setBankTransactions: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  bankTransactionFolders: BankTransactionFolder[];
  setBankTransactionFolders: React.Dispatch<React.SetStateAction<BankTransactionFolder[]>>;
  clients: Array<{ id?: number | string; name?: string; manager?: string; depositNameAliases?: string }>;
  setClients: React.Dispatch<React.SetStateAction<Array<{ id?: number | string; name?: string; manager?: string; depositNameAliases?: string; [key: string]: unknown }>>>;
  workers: Array<{ name?: string; depositNameAliases?: string }>;
  receivableRows: ReceivableRow[];
  sales: Array<{ id?: number | string; workers?: unknown[]; worker?: string; amount?: number }>;
  paymentVouchers: Array<{ id?: number | string; bankTransactionId?: string }>;
  setPaymentVouchers: React.Dispatch<React.SetStateAction<unknown[]>>;
  setPaymentInputLogs: React.Dispatch<React.SetStateAction<unknown[]>>;
  companyExpenses: CompanyExpense[];
  setCompanyExpenses: React.Dispatch<React.SetStateAction<CompanyExpense[]>>;
  fixedExpenses: FixedExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  setFixedExpensePayments: React.Dispatch<React.SetStateAction<FixedExpensePayment[]>>;
  bankLedgerRules: BankLearnRule[];
  setBankLedgerRules: React.Dispatch<React.SetStateAction<BankLearnRule[]>>;
  expenseCategories: string[];
  setExpenseCategories: React.Dispatch<React.SetStateAction<string[]>>;
  currentUser: ErpUser | null;
}) {
  const [pageView, setPageView] = useState<PageView>("list");
  const [periodKey, setPeriodKey] = useState<PeriodKey>("thisMonth");
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => monthRangeISO(0));
  const [flowFilter, setFlowFilter] = useState<BankTransactionFlowFilter>("all");
  const [accountFilter, setAccountFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [folderScope, setFolderScope] = useState<FolderScope>("all");
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderType, setNewFolderType] = useState<BankTransactionFolderType>("client");
  const [folderError, setFolderError] = useState("");
  const [importPreview, setImportPreview] = useState<IbkBankImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [linkModalTx, setLinkModalTx] = useState<BankTransaction | null>(null);
  const [clientLinkModalTx, setClientLinkModalTx] = useState<BankTransaction | null>(null);
  const [clientLinkClientName, setClientLinkClientName] = useState("");
  const { recordAudit } = useAudit();
  const [ledgerModal, setLedgerModal] = useState<{
    tx: BankTransaction;
    kind: LedgerRegisterKind;
    fixedExpenseId: string;
    category: string;
    date: string;
    description: string;
    amount: string;
    memo: string;
  } | null>(null);
  const [ledgerFormError, setLedgerFormError] = useState("");
  const [sentArchives, setSentArchives] = useState<PdfArchiveMeta[]>([]);
  const ibkInputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const savedBy = currentUser?.name || currentUser?.loginId || "";

  const applyAutoLearnRules = React.useCallback(
    (
      transactions: BankTransaction[],
      payments: FixedExpensePayment[],
      expenses: CompanyExpense[],
      rules: BankLearnRule[],
      options: { onlyTransactionIds?: Set<string>; showMessage?: boolean } = {},
    ) => {
      const result = autoApplyBankLearnRules(transactions, payments, expenses, rules, fixedExpenses, {
        createdBy: savedBy || undefined,
        onlyTransactionIds: options.onlyTransactionIds,
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
      if (result.newPayments.length) {
        setFixedExpensePayments((prev) => [...result.newPayments, ...prev]);
      }
      if (result.newExpenses.length) {
        setCompanyExpenses((prev) => [...result.newExpenses, ...prev]);
      }
      setBankTransactions(result.transactions);
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
    [fixedExpenses, savedBy, setFixedExpensePayments, setCompanyExpenses, setBankTransactions],
  );

  const loadSentArchives = React.useCallback(async () => {
    try {
      const records = await listSentStatementArchives();
      setSentArchives(records);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    void loadSentArchives();
  }, [loadSentArchives]);

  useEffect(() => {
    if (!bankLedgerRules.length) return;
    applyAutoLearnRules(bankTransactions, fixedExpensePayments, companyExpenses, bankLedgerRules, {
      showMessage: false,
    });
  }, [bankLedgerRules, fixedExpenses, bankTransactions, fixedExpensePayments, companyExpenses, applyAutoLearnRules]);

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
  const unfiledStats = useMemo(
    () => buildBankTransactionFolderStats(bankTransactions, UNFILED_FOLDER_KEY),
    [bankTransactions]
  );

  const accountSummaries = useMemo(() => buildBankAccountSummaries(bankTransactions), [bankTransactions]);

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

  const fixedExpenseSelectOptions = useMemo(
    () =>
      fixedExpenses
        .filter((row) => row.isActive)
        .map((row) => ({
          value: row.id,
          label: `${row.name} \u00B7 ${row.category}`,
          raw: { kind: "fixed" as const, fixedExpense: row },
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "ko")),
    [fixedExpenses],
  );

  const manualCategoryOptions = useMemo(() => {
    const categories = [...expenseCategories];
    if (ledgerModal?.kind === "manual" && ledgerModal.category && !categories.includes(ledgerModal.category)) {
      categories.unshift(ledgerModal.category);
    }
    return categories.map((category) => ({ label: category, value: category }));
  }, [expenseCategories, ledgerModal?.kind, ledgerModal?.category]);

  const activePeriod = useMemo(
    () => resolveActivePeriod(periodKey, dateFilter),
    [periodKey, dateFilter]
  );

  const filteredRows = useMemo(() => {
    let scoped = filterBankTransactions(bankTransactions, {
      search: query,
      dateFrom: activePeriod.startDate,
      dateTo: activePeriod.endDate,
      flowType: flowFilter,
      accountNumber: accountFilter,
      folderId: selectedFolderId || undefined,
    });

    if (!selectedFolderId && folderScope === "unfiled") {
      scoped = scoped.filter((row) => !row.folderId);
    } else if (!selectedFolderId && folderScope === "client") {
      const ids = new Set(clientFolders.map((folder) => folder.id));
      scoped = scoped.filter((row) => row.folderId && ids.has(row.folderId));
    } else if (!selectedFolderId && folderScope === "card") {
      const ids = new Set(cardFolders.map((folder) => folder.id));
      scoped = scoped.filter((row) => row.folderId && ids.has(row.folderId));
    } else if (!selectedFolderId && folderScope === "worker") {
      const ids = new Set(workerFolders.map((folder) => folder.id));
      scoped = scoped.filter((row) => row.folderId && ids.has(row.folderId));
    }

    return sortBankTransactions(scoped);
  }, [
    bankTransactions,
    query,
    activePeriod.startDate,
    activePeriod.endDate,
    flowFilter,
    accountFilter,
    selectedFolderId,
    folderScope,
    clientFolders,
    cardFolders,
    workerFolders,
  ]);

  const stats = useMemo(() => buildBankTransactionStats(filteredRows), [filteredRows]);
  const topCounterparties = useMemo(() => buildTopCounterpartySummaries(filteredRows, 5), [filteredRows]);
  const depositSuggestions = useMemo(() => {
    const sentByTxId = new Map(
      buildAllSentStatementDepositSuggestions(bankTransactions, sentArchives, clients).map((row) => [
        row.tx.id,
        row.candidates,
      ])
    );
    const receivableSuggestions = buildAllBankDepositSuggestions(bankTransactions, receivableRows, clients);

    const merged: DepositSuggestion[] = [];

    for (const [txId, candidates] of sentByTxId.entries()) {
      const tx = bankTransactions.find((row) => row.id === txId);
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
  }, [bankTransactions, receivableRows, sentArchives, clients]);
  const unmatchedDepositCount = useMemo(
    () => bankTransactions.filter((row) => row.deposit > 0 && !row.linkedPaymentVoucherId).length,
    [bankTransactions]
  );

  const flowTotal = stats.deposits + stats.withdrawals;
  const depositRatio = flowTotal > 0 ? (stats.deposits / flowTotal) * 100 : 50;
  const withdrawalRatio = flowTotal > 0 ? (stats.withdrawals / flowTotal) * 100 : 50;

  const hasAnyData = bankTransactions.length > 0;

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
    const autoLearn = autoApplyBankLearnRules(
      classified.next,
      fixedExpensePayments,
      companyExpenses,
      bankLedgerRules,
      fixedExpenses,
      { createdBy: savedBy || undefined, onlyTransactionIds: addedIds.size ? addedIds : undefined },
    );
    setBankTransactions(autoLearn.transactions);
    if (autoLearn.newPayments.length) {
      setFixedExpensePayments((prev) => [...autoLearn.newPayments, ...prev]);
    }
    if (autoLearn.newExpenses.length) {
      setCompanyExpenses((prev) => [...autoLearn.newExpenses, ...prev]);
    }
    setBankTransactionFolders(classified.folders);
    setImportPreview(null);
    const latestLabel = importPreview.latestTransactionAt
      ? ` \u00B7 ${L.dataAsOf} ${formatBankTransactionDateTime(importPreview.latestTransactionAt)}`
      : "";
    const autoLearnLabel = autoLearn.fixedCount + autoLearn.manualCount + autoLearn.folderCount
      ? `, ${L.ledgerAutoLearnDone({
          fixed: autoLearn.fixedCount,
          manual: autoLearn.manualCount,
          folder: autoLearn.folderCount,
        }).replace(/\.$/, "")}`
      : "";
    setImportMessage(
      `${L.ibkImportDone} (${result.added}${L.ibkImportAdded}${result.skipped ? `, ${result.skipped}${L.ibkImportSkipped}` : ""}${classified.updated ? `, ${classified.updated}\uAC74 \uBD84\uB958` : ""}${autoLearnLabel})${latestLabel}`
    );
  };

  const assignTransactionFolder = (transactionId: string, folderId: string) => {
    const tx = bankTransactions.find((row) => row.id === transactionId);
    if (!tx) return;

    const nextTransactions = bankTransactions.map((row) => {
      if (row.id !== transactionId) return row;
      if (!folderId) {
        return { ...row, folderId: undefined, linkedSubject: undefined, classifiedAt: undefined };
      }
      return {
        ...row,
        folderId,
        classifiedAt: new Date().toISOString(),
        linkedSubject: row.linkedSubject || row.counterpartyName || row.description || undefined,
      };
    });

    setBankTransactions(nextTransactions);

    if (!folderId) return;

    const nextRules = upsertBankLearnRule(
      bankLedgerRules,
      buildBankLearnRuleFromFolderAssignment(tx, folderId, savedBy || undefined),
    );
    setBankLedgerRules(nextRules);
    applyAutoLearnRules(nextTransactions, fixedExpensePayments, companyExpenses, nextRules, {
      showMessage: true,
    });
  };

  const updateTransactionMemo = (transactionId: string, memo: string) => {
    setBankTransactions((prev) =>
      prev.map((row) =>
        row.id === transactionId ? { ...row, memo: memo || undefined } : row
      )
    );
  };

  const runAutoClassify = () => {
    const result = autoClassifyBankTransactions(bankTransactions, clients, workers, bankTransactionFolders);
    setBankTransactions(result.next);
    setBankTransactionFolders(result.folders);
    setImportMessage(`${result.updated}${L.autoClassifyDone}`);
  };

  const handleCreateFolder = () => {
    const result = createBankTransactionFolder(bankTransactionFolders, {
      folderName: newFolderName,
      folderType: newFolderType,
    });
    if (result.error) {
      setFolderError(result.error);
      return;
    }
    setBankTransactionFolders(result.next);
    if (result.folder) setSelectedFolderId(result.folder.id);
    setCreateFolderOpen(false);
    setNewFolderName("");
    setFolderError("");
  };

  const handleDeleteFolder = (folder: BankTransactionFolder) => {
    if (!confirmDelete(L.deleteFolderConfirm)) return;
    const removed = removeBankTransactionFolder(bankTransactionFolders, folder.id);
    if (removed.error) {
      setFolderError(removed.error);
      return;
    }
    setBankTransactionFolders(removed.next);
    setBankTransactions((prev) => clearBankTransactionFolderReferences(prev, folder.id));
    if (selectedFolderId === folder.id) setSelectedFolderId("");
    setFolderError("");
  };

  const confirmSentStatementMatch = async (tx: BankTransaction, candidate: SentStatementMatchCandidate) => {
    if (paymentVouchers.some((voucher) => voucher.bankTransactionId === tx.id)) {
      setImportMessage("\uC774\uBBF8 \uC5F0\uACB0\uB41C \uD1B5\uC7A5 \uAC70\uB798\uC785\uB2C8\uB2E4.");
      return;
    }

    const archive = sentArchives.find((row) => row.id === candidate.pdfArchiveId);
    const vouchers = createPaymentVouchersFromSentStatementMatch(tx, candidate, { sales, clients, archive });
    const primaryVoucher = vouchers[0];
    const savedBy = currentUser?.name || currentUser?.loginId || "";
    const logs = createPaymentInputLogsFromVouchers(vouchers, savedBy);

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
              folderId:
                row.folderId ||
                (isCardCompanyDeposit(row) ? DEFAULT_CARD_SALES_FOLDER_ID : DEFAULT_CLIENT_FOLDER_ID),
            }
          : row
      )
    );

    try {
      await updatePdfArchiveMeta(candidate.pdfArchiveId, {
        paymentStatus: candidate.paymentStatus,
        linkedBankTransactionId: tx.id,
        linkedPaymentVoucherId: primaryVoucher.id,
      });
      setSentArchives((prev) =>
        prev.map((row) =>
          row.id === candidate.pdfArchiveId
            ? {
                ...row,
                paymentStatus: candidate.paymentStatus,
                linkedBankTransactionId: tx.id,
                linkedPaymentVoucherId: primaryVoucher.id,
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
    if (!canRegisterBankTxToCompanyLedger(tx)) return;
    const prefill = buildCompanyExpensePrefillFromBankTransaction(tx);
    const targetKey = resolveLedgerTargetForBankTransaction(tx, bankLedgerRules, fixedExpenses);
    const parsed = parseLedgerTargetKey(targetKey);
    const kind: LedgerRegisterKind = parsed?.kind === "fixed" ? "fixed" : "manual";
    const fixedItem =
      parsed?.kind === "fixed" && parsed.fixedExpenseId
        ? fixedExpenses.find((row) => row.id === parsed.fixedExpenseId)
        : undefined;
    const defaultFixedId =
      fixedItem?.id ||
      fixedExpenses.find((row) => row.isActive)?.id ||
      "";
    setLedgerFormError("");
    setLedgerModal({
      tx,
      kind,
      fixedExpenseId: kind === "fixed" ? defaultFixedId : "",
      category: kind === "manual" ? parsed?.category || prefill.category : prefill.category,
      date: prefill.date,
      description: fixedItem?.name || prefill.description,
      amount: prefill.amount,
      memo: prefill.memo,
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
        if (fixedItem && !prev.description.trim()) {
          next.description = fixedItem.name;
        }
      } else if (!next.category.trim()) {
        next.category = buildCompanyExpensePrefillFromBankTransaction(prev.tx).category;
      }
      return next;
    });
  };

  const saveLedgerRegister = () => {
    if (!ledgerModal) return;
    const savedBy = currentUser?.name || currentUser?.loginId || "";

    if (ledgerModal.kind === "fixed") {
      if (!ledgerModal.fixedExpenseId) {
        setLedgerFormError("\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
        return;
      }

      const error = validateFixedExpensePaymentInput({
        date: ledgerModal.date,
        fixedExpenseId: ledgerModal.fixedExpenseId,
        amount: ledgerModal.amount,
      });
      if (error) {
        setLedgerFormError(error);
        return;
      }

      const paymentId = makeLedgerId();
      const payment: FixedExpensePayment = {
        id: paymentId,
        fixedExpenseId: ledgerModal.fixedExpenseId,
        date: ledgerModal.date,
        amount: parseLedgerAmount(ledgerModal.amount),
        memo: ledgerModal.memo.trim() || ledgerModal.description.trim(),
        bankTransactionId: ledgerModal.tx.id,
        createdBy: savedBy,
        createdAt: new Date().toISOString(),
      };

      setFixedExpensePayments((prev) => [payment, ...prev]);
      setBankTransactions((prev) =>
        prev.map((row) =>
          row.id === ledgerModal.tx.id
            ? {
                ...row,
                linkedFixedExpensePaymentId: paymentId,
              }
            : row
        )
      );
      const nextRules = upsertBankLearnRule(
        bankLedgerRules,
        buildBankLedgerMatchRuleFromRegistration(
          ledgerModal.tx,
          ledgerModal.fixedExpenseId,
          savedBy,
          parseLedgerAmount(ledgerModal.amount),
        ),
      );
      setBankLedgerRules(nextRules);
      applyAutoLearnRules(
        bankTransactions.map((row) =>
          row.id === ledgerModal.tx.id ? { ...row, linkedFixedExpensePaymentId: paymentId } : row,
        ),
        [payment, ...fixedExpensePayments],
        companyExpenses,
        nextRules,
        { showMessage: true },
      );
      setLedgerModal(null);
      setLedgerFormError("");
      setImportMessage(L.ledgerFixedRegisterDone);
      return;
    }

    const category = ledgerModal.category.trim();
    if (!category) {
      setLedgerFormError("\uCE74\uD14C\uACE0\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
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
      memo: ledgerModal.memo.trim(),
      bankTransactionId: ledgerModal.tx.id,
      createdBy: savedBy,
      createdAt: new Date().toISOString(),
    };

    const nextTransactions = bankTransactions.map((row) =>
      row.id === ledgerModal.tx.id
        ? {
            ...row,
            linkedCompanyExpenseId: expenseId,
          }
        : row,
    );
    const nextExpenses = [expense, ...companyExpenses];
    const nextCategories = mergeExpenseCategory(expenseCategories, category);
    const nextRules = upsertBankLearnRule(
      bankLedgerRules,
      buildBankLearnRuleFromManualRegistration(ledgerModal.tx, category, savedBy),
    );

    setExpenseCategories(nextCategories);
    setCompanyExpenses(nextExpenses);
    setBankTransactions(nextTransactions);
    setBankLedgerRules(nextRules);
    applyAutoLearnRules(nextTransactions, fixedExpensePayments, nextExpenses, nextRules, {
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

    const classified = autoClassifyBankTransactions(bankTransactions, nextClients, workers, bankTransactionFolders);
    setBankTransactions(classified.next);
    setBankTransactionFolders(classified.folders);

    setClientLinkModalTx(null);
    setClientLinkClientName("");
    const classifyNote = classified.updated > 0 ? ` (${classified.updated}\uAC74 \uBD84\uB958)` : "";
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
    const linkedByTxId = new Map<
      string,
      { salesId?: number | string; voucherId: number; client: string; pdfArchiveId?: string; paymentStatus?: "confirmed" | "partial" }
    >();

    for (const item of depositSuggestions) {
      const candidate = item.candidates[0];
      if (!candidate || candidate.score < 75) continue;
      if (item.tx.linkedPaymentVoucherId || existingBankIds.has(item.tx.id)) continue;

      if (item.kind === "sentStatement") {
        const sentCandidate = candidate as SentStatementMatchCandidate;
        const archive = sentArchives.find((row) => row.id === sentCandidate.pdfArchiveId);
        const vouchers = createPaymentVouchersFromSentStatementMatch(item.tx, sentCandidate, { sales, clients, archive });
        sentVouchers.push(...vouchers);
        existingBankIds.add(item.tx.id);
        linkedByTxId.set(item.tx.id, {
          voucherId: vouchers[0].id,
          client: sentCandidate.client,
          pdfArchiveId: sentCandidate.pdfArchiveId,
          paymentStatus: sentCandidate.paymentStatus,
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
          linkedSubject: linked.client,
          matchConfirmedAt: new Date().toISOString(),
          matchConfirmedBy: savedBy,
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

  const renderTransactionDescription = (row: BankTransaction) => {
    const text = row.description || "-";
    if (canRegisterBankTxToCompanyLedger(row)) {
      return (
        <button
          type="button"
          className="text-left font-medium text-blue-700 underline decoration-blue-200 underline-offset-2 hover:text-blue-900"
          title={L.ledgerRegister}
          onClick={() => openLedgerRegister(row)}
        >
          {text}
        </button>
      );
    }
    return <span className="font-medium text-slate-900">{text}</span>;
  };

  const renderRow = (row: BankTransaction) => {
    const isDeposit = row.deposit > 0;
    const isWithdrawal = row.withdrawal > 0;
    const rowClass = isDeposit ? "is-deposit-row" : isWithdrawal ? "is-withdrawal-row" : "";
    const folder = row.folderId ? folderMap.get(row.folderId) : undefined;

    return (
      <tr key={row.id} className={`border-t ${rowClass}`}>
        <td className="whitespace-nowrap text-slate-600">{formatBankTransactionDateTime(row.transactionAt)}</td>
        <td className="text-right font-semibold text-emerald-700">{row.deposit > 0 ? formatKRW(row.deposit) : "-"}</td>
        <td className="text-right font-semibold text-red-600">{row.withdrawal > 0 ? formatKRW(row.withdrawal) : "-"}</td>
        <td className="text-right font-bold text-slate-900">{formatKRW(row.balanceAfter)}</td>
        <td>{renderTransactionDescription(row)}</td>
        <td className="text-slate-700">
          {canLinkUnclassifiedClientDeposit(row) ? (
            <button
              type="button"
              className="text-left font-medium text-emerald-700 underline decoration-emerald-200 underline-offset-2 hover:text-emerald-900"
              title={L.clientLinkClickHint}
              onClick={() => openClientLinkModal(row)}
            >
              {row.counterpartyName || row.description || "-"}
            </button>
          ) : (
            row.counterpartyName || "-"
          )}
        </td>
        <td>
          {folder ? (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getBankTransactionFolderTone(folder.folderType)}`}>
              {folder.folderName}
            </span>
          ) : canLinkUnclassifiedClientDeposit(row) ? (
            <button
              type="button"
              className="inline-flex rounded-full border border-dashed border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100"
              title={L.clientLinkClickHint}
              onClick={() => openClientLinkModal(row)}
            >
              {L.unfiled}
            </button>
          ) : (
            <span className="text-xs font-semibold text-slate-400">{L.unfiled}</span>
          )}
          {row.linkedCompanyExpenseId ? (
            <div className="mt-1">
              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                {L.ledgerManualRegistered}
              </span>
            </div>
          ) : null}
          {row.linkedFixedExpensePaymentId ? (
            <div className="mt-1">
              <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                {L.ledgerFixedRegistered}
              </span>
            </div>
          ) : null}
          {row.linkedSubject ? (
            <div className="mt-1 text-xs text-slate-500">{row.linkedSubject}</div>
          ) : null}
        </td>
        <td className="text-slate-600">{row.counterpartyBank || "-"}</td>
        <td>
          {row.linkedPaymentVoucherId ? (
            <div>
              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                {getBankMatchStatusLabel(row)}
              </span>
              {row.linkedSubject ? (
                <div className="mt-1 text-xs text-slate-500">
                  {row.linkedSubject}
                  {row.linkedSalesId ? ` #${row.linkedSalesId}` : ""}
                </div>
              ) : null}
            </div>
          ) : row.deposit > 0 && !isCardCompanyDeposit(row) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg text-xs"
              onClick={() => setLinkModalTx(row)}
            >
              <Link2 size={12} className="mr-1" />
              {L.matchManual}
            </Button>
          ) : (
            "-"
          )}
        </td>
        <td>
          {row.transactionType ? (
            <span className="erp-bank-type-badge">{row.transactionType}</span>
          ) : (
            "-"
          )}
        </td>
        <td>
          <select
            className="erp-input max-w-[10rem] rounded-lg py-1 text-xs"
            value={row.folderId || ""}
            onChange={(event) => assignTransactionFolder(row.id, event.target.value)}
          >
            <option value="">{L.unfiled}</option>
            <optgroup label={L.clientFolders}>
              {clientFolders.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.folderName}
                </option>
              ))}
            </optgroup>
            <optgroup label={L.cardFolders}>
              {cardFolders.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.folderName}
                </option>
              ))}
            </optgroup>
            <optgroup label={L.workerFolders}>
              {workerFolders.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.folderName}
                </option>
              ))}
            </optgroup>
          </select>
        </td>
        <td>
          <input
            className="erp-input erp-input-compact min-w-[8rem] max-w-[14rem]"
            value={row.memo || ""}
            placeholder={L.memoPlaceholder}
            onChange={(event) => updateTransactionMemo(row.id, event.target.value)}
            onClick={(event) => event.stopPropagation()}
          />
        </td>
      </tr>
    );
  };

  const renderMobileCard = (row: BankTransaction) => {
    const folder = row.folderId ? folderMap.get(row.folderId) : undefined;
    const canLedger = canRegisterBankTxToCompanyLedger(row);
    return (
    <MobileRecordCard
      key={row.id}
      title={row.description || "(\uAC70\uB798\uB0B4\uC6A9 \uC5C6\uC74C)"}
      subtitle={formatBankTransactionDateTime(row.transactionAt)}
      badges={[
        folder
          ? {
              label: folder.folderName,
              tone:
                folder.folderType === "client"
                  ? ("success" as const)
                  : folder.folderType === "card"
                    ? ("default" as const)
                    : ("default" as const),
            }
          : { label: L.unfiled, tone: "muted" as const },
        row.linkedCompanyExpenseId ? { label: L.ledgerManualRegistered, tone: "default" as const } : null,
        row.linkedFixedExpensePaymentId ? { label: L.ledgerFixedRegistered, tone: "default" as const } : null,
        row.deposit > 0 ? { label: `${L.deposit} ${formatKRW(row.deposit)}`, tone: "success" as const } : null,
        row.withdrawal > 0 ? { label: `${L.withdrawal} ${formatKRW(row.withdrawal)}`, tone: "danger" as const } : null,
      ].filter(Boolean) as Array<{ label: string; tone: "success" | "danger" | "default" | "muted" }>}
      rows={[
        { label: L.balance, value: formatKRW(row.balanceAfter) },
        { label: L.counterpartyName, value: row.counterpartyName || "-" },
        { label: L.counterpartyBank, value: row.counterpartyBank || "-" },
        { label: L.transactionType, value: row.transactionType || "-" },
        {
          label: L.memo,
          value: (
            <input
              className="erp-input erp-input-compact w-full min-w-0 text-right"
              value={row.memo || ""}
              placeholder={L.memoPlaceholder}
              onChange={(event) => updateTransactionMemo(row.id, event.target.value)}
            />
          ),
        },
      ]}
      actions={
        canLedger || canLinkUnclassifiedClientDeposit(row) ? (
          <div className="flex flex-wrap gap-2">
            {canLinkUnclassifiedClientDeposit(row) ? (
              <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => openClientLinkModal(row)}>
                <Building2 size={14} className="mr-1" />
                {L.clientLinkTitle}
              </Button>
            ) : null}
            {canLedger ? (
              <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => openLedgerRegister(row)}>
                <BookOpen size={14} className="mr-1" />
                {L.ledgerRegister}
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
    />
    );
  };

  return (
    <div className="erp-page erp-bank-transactions-page">
      <Card className="erp-bank-hub-card mb-4 rounded-2xl shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="erp-bank-hub-icon shrink-0">
              <Landmark size={22} />
            </div>
            <div>
              <h1 className="erp-text-page-title text-slate-900">{L.pageTitle}</h1>
              <p className="mt-1 max-w-2xl erp-text-body text-slate-600">{L.pageDesc}</p>
              {hasAnyData ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {accountSummaries.map((account) => (
                    <button
                      key={account.accountNumber}
                      type="button"
                      className={`erp-bank-account-chip text-left ${accountFilter === account.accountNumber ? "is-active" : ""}`}
                      onClick={() =>
                        setAccountFilter((prev) => (prev === account.accountNumber ? "" : account.accountNumber))
                      }
                    >
                      <span className="text-xs font-bold text-slate-500">{account.bankName}</span>
                      <span className="font-mono text-sm font-bold text-slate-900">{account.accountNumber}</span>
                      <span className="text-xs font-semibold text-emerald-700">
                        {L.latestBalance} {formatKRW(account.latestBalance)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {L.dataAsOf} {formatBankTransactionDateTime(account.latestAt)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            className="shrink-0 rounded-2xl px-5 shadow-md"
            disabled={importLoading}
            onClick={() => ibkInputRef.current?.click()}
          >
            {importLoading ? (
              <Upload size={16} className="mr-2 animate-pulse" />
            ) : (
              <FileSpreadsheet size={16} className="mr-2" />
            )}
            {L.ibkImport}
          </Button>
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
      ) : (
        <>
          {pageView === "list" ? (
            <>
          <Card className="mb-4 rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="erp-text-section font-bold text-slate-900">{L.foldersTitle}</div>
                  <p className="mt-1 erp-text-caption text-slate-500">
                    {L.foldersHint} {L.ledgerClickHint}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={runAutoClassify}>
                    <Sparkles size={14} className="mr-1" />
                    {L.autoClassify}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => {
                      setCreateFolderOpen(true);
                      setFolderError("");
                    }}
                  >
                    <FolderPlus size={14} className="mr-1" />
                    {L.createFolder}
                  </Button>
                </div>
              </div>

              {folderError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
                  {folderError}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { key: "all" as FolderScope, label: L.allFolders },
                    { key: "client" as FolderScope, label: L.folderScopeClient },
                    { key: "card" as FolderScope, label: L.folderScopeCard },
                    { key: "worker" as FolderScope, label: L.folderScopeWorker },
                    { key: "unfiled" as FolderScope, label: `${L.unfiled} (${unfiledStats.count})` },
                  ] as const
                ).map((option) => (
                  <Button
                    key={option.key}
                    type="button"
                    size="sm"
                    variant={!selectedFolderId && folderScope === option.key ? "default" : "outline"}
                    className="rounded-xl"
                    onClick={() => {
                      setSelectedFolderId("");
                      setFolderScope(option.key);
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
                  <div className="mb-3 flex items-center gap-2 font-bold text-emerald-800">
                    <Building2 size={16} />
                    {L.clientFolders}
                  </div>
                  <div className="space-y-2">
                    {clientFolders.map((folder) => {
                      const folderStats = buildBankTransactionFolderStats(bankTransactions, folder.id);
                      const active = selectedFolderId === folder.id;
                      return (
                        <div
                          key={folder.id}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${active ? "border-emerald-300 bg-white shadow-sm" : "border-emerald-100 bg-white/70"}`}
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => {
                              setSelectedFolderId(folder.id);
                              setFolderScope("all");
                            }}
                          >
                            <div className="truncate font-semibold text-slate-900">{folder.folderName}</div>
                            <div className="text-xs text-slate-500">
                              {folderStats.count}
                              {L.count}
                              {" \u00B7 "}
                              {L.deposit} {formatKRW(folderStats.deposits)}
                            </div>
                          </button>
                          {!folder.isDefault ? (
                            <button
                              type="button"
                              className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => handleDeleteFolder(folder)}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-2xl border border-violet-100 bg-violet-50/40 p-3">
                  <div className="mb-3 flex items-center gap-2 font-bold text-violet-800">
                    <CreditCard size={16} />
                    {L.cardFolders}
                  </div>
                  <div className="space-y-2">
                    {cardFolders.map((folder) => {
                      const folderStats = buildBankTransactionFolderStats(bankTransactions, folder.id);
                      const active = selectedFolderId === folder.id;
                      return (
                        <div
                          key={folder.id}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${active ? "border-violet-300 bg-white shadow-sm" : "border-violet-100 bg-white/70"}`}
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => {
                              setSelectedFolderId(folder.id);
                              setFolderScope("all");
                            }}
                          >
                            <div className="truncate font-semibold text-slate-900">{folder.folderName}</div>
                            <div className="text-xs text-slate-500">
                              {folderStats.count}
                              {L.count}
                              {" \u00B7 "}
                              {L.deposit} {formatKRW(folderStats.deposits)}
                            </div>
                          </button>
                          {!folder.isDefault ? (
                            <button
                              type="button"
                              className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => handleDeleteFolder(folder)}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-2xl border border-amber-100 bg-amber-50/40 p-3">
                  <div className="mb-3 flex items-center gap-2 font-bold text-amber-800">
                    <HardHat size={16} />
                    {L.workerFolders}
                  </div>
                  <div className="space-y-2">
                    {workerFolders.map((folder) => {
                      const folderStats = buildBankTransactionFolderStats(bankTransactions, folder.id);
                      const active = selectedFolderId === folder.id;
                      return (
                        <div
                          key={folder.id}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${active ? "border-amber-300 bg-white shadow-sm" : "border-amber-100 bg-white/70"}`}
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => {
                              setSelectedFolderId(folder.id);
                              setFolderScope("all");
                            }}
                          >
                            <div className="truncate font-semibold text-slate-900">{folder.folderName}</div>
                            <div className="text-xs text-slate-500">
                              {folderStats.count}
                              {L.count}
                              {" \u00B7 "}
                              {L.withdrawal} {formatKRW(folderStats.withdrawals)}
                            </div>
                          </button>
                          {!folder.isDefault ? (
                            <button
                              type="button"
                              className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => handleDeleteFolder(folder)}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>

          <div className="mb-4 erp-bank-stat-grid">
            <StatCard
              label={L.depositTotal}
              value={formatKRW(stats.deposits)}
              icon={<ArrowDownLeft size={18} className="text-emerald-500" />}
              tone="deposit"
            />
            <StatCard
              label={L.withdrawalTotal}
              value={formatKRW(stats.withdrawals)}
              icon={<ArrowUpRight size={18} className="text-red-500" />}
              tone="withdrawal"
            />
            <StatCard
              label={L.netTotal}
              value={formatKRW(stats.net)}
              icon={<TrendingUp size={18} className="text-slate-400" />}
              tone={stats.net >= 0 ? "net-positive" : "net-negative"}
            />
            <StatCard
              label={L.count}
              value={`${stats.count}${L.count}`}
              icon={<ListChecks size={18} className="text-slate-400" />}
              tone="neutral"
            />
          </div>

          {flowTotal > 0 ? (
            <Card className="mb-4 rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="grid gap-4 p-4 lg:grid-cols-[1fr_16rem] lg:items-center">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="erp-text-caption font-bold text-slate-600">{L.filteredSummary}</span>
                    <span className="erp-text-caption text-slate-500">
                      {activePeriod.startDate || "..."} ~ {activePeriod.endDate || "..."}
                    </span>
                  </div>
                  <div className="erp-bank-flow-bar">
                    <div className="erp-bank-flow-bar-deposit" style={{ width: `${depositRatio}%` }} />
                    <div className="erp-bank-flow-bar-withdrawal" style={{ width: `${withdrawalRatio}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 erp-text-caption">
                    <span className="font-semibold text-emerald-700">
                      {L.deposit} {Math.round(depositRatio)}%
                    </span>
                    <span className="font-semibold text-red-600">
                      {L.withdrawal} {Math.round(withdrawalRatio)}%
                    </span>
                  </div>
                </div>
                {topCounterparties.length ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <div className="mb-2 flex items-center gap-2 erp-text-caption font-bold text-slate-600">
                      <Building2 size={14} />
                      {L.topCounterparties}
                    </div>
                    {topCounterparties.map((item) => (
                      <div key={item.name} className="erp-bank-counterparty-item">
                        <span className="truncate text-sm font-medium text-slate-800">{item.name}</span>
                        <span className="shrink-0 text-xs font-bold text-slate-600">
                          {item.depositTotal > 0 ? (
                            <span className="text-emerald-700">+{formatKRW(item.depositTotal)}</span>
                          ) : null}
                          {item.depositTotal > 0 && item.withdrawalTotal > 0 ? " / " : null}
                          {item.withdrawalTotal > 0 ? (
                            <span className="text-red-600">-{formatKRW(item.withdrawalTotal)}</span>
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
            </>
          ) : null}
        </>
      )}

      {hasAnyData && pageView === "list" ? (
        <Card className="mb-4 rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 erp-text-caption font-bold text-slate-500">{L.periodLabel}</span>
              {PERIOD_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  size="sm"
                  variant={periodKey === option.key ? "default" : "outline"}
                  className="rounded-xl"
                  onClick={() => setPeriodKey(option.key)}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label={L.periodStart}>
                <KoreanDateInput
                  value={activePeriod.startDate}
                  onChange={(value) => {
                    setPeriodKey("custom");
                    setDateFilter((prev) => ({ ...prev, startDate: value }));
                  }}
                />
              </Field>
              <Field label={L.periodEnd}>
                <KoreanDateInput
                  value={activePeriod.endDate}
                  onChange={(value) => {
                    setPeriodKey("custom");
                    setDateFilter((prev) => ({ ...prev, endDate: value }));
                  }}
                />
              </Field>
              <Field label={L.accountFilter}>
                <select
                  className="erp-input w-full rounded-xl"
                  value={accountFilter}
                  onChange={(event) => setAccountFilter(event.target.value)}
                >
                  <option value="">{L.allAccounts}</option>
                  {accountSummaries.map((account) => (
                    <option key={account.accountNumber} value={account.accountNumber}>
                      {account.accountNumber}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={L.search}>
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="erp-input w-full rounded-xl pl-9"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={L.search}
                  />
                </div>
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 erp-text-caption font-bold text-slate-500">{L.flowLabel}</span>
              {FLOW_FILTER_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  size="sm"
                  variant={flowFilter === option.key ? "default" : "outline"}
                  className={`rounded-xl ${flowFilter === option.key && option.key !== "all" ? option.tone : ""}`}
                  onClick={() => setFlowFilter(option.key)}
                >
                  {option.label}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto rounded-xl text-slate-500"
                onClick={() => {
                  setPeriodKey("thisMonth");
                  setDateFilter(monthRangeISO(0));
                  setFlowFilter("all");
                  setAccountFilter("");
                  setQuery("");
                }}
              >
                {L.resetFilter}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {hasAnyData && pageView === "list" ? (
        <TableExportSection
          fileName={`bank-transactions-${todayISO()}`}
          title={L.pageTitle}
          disabled={!filteredRows.length}
          tableSelector="#bank-transactions-table"
        >
          <DesktopTableWrap>
            <table id="bank-transactions-table" ref={tableRef} className="erp-table erp-bank-table w-full min-w-[960px]">
              <thead>
                <tr className="bg-slate-100 text-left text-slate-600">
                  <th>{L.transactionAt}</th>
                  <th className="text-right">{L.deposit}</th>
                  <th className="text-right">{L.withdrawal}</th>
                  <th className="text-right">{L.balance}</th>
                  <th>{L.description}</th>
                <th>{L.counterpartyName}</th>
                <th>{L.classification}</th>
                <th>{L.counterpartyBank}</th>
                <th>{L.matchStatus}</th>
                <th>{L.transactionType}</th>
                <th>{L.assignFolder}</th>
                <th>{L.memo}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length ? (
                  filteredRows.map(renderRow)
                ) : (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-500">
                      {L.empty}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </DesktopTableWrap>

          <MobileRecordList>
            {filteredRows.length ? (
              filteredRows.map(renderMobileCard)
            ) : (
              <div className="py-8 text-center text-slate-500">{L.empty}</div>
            )}
          </MobileRecordList>
        </TableExportSection>
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
              {buildSentStatementMatchCandidates(linkModalTx, sentArchives, { minScore: 0, limit: 30, clients }).map((candidate) => (
                <button
                  key={candidate.pdfArchiveId}
                  type="button"
                  className="w-full rounded-xl border border-violet-200 bg-violet-50/40 px-4 py-3 text-left hover:border-violet-300 hover:bg-violet-50"
                  onClick={() => void confirmSentStatementMatch(linkModalTx, candidate)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{candidate.client}</span>
                    <span className="text-xs font-bold text-violet-700">
                      {L.matchScore} {candidate.score}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {L.statementTotal} {formatKRW(candidate.statementTotalAmount)}
                    {" \u00B7 "}
                    {L.sentAt} {String(candidate.sentAt || "").slice(0, 10)}
                  </div>
                </button>
              ))}
              {buildSentStatementMatchCandidates(linkModalTx, sentArchives, { minScore: 0, limit: 30, clients }).length > 0 &&
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
        <div className="erp-ledger-modal-backdrop" onClick={() => setLedgerModal(null)}>
          <div
            className="erp-ledger-modal max-w-lg"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  <BookOpen size={14} />
                  {L.ledgerRegister}
                </div>
                <h2 className="erp-text-section font-bold">{L.ledgerRegisterTitle}</h2>
                <p className="mt-1 erp-text-caption text-slate-500">{L.ledgerRegisterDesc}</p>
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
              <Field label={L.ledgerDate}>
                <KoreanDateInput value={ledgerModal.date} onChange={(value) => setLedgerModal((prev) => (prev ? { ...prev, date: value } : prev))} />
              </Field>
              {ledgerModal.kind === "fixed" ? (
                <Field label={L.ledgerFixedItem}>
                  <AutocompleteSelect
                    value={ledgerModal.fixedExpenseId}
                    options={fixedExpenseSelectOptions}
                    placeholder={L.ledgerFixedItem}
                    compact={false}
                    inputProps={{ className: "rounded-xl" }}
                    onChange={(value, raw) => {
                      setLedgerModal((prev) => {
                        if (!prev) return prev;
                        const next = { ...prev, fixedExpenseId: value };
                        if (raw && typeof raw === "object" && "fixedExpense" in raw) {
                          const fixedExpense = raw.fixedExpense as FixedExpense;
                          if (!prev.description.trim()) {
                            next.description = fixedExpense.name;
                          }
                        }
                        return next;
                      });
                    }}
                  />
                  <p className="mt-1.5 text-xs font-semibold text-amber-700">{L.ledgerSaveFixedHint}</p>
                </Field>
              ) : (
                <Field label={L.ledgerManualCategory}>
                  <AutocompleteInput
                    value={ledgerModal.category}
                    options={manualCategoryOptions}
                    placeholder={L.ledgerManualCategory}
                    freeSolo
                    compact={false}
                    inputProps={{ className: "rounded-xl" }}
                    onChange={(value) =>
                      setLedgerModal((prev) => (prev ? { ...prev, category: String(value || "").trim() } : prev))
                    }
                  />
                  <p className="mt-1.5 text-xs font-semibold text-slate-500">
                    {`${L.ledgerSaveManualHint}. ${L.ledgerCategoryAddHint}`}
                  </p>
                </Field>
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
                  <input
                    className="erp-input w-full rounded-xl"
                    value={ledgerModal.memo}
                    onChange={(event) => setLedgerModal((prev) => (prev ? { ...prev, memo: event.target.value } : prev))}
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
                {L.ledgerSave}
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
                  onChange={(event) => setNewFolderType(event.target.value as BankTransactionFolderType)}
                >
                  <option value="client">{L.clientFolders}</option>
                  <option value="card">{L.cardFolders}</option>
                  <option value="worker">{L.workerFolders}</option>
                </select>
              </Field>
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
    </div>
  );
}
