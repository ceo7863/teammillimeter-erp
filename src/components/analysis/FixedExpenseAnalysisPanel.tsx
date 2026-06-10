import React, { useMemo, useState } from "react";
import type { FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import { buildFixedExpenseAnalysisRows } from "@/utils/financialAnalysis";
import type { AccountCode, LedgerCategory } from "@/utils/ledgerSystem";
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
  title: "\uACE0\uC815\uBE44 \uBD84\uC11D",
  itemName: "\uD56D\uBAA9",
  classificationAccount: "\uBD84\uB958\uACC4\uC815",
  account: "\uACC4\uC815\uACFC\uBAA9",
  amount: "\uB09B\uBD80\uC561",
  payments: "\uB09B\uBD80",
  bankLinked: "\uD1B5\uC7A5\uC5F0\uB3D9",
  total: "\uD569\uACC4",
  itemCount: "\uD56D\uBAA9 \uC218",
  byClassification: "\uBD84\uB958\uACC4\uC815(\uACC4\uC815\uACFC\uBAA9)\uBCC4",
  byItem: "\uACE0\uC815\uBE44 \uD56D\uBAA9\uBCC4",
  empty: "\uD574\uB2F9 \uAE30\uAC04 \uACE0\uC815\uBE44 \uB09B\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  caseSuffix: "\uAC74",
};

type FixedExpenseAnalysisPanelProps = {
  fixedExpensePayments?: FixedExpensePayment[];
  fixedExpenses?: FixedExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
};

export function FixedExpenseAnalysisPanel({
  fixedExpensePayments = [],
  fixedExpenses = [],
  ledgerCategories,
  accountCodes,
}: FixedExpenseAnalysisPanelProps) {
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

  const rows = useMemo(
    () =>
      buildFixedExpenseAnalysisRows(
        fixedExpenses,
        fixedExpensePayments,
        ledgerCategories,
        accountCodes,
        dateFrom,
        dateTo,
      ),
    [fixedExpenses, fixedExpensePayments, ledgerCategories, accountCodes, dateFrom, dateTo],
  );

  const accountGroups = useMemo(() => {
    const bucket = new Map<
      string,
      { accountCode: string; accountLabel: string; amount: number; itemCount: number }
    >();
    for (const row of rows) {
      const current = bucket.get(row.accountCode) || {
        accountCode: row.accountCode,
        accountLabel: row.accountLabel,
        amount: 0,
        itemCount: 0,
      };
      current.amount += row.amount;
      current.itemCount += 1;
      bucket.set(row.accountCode, current);
    }
    return [...bucket.values()].sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          amount: acc.amount + row.amount,
          payments: acc.payments + row.paymentCount,
          bankLinked: acc.bankLinked + row.bankLinkedCount,
        }),
        { amount: 0, payments: 0, bankLinked: 0 },
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

      <FinancialSummaryBar
        items={[
          { label: L.total, value: formatFinancialKRW(totals.amount) },
          { label: L.payments, value: `${totals.payments}${L.caseSuffix}` },
          { label: L.bankLinked, value: `${totals.bankLinked}${L.caseSuffix}` },
          { label: L.itemCount, value: `${rows.length}${L.caseSuffix}` },
        ]}
      />

      {accountGroups.length ? (
        <FinancialPanel title={L.byClassification}>
          <FinancialTableWrap>
            <table className="erp-financial-table">
              <thead>
                <tr>
                  <th>{L.account}</th>
                  <th className="is-num">{L.amount}</th>
                  <th className="is-num">{L.itemCount}</th>
                </tr>
              </thead>
              <tbody>
                {accountGroups.map((row) => (
                  <tr key={row.accountCode}>
                    <td className="is-label">
                      <span className="font-mono text-xs text-slate-500">{row.accountCode}</span> {row.accountLabel}
                    </td>
                    <td className="is-num">{formatFinancialKRW(row.amount)}</td>
                    <td className="is-num">{row.itemCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FinancialTableWrap>
        </FinancialPanel>
      ) : null}

      <FinancialPanel title={L.byItem}>
        {rows.length ? (
          <FinancialTableWrap>
            <table className="erp-financial-table">
              <thead>
                <tr>
                  <th>{L.itemName}</th>
                  <th>{L.classificationAccount}</th>
                  <th>{L.account}</th>
                  <th className="is-num">{L.amount}</th>
                  <th className="is-num">{L.payments}</th>
                  <th className="is-num">{L.bankLinked}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className="is-label">{row.itemName}</td>
                    <td className="is-label text-slate-600">{row.classificationAccount}</td>
                    <td className="is-label">
                      <span className="font-mono text-xs text-slate-500">{row.accountCode}</span> {row.accountLabel}
                    </td>
                    <td className="is-num">{formatFinancialKRW(row.amount)}</td>
                    <td className="is-num">{row.paymentCount}</td>
                    <td className="is-num">{row.bankLinkedCount}</td>
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
