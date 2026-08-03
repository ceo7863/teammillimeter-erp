import React, { memo, useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, ListChecks, Repeat, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BankTransactionDisplaySettings } from "@/components/BankTransactionDisplaySettings";
import { BankTransactionListSection, type BankTransactionListSectionLabels } from "@/components/BankTransactionListSection";
import { BankTransactionTableFooter } from "@/components/BankTransactionTableFooter";
import { TableExportSection } from "@/components/TableExportSection";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import {
  buildBankTransactionColumnVisibilityFromPreset,
  loadBankTransactionColumnVisibility,
  saveBankTransactionColumnVisibility,
  type BankTransactionColumnPreset,
  type BankTransactionColumnVisibility,
  type BankTransactionDisplayColumnKey,
} from "@/utils/bankTransactionColumnVisibility";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { AccountCode, LedgerCategory } from "@/utils/ledgerSystem";
import type { TaxInvoice } from "@/utils/taxInvoices";
import type { WorkerMonthlyActualVoucher } from "@/utils/workerMonthlyActualPayments";

type BankTransactionsListPanelProps = {
  rows: BankTransaction[];
  isListActive: boolean;
  pendingColumnPreset?: BankTransactionColumnPreset | null;
  onPendingColumnPresetConsumed?: () => void;
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
  clients: Array<{ name?: string }>;
  workers: Array<{ name?: string }>;
  workerMonthlyActualVouchers?: WorkerMonthlyActualVoucher[];
  paymentVouchers: Array<{ bankTransactionId?: string | number; salesId?: number | string; finalAmount?: number; amount?: number; linkedPdfArchiveId?: string; isPartialPayment?: boolean }>;
  sentArchives?: Array<{ id: string; statementTotalAmount?: number; statementSalesIds?: Array<string | number> }>;
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
  evidenceAutoMatchLabel: string;
  preauthNetOpenLabel: string;
  recurringFixedOpenLabel: string;
  autoClassifyLabel: string;
  addFixedExpenseLabel: string;
  preauthNetActionCount: number;
  recurringFixedActionCount: number;
  getBankTransactionsExportParsed: () => ReturnType<typeof import("@/utils/bankTransactionRowDisplay").buildBankTransactionsExportTable> | null;
};

const BankTransactionsListToolbar = memo(function BankTransactionsListToolbar({
  onBatchEvidenceAutoLink,
  onOpenPreauthNet,
  onOpenRecurringFixed,
  onAutoClassify,
  onOpenClassificationRules,
  onCreateFixedExpenseItem,
  classificationRulesLabel,
  classificationRulesCount = 0,
  evidenceAutoMatchLabel,
  preauthNetOpenLabel,
  recurringFixedOpenLabel,
  autoClassifyLabel,
  addFixedExpenseLabel,
  preauthNetActionCount,
  recurringFixedActionCount,
  columnVisibility,
  displaySettingsLabels,
  onColumnVisibilityChange,
}: Pick<
  BankTransactionsListPanelProps,
  | "onBatchEvidenceAutoLink"
  | "onOpenPreauthNet"
  | "onOpenRecurringFixed"
  | "onAutoClassify"
  | "onOpenClassificationRules"
  | "onCreateFixedExpenseItem"
  | "classificationRulesLabel"
  | "classificationRulesCount"
  | "evidenceAutoMatchLabel"
  | "preauthNetOpenLabel"
  | "recurringFixedOpenLabel"
  | "autoClassifyLabel"
  | "addFixedExpenseLabel"
  | "preauthNetActionCount"
  | "recurringFixedActionCount"
> & {
  columnVisibility: BankTransactionColumnVisibility;
  displaySettingsLabels: BankTransactionListSectionLabels;
  onColumnVisibilityChange: (key: BankTransactionDisplayColumnKey, visible: boolean) => void;
}) {
  return (
    <>
      <BankTransactionDisplaySettings
        visibility={columnVisibility}
        labels={displaySettingsLabels}
        onChange={onColumnVisibilityChange}
      />
      <div className="erp-bank-wehago-table-toolbar__actions">
        <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onBatchEvidenceAutoLink}>
          {evidenceAutoMatchLabel}
        </Button>
        {preauthNetActionCount > 0 ? (
          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onOpenPreauthNet}>
            <ArrowLeftRight size={14} className="mr-1" />
            {preauthNetOpenLabel} ({preauthNetActionCount})
          </Button>
        ) : null}
        {recurringFixedActionCount > 0 ? (
          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onOpenRecurringFixed}>
            <Repeat size={14} className="mr-1" />
            {recurringFixedOpenLabel} ({recurringFixedActionCount})
          </Button>
        ) : null}
        {onOpenClassificationRules ? (
          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onOpenClassificationRules}>
            <ListChecks size={14} className="mr-1" />
            {classificationRulesLabel || "분류 규칙"}
            {classificationRulesCount > 0 ? ` (${classificationRulesCount})` : ""}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onAutoClassify}>
          <Sparkles size={14} className="mr-1" />
          {autoClassifyLabel}
        </Button>
        <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onCreateFixedExpenseItem}>
          {addFixedExpenseLabel}
        </Button>
      </div>
    </>
  );
});

function BankTransactionsListPanelComponent({
  rows,
  isListActive,
  pendingColumnPreset = null,
  onPendingColumnPresetConsumed,
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
  clients,
  workers,
  workerMonthlyActualVouchers = [],
  paymentVouchers,
  sentArchives,
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
  classificationRulesCount = 0,
  evidenceAutoMatchLabel,
  preauthNetOpenLabel,
  recurringFixedOpenLabel,
  autoClassifyLabel,
  addFixedExpenseLabel,
  preauthNetActionCount,
  recurringFixedActionCount,
  getBankTransactionsExportParsed,
}: BankTransactionsListPanelProps) {
  const [columnVisibility, setColumnVisibility] = useState(loadBankTransactionColumnVisibility);

  useEffect(() => {
    if (!pendingColumnPreset) return;
    const next = buildBankTransactionColumnVisibilityFromPreset(pendingColumnPreset);
    setColumnVisibility(next);
    saveBankTransactionColumnVisibility(next);
    onPendingColumnPresetConsumed?.();
  }, [pendingColumnPreset, onPendingColumnPresetConsumed]);

  const handleColumnVisibilityChange = useCallback(
    (key: BankTransactionDisplayColumnKey, visible: boolean) => {
      setColumnVisibility((prev) => {
        const next = { ...prev, [key]: visible };
        saveBankTransactionColumnVisibility(next);
        return next;
      });
    },
    [],
  );

  return (
    <>
      {showEmptyPeriodHint ? (
        <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {emptyPeriodHint}
        </p>
      ) : null}
      <div className="erp-bank-wehago-table-shell border border-slate-200 bg-white">
        <TableExportSection
          fileName={exportFileName}
          title={exportTitle}
          disabled={!rows.length}
          hideToolbar
          tableSelector="#bank-transactions-table"
          getParsedTable={getBankTransactionsExportParsed}
        >
          <BankTransactionListSection
            rows={rows}
            isListActive={isListActive}
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
        sentArchives={sentArchives}
            labels={labels}
            columnVisibility={columnVisibility}
            onEditMemo={onEditMemo}
            onEditAccountSubject={onEditAccountSubject}
            onEditClient={onEditClient}
            onEditFixedExpense={onEditFixedExpense}
            onFindEvidence={onFindEvidence}
            onFindErpProcess={onFindErpProcess}
            onIssueTaxInvoice={onIssueTaxInvoice}
            onFilterCounterparty={onFilterCounterparty}
            toolbar={
              <BankTransactionsListToolbar
                onBatchEvidenceAutoLink={onBatchEvidenceAutoLink}
                onOpenPreauthNet={onOpenPreauthNet}
                onOpenRecurringFixed={onOpenRecurringFixed}
                onAutoClassify={onAutoClassify}
                onOpenClassificationRules={onOpenClassificationRules}
                onCreateFixedExpenseItem={onCreateFixedExpenseItem}
                classificationRulesLabel={classificationRulesLabel}
                classificationRulesCount={classificationRulesCount}
                evidenceAutoMatchLabel={evidenceAutoMatchLabel}
                preauthNetOpenLabel={preauthNetOpenLabel}
                recurringFixedOpenLabel={recurringFixedOpenLabel}
                autoClassifyLabel={autoClassifyLabel}
                addFixedExpenseLabel={addFixedExpenseLabel}
                preauthNetActionCount={preauthNetActionCount}
                recurringFixedActionCount={recurringFixedActionCount}
                columnVisibility={columnVisibility}
                displaySettingsLabels={labels}
                onColumnVisibilityChange={handleColumnVisibilityChange}
              />
            }
          />
          <BankTransactionTableFooter
            count={stats.count}
            deposits={stats.deposits}
            withdrawals={stats.withdrawals}
            net={stats.net}
          />
        </TableExportSection>
      </div>
    </>
  );
}

function bankTransactionsListPanelPropsAreEqual(
  prev: BankTransactionsListPanelProps,
  next: BankTransactionsListPanelProps,
): boolean {
  if (prev.isListActive !== next.isListActive) return false;
  if (prev.pendingColumnPreset !== next.pendingColumnPreset) return false;
  if (prev.showEmptyPeriodHint !== next.showEmptyPeriodHint) return false;
  if (prev.emptyPeriodHint !== next.emptyPeriodHint) return false;
  if (prev.exportFileName !== next.exportFileName) return false;
  if (prev.exportTitle !== next.exportTitle) return false;
  if (prev.labels !== next.labels) return false;
  if (prev.preauthNetActionCount !== next.preauthNetActionCount) return false;
  if (prev.recurringFixedActionCount !== next.recurringFixedActionCount) return false;
  if (prev.evidenceAutoMatchLabel !== next.evidenceAutoMatchLabel) return false;
  if (prev.preauthNetOpenLabel !== next.preauthNetOpenLabel) return false;
  if (prev.recurringFixedOpenLabel !== next.recurringFixedOpenLabel) return false;
  if (prev.autoClassifyLabel !== next.autoClassifyLabel) return false;
  if (prev.classificationRulesLabel !== next.classificationRulesLabel) return false;
  if (prev.classificationRulesCount !== next.classificationRulesCount) return false;
  if (prev.addFixedExpenseLabel !== next.addFixedExpenseLabel) return false;

  if ((prev.stats?.count ?? 0) !== (next.stats?.count ?? 0)) return false;
  if ((prev.stats?.deposits ?? 0) !== (next.stats?.deposits ?? 0)) return false;
  if ((prev.stats?.withdrawals ?? 0) !== (next.stats?.withdrawals ?? 0)) return false;
  if ((prev.stats?.net ?? 0) !== (next.stats?.net ?? 0)) return false;

  if (prev.rows !== next.rows) {
    if (prev.rows.length !== next.rows.length) return false;
    for (let i = 0; i < prev.rows.length; i += 1) {
      if (prev.rows[i] !== next.rows[i]) return false;
    }
  }

  if (prev.accountSubjectLabels !== next.accountSubjectLabels) return false;
  if (prev.folderMap !== next.folderMap) return false;
  if (prev.ledgerCategoryFolder !== next.ledgerCategoryFolder) return false;
  if (prev.companyExpenses !== next.companyExpenses) return false;
  if (prev.fixedExpensePayments !== next.fixedExpensePayments) return false;
  if (prev.fixedExpenses !== next.fixedExpenses) return false;
  if (prev.ledgerCategories !== next.ledgerCategories) return false;
  if (prev.accountCodes !== next.accountCodes) return false;
  if (prev.taxInvoices !== next.taxInvoices) return false;
  if (prev.clients !== next.clients) return false;
  if (prev.workers !== next.workers) return false;
  if (prev.paymentVouchers !== next.paymentVouchers) return false;
  if (prev.sentArchives !== next.sentArchives) return false;

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

export const BankTransactionsListPanel = memo(BankTransactionsListPanelComponent, bankTransactionsListPanelPropsAreEqual);
