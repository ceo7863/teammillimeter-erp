import React, { useMemo, useState } from "react";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { CompanyExpense } from "@/utils/companyLedger";
import {
  buildAccountFlowBreakdown,
  buildBankAccountPeriodSummaries,
  buildCounterpartyFlowBreakdown,
  buildPeriodBankTotals,
  computePeriodChangePct,
} from "@/utils/financialAnalysis";
import { buildAllLedgerEntries, type AccountCode, type LedgerCategory } from "@/utils/ledgerSystem";
import {
  FinancialFlowBreakdown,
  FinancialPanel,
  FinancialSegmentButtons,
  FinancialSummaryBar,
  FinancialTableWrap,
  FinancialToolbar,
  FinancialEmpty,
  formatFinancialKRW,
  resolveFinancialPeriodRange,
  type FinancialPeriod,
} from "@/components/analysis/AnalysisUi";

const L = {
  title: "\uC790\uAE08\uD604\uD669",
  opening: "\uAE30\uCD08 \uC794\uACE0",
  closing: "\uAE30\uB9D0 \uC794\uACE0",
  availableClosing: "\uAE30\uB9D0 \uCD9C\uAE08\uAC00\uB2A5\uC561",
  totalDeposit: "\uCD1D \uC785\uAE08",
  totalWithdrawal: "\uCD1D \uCD9C\uAE08",
  accountList: "\uACC4\uC88C \uBAA9\uB85D",
  flowDetails: "\uC785\uCD9C\uAE08 \uB0B4\uC5ED",
  bankName: "\uC740\uD589",
  accountNumber: "\uACC4\uC88C",
  periodDeposit: "\uAE30\uAC04 \uC785\uAE08",
  periodWithdrawal: "\uAE30\uAC04 \uCD9C\uAE08",
  balance: "\uC794\uC561",
  count: "\uAC74\uC218",
  total: "\uD569\uACC4",
  empty: "\uD574\uB2F9 \uAE30\uAC04 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  viewAccount: "\uACC4\uC815\uBCC4\uB85C \uBCF4\uAE30",
  viewCounterparty: "\uAC70\uB798\uCC98\uBCC4\uB85C \uBCF4\uAE30",
  caseSuffix: "\uAC74",
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
  const [period, setPeriod] = useState<FinancialPeriod>("month");
  const initialRange = resolveFinancialPeriodRange("month");
  const [dateFrom, setDateFrom] = useState(initialRange.startDate);
  const [dateTo, setDateTo] = useState(initialRange.endDate);
  const [breakdownView, setBreakdownView] = useState<BreakdownView>("account");

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

  const summaryItems = [
    { label: L.opening, value: formatFinancialKRW(periodTotals.openingBalance) },
    { label: L.totalDeposit, value: formatFinancialKRW(periodTotals.totalDeposit) },
    { label: L.totalWithdrawal, value: formatFinancialKRW(periodTotals.totalWithdrawal) },
    { label: L.closing, value: formatFinancialKRW(periodTotals.closingBalance), changePct },
    { label: L.availableClosing, value: formatFinancialKRW(periodTotals.closingBalance), changePct },
  ];

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

      <FinancialSummaryBar items={summaryItems} />

      <FinancialPanel title={L.accountList}>
        {accountRows.length ? (
          <FinancialTableWrap>
            <table className="erp-financial-table">
              <thead>
                <tr>
                  <th>{L.bankName}</th>
                  <th>{L.accountNumber}</th>
                  <th className="is-num">{L.periodDeposit}</th>
                  <th className="is-num">{L.periodWithdrawal}</th>
                  <th className="is-num">{L.balance}</th>
                  <th className="is-num">{L.count}</th>
                </tr>
              </thead>
              <tbody>
                {accountRows.map((row) => (
                  <tr key={row.accountNumber}>
                    <td className="is-label">{row.bankName}</td>
                    <td className="is-label font-mono">{row.accountNumber}</td>
                    <td className="is-num">{row.periodDeposit > 0 ? formatFinancialKRW(row.periodDeposit) : "-"}</td>
                    <td className="is-num">{row.periodWithdrawal > 0 ? formatFinancialKRW(row.periodWithdrawal) : "-"}</td>
                    <td className="is-num">{formatFinancialKRW(row.latestBalance)}</td>
                    <td className="is-num">{row.periodCount || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FinancialTableWrap>
        ) : (
          <FinancialEmpty message={L.empty} />
        )}
      </FinancialPanel>

      <FinancialPanel
        title={L.flowDetails}
        actions={
          <FinancialSegmentButtons
            value={breakdownView}
            options={[
              { key: "account", label: L.viewAccount },
              { key: "counterparty", label: L.viewCounterparty },
            ]}
            onChange={setBreakdownView}
          />
        }
      >
        {incomeRows.length || expenseRows.length ? (
          <FinancialFlowBreakdown
            incomeTitle={`\uC785\uAE08 ${incomeCount}${L.caseSuffix}`}
            expenseTitle={`\uCD9C\uAE08 ${expenseCount}${L.caseSuffix}`}
            incomeRows={incomeRows}
            expenseRows={expenseRows}
          />
        ) : (
          <FinancialEmpty message={L.empty} />
        )}
      </FinancialPanel>
    </div>
  );
}
