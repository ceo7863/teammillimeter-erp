import React, { useEffect, useMemo, useState } from "react";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import {
  buildAccountTrendSeries,
  buildMonthlyAccountTrendRows,
  buildPeriodAccountSummary,
  type AccountTrendSeries,
  type MonthlyAccountTrendRow,
} from "@/utils/financialAnalysis";
import { buildAllLedgerEntries, type AccountCode, type LedgerCategory } from "@/utils/ledgerSystem";
import {
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
  title: "\uACC4\uC815\uBCC4 \uCD94\uC774",
  flowAll: "\uC804\uCCB4",
  flowExpense: "\uCD9C\uAE08",
  flowIncome: "\uC785\uAE08",
  accountPick: "\uACC4\uC815 \uC120\uD0DD",
  accountPickHint: "\uCD94\uC774\uB97C \uBE44\uADFC \uACC4\uC815\uACFC\uBAA9\uC744 \uC120\uD0DD\uD558\uC138\uC694.",
  empty: "\uD574\uB2F9 \uAE30\uAC04 \uD655\uC815 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptySelection: "\uBE44\uADFC \uACC4\uC815\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  monthCol: "\uC6D4",
  totalCol: "\uD569\uACC4",
  monthlyChart: "\uC6D4\uBCC4 \uCD9C\uC785\uAE08",
  accountMonthlyChart: "\uACC4\uC815\uBCC4 \uC6D4\uBCC4 \uCD94\uC774",
  monthlyTable: "\uC6D4\uBCC4 \uC694\uC57D \uD45C",
  accountTable: "\uACC4\uC815\uBCC4 \uC6D4\uBCC4 \uD45C",
  net: "\uC21C\uC561",
};

const CHART_COLORS = ["#0f172a", "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#ca8a04"];

type FlowFilter = "all" | "expense" | "income";

type AccountTrendPanelProps = {
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
  fixedExpensePayments?: FixedExpensePayment[];
  fixedExpenses?: FixedExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
};

function formatCompactKRW(value: number) {
  if (!value) return "0";
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}\uC5B5`;
  if (value >= 10000) return `${Math.round(value / 10000)}\uB9CC`;
  return String(value);
}

function monthAxisLabel(monthKey: string, showYear: boolean) {
  const month = Number(monthKey.slice(5));
  if (!showYear) return `${month}\uC6D4`;
  return `${monthKey.slice(2, 4)}.${month}`;
}

function barHeightPercent(value: number, maxValue: number) {
  if (!value) return 0;
  return Math.max((value / maxValue) * 100, 14);
}

function MonthlyFlowBarChart({
  rows,
  flowFilter,
  showYear,
}: {
  rows: MonthlyAccountTrendRow[];
  flowFilter: FlowFilter;
  showYear: boolean;
}) {
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => {
      if (flowFilter === "expense") return [row.expense];
      if (flowFilter === "income") return [row.income];
      return [row.expense, row.income];
    }),
  );

  const renderBar = (value: number, tone: "expense" | "income") => (
    <div className="erp-account-trend-bar-wrap">
      <div
        className={`erp-account-trend-bar is-${tone}${value > 0 ? " has-value" : ""}`}
        style={{ height: value > 0 ? `${barHeightPercent(value, maxValue)}%` : "0" }}
        title={formatFinancialKRW(value)}
      >
        {value > 0 ? <span className="erp-account-trend-bar-value">{formatCompactKRW(value)}</span> : null}
      </div>
    </div>
  );

  return (
    <div className="erp-account-trend-monthly-chart" aria-label={L.monthlyChart}>
      <div className="erp-dashboard-annual-chart-legend">
        {flowFilter !== "income" ? (
          <span>
            <i className="is-expense" />
            {L.flowExpense}
          </span>
        ) : null}
        {flowFilter !== "expense" ? (
          <span>
            <i className="is-income" />
            {L.flowIncome}
          </span>
        ) : null}
      </div>
      <div
        className="erp-account-trend-monthly-grid"
        style={{ gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, minmax(0, 1fr))` }}
      >
        {rows.map((row) => (
          <div key={row.monthKey} className="erp-dashboard-annual-chart-col">
            <div
              className="erp-dashboard-annual-chart-bars"
              title={`${row.label} \u00B7 ${L.flowExpense} ${formatFinancialKRW(row.expense)} \u00B7 ${L.flowIncome} ${formatFinancialKRW(row.income)} \u00B7 ${L.net} ${formatFinancialKRW(row.net)}`}
            >
              {flowFilter !== "income" ? renderBar(row.expense, "expense") : null}
              {flowFilter !== "expense" ? renderBar(row.income, "income") : null}
            </div>
            <span className="erp-dashboard-annual-chart-label">{monthAxisLabel(row.monthKey, showYear)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyAccountBarChart({
  monthKeys,
  series,
  showYear,
}: {
  monthKeys: string[];
  series: AccountTrendSeries[];
  showYear: boolean;
}) {
  const maxValue = Math.max(
    1,
    ...series.flatMap((row) => monthKeys.map((mk) => row.monthlyAmounts[mk] || 0)),
  );

  return (
    <div className="erp-account-trend-monthly-chart" aria-label={L.accountMonthlyChart}>
      <div className="erp-dashboard-annual-chart-legend">
        {series.map((row, index) => (
          <span key={row.accountCode}>
            <i style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
            {row.accountCode} {row.label}
          </span>
        ))}
      </div>
      <div
        className="erp-account-trend-monthly-grid"
        style={{ gridTemplateColumns: `repeat(${Math.max(monthKeys.length, 1)}, minmax(0, 1fr))` }}
      >
        {monthKeys.map((mk) => (
          <div key={mk} className="erp-dashboard-annual-chart-col">
            <div className="erp-dashboard-annual-chart-bars">
              {series.map((row, index) => {
                const value = row.monthlyAmounts[mk] || 0;
                const color = CHART_COLORS[index % CHART_COLORS.length];
                return (
                  <div key={row.accountCode} className="erp-account-trend-bar-wrap">
                    <div
                      className={`erp-account-trend-bar has-value${value > 0 ? "" : " is-empty"}`}
                      style={{
                        height: value > 0 ? `${barHeightPercent(value, maxValue)}%` : "0",
                        background: color,
                      }}
                      title={`${row.accountCode} ${row.label} \u00B7 ${formatFinancialKRW(value)}`}
                    >
                      {value > 0 ? <span className="erp-account-trend-bar-value">{formatCompactKRW(value)}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <span className="erp-dashboard-annual-chart-label">{monthAxisLabel(mk, showYear)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountTrendPanel({
  bankTransactions,
  companyExpenses,
  fixedExpensePayments,
  fixedExpenses,
  ledgerCategories,
  accountCodes,
}: AccountTrendPanelProps) {
  const [period, setPeriod] = useState<FinancialPeriod>("year");
  const initialRange = resolveFinancialPeriodRange("year");
  const [dateFrom, setDateFrom] = useState(initialRange.startDate);
  const [dateTo, setDateTo] = useState(initialRange.endDate);
  const [flowFilter, setFlowFilter] = useState<FlowFilter>("all");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

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
        bankLinkedOnly: true,
      }),
    [bankTransactions, companyExpenses, fixedExpensePayments, fixedExpenses, ledgerCategories, accountCodes],
  );

  const monthKeys = useMemo(() => resolveFinancialMonthKeys(dateFrom, dateTo, 24), [dateFrom, dateTo]);
  const showYearOnAxis = useMemo(() => {
    const years = new Set(monthKeys.map((mk) => mk.slice(0, 4)));
    return years.size > 1;
  }, [monthKeys]);

  const accountOptions = useMemo(() => {
    const summary = buildPeriodAccountSummary(allEntries, accountCodes, dateFrom, dateTo);
    return summary
      .filter((row) => row.expense > 0 || row.income > 0)
      .sort((a, b) => b.expense + b.income - (a.expense + a.income));
  }, [allEntries, accountCodes, dateFrom, dateTo]);

  useEffect(() => {
    if (selectedCodes.length || !accountOptions.length) return;
    setSelectedCodes(accountOptions.slice(0, 3).map((row) => row.accountCode));
  }, [accountOptions, selectedCodes.length]);

  const series = useMemo(
    () =>
      buildAccountTrendSeries(
        allEntries,
        accountCodes,
        monthKeys,
        selectedCodes,
        flowFilter === "all" ? undefined : flowFilter,
      ),
    [allEntries, accountCodes, monthKeys, selectedCodes, flowFilter],
  );

  const monthlyRows = useMemo(
    () => buildMonthlyAccountTrendRows(allEntries, monthKeys, selectedCodes),
    [allEntries, monthKeys, selectedCodes],
  );

  const toggleAccount = (code: string) => {
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((row) => row !== code) : [...prev, code]));
  };

  const flowChips = (
    <div className="erp-financial-period-group" role="group" aria-label={"\uAD6C\uBD84"}>
      {(
        [
          ["all", L.flowAll],
          ["expense", L.flowExpense],
          ["income", L.flowIncome],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={`erp-financial-period-btn${flowFilter === key ? " is-active" : ""}`}
          onClick={() => setFlowFilter(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );

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
        trailing={flowChips}
      />

      <FinancialPanel title={L.accountPick}>
        <p className="erp-text-caption mb-3 text-slate-500">{L.accountPickHint}</p>
        <div className="flex flex-wrap gap-2">
          {accountOptions.map((row) => {
            const active = selectedCodes.includes(row.accountCode);
            return (
              <button
                key={row.accountCode}
                type="button"
                onClick={() => toggleAccount(row.accountCode)}
                className={`rounded-xl border px-3 py-1.5 text-sm font-semibold ${
                  active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {row.accountCode} {row.accountName}
              </button>
            );
          })}
        </div>
      </FinancialPanel>

      {!accountOptions.length ? (
        <FinancialEmpty message={L.empty} />
      ) : !selectedCodes.length ? (
        <FinancialEmpty message={L.emptySelection} />
      ) : (
        <>
          <FinancialPanel title={L.monthlyChart}>
            <MonthlyFlowBarChart rows={monthlyRows} flowFilter={flowFilter} showYear={showYearOnAxis} />
          </FinancialPanel>

          {series.length > 0 ? (
            <FinancialPanel title={L.accountMonthlyChart}>
              <MonthlyAccountBarChart monthKeys={monthKeys} series={series} showYear={showYearOnAxis} />
            </FinancialPanel>
          ) : null}

          <FinancialPanel title={L.monthlyTable}>
            <FinancialTableWrap>
              <table className="erp-financial-table">
                <thead>
                  <tr>
                    <th>{L.monthCol}</th>
                    <th className="is-num">{L.flowExpense}</th>
                    <th className="is-num">{L.flowIncome}</th>
                    <th className="is-num">{L.net}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.map((row) => (
                    <tr key={row.monthKey}>
                      <td>{monthAxisLabel(row.monthKey, showYearOnAxis)}</td>
                      <td className="is-num">{row.expense ? formatFinancialKRW(row.expense) : "-"}</td>
                      <td className="is-num">{row.income ? formatFinancialKRW(row.income) : "-"}</td>
                      <td className={`is-num${row.net < 0 ? " erp-financial-amount-negative" : ""}`}>
                        {row.net ? formatFinancialKRW(row.net) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FinancialTableWrap>
          </FinancialPanel>

          <FinancialPanel title={L.accountTable}>
            <FinancialTableWrap>
              <table className="erp-financial-table">
                <thead>
                  <tr>
                    <th>{L.accountPick}</th>
                    {monthKeys.map((mk) => (
                      <th key={mk} className="is-num">
                        {monthAxisLabel(mk, showYearOnAxis)}
                      </th>
                    ))}
                    <th className="is-num">{L.totalCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((row) => (
                    <tr key={row.accountCode}>
                      <td>
                        <span className="font-mono text-xs text-slate-500">{row.accountCode}</span> {row.label}
                      </td>
                      {monthKeys.map((mk) => (
                        <td key={mk} className="is-num">
                          {row.monthlyAmounts[mk] ? formatFinancialKRW(row.monthlyAmounts[mk]) : "-"}
                        </td>
                      ))}
                      <td className="is-num font-bold">{formatFinancialKRW(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FinancialTableWrap>
          </FinancialPanel>
        </>
      )}
    </div>
  );
}
