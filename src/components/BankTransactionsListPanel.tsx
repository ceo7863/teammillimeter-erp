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
  getBankTransactionsExportParsed: () => ReturnType<typeof import("@/utils/bankTransactionRowDisplay").buildBankTransactionsExportTable> | null;
};

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
              <>
                <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onBatchEvidenceAutoLink}>
                  {evidenceAutoMatchLabel}
                </Button>
                <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onOpenPreauthNet}>
                  <ArrowLeftRight size={14} className="mr-1" />
                  {preauthNetOpenLabel}
                </Button>
                <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onOpenRecurringFixed}>
                  <Repeat size={14} className="mr-1" />
                  {recurringFixedOpenLabel}
                </Button>
                <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onAutoClassify}>
                  <Sparkles size={14} className="mr-1" />
                  {autoClassifyLabel}
                </Button>
                <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onCreateFixedExpenseItem}>
                  {addFixedExpenseLabel}
                </Button>
              </>
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

export const BankTransactionsListPanel = memo(BankTransactionsListPanelComponent);
