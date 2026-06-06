import React, { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KoreanDateInput } from "@/components/KoreanDateInput";
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
  buildCounterpartyFlowBreakdown,
  buildPeriodBankTotals,
  computePeriodChangePct,
} from "@/utils/financialAnalysis";
import { buildAllLedgerEntries, type AccountCode, type LedgerCategory } from "@/utils/ledgerSystem";

const L = {
  title: "\uC790\uAE08\uD604\uD669",
  desc: "\uAE30\uAC04\uBCC4 \uD1B5\uC7A5 \uC785\uCD9C\uAE08 \uD604\uD669\uACFC \uACC4\uC815\uBCC4 \uBD84\uB958 \uD604\uD669\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.",
  prevMonth: "\uC774\uC804 \uB2EC",
  nextMonth: "\uB2E4\uC74C \uB2EC",
  year: "\uB144",
  month: "\uC6D4",
  dateFrom: "\uC2DC\uC791\uC77C",
  dateTo: "\uC885\uB8CC\uC77C",
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
  viewAccount: "\uACC4\uC815\uBCC4",
  viewCounterparty: "\uAC70\uB798\uCC98\uBCC4",
  changePct: "\uC99D\uAC10\uB960",
};

type BreakdownView = "account" | "counterparty";

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
  const defaultRange = useMemo(() => monthRangeForKey(monthKey), [monthKey]);
  const [dateFrom, setDateFrom] = useState(defaultRange.startDate);
  const [dateTo, setDateTo] = useState(defaultRange.endDate);
  const [breakdownView, setBreakdownView] = useState<BreakdownView>("account");

  const shiftMonth = (delta: number) => {
    const nextKey = shiftMonthKey(monthKey, delta);
    const range = monthRangeForKey(nextKey);
    setMonthKey(nextKey);
    setDateFrom(range.startDate);
    setDateTo(range.endDate);
  };

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
    () => buildPeriodBankTotals(bankTransactions, dateFrom, dateTo),
    [bankTransactions, dateFrom, dateTo],
  );

  const changePct = useMemo(
    () => computePeriodChangePct(periodTotals.openingBalance, periodTotals.closingBalance),
    [periodTotals.openingBalance, periodTotals.closingBalance],
  );

  const incomeRows = useMemo(() => {
    if (breakdownView === "counterparty") {
      return buildCounterpartyFlowBreakdown(bankTransactions, "income", dateFrom, dateTo);
    }
    return buildAccountFlowBreakdown(allEntries, accountCodes, "income", dateFrom, dateTo);
  }, [breakdownView, bankTransactions, allEntries, accountCodes, dateFrom, dateTo]);

  const expenseRows = useMemo(() => {
    if (breakdownView === "counterparty") {
      return buildCounterpartyFlowBreakdown(bankTransactions, "expense", dateFrom, dateTo);
    }
    return buildAccountFlowBreakdown(allEntries, accountCodes, "expense", dateFrom, dateTo);
  }, [breakdownView, bankTransactions, allEntries, accountCodes, dateFrom, dateTo]);

  const accountRows = useMemo(
    () => buildBankAccountPeriodSummaries(bankTransactions, dateFrom, dateTo),
    [bankTransactions, dateFrom, dateTo],
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
            <Button type="button" variant="outline" size="sm" onClick={() => shiftMonth(-1)}>
              {L.prevMonth}
            </Button>
            <span className="erp-text-body min-w-[7rem] text-center font-bold">
              {monthKey.slice(0, 4)}
              {L.year} {Number(monthKey.slice(5))}
              {L.month}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => shiftMonth(1)}>
              {L.nextMonth}
            </Button>
            <label className="erp-text-body">
              <span className="mb-1 block text-slate-500">{L.dateFrom}</span>
              <KoreanDateInput
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="erp-input rounded-xl"
              />
            </label>
            <label className="erp-text-body">
              <span className="mb-1 block text-slate-500">{L.dateTo}</span>
              <KoreanDateInput
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="erp-input rounded-xl"
              />
            </label>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={L.opening} value={formatKRW(periodTotals.openingBalance)} />
            <StatCard label={L.totalDeposit} value={formatKRW(periodTotals.totalDeposit)} tone="text-emerald-700" />
            <StatCard label={L.totalWithdrawal} value={formatKRW(periodTotals.totalWithdrawal)} tone="text-red-600" />
            <StatCard
              label={L.closing}
              value={formatKRW(periodTotals.closingBalance)}
              subValue={formatChangePct(changePct)}
              subTone={changePct === null ? "text-slate-500" : changePct >= 0 ? "text-emerald-700" : "text-red-600"}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label={L.netChange} value={formatKRW(periodTotals.netChange)} />
            <StatCard label={L.unclassified} value={`${periodTotals.unclassifiedCount}${L.caseSuffix}`} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setBreakdownView("account")}
          className={`erp-text-body rounded-xl px-4 py-2 font-bold ${breakdownView === "account" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
        >
          {L.viewAccount}
        </button>
        <button
          type="button"
          onClick={() => setBreakdownView("counterparty")}
          className={`erp-text-body rounded-xl px-4 py-2 font-bold ${breakdownView === "counterparty" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
        >
          {L.viewCounterparty}
        </button>
      </div>

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

function formatChangePct(value: number | null) {
  if (value === null) return `${L.changePct} -`;
  const sign = value > 0 ? "+" : "";
  return `${L.changePct} ${sign}${value.toFixed(1)}%`;
}

function StatCard({
  label,
  value,
  tone = "text-slate-950",
  subValue,
  subTone = "text-slate-500",
}: {
  label: string;
  value: string;
  tone?: string;
  subValue?: string;
  subTone?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="erp-text-caption text-slate-500">{label}</div>
      <div className={`erp-text-section-title mt-1 font-bold ${tone}`}>{value}</div>
      {subValue ? <div className={`erp-text-caption mt-1 font-semibold ${subTone}`}>{subValue}</div> : null}
    </div>
  );
}

type FlowRow = {
  label: string;
  count: number;
  amount: number;
  isUncategorized: boolean;
};

function FlowBreakdownCard({ title, rows }: { title: string; rows: FlowRow[] }) {
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
                <span className="inline-flex items-center gap-1.5">
                  {row.isUncategorized ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> : null}
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
