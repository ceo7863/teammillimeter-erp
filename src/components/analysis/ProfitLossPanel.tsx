import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { formatKRW, formatMonthLabel, type CompanyExpense } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { TaxInvoice } from "@/utils/taxInvoices";
import {
  buildAccrualProfitLossTree,
  buildMonthlyAccountTree,
  collectMonthKeysFromEntries,
  type AccrualProfitLossTreeNode,
  type MonthlyAccountTreeNode,
} from "@/utils/financialAnalysis";
import { buildAllLedgerEntries, type AccountCode, type LedgerCategory } from "@/utils/ledgerSystem";

const L = {
  title: "\uC190\uC775\uACC4\uC0B0\uC11C",
  desc: "\uD655\uC815\uB41C \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uACC4\uC815 \uADF8\uB8F9\uBCC4\uB85C \uC6D4\uBCC4 \uC9D1\uACC4\uD569\uB2C8\uB2E4.",
  income: "\uC218\uC775",
  expense: "\uBE44\uC6A9",
  account: "\uACC4\uC815",
  total: "\uD569\uACC4",
  empty: "\uD655\uC778\uB41C \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  cashBasis: "\uD604\uAE08\uC8FC\uC758",
  accrualBasis: "\uBC1C\uC0DD\uC8FC\uC758",
  operatingProfit: "\uC601\uC5C5\uC774\uC775",
};

type ProfitBasis = "cash" | "accrual";

type ProfitLossPanelProps = {
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
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
  ledgerCategories,
  accountCodes,
  taxInvoices,
}: ProfitLossPanelProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [basis, setBasis] = useState<ProfitBasis>("cash");

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

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <h2 className="erp-text-page-title text-slate-900">{L.title}</h2>
          <p className="mt-1 erp-text-body text-slate-600">{L.desc}</p>
          <div className="mt-4 flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setBasis("cash")}
              className={`erp-text-body rounded-xl px-4 py-2 font-bold ${basis === "cash" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
            >
              {L.cashBasis}
            </button>
            <button
              type="button"
              onClick={() => setBasis("accrual")}
              className={`erp-text-body rounded-xl px-4 py-2 font-bold ${basis === "accrual" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
            >
              {L.accrualBasis}
            </button>
          </div>
        </CardContent>
      </Card>

      <TreeSection
        title={L.income}
        rows={incomeTree}
        monthKeys={monthKeys}
        collapsedGroups={collapsedGroups}
        onToggleGroup={toggleGroup}
        tone="text-emerald-700"
        cashBasis={basis === "cash"}
      />
      <TreeSection
        title={L.expense}
        rows={expenseTree}
        monthKeys={monthKeys}
        collapsedGroups={collapsedGroups}
        onToggleGroup={toggleGroup}
        tone="text-red-600"
        cashBasis={basis === "cash"}
      />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <DesktopTableWrap>
            <table className="erp-table w-full">
              <thead>
                <tr>
                  <th>{L.operatingProfit}</th>
                  {monthKeys.map((mk) => (
                    <th key={mk} className="text-right">
                      {formatMonthLabel(mk)}
                    </th>
                  ))}
                  <th className="text-right">{L.total}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-slate-50 font-bold">
                  <td>{L.operatingProfit}</td>
                  {monthKeys.map((mk) => {
                    const value = operatingProfit.monthlyAmounts[mk] || 0;
                    return (
                      <td
                        key={mk}
                        className={`text-right ${value >= 0 ? "text-emerald-700" : "text-red-600"}`}
                      >
                        {value ? formatKRW(value) : "-"}
                      </td>
                    );
                  })}
                  <td
                    className={`text-right ${operatingProfit.total >= 0 ? "text-emerald-700" : "text-red-600"}`}
                  >
                    {formatKRW(operatingProfit.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </DesktopTableWrap>
        </CardContent>
      </Card>
    </div>
  );
}

function TreeSection({
  title,
  rows,
  monthKeys,
  collapsedGroups,
  onToggleGroup,
  tone,
  cashBasis,
}: {
  title: string;
  rows: TreeRow[];
  monthKeys: string[];
  collapsedGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
  tone: string;
  cashBasis: boolean;
}) {
  const visibleRows = rows.filter((row) => {
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

  const indentClass = (row: TreeRow) => {
    if (row.level === "group") return "";
    if (cashBasis && isCashRow(row)) {
      return row.level === "secondary" ? "pl-4" : "pl-8";
    }
    return "pl-6";
  };

  const isCollapsible = (row: TreeRow) =>
    row.level === "group" || (cashBasis && isCashRow(row) && row.level === "secondary");

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-4 md:p-5">
        <h3 className={`erp-text-section-title mb-4 font-bold ${tone}`}>{title}</h3>
        {visibleRows.length ? (
          <DesktopTableWrap>
            <table className="erp-table w-full">
              <thead>
                <tr>
                  <th>{L.account}</th>
                  {monthKeys.map((mk) => (
                    <th key={mk} className="text-right">
                      {formatMonthLabel(mk)}
                    </th>
                  ))}
                  <th className="text-right">{L.total}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={row.key}
                    className={row.level === "group" || (cashBasis && isCashRow(row) && row.level === "secondary") ? "bg-slate-50 font-bold" : ""}
                  >
                    <td>
                      {isCollapsible(row) ? (
                        <button
                          type="button"
                          onClick={() => onToggleGroup(row.key)}
                          className="inline-flex items-center gap-1 text-left"
                        >
                          {collapsedGroups[row.key] ? (
                            <ChevronRight className="h-4 w-4 shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0" />
                          )}
                          {row.label}
                        </button>
                      ) : (
                        <span className={indentClass(row)}>{row.label}</span>
                      )}
                    </td>
                    {monthKeys.map((mk) => (
                      <td
                        key={mk}
                        className={`text-right ${row.level === "group" || (cashBasis && isCashRow(row) && row.level === "secondary") ? "font-bold" : ""}`}
                      >
                        {row.monthlyAmounts[mk] ? formatKRW(row.monthlyAmounts[mk]) : "-"}
                      </td>
                    ))}
                    <td className={`text-right font-bold ${tone}`}>{formatKRW(row.total)}</td>
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
  );
}
