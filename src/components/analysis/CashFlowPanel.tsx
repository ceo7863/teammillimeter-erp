import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { formatKRW, formatMonthLabel, type CompanyExpense } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import { buildCashFlowSummary, collectMonthKeysFromEntries } from "@/utils/financialAnalysis";
import { buildAllLedgerEntries, type AccountCode, type LedgerCategory } from "@/utils/ledgerSystem";

const L = {
  title: "\uD604\uAE08\uD750\uB984\uD45C",
  desc: "\uACC4\uC815 \uADF8\uB8F9\uBCC4 \uC6D4\uBCC4 \uC785\uCD9C\uAE08\uACFC \uC21C\uD604\uAE08\uD750\uB984\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.",
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
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
};

export function CashFlowPanel({
  bankTransactions,
  companyExpenses,
  ledgerCategories,
  accountCodes,
}: CashFlowPanelProps) {
  const allEntries = useMemo(
    () =>
      buildAllLedgerEntries({
        bankTransactions,
        companyExpenses,
        categories: ledgerCategories,
        accountCodes,
      }),
    [bankTransactions, companyExpenses, ledgerCategories, accountCodes],
  );

  const monthKeys = useMemo(() => collectMonthKeysFromEntries(allEntries, 6), [allEntries]);

  const rows = useMemo(
    () => buildCashFlowSummary(allEntries, accountCodes, monthKeys),
    [allEntries, accountCodes, monthKeys],
  );

  const totals = useMemo(() => {
    const monthlyIncome: Record<string, number> = Object.fromEntries(monthKeys.map((mk) => [mk, 0]));
    const monthlyExpense: Record<string, number> = Object.fromEntries(monthKeys.map((mk) => [mk, 0]));
    const monthlyNet: Record<string, number> = Object.fromEntries(monthKeys.map((mk) => [mk, 0]));
    let totalIncome = 0;
    let totalExpense = 0;
    for (const row of rows) {
      totalIncome += row.totalIncome;
      totalExpense += row.totalExpense;
      for (const mk of monthKeys) {
        monthlyIncome[mk] += row.monthlyIncome[mk] || 0;
        monthlyExpense[mk] += row.monthlyExpense[mk] || 0;
        monthlyNet[mk] += row.monthlyNet[mk] || 0;
      }
    }
    return { monthlyIncome, monthlyExpense, monthlyNet, totalIncome, totalExpense, totalNet: totalIncome - totalExpense };
  }, [rows, monthKeys]);

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
          {rows.length ? (
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
                  {rows.map((row) => (
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
