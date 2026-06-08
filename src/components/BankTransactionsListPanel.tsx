import React, { memo } from "react";
import { ArrowLeftRight, Repeat, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BankTransactionListSection, type BankTransactionListSectionLabels } from "@/components/BankTransactionListSection";
import { BankTransactionTableFooter } from "@/components/BankTransactionTableFooter";
import { TableExportSection } from "@/components/TableExportSection";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { AccountCode, LedgerCategory } from "@/utils/ledgerSystem";
import type { TaxInvoice } from "@/utils/taxInvoices";

type BankTransactionsListPanelProps = {
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
  clients: Array<{ name?: string }>;
  workers: Array<{ name?: string }>;
  paymentVouchers: Array<{ bankTransactionId?: string | number; isPartialPayment?: boolean }>;
  labels: BankTransactionListSectionLabels;
  stats: { count: number; deposits: number; withdrawals: number; net: number };
  onEditMemo: (row: BankTransaction) => void;
  onEditAccountSubject: (row: BankTransaction) => void;
  onEditClient: (row: BankTransaction) => void;
  onEditFixedExpense: (row: BankTransaction) => void;
  onFindEvidence: (row: BankTransaction) => void;
  onIssueTaxInvoice?: (row: BankTransaction) => void;
  onFilterCounterparty: (label: string) => void;
  onBatchEvidenceAutoLink: () => void;
  onOpenPreauthNet: () => void;
  onOpenRecurringFixed: () => void;
  onAutoClassify: () => void;
  onCreateFixedExpenseItem: () => void;
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
  onCreateFixedExpenseItem,
  evidenceAutoMatchLabel,
  preauthNetOpenLabel,
  recurringFixedOpenLabel,
  autoClassifyLabel,
  addFixedExpenseLabel,
  preauthNetActionCount,
  recurringFixedActionCount,
}: Pick<
  BankTransactionsListPanelProps,
  | "onBatchEvidenceAutoLink"
  | "onOpenPreauthNet"
  | "onOpenRecurringFixed"
  | "onAutoClassify"
  | "onCreateFixedExpenseItem"
  | "evidenceAutoMatchLabel"
  | "preauthNetOpenLabel"
  | "recurringFixedOpenLabel"
  | "autoClassifyLabel"
  | "addFixedExpenseLabel"
  | "preauthNetActionCount"
  | "recurringFixedActionCount"
>) {
  return (
    <>
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
      <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onAutoClassify}>
        <Sparkles size={14} className="mr-1" />
        {autoClassifyLabel}
      </Button>
      <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onCreateFixedExpenseItem}>
        {addFixedExpenseLabel}
      </Button>
    </>
  );
});

function BankTransactionsListPanelComponent({
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
  clients,
  workers,
  paymentVouchers,
  labels,
  stats,
  onEditMemo,
  onEditAccountSubject,
  onEditClient,
  onEditFixedExpense,
  onFindEvidence,
  onIssueTaxInvoice,
  onFilterCounterparty,
  onBatchEvidenceAutoLink,
  onOpenPreauthNet,
  onOpenRecurringFixed,
  onAutoClassify,
  onCreateFixedExpenseItem,
  evidenceAutoMatchLabel,
  preauthNetOpenLabel,
  recurringFixedOpenLabel,
  autoClassifyLabel,
  addFixedExpenseLabel,
  preauthNetActionCount,
  recurringFixedActionCount,
  getBankTransactionsExportParsed,
}: BankTransactionsListPanelProps) {
  return (
    <>
      {showEmptyPeriodHint ? (
        <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {emptyPeriodHint}
        </p>
      ) : null}
      <div className="erp-bank-wehago-table-shell rounded-2xl border border-slate-200 bg-white shadow-sm">
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
        paymentVouchers={paymentVouchers}
            labels={labels}
            onEditMemo={onEditMemo}
            onEditAccountSubject={onEditAccountSubject}
            onEditClient={onEditClient}
            onEditFixedExpense={onEditFixedExpense}
            onFindEvidence={onFindEvidence}
            onIssueTaxInvoice={onIssueTaxInvoice}
            onFilterCounterparty={onFilterCounterparty}
            toolbar={
              <BankTransactionsListToolbar
                onBatchEvidenceAutoLink={onBatchEvidenceAutoLink}
                onOpenPreauthNet={onOpenPreauthNet}
                onOpenRecurringFixed={onOpenRecurringFixed}
                onAutoClassify={onAutoClassify}
                onCreateFixedExpenseItem={onCreateFixedExpenseItem}
                evidenceAutoMatchLabel={evidenceAutoMatchLabel}
                preauthNetOpenLabel={preauthNetOpenLabel}
                recurringFixedOpenLabel={recurringFixedOpenLabel}
                autoClassifyLabel={autoClassifyLabel}
                addFixedExpenseLabel={addFixedExpenseLabel}
                preauthNetActionCount={preauthNetActionCount}
                recurringFixedActionCount={recurringFixedActionCount}
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

  if (prev.onEditMemo !== next.onEditMemo) return false;
  if (prev.onEditAccountSubject !== next.onEditAccountSubject) return false;
  if (prev.onEditClient !== next.onEditClient) return false;
  if (prev.onEditFixedExpense !== next.onEditFixedExpense) return false;
  if (prev.onFindEvidence !== next.onFindEvidence) return false;
  if (prev.onIssueTaxInvoice !== next.onIssueTaxInvoice) return false;
  if (prev.onFilterCounterparty !== next.onFilterCounterparty) return false;
  if (prev.onBatchEvidenceAutoLink !== next.onBatchEvidenceAutoLink) return false;
  if (prev.onOpenPreauthNet !== next.onOpenPreauthNet) return false;
  if (prev.onOpenRecurringFixed !== next.onOpenRecurringFixed) return false;
  if (prev.onAutoClassify !== next.onAutoClassify) return false;
  if (prev.onCreateFixedExpenseItem !== next.onCreateFixedExpenseItem) return false;
  if (prev.getBankTransactionsExportParsed !== next.getBankTransactionsExportParsed) return false;

  return true;
}

export const BankTransactionsListPanel = memo(BankTransactionsListPanelComponent, bankTransactionsListPanelPropsAreEqual);
