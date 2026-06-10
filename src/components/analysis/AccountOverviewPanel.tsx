import React, { useMemo, useState } from "react";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import {
  buildLedgerSourceBreakdown,
  buildPeriodAccountSummary,
  buildPeriodBankTotals,
} from "@/utils/financialAnalysis";
import {
  buildAllLedgerEntries,
  buildLedgerGapSummary,
  type AccountCode,
  type LedgerCategory,
} from "@/utils/ledgerSystem";
import {
  FinancialEmpty,
  FinancialPanel,
  FinancialSummaryBar,
  FinancialTableWrap,
  FinancialToolbar,
  formatFinancialKRW,
  resolveFinancialPeriodRange,
  type FinancialPeriod,
} from "@/components/analysis/AnalysisUi";

const L = {
  title: "\uACC4\uC815 \uC694\uC57D",
  income: "\uC785\uAE08",
  expense: "\uCD9C\uAE08",
  net: "\uC21C\uC561",
  accountCode: "\uCF54\uB4DC",
  accountName: "\uACC4\uC815\uACFC\uBAA9",
  parentGroup: "\uADF8\uB8F9",
  count: "\uAC74\uC218",
  sourceTitle: "\uB4F1\uB85D \uACBD\uB85C\uBCC4",
  sourceLabel: "\uACBD\uB85C",
  accountTable: "\uACC4\uC815\uACFC\uBAA9\uBCC4 \uC9D1\uACC4",
  unclassified: "\uBBF8\uBD84\uB958 \uD1B5\uC7A5",
  closingBalance: "\uAE30\uB9D0 \uC794\uACE0",
  empty: "\uD574\uB2F9 \uAE30\uAC04 \uD655\uC815 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  caseSuffix: "\uAC74",
  withdrawalPrefix: "\uCD9C\uAE08",
  openUnclassified: "\uBBF8\uBD84\uB958 \uD1B5\uC7A5 \uBD84\uB958\uD558\uAE30",
};

type AccountOverviewPanelProps = {
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
  fixedExpensePayments?: FixedExpensePayment[];
  fixedExpenses?: FixedExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
  onOpenUnclassifiedInbox?: () => void;
};

export function AccountOverviewPanel({
  bankTransactions,
  companyExpenses,
  fixedExpensePayments,
  fixedExpenses,
  ledgerCategories,
  accountCodes,
  onOpenUnclassifiedInbox,
}: AccountOverviewPanelProps) {
  const [period, setPeriod] = useState<FinancialPeriod>("month");
  const initialRange = resolveFinancialPeriodRange("month");
  const [dateFrom, setDateFrom] = useState(initialRange.startDate);
  const [dateTo, setDateTo] = useState(initialRange.endDate);

  const handlePeriodChange = (next: FinancialPeriod) => {
    setPeriod(next);
    const range = resolveFinancialPeriodRange(next);
    setDateFrom(range.startDate);
    setDateTo(range.endDate);
  };

  const allEntries = useMemo(
    () =>
      buildAllLedgerEntries({
        bankTransactions,
        companyExpenses,
        fixedExpensePayments,
        fixedExpenses,
        categories: ledgerCategories,
        accountCodes,
      }),
    [bankTransactions, companyExpenses, fixedExpensePayments, fixedExpenses, ledgerCategories, accountCodes],
  );

  const accountRows = useMemo(
    () => buildPeriodAccountSummary(allEntries, accountCodes, dateFrom, dateTo),
    [allEntries, accountCodes, dateFrom, dateTo],
  );

  const sourceRows = useMemo(
    () => buildLedgerSourceBreakdown(allEntries, dateFrom, dateTo),
    [allEntries, dateFrom, dateTo],
  );

  const gap = useMemo(
    () => buildLedgerGapSummary(bankTransactions, allEntries),
    [bankTransactions, allEntries],
  );

  const totals = useMemo(
    () =>
      accountRows.reduce(
        (acc, row) => ({
          income: acc.income + row.income,
          expense: acc.expense + row.expense,
        }),
        { income: 0, expense: 0 },
      ),
    [accountRows],
  );

  const periodBank = useMemo(
    () => buildPeriodBankTotals(bankTransactions, dateFrom, dateTo),
    [bankTransactions, dateFrom, dateTo],
  );

  const summaryItems = [
    { label: L.income, value: formatFinancialKRW(totals.income) },
    { label: L.expense, value: formatFinancialKRW(totals.expense) },
    {
      label: L.net,
      value: formatFinancialKRW(totals.income - totals.expense),
    },
    {
      label: L.unclassified,
      value: gap.unclassifiedCount
        ? `${gap.unclassifiedCount}${L.caseSuffix} ${L.withdrawalPrefix} ${formatFinancialKRW(gap.unclassifiedWithdrawal)}`
        : "-",
    },
    { label: L.closingBalance, value: formatFinancialKRW(periodBank.closingBalance) },
  ];

  return (
    <div className="erp-financial-view">
      <FinancialToolbar
        title={L.title}
        period={period}
        onPeriodChange={handlePeriodChange}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />

      <FinancialSummaryBar items={summaryItems} />

      {gap.unclassifiedCount > 0 && onOpenUnclassifiedInbox ? (
        <div className="mb-4 flex justify-end">
          <button type="button" className="erp-financial-filter-btn" onClick={onOpenUnclassifiedInbox}>
            {L.openUnclassified} ({gap.unclassifiedCount}
            {L.caseSuffix})
          </button>
        </div>
      ) : null}

      <FinancialPanel title={L.sourceTitle}>
        {sourceRows.length ? (
          <FinancialTableWrap>
            <table className="erp-financial-table">
              <thead>
                <tr>
                  <th>{L.sourceLabel}</th>
                  <th className="is-num">{L.income}</th>
                  <th className="is-num">{L.expense}</th>
                  <th className="is-num">{L.count}</th>
                </tr>
              </thead>
              <tbody>
                {sourceRows.map((row) => (
                  <tr key={row.key}>
                    <td className="is-label">{row.label}</td>
                    <td className="is-num">{row.income ? formatFinancialKRW(row.income) : "-"}</td>
                    <td className="is-num">{row.expense ? formatFinancialKRW(row.expense) : "-"}</td>
                    <td className="is-num">{row.count || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FinancialTableWrap>
        ) : (
          <FinancialEmpty message={L.empty} />
        )}
      </FinancialPanel>

      <FinancialPanel title={L.accountTable}>
        {accountRows.length ? (
          <FinancialTableWrap>
            <table className="erp-financial-table">
              <thead>
                <tr>
                  <th>{L.accountCode}</th>
                  <th>{L.accountName}</th>
                  <th>{L.parentGroup}</th>
                  <th className="is-num">{L.income}</th>
                  <th className="is-num">{L.expense}</th>
                  <th className="is-num">{L.net}</th>
                  <th className="is-num">{L.count}</th>
                </tr>
              </thead>
              <tbody>
                {accountRows.map((row) => (
                  <tr key={row.accountCode} className={row.isUncategorized ? "is-warning" : ""}>
                    <td className="is-label font-mono text-xs">{row.accountCode}</td>
                    <td className="is-label">{row.accountName}</td>
                    <td className="is-label text-slate-600">{row.parentGroup}</td>
                    <td className="is-num">{row.income ? formatFinancialKRW(row.income) : "-"}</td>
                    <td className="is-num">{row.expense ? formatFinancialKRW(row.expense) : "-"}</td>
                    <td className={`is-num${row.net < 0 ? " erp-financial-amount-negative" : ""}`}>
                      {formatFinancialKRW(row.net)}
                    </td>
                    <td className="is-num">{row.count || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FinancialTableWrap>
        ) : (
          <FinancialEmpty message={L.empty} />
        )}
      </FinancialPanel>
    </div>
  );
}
