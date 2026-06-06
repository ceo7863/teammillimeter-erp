import React, { useMemo, useState } from "react";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { monthRangeISO, type CompanyExpense, type FixedExpense, type FixedExpensePayment } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import { buildCustomAnalysisBreakdown, type CustomAnalysisGroupMode } from "@/utils/financialAnalysis";
import { buildAllLedgerEntries, type AccountCode, type LedgerCategory } from "@/utils/ledgerSystem";
import {
  FinancialEmpty,
  FinancialPanel,
  FinancialTableWrap,
  FinancialToolbar,
  formatFinancialKRW,
  resolveFinancialPeriodRange,
  type FinancialPeriod,
} from "@/components/analysis/AnalysisUi";

const L = {
  title: "\uB9DE\uCDA4 \uBD84\uC11D",
  dateFrom: "\uC2DC\uC791\uC77C",
  dateTo: "\uC885\uB8CC\uC77C",
  groupBy: "\uADF8\uB8F9 \uAE30\uC900",
  category: "\uCE74\uD14C\uACE0\uB9AC",
  account: "\uACC4\uC815",
  parentGroup: "\uACC4\uC815 \uADF8\uB8F9",
  counterparty: "\uAC70\uB798\uCC98",
  label: "\uD56D\uBAA9",
  income: "\uC785\uAE08",
  expense: "\uCD9C\uAE08",
  net: "\uC21C\uC561",
  count: "\uAC74\uC218",
  empty: "\uC870\uAC74\uC5D0 \uB9DE\uB294 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  thisMonth: "\uC774\uBC88 \uB2EC",
  result: "\uBD84\uC11D \uACB0\uACFC",
};

type CustomAnalysisPanelProps = {
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
  fixedExpensePayments?: FixedExpensePayment[];
  fixedExpenses?: FixedExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
};

export function CustomAnalysisPanel({
  bankTransactions,
  companyExpenses,
  fixedExpensePayments,
  fixedExpenses,
  ledgerCategories,
  accountCodes,
}: CustomAnalysisPanelProps) {
  const defaultRange = monthRangeISO(0);
  const [period, setPeriod] = useState<FinancialPeriod>("month");
  const [dateFrom, setDateFrom] = useState(defaultRange.startDate);
  const [dateTo, setDateTo] = useState(defaultRange.endDate);
  const [groupBy, setGroupBy] = useState<CustomAnalysisGroupMode>("category");

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

  const rows = useMemo(
    () => buildCustomAnalysisBreakdown(allEntries, accountCodes, dateFrom, dateTo, groupBy),
    [allEntries, accountCodes, dateFrom, dateTo, groupBy],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          income: acc.income + row.income,
          expense: acc.expense + row.expense,
          count: acc.count + row.count,
        }),
        { income: 0, expense: 0, count: 0 },
      ),
    [rows],
  );

  const applyThisMonth = () => {
    const range = monthRangeISO(0);
    setPeriod("month");
    setDateFrom(range.startDate);
    setDateTo(range.endDate);
  };

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

      <FinancialPanel title={L.title}>
        <div className="erp-financial-filter-row">
          <label className="erp-financial-filter-field">
            {L.dateFrom}
            <KoreanDateInput value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="erp-input" />
          </label>
          <label className="erp-financial-filter-field">
            {L.dateTo}
            <KoreanDateInput value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="erp-input" />
          </label>
          <button type="button" className="erp-financial-filter-btn" onClick={applyThisMonth}>
            {L.thisMonth}
          </button>
          <label className="erp-financial-filter-field">
            {L.groupBy}
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as CustomAnalysisGroupMode)}
              className="erp-input border border-slate-200"
            >
              <option value="category">{L.category}</option>
              <option value="account">{L.account}</option>
              <option value="parentGroup">{L.parentGroup}</option>
              <option value="counterparty">{L.counterparty}</option>
            </select>
          </label>
        </div>

        {rows.length ? (
          <FinancialTableWrap>
            <table className="erp-financial-table">
              <thead>
                <tr>
                  <th>{L.label}</th>
                  <th className="is-num">{L.income}</th>
                  <th className="is-num">{L.expense}</th>
                  <th className="is-num">{L.net}</th>
                  <th className="is-num">{L.count}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className="is-label">{row.label}</td>
                    <td className="is-num">{row.income ? formatFinancialKRW(row.income) : "-"}</td>
                    <td className="is-num">{row.expense ? formatFinancialKRW(row.expense) : "-"}</td>
                    <td className={`is-num${row.net < 0 ? " erp-financial-amount-negative" : ""}`}>
                      {formatFinancialKRW(row.net)}
                    </td>
                    <td className="is-num">{row.count}</td>
                  </tr>
                ))}
                <tr className="is-summary">
                  <td className="is-label">{L.result}</td>
                  <td className="is-num">{formatFinancialKRW(totals.income)}</td>
                  <td className="is-num">{formatFinancialKRW(totals.expense)}</td>
                  <td className={`is-num${totals.income - totals.expense < 0 ? " erp-financial-amount-negative" : ""}`}>
                    {formatFinancialKRW(totals.income - totals.expense)}
                  </td>
                  <td className="is-num">{totals.count}</td>
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
