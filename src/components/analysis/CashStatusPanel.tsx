import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import type { BankTransaction } from "@/utils/bankTransactions";
import {
  formatKRW,
  getMonthKey,
  monthRangeForKey,
  shiftMonthKey,
  todayISO,
  type CompanyExpense,
} from "@/utils/companyLedger";
import {
  buildAccountFlowBreakdown,
  buildBankAccountPeriodSummaries,
  buildPeriodBankTotals,
} from "@/utils/financialAnalysis";
import { buildAllLedgerEntries, type AccountCode, type LedgerCategory } from "@/utils/ledgerSystem";

const L = {
  title: "\uC790\uAE08\uD604\uD669",
  desc: "\uAE30\uAC04\uBCC4 \uD1B5\uC7A5 \uC785\uCD9C\uAE08 \uD604\uD669\uACFC \uACC4\uC815\uBCC4 \uBD84\uB958 \uD604\uD669\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.",
  prevMonth: "\uC774\uC804 \uB2EC",
  nextMonth: "\uB2E4\uC74C \uB2EC",
  year: "\uB144",
  month: "\uC6D4",
  opening: "\uAE30\uCD08",
  closing: "\uAE30\uB9D0",
  totalDeposit: "\uCD1D \uC785\uAE08",
  totalWithdrawal: "\uCD1D \uCD9C\uAE08",
  netChange: "\uC21C\uC99D\uAC10",
  unclassified: "\uBBF8\uBD84\uB958 \uAC74\uC218",
  incomeBreakdown: "\uC785\uAE08",
  expenseBreakdown: "\uCD9C\uAE08",
  caseSuffix: "\uAC74",
  accountList: "\uACC4\uC88C \uBAA9\uB85D",
  accountNumber: "\uACC4\uC88C",
  bankName: "\uC740\uD589",
  periodDeposit: "\uAE30\uAC04 \uC785\uAE08",
  periodWithdrawal: "\uAE30\uAC04 \uCD9C\uAE08",
  balance: "\uC794\uC561",
  count: "\uAC74\uC218",
  empty: "\uD574\uB2F9 \uAE30\uAC04 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
};

type CashStatusPanelProps = {
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
};

export function CashStatusPanel({
  bankTransactions,
  companyExpenses,
  ledgerCategories,
  accountCodes,
}: CashStatusPanelProps) {
  const [monthKey, setMonthKey] = useState(getMonthKey(todayISO()));
  const { startDate, endDate } = useMemo(() => monthRangeForKey(monthKey), [monthKey]);

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

  const periodTotals = useMemo(
    () => buildPeriodBankTotals(bankTransactions, startDate, endDate),
    [bankTransactions, startDate, endDate],
  );

  const incomeRows = useMemo(
    () => buildAccountFlowBreakdown(allEntries, accountCodes, "income", startDate, endDate),
    [allEntries, accountCodes, startDate, endDate],
  );

  const expenseRows = useMemo(
    () => buildAccountFlowBreakdown(allEntries, accountCodes, "expense", startDate, endDate),
    [allEntries, accountCodes, startDate, endDate],
  );

  const accountRows = useMemo(
    () => buildBankAccountPeriodSummaries(bankTransactions, startDate, endDate),
    [bankTransactions, startDate, endDate],
  );

  const incomeCount = incomeRows.reduce((sum, row) => sum + row.count, 0);
  const expenseCount = expenseRows.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4">
            <h2 className="erp-text-page-title text-slate-900">{L.title}</h2>
            <p className="mt-1 erp-text-body text-slate-600">{L.desc}</p>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))}>
              {L.prevMonth}
            </Button>
            <span className="erp-text-body min-w-[7rem] text-center font-bold">
              {monthKey.slice(0, 4)}
              {L.year} {Number(monthKey.slice(5))}
              {L.month}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))}>
              {L.nextMonth}
            </Button>
            <span className="erp-text-caption text-slate-500">
              {startDate} ~ {endDate}
            </span>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={L.opening} value={formatKRW(periodTotals.openingBalance)} />
            <StatCard label={L.totalDeposit} value={formatKRW(periodTotals.totalDeposit)} tone="text-emerald-700" />
            <StatCard label={L.totalWithdrawal} value={formatKRW(periodTotals.totalWithdrawal)} tone="text-red-600" />
            <StatCard label={L.closing} value={formatKRW(periodTotals.closingBalance)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label={L.netChange} value={formatKRW(periodTotals.netChange)} />
            <StatCard label={L.unclassified} value={`${periodTotals.unclassifiedCount}${L.caseSuffix}`} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <FlowBreakdownCard title={`${L.incomeBreakdown} ${incomeCount}${L.caseSuffix}`} rows={incomeRows} />
        <FlowBreakdownCard title={`${L.expenseBreakdown} ${expenseCount}${L.caseSuffix}`} rows={expenseRows} />
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <h3 className="erp-text-section-title mb-4 font-bold text-slate-900">{L.accountList}</h3>
          {accountRows.length ? (
            <DesktopTableWrap>
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <th>{L.bankName}</th>
                    <th>{L.accountNumber}</th>
                    <th className="text-right">{L.periodDeposit}</th>
                    <th className="text-right">{L.periodWithdrawal}</th>
                    <th className="text-right">{L.balance}</th>
                    <th className="text-right">{L.count}</th>
                  </tr>
                </thead>
                <tbody>
                  {accountRows.map((row) => (
                    <tr key={row.accountNumber}>
                      <td>{row.bankName}</td>
                      <td className="font-mono text-sm">{row.accountNumber}</td>
                      <td className="text-right font-semibold text-emerald-700">
                        {row.periodDeposit > 0 ? formatKRW(row.periodDeposit) : "-"}
                      </td>
                      <td className="text-right font-semibold text-red-600">
                        {row.periodWithdrawal > 0 ? formatKRW(row.periodWithdrawal) : "-"}
                      </td>
                      <td className="text-right font-bold">{formatKRW(row.latestBalance)}</td>
                      <td className="text-right">{row.periodCount || "-"}</td>
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
    </div>
  );
}

function StatCard({ label, value, tone = "text-slate-950" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="erp-text-caption text-slate-500">{label}</div>
      <div className={`erp-text-section-title mt-1 font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function FlowBreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: ReturnType<typeof buildAccountFlowBreakdown>;
}) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-4 md:p-5">
        <h3 className="erp-text-section-title mb-4 font-bold text-slate-900">{title}</h3>
        {rows.length ? (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.label}
                className={`flex items-center justify-between rounded-xl px-3 py-2 erp-text-body ${
                  row.isUncategorized ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-800"
                }`}
              >
                <span>
                  {row.label} ({row.count})
                </span>
                <span className="font-bold">{formatKRW(row.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-6 text-center erp-text-body text-slate-500">{L.empty}</div>
        )}
      </CardContent>
    </Card>
  );
}
