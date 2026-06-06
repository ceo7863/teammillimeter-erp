import React, { useMemo, useState } from "react";
import { formatMonthLabel, type CompanyExpense, type FixedExpense, type FixedExpensePayment } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { TaxInvoice } from "@/utils/taxInvoices";
import {
  buildAccrualProfitLossTree,
  buildMonthlyAccountTree,
  collectAnalysisMonthKeys,
  type AccrualProfitLossTreeNode,
  type MonthlyAccountTreeNode,
} from "@/utils/financialAnalysis";
import { buildAllLedgerEntries, type AccountCode, type LedgerCategory } from "@/utils/ledgerSystem";
import {
  FinancialCheckbox,
  FinancialEmpty,
  FinancialPanel,
  FinancialSegmentButtons,
  FinancialTableWrap,
  FinancialToolbar,
  FinancialTreeToggle,
  formatFinancialKRW,
  resolveFinancialMonthKeys,
  resolveFinancialPeriodRange,
  type FinancialPeriod,
} from "@/components/analysis/AnalysisUi";

const L = {
  title: "\uC190\uC775\uACC4\uC0B0\uC11C",
  account: "\uACC4\uC815",
  total: "\uD569\uACC4",
  empty: "\uD655\uC778\uB41C \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  cashBasis: "\uD604\uAE08\uC8FC\uC758",
  accrualBasis: "\uBC1C\uC0DD\uC8FC\uC758",
  incomeSection: "\uC218\uC775",
  expenseSection: "\uBE44\uC6A9",
  operatingProfit: "\uC601\uC5C5\uC774\uC775",
};

type ProfitBasis = "cash" | "accrual";

type ProfitLossPanelProps = {
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
  fixedExpensePayments?: FixedExpensePayment[];
  fixedExpenses?: FixedExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
  taxInvoices: TaxInvoice[];
};

type TreeRow = MonthlyAccountTreeNode | AccrualProfitLossTreeNode;

function isCashRow(row: TreeRow): row is MonthlyAccountTreeNode {
  return row.level === "group" || row.level === "secondary" || row.level === "tertiary";
}

export function ProfitLossPanel({
  bankTransactions,
  companyExpenses,
  fixedExpensePayments,
  fixedExpenses,
  ledgerCategories,
  accountCodes,
  taxInvoices,
}: ProfitLossPanelProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [basis, setBasis] = useState<ProfitBasis>("cash");
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

  const monthKeys = useMemo(() => {
    const fromEntries = collectAnalysisMonthKeys(allEntries, bankTransactions, taxInvoices, 12);
    const fromRange = resolveFinancialMonthKeys(dateFrom, dateTo, 6);
    const merged = [...new Set([...fromRange, ...fromEntries])].sort((a, b) => a.localeCompare(b));
    return merged.slice(-6);
  }, [allEntries, bankTransactions, taxInvoices, dateFrom, dateTo]);

  const cashIncomeTree = useMemo(
    () => buildMonthlyAccountTree(allEntries, accountCodes, monthKeys, "income"),
    [allEntries, accountCodes, monthKeys],
  );

  const cashExpenseTree = useMemo(
    () => buildMonthlyAccountTree(allEntries, accountCodes, monthKeys, "expense"),
    [allEntries, accountCodes, monthKeys],
  );

  const accrualTree = useMemo(
    () => buildAccrualProfitLossTree(taxInvoices, monthKeys),
    [taxInvoices, monthKeys],
  );

  const incomeTree = basis === "cash" ? cashIncomeTree : accrualTree.sales;
  const expenseTree = basis === "cash" ? cashExpenseTree : accrualTree.purchase;

  const operatingProfit = useMemo(() => {
    const incomeByMonth = Object.fromEntries(monthKeys.map((mk) => [mk, 0]));
    const expenseByMonth = Object.fromEntries(monthKeys.map((mk) => [mk, 0]));

    for (const row of incomeTree.filter((item) => item.level === "group")) {
      for (const mk of monthKeys) {
        incomeByMonth[mk] += row.monthlyAmounts[mk] || 0;
      }
    }
    for (const row of expenseTree.filter((item) => item.level === "group")) {
      for (const mk of monthKeys) {
        expenseByMonth[mk] += row.monthlyAmounts[mk] || 0;
      }
    }

    const monthlyAmounts = Object.fromEntries(
      monthKeys.map((mk) => [mk, (incomeByMonth[mk] || 0) - (expenseByMonth[mk] || 0)]),
    );
    const total = monthKeys.reduce((sum, mk) => sum + (monthlyAmounts[mk] || 0), 0);
    return { monthlyAmounts, total };
  }, [incomeTree, expenseTree, monthKeys]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const visibleIncomeRows = filterVisibleRows(incomeTree, collapsedGroups, basis === "cash");
  const visibleExpenseRows = filterVisibleRows(expenseTree, collapsedGroups, basis === "cash");
  const hasRows = visibleIncomeRows.length + visibleExpenseRows.length > 0;

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
        trailing={
          <FinancialSegmentButtons
            value={basis}
            options={[
              { key: "cash", label: L.cashBasis },
              { key: "accrual", label: L.accrualBasis },
            ]}
            onChange={setBasis}
          />
        }
      />

      <FinancialPanel title={L.title}>
        {hasRows && monthKeys.length ? (
          <FinancialTableWrap>
            <table className="erp-financial-table">
              <thead>
                <tr>
                  <th>{L.account}</th>
                  {monthKeys.map((mk) => (
                    <th key={mk} className="is-num">
                      {formatMonthLabel(mk)}
                    </th>
                  ))}
                  <th className="is-num">{L.total}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="is-section">
                  <td colSpan={monthKeys.length + 2}>{L.incomeSection}</td>
                </tr>
                {renderTreeRows(visibleIncomeRows, monthKeys, collapsedGroups, toggleGroup, basis === "cash")}
                <tr className="is-section">
                  <td colSpan={monthKeys.length + 2}>{L.expenseSection}</td>
                </tr>
                {renderTreeRows(visibleExpenseRows, monthKeys, collapsedGroups, toggleGroup, basis === "cash")}
                <tr className="is-summary">
                  <td className="is-label">{L.operatingProfit}</td>
                  {monthKeys.map((mk) => {
                    const value = operatingProfit.monthlyAmounts[mk] || 0;
                    return (
                      <td key={mk} className={`is-num${value < 0 ? " erp-financial-amount-negative" : ""}`}>
                        {value ? formatFinancialKRW(value) : "-"}
                      </td>
                    );
                  })}
                  <td className={`is-num${operatingProfit.total < 0 ? " erp-financial-amount-negative" : ""}`}>
                    {formatFinancialKRW(operatingProfit.total)}
                  </td>
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

function filterVisibleRows(rows: TreeRow[], collapsedGroups: Record<string, boolean>, cashBasis: boolean) {
  return rows.filter((row) => {
    if (row.level === "group") return true;

    const groupKey = cashBasis && isCashRow(row)
      ? `group-${row.parentGroup}`
      : !cashBasis && "flowType" in row
        ? `group-${row.flowType}`
        : "";

    if (groupKey && collapsedGroups[groupKey]) return false;

    if (cashBasis && isCashRow(row) && row.level === "tertiary") {
      return !collapsedGroups[row.parentSecondaryKey || ""];
    }

    if (!cashBasis && row.level === "documentType" && "flowType" in row) {
      return !collapsedGroups[`group-${row.flowType}`];
    }

    return true;
  });
}

function renderTreeRows(
  rows: TreeRow[],
  monthKeys: string[],
  collapsedGroups: Record<string, boolean>,
  onToggleGroup: (key: string) => void,
  cashBasis: boolean,
) {
  return rows.map((row) => {
    const isGroup = row.level === "group" || (cashBasis && isCashRow(row) && row.level === "secondary");
    const indent: 0 | 1 | 2 =
      row.level === "group" ? 0 : cashBasis && isCashRow(row) && row.level === "secondary" ? 1 : 2;

    const isCollapsible =
      row.level === "group" || (cashBasis && isCashRow(row) && row.level === "secondary");

    return (
      <tr key={row.key} className={isGroup ? "is-group" : ""}>
        <td className="is-label">
          {isCollapsible ? (
            <FinancialTreeToggle
              collapsed={Boolean(collapsedGroups[row.key])}
              onToggle={() => onToggleGroup(row.key)}
              label={row.label}
              indent={indent}
            />
          ) : (
            <span className={`erp-financial-indent-${indent}`}>{row.label}</span>
          )}
        </td>
        {monthKeys.map((mk) => {
          const value = row.monthlyAmounts[mk] || 0;
          return (
            <td key={mk} className={`is-num${value < 0 ? " erp-financial-amount-negative" : ""}`}>
              {value ? formatFinancialKRW(value) : "-"}
            </td>
          );
        })}
        <td className={`is-num${row.total < 0 ? " erp-financial-amount-negative" : ""}`}>
          {row.total ? formatFinancialKRW(row.total) : "-"}
        </td>
      </tr>
    );
  });
}
