import React, { memo } from "react";
import {
  BankTransactionFilterBar,
  type BankTransactionAppliedFilters,
} from "@/components/BankTransactionFilterBar";
import { BankTransactionsListPanel } from "@/components/BankTransactionsListPanel";
import type { BankTransactionColumnPreset } from "@/utils/bankTransactionColumnVisibility";
import type { BankTransactionListSectionLabels } from "@/components/BankTransactionListSection";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { AccountCode, LedgerCategory } from "@/utils/ledgerSystem";
import type { TaxInvoice } from "@/utils/taxInvoices";
import type { WorkerMonthlyActualVoucher } from "@/utils/workerMonthlyActualPayments";
import type { BankTxStatusTab } from "@/utils/bankTransactionStatusFilter";

export type BankTransactionsListShellProps = {
  appliedFilters: BankTransactionAppliedFilters;
  filterResetKey: number;
  pendingColumnPreset?: BankTransactionColumnPreset | null;
  onPendingColumnPresetConsumed?: () => void;
  statusCounts: Partial<Record<Exclude<BankTxStatusTab, "all">, number>>;
  accountSummaries: Array<{ accountNumber: string; bankName?: string }>;
  accountSubjectFilterOptions: Array<{ code: string; name: string }>;
  clients: Array<{ name?: string }>;
  onApplySearch: (searchQuery: string) => void;
  onApplyFilters: (filters: BankTransactionAppliedFilters) => void;
  onResetFilters: () => void;
  rows: BankTransaction[];
  isListActive: boolean;
  showEmptyPeriodHint: boolean;
  emptyPeriodHint: string;
  exportFileName: string;
  exportTitle: string;
  accountSubjectLabels: Record<string, string>;
  folderMap: Map<string, BankTransactionFolder>;
  ledgerCategoryFolder?: BankTransactionFolder;
  companyExpenses: CompanyExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  fixedExpenses: FixedExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
  taxInvoices: TaxInvoice[];
  workers: Array<{ name?: string }>;
  workerMonthlyActualVouchers?: WorkerMonthlyActualVoucher[];
  paymentVouchers: Array<{ bankTransactionId?: string | number; isPartialPayment?: boolean }>;
  labels: BankTransactionListSectionLabels;
  stats: { count: number; deposits: number; withdrawals: number; net: number };
  onEditMemo: (row: BankTransaction) => void;
  onEditAccountSubject: (row: BankTransaction) => void;
  onEditClient: (row: BankTransaction) => void;
  onEditFixedExpense: (row: BankTransaction) => void;
  onFindEvidence: (row: BankTransaction) => void;
  onFindErpProcess: (row: BankTransaction) => void;
  onIssueTaxInvoice?: (row: BankTransaction) => void;
  onFilterCounterparty: (label: string) => void;
  onBatchEvidenceAutoLink: () => void;
  onOpenPreauthNet: () => void;
  onOpenRecurringFixed: () => void;
  onAutoClassify: () => void;
  onOpenClassificationRules?: () => void;
  onCreateFixedExpenseItem: () => void;
  classificationRulesLabel?: string;
  classificationRulesCount?: number;
  preauthNetActionCount: number;
  recurringFixedActionCount: number;
  evidenceAutoMatchLabel: string;
  preauthNetOpenLabel: string;
  recurringFixedOpenLabel: string;
  autoClassifyLabel: string;
  addFixedExpenseLabel: string;
  getBankTransactionsExportParsed: () => ReturnType<
    typeof import("@/utils/bankTransactionRowDisplay").buildBankTransactionsExportTable
  > | null;
};

function BankTransactionsListShellComponent(props: BankTransactionsListShellProps) {
  const {
    appliedFilters,
    filterResetKey,
    pendingColumnPreset,
    onPendingColumnPresetConsumed,
    statusCounts,
    accountSummaries,
    accountSubjectFilterOptions,
    clients,
    onApplySearch,
    onApplyFilters,
    onResetFilters,
    rows,
    isListActive,
    showEmptyPeriodHint,
    emptyPeriodHint,
    exportFileName,
    exportTitle,
    accountSubjectLabels,
    folderMap,
    ledgerCategoryFolder,
    companyExpenses,
    fixedExpensePayments,
    fixedExpenses,
    ledgerCategories,
    accountCodes,
    taxInvoices,
    workers,
    workerMonthlyActualVouchers,
    paymentVouchers,
    labels,
    stats,
    onEditMemo,
    onEditAccountSubject,
    onEditClient,
    onEditFixedExpense,
    onFindEvidence,
    onFindErpProcess,
    onIssueTaxInvoice,
    onFilterCounterparty,
    onBatchEvidenceAutoLink,
    onOpenPreauthNet,
    onOpenRecurringFixed,
    onAutoClassify,
    onOpenClassificationRules,
    onCreateFixedExpenseItem,
    classificationRulesLabel,
    classificationRulesCount,
    preauthNetActionCount,
    recurringFixedActionCount,
    evidenceAutoMatchLabel,
    preauthNetOpenLabel,
    recurringFixedOpenLabel,
    autoClassifyLabel,
    addFixedExpenseLabel,
    getBankTransactionsExportParsed,
  } = props;

  return (
    <>
      <BankTransactionFilterBar
        applied={appliedFilters}
        onApplySearch={onApplySearch}
        onApply={onApplyFilters}
        statusCounts={statusCounts}
        accounts={accountSummaries}
        accountSubjects={accountSubjectFilterOptions}
        clients={clients}
        filterResetKey={filterResetKey}
        onReset={onResetFilters}
      />
      <BankTransactionsListPanel
        rows={rows}
        isListActive={isListActive}
        pendingColumnPreset={pendingColumnPreset}
        onPendingColumnPresetConsumed={onPendingColumnPresetConsumed}
        showEmptyPeriodHint={showEmptyPeriodHint}
        emptyPeriodHint={emptyPeriodHint}
        exportFileName={exportFileName}
        exportTitle={exportTitle}
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
        workerMonthlyActualVouchers={workerMonthlyActualVouchers}
        paymentVouchers={paymentVouchers}
        labels={labels}
        stats={stats}
        onEditMemo={onEditMemo}
        onEditAccountSubject={onEditAccountSubject}
        onEditClient={onEditClient}
        onEditFixedExpense={onEditFixedExpense}
        onFindEvidence={onFindEvidence}
        onFindErpProcess={onFindErpProcess}
        onIssueTaxInvoice={onIssueTaxInvoice}
        onFilterCounterparty={onFilterCounterparty}
        onBatchEvidenceAutoLink={onBatchEvidenceAutoLink}
        onOpenPreauthNet={onOpenPreauthNet}
        onOpenRecurringFixed={onOpenRecurringFixed}
        onAutoClassify={onAutoClassify}
        onOpenClassificationRules={onOpenClassificationRules}
        onCreateFixedExpenseItem={onCreateFixedExpenseItem}
        classificationRulesLabel={classificationRulesLabel}
        classificationRulesCount={classificationRulesCount}
        preauthNetActionCount={preauthNetActionCount}
        recurringFixedActionCount={recurringFixedActionCount}
        evidenceAutoMatchLabel={evidenceAutoMatchLabel}
        preauthNetOpenLabel={preauthNetOpenLabel}
        recurringFixedOpenLabel={recurringFixedOpenLabel}
        autoClassifyLabel={autoClassifyLabel}
        addFixedExpenseLabel={addFixedExpenseLabel}
        getBankTransactionsExportParsed={getBankTransactionsExportParsed}
      />
    </>
  );
}

function bankTransactionsListShellPropsAreEqual(
  prev: BankTransactionsListShellProps,
  next: BankTransactionsListShellProps,
): boolean {
  if (prev.isListActive !== next.isListActive) return false;
  if (prev.showEmptyPeriodHint !== next.showEmptyPeriodHint) return false;
  if (prev.filterResetKey !== next.filterResetKey) return false;
  if (prev.emptyPeriodHint !== next.emptyPeriodHint) return false;
  if (prev.exportFileName !== next.exportFileName) return false;
  if (prev.exportTitle !== next.exportTitle) return false;
  if (prev.preauthNetActionCount !== next.preauthNetActionCount) return false;
  if (prev.recurringFixedActionCount !== next.recurringFixedActionCount) return false;
  if (prev.evidenceAutoMatchLabel !== next.evidenceAutoMatchLabel) return false;
  if (prev.preauthNetOpenLabel !== next.preauthNetOpenLabel) return false;
  if (prev.recurringFixedOpenLabel !== next.recurringFixedOpenLabel) return false;
  if (prev.autoClassifyLabel !== next.autoClassifyLabel) return false;
  if (prev.classificationRulesLabel !== next.classificationRulesLabel) return false;
  if (prev.classificationRulesCount !== next.classificationRulesCount) return false;
  if (prev.addFixedExpenseLabel !== next.addFixedExpenseLabel) return false;
  if (prev.labels !== next.labels) return false;
  if (prev.appliedFilters !== next.appliedFilters) return false;
  if (prev.statusCounts !== next.statusCounts) return false;
  if (prev.accountSummaries !== next.accountSummaries) return false;
  if (prev.accountSubjectFilterOptions !== next.accountSubjectFilterOptions) return false;
  if (prev.clients !== next.clients) return false;
  if (prev.stats !== next.stats) return false;
  if (prev.accountSubjectLabels !== next.accountSubjectLabels) return false;
  if (prev.folderMap !== next.folderMap) return false;
  if (prev.ledgerCategoryFolder !== next.ledgerCategoryFolder) return false;
  if (prev.companyExpenses !== next.companyExpenses) return false;
  if (prev.fixedExpensePayments !== next.fixedExpensePayments) return false;
  if (prev.fixedExpenses !== next.fixedExpenses) return false;
  if (prev.ledgerCategories !== next.ledgerCategories) return false;
  if (prev.accountCodes !== next.accountCodes) return false;
  if (prev.taxInvoices !== next.taxInvoices) return false;
  if (prev.workers !== next.workers) return false;
  if (prev.workerMonthlyActualVouchers !== next.workerMonthlyActualVouchers) return false;
  if (prev.paymentVouchers !== next.paymentVouchers) return false;

  if (prev.rows !== next.rows) {
    if (prev.rows.length !== next.rows.length) return false;
    for (let i = 0; i < prev.rows.length; i += 1) {
      if (prev.rows[i] !== next.rows[i]) return false;
    }
  }

  if (prev.onApplySearch !== next.onApplySearch) return false;
  if (prev.onApplyFilters !== next.onApplyFilters) return false;
  if (prev.onResetFilters !== next.onResetFilters) return false;
  if (prev.onEditMemo !== next.onEditMemo) return false;
  if (prev.onEditAccountSubject !== next.onEditAccountSubject) return false;
  if (prev.onEditClient !== next.onEditClient) return false;
  if (prev.onEditFixedExpense !== next.onEditFixedExpense) return false;
  if (prev.onFindEvidence !== next.onFindEvidence) return false;
  if (prev.onFindErpProcess !== next.onFindErpProcess) return false;
  if (prev.onIssueTaxInvoice !== next.onIssueTaxInvoice) return false;
  if (prev.onFilterCounterparty !== next.onFilterCounterparty) return false;
  if (prev.onBatchEvidenceAutoLink !== next.onBatchEvidenceAutoLink) return false;
  if (prev.onOpenPreauthNet !== next.onOpenPreauthNet) return false;
  if (prev.onOpenRecurringFixed !== next.onOpenRecurringFixed) return false;
  if (prev.onAutoClassify !== next.onAutoClassify) return false;
  if (prev.onOpenClassificationRules !== next.onOpenClassificationRules) return false;
  if (prev.onCreateFixedExpenseItem !== next.onCreateFixedExpenseItem) return false;
  if (prev.getBankTransactionsExportParsed !== next.getBankTransactionsExportParsed) return false;

  return true;
}

export const BankTransactionsListShell = memo(
  BankTransactionsListShellComponent,
  bankTransactionsListShellPropsAreEqual,
);
