import React, { useMemo, useState } from "react";
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
  groupBy: "\uADF8\uB8F9 \uAE30\uC900",
  account: "\uACC4\uC815\uACFC\uBAA9",
  classificationAccount: "\uBD84\uB958\uACC4\uC815",
  fixedItem: "\uACE0\uC815\uBE44 \uD56D\uBAA9",
  category: "\uCE74\uD14C\uACE0\uB9AC (\uBCC0\uB3D9)",
  parentGroup: "\uACC4\uC815 \uADF8\uB8F9",
  counterparty: "\uAC70\uB798\uCC98",
  label: "\uD56D\uBAA9",
  income: "\uC785\uAE08",
  expense: "\uCD9C\uAE08",
  net: "\uC21C\uC561",
  count: "\uAC74\uC218",
  empty: "\uC870\uAC74\uC5D0 \uB9DE\uB294 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
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
  const [groupBy, setGroupBy] = useState<CustomAnalysisGroupMode>("account");

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
    () => buildCustomAnalysisBreakdown(allEntries, accountCodes, dateFrom, dateTo, groupBy, fixedExpenses),
    [allEntries, accountCodes, dateFrom, dateTo, groupBy, fixedExpenses],
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
            {L.groupBy}
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as CustomAnalysisGroupMode)}
              className="erp-input border border-slate-200"
            >
              <option value="account">{L.account}</option>
              <option value="classificationAccount">{L.classificationAccount}</option>
              <option value="fixedItem">{L.fixedItem}</option>
              <option value="parentGroup">{L.parentGroup}</option>
              <option value="counterparty">{L.counterparty}</option>
              <option value="category">{L.category}</option>
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
