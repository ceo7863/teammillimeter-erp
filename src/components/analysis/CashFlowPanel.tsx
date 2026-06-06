import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { formatKRW, formatMonthLabel, type CompanyExpense, type FixedExpense, type FixedExpensePayment } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import {
  buildCashFlowAnalysisSummary,
  buildCashFlowSummary,
  collectAnalysisMonthKeys,
} from "@/utils/financialAnalysis";
import { buildAllLedgerEntries, type AccountCode, type LedgerCategory } from "@/utils/ledgerSystem";

const L = {
  title: "\uD604\uAE08\uD750\uB984\uD45C",
  desc: "\uACC4\uC815 \uADF8\uB8F9\uBCC4 \uC6D4\uBCC4 \uC785\uCD9C\uAE08\uACFC \uC21C\uD604\uAE08\uD750\uB984\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.",
  analysisTitle: "\uD604\uAE08\uD750\uB984 \uBD84\uC11D",
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

  const monthKeys = useMemo(
    () => collectAnalysisMonthKeys(allEntries, bankTransactions, [], 6),
    [allEntries, bankTransactions],
  );

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
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <h2 className="erp-text-page-title text-slate-900">{L.title}</h2>
          <p className="mt-1 erp-text-body text-slate-600">{L.desc}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <h3 className="erp-text-section-title mb-4 font-bold text-slate-900">{L.analysisTitle}</h3>
          {monthKeys.length ? (
            <DesktopTableWrap>
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <th>{L.group}</th>
                    {monthKeys.map((mk) => (
                      <th key={mk} className="text-right">
                        {formatMonthLabel(mk)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summaryMetricRows.map((metric) => (
                    <tr key={metric.key}>
                      <td className="font-semibold">{metric.label}</td>
                      {monthKeys.map((mk) => {
                        const value = analysisByMonth[mk]?.[metric.key] || 0;
                        const tone =
                          metric.key === "operatingNet" || metric.key === "unclassifiedNet"
                            ? value >= 0
                              ? "text-emerald-700"
                              : "text-red-600"
                            : "";
                        return (
                          <td key={`${metric.key}-${mk}`} className={`text-right font-semibold ${tone}`}>
                            {value ? formatKRW(value) : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </DesktopTableWrap>
          ) : (
            <div className="py-8 text-center erp-text-body text-slate-500">{L.empty}</div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <label className="mb-4 inline-flex items-center gap-2 erp-text-body text-slate-700">
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(event) => setHideEmpty(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            {L.hideEmpty}
          </label>

          {visibleRows.length ? (
            <DesktopTableWrap>
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <th rowSpan={2}>{L.group}</th>
                    {monthKeys.map((mk) => (
                      <th key={mk} colSpan={3} className="text-center border-b">
                        {formatMonthLabel(mk)}
                      </th>
                    ))}
                    <th colSpan={3} className="text-center border-b">
                      {L.total}
                    </th>
                  </tr>
                  <tr>
                    {monthKeys.map((mk) => (
                      <React.Fragment key={`sub-${mk}`}>
                        <th className="text-right text-emerald-700">{L.income}</th>
                        <th className="text-right text-red-600">{L.expense}</th>
                        <th className="text-right">{L.net}</th>
                      </React.Fragment>
                    ))}
                    <th className="text-right text-emerald-700">{L.income}</th>
                    <th className="text-right text-red-600">{L.expense}</th>
                    <th className="text-right">{L.net}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.parentGroup}>
                      <td className="font-semibold">{row.parentGroup}</td>
                      {monthKeys.map((mk) => (
                        <React.Fragment key={`${row.parentGroup}-${mk}`}>
                          <td className="text-right text-emerald-700">
                            {row.monthlyIncome[mk] ? formatKRW(row.monthlyIncome[mk]) : "-"}
                          </td>
                          <td className="text-right text-red-600">
                            {row.monthlyExpense[mk] ? formatKRW(row.monthlyExpense[mk]) : "-"}
                          </td>
                          <td className="text-right font-semibold">
                            {row.monthlyNet[mk] ? formatKRW(row.monthlyNet[mk]) : "-"}
                          </td>
                        </React.Fragment>
                      ))}
                      <td className="text-right font-bold text-emerald-700">{formatKRW(row.totalIncome)}</td>
                      <td className="text-right font-bold text-red-600">{formatKRW(row.totalExpense)}</td>
                      <td className="text-right font-bold">{formatKRW(row.totalNet)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td>{L.total}</td>
                    {monthKeys.map((mk) => (
                      <React.Fragment key={`total-${mk}`}>
                        <td className="text-right text-emerald-700">{formatKRW(totals.monthlyIncome[mk])}</td>
                        <td className="text-right text-red-600">{formatKRW(totals.monthlyExpense[mk])}</td>
                        <td className="text-right">{formatKRW(totals.monthlyNet[mk])}</td>
                      </React.Fragment>
                    ))}
                    <td className="text-right text-emerald-700">{formatKRW(totals.totalIncome)}</td>
                    <td className="text-right text-red-600">{formatKRW(totals.totalExpense)}</td>
                    <td className="text-right">{formatKRW(totals.totalNet)}</td>
                  </tr>
                </tbody>
              </table>
            </DesktopTableWrap>
          ) : (
            <div className="py-8 text-center erp-text-body text-slate-500">{L.empty}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
