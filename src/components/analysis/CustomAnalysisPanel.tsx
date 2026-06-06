import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { formatKRW, monthRangeISO, type CompanyExpense } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import { buildCustomAnalysisBreakdown, type CustomAnalysisGroupMode } from "@/utils/financialAnalysis";
import { buildAllLedgerEntries, type AccountCode, type LedgerCategory } from "@/utils/ledgerSystem";

const L = {
  title: "\uB9DE\uCDA4\uBD84\uC11D",
  desc: "\uAE30\uAC04\uACFC \uADF8\uB8F9 \uAE30\uC900\uC744 \uC120\uD0DD\uD574 \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uC9D1\uACC4\uD569\uB2C8\uB2E4.",
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
};

type CustomAnalysisPanelProps = {
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
};

export function CustomAnalysisPanel({
  bankTransactions,
  companyExpenses,
  ledgerCategories,
  accountCodes,
}: CustomAnalysisPanelProps) {
  const defaultRange = monthRangeISO(0);
  const [dateFrom, setDateFrom] = useState(defaultRange.startDate);
  const [dateTo, setDateTo] = useState(defaultRange.endDate);
  const [groupBy, setGroupBy] = useState<CustomAnalysisGroupMode>("category");

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
    setDateFrom(range.startDate);
    setDateTo(range.endDate);
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <h2 className="erp-text-page-title text-slate-900">{L.title}</h2>
          <p className="mt-1 erp-text-body text-slate-600">{L.desc}</p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="erp-text-body">
              <span className="mb-1 block text-slate-600">{L.dateFrom}</span>
              <KoreanDateInput
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="erp-input rounded-xl"
              />
            </label>
            <label className="erp-text-body">
              <span className="mb-1 block text-slate-600">{L.dateTo}</span>
              <KoreanDateInput
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="erp-input rounded-xl"
              />
            </label>
            <button
              type="button"
              onClick={applyThisMonth}
              className="rounded-xl bg-slate-100 px-4 py-2 erp-text-body font-semibold text-slate-700"
            >
              {L.thisMonth}
            </button>
            <label className="erp-text-body">
              <span className="mb-1 block text-slate-600">{L.groupBy}</span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as CustomAnalysisGroupMode)}
                className="erp-input rounded-xl border border-slate-200 px-3 py-2"
              >
                <option value="category">{L.category}</option>
                <option value="account">{L.account}</option>
                <option value="parentGroup">{L.parentGroup}</option>
                <option value="counterparty">{L.counterparty}</option>
              </select>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          {rows.length ? (
            <DesktopTableWrap>
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <th>{L.label}</th>
                    <th className="text-right">{L.income}</th>
                    <th className="text-right">{L.expense}</th>
                    <th className="text-right">{L.net}</th>
                    <th className="text-right">{L.count}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td className="font-semibold">{row.label}</td>
                      <td className="text-right text-emerald-700">{row.income ? formatKRW(row.income) : "-"}</td>
                      <td className="text-right text-red-600">{row.expense ? formatKRW(row.expense) : "-"}</td>
                      <td className="text-right font-bold">{formatKRW(row.net)}</td>
                      <td className="text-right">{row.count}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td>{L.net}</td>
                    <td className="text-right text-emerald-700">{formatKRW(totals.income)}</td>
                    <td className="text-right text-red-600">{formatKRW(totals.expense)}</td>
                    <td className="text-right">{formatKRW(totals.income - totals.expense)}</td>
                    <td className="text-right">{totals.count}</td>
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
