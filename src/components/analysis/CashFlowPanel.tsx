import React, { useMemo, useState } from "react";
import { formatMonthLabel, type CompanyExpense, type FixedExpense, type FixedExpensePayment } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import {
  buildCashFlowAnalysisSummary,
  buildCashFlowSummary,
  collectAnalysisMonthKeys,
} from "@/utils/financialAnalysis";
import { buildAllLedgerEntries, type AccountCode, type LedgerCategory } from "@/utils/ledgerSystem";
import {
  FinancialCheckbox,
  FinancialEmpty,
  FinancialPanel,
  FinancialTableWrap,
  FinancialToolbar,
  formatFinancialKRW,
  resolveFinancialMonthKeys,
  resolveFinancialPeriodRange,
  type FinancialPeriod,
} from "@/components/analysis/AnalysisUi";

const L = {
  title: "\uD604\uAE08\uD750\uB984\uD45C",
  analysisTitle: "\uD604\uAE08\uD750\uB984 \uBD84\uC11D",
  detailTitle: "\uC601\uC5C5\uD65C\uB3D9 \uD604\uAE08\uD750\uB984",
  openingBalance: "\uC6D4\uCD08 \uD604\uAE08 \uC794\uACE0",
  operatingCashFlow: "\uC601\uC5C5\uD65C\uB3D9 \uD604\uAE08\uD750\uB984",
  unclassifiedFlow: "\uACC4\uC815 \uC5C6\uB294 \uC785\uCD9C\uAE08",
  closingBalance: "\uC6D4\uB9D0 \uD604\uAE08 \uC794\uACE0",
  hideEmpty: "\uBE44\uC5B4\uC788\uB294 \uACC4\uC815 \uC228\uAE30\uAE30",
  group: "\uADF8\uB8F9",
  income: "\uC785\uAE08",
  expense: "\uCD9C\uAE08",
  net: "\uC21C\uD604\uAE08",
  total: "\uD569\uACC4",
  empty: "\uD655\uC778\uB41C \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
};

type CashFlowPanelProps = {
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
  fixedExpensePayments?: FixedExpensePayment[];
  fixedExpenses?: FixedExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
};

export function CashFlowPanel({
  bankTransactions,
  companyExpenses,
  fixedExpensePayments,
  fixedExpenses,
  ledgerCategories,
  accountCodes,
}: CashFlowPanelProps) {
  const [hideEmpty, setHideEmpty] = useState(false);
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

  const monthKeys = useMemo(() => {
    const fromEntries = collectAnalysisMonthKeys(allEntries, bankTransactions, [], 12);
    const fromRange = resolveFinancialMonthKeys(dateFrom, dateTo, 6);
    const merged = [...new Set([...fromRange, ...fromEntries])].sort((a, b) => a.localeCompare(b));
    return merged.slice(-6);
  }, [allEntries, bankTransactions, dateFrom, dateTo]);

  const analysisRows = useMemo(
    () => buildCashFlowAnalysisSummary(bankTransactions, allEntries, monthKeys),
    [bankTransactions, allEntries, monthKeys],
  );

  const rows = useMemo(
    () => buildCashFlowSummary(allEntries, accountCodes, monthKeys),
    [allEntries, accountCodes, monthKeys],
  );

  const visibleRows = useMemo(() => {
    if (!hideEmpty) return rows;
    return rows.filter(
      (row) =>
        row.totalIncome !== 0 ||
        row.totalExpense !== 0 ||
        row.totalNet !== 0 ||
        monthKeys.some(
          (mk) => (row.monthlyIncome[mk] || 0) !== 0 || (row.monthlyExpense[mk] || 0) !== 0,
        ),
    );
  }, [rows, hideEmpty, monthKeys]);

  const totals = useMemo(() => {
    const monthlyIncome: Record<string, number> = Object.fromEntries(monthKeys.map((mk) => [mk, 0]));
    const monthlyExpense: Record<string, number> = Object.fromEntries(monthKeys.map((mk) => [mk, 0]));
    const monthlyNet: Record<string, number> = Object.fromEntries(monthKeys.map((mk) => [mk, 0]));
    let totalIncome = 0;
    let totalExpense = 0;
    for (const row of visibleRows) {
      totalIncome += row.totalIncome;
      totalExpense += row.totalExpense;
      for (const mk of monthKeys) {
        monthlyIncome[mk] += row.monthlyIncome[mk] || 0;
        monthlyExpense[mk] += row.monthlyExpense[mk] || 0;
        monthlyNet[mk] += row.monthlyNet[mk] || 0;
      }
    }
    return { monthlyIncome, monthlyExpense, monthlyNet, totalIncome, totalExpense, totalNet: totalIncome - totalExpense };
  }, [visibleRows, monthKeys]);

  const analysisByMonth = useMemo(
    () => Object.fromEntries(analysisRows.map((row) => [row.monthKey, row])),
    [analysisRows],
  );

  const summaryMetricRows = [
    { key: "openingBalance", label: L.openingBalance },
    { key: "operatingNet", label: L.operatingCashFlow },
    { key: "unclassifiedNet", label: L.unclassifiedFlow },
    { key: "closingBalance", label: L.closingBalance },
  ] as const;

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
        trailing={<FinancialCheckbox checked={hideEmpty} onChange={setHideEmpty} label={L.hideEmpty} />}
      />

      <FinancialPanel title={L.analysisTitle}>
        {monthKeys.length ? (
          <FinancialTableWrap>
            <table className="erp-financial-table">
              <thead>
                <tr>
                  <th>{L.group}</th>
                  {monthKeys.map((mk) => (
                    <th key={mk} className="is-num">
                      {formatMonthLabel(mk)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaryMetricRows.map((metric) => (
                  <tr key={metric.key} className="is-summary">
                    <td className="is-label">{metric.label}</td>
                    {monthKeys.map((mk) => {
                      const value = analysisByMonth[mk]?.[metric.key] || 0;
                      return (
                        <td
                          key={`${metric.key}-${mk}`}
                          className={`is-num${value < 0 ? " erp-financial-amount-negative" : ""}`}
                        >
                          {value ? formatFinancialKRW(value) : "-"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </FinancialTableWrap>
        ) : (
          <FinancialEmpty message={L.empty} />
        )}
      </FinancialPanel>

      <FinancialPanel title={L.detailTitle}>
        {visibleRows.length && monthKeys.length ? (
          <FinancialTableWrap>
            <table className="erp-financial-table">
              <thead>
                <tr>
                  <th rowSpan={2}>{L.group}</th>
                  {monthKeys.map((mk) => (
                    <th key={mk} colSpan={3} className="is-num">
                      {formatMonthLabel(mk)}
                    </th>
                  ))}
                  <th colSpan={3} className="is-num">
                    {L.total}
                  </th>
                </tr>
                <tr>
                  {monthKeys.map((mk) => (
                    <React.Fragment key={`sub-${mk}`}>
                      <th className="is-num">{L.income}</th>
                      <th className="is-num">{L.expense}</th>
                      <th className="is-num">{L.net}</th>
                    </React.Fragment>
                  ))}
                  <th className="is-num">{L.income}</th>
                  <th className="is-num">{L.expense}</th>
                  <th className="is-num">{L.net}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.parentGroup}>
                    <td className="is-label">{row.parentGroup}</td>
                    {monthKeys.map((mk) => (
                      <React.Fragment key={`${row.parentGroup}-${mk}`}>
                        <td className="is-num">{row.monthlyIncome[mk] ? formatFinancialKRW(row.monthlyIncome[mk]) : "-"}</td>
                        <td className="is-num">{row.monthlyExpense[mk] ? formatFinancialKRW(row.monthlyExpense[mk]) : "-"}</td>
                        <td className={`is-num${(row.monthlyNet[mk] || 0) < 0 ? " erp-financial-amount-negative" : ""}`}>
                          {row.monthlyNet[mk] ? formatFinancialKRW(row.monthlyNet[mk]) : "-"}
                        </td>
                      </React.Fragment>
                    ))}
                    <td className="is-num">{formatFinancialKRW(row.totalIncome)}</td>
                    <td className="is-num">{formatFinancialKRW(row.totalExpense)}</td>
                    <td className={`is-num${row.totalNet < 0 ? " erp-financial-amount-negative" : ""}`}>
                      {formatFinancialKRW(row.totalNet)}
                    </td>
                  </tr>
                ))}
                <tr className="is-summary">
                  <td className="is-label">{L.total}</td>
                  {monthKeys.map((mk) => (
                    <React.Fragment key={`total-${mk}`}>
                      <td className="is-num">{formatFinancialKRW(totals.monthlyIncome[mk])}</td>
                      <td className="is-num">{formatFinancialKRW(totals.monthlyExpense[mk])}</td>
                      <td className={`is-num${(totals.monthlyNet[mk] || 0) < 0 ? " erp-financial-amount-negative" : ""}`}>
                        {formatFinancialKRW(totals.monthlyNet[mk])}
                      </td>
                    </React.Fragment>
                  ))}
                  <td className="is-num">{formatFinancialKRW(totals.totalIncome)}</td>
                  <td className="is-num">{formatFinancialKRW(totals.totalExpense)}</td>
                  <td className={`is-num${totals.totalNet < 0 ? " erp-financial-amount-negative" : ""}`}>
                    {formatFinancialKRW(totals.totalNet)}
                  </td>
                </tr>
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
