import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { formatKRW, formatMonthLabel, type CompanyExpense } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import { buildMonthlyAccountTree, collectMonthKeysFromEntries } from "@/utils/financialAnalysis";
import { buildAllLedgerEntries, type AccountCode, type LedgerCategory } from "@/utils/ledgerSystem";

const L = {
  title: "\uC190\uC775\uACC4\uC0B0\uC11C",
  desc: "\uD655\uC815\uB41C \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC744 \uACC4\uC815 \uADF8\uB8F9\uBCC4\uB85C \uC6D4\uBCC4 \uC9D1\uACC4\uD569\uB2C8\uB2E4.",
  income: "\uC218\uC775",
  expense: "\uBE44\uC6A9",
  account: "\uACC4\uC815",
  total: "\uD569\uACC4",
  empty: "\uD655\uC778\uB41C \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
};

type ProfitLossPanelProps = {
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
};

export function ProfitLossPanel({
  bankTransactions,
  companyExpenses,
  ledgerCategories,
  accountCodes,
}: ProfitLossPanelProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

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

  const incomeTree = useMemo(
    () => buildMonthlyAccountTree(allEntries, accountCodes, monthKeys, "income"),
    [allEntries, accountCodes, monthKeys],
  );

  const expenseTree = useMemo(
    () => buildMonthlyAccountTree(allEntries, accountCodes, monthKeys, "expense"),
    [allEntries, accountCodes, monthKeys],
  );

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <h2 className="erp-text-page-title text-slate-900">{L.title}</h2>
          <p className="mt-1 erp-text-body text-slate-600">{L.desc}</p>
        </CardContent>
      </Card>

      <TreeSection
        title={L.income}
        rows={incomeTree}
        monthKeys={monthKeys}
        collapsedGroups={collapsedGroups}
        onToggleGroup={toggleGroup}
        tone="text-emerald-700"
      />
      <TreeSection
        title={L.expense}
        rows={expenseTree}
        monthKeys={monthKeys}
        collapsedGroups={collapsedGroups}
        onToggleGroup={toggleGroup}
        tone="text-red-600"
      />
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
}: {
  title: string;
  rows: ReturnType<typeof buildMonthlyAccountTree>;
  monthKeys: string[];
  collapsedGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
  tone: string;
}) {
  const visibleRows = rows.filter((row) => {
    if (row.level === "group") return true;
    const groupKey = `group-${row.parentGroup}`;
    return !collapsedGroups[groupKey];
  });

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
                  <tr key={row.key} className={row.level === "group" ? "bg-slate-50 font-bold" : ""}>
                    <td>
                      {row.level === "group" ? (
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
                        <span className="pl-6">{row.label}</span>
                      )}
                    </td>
                    {monthKeys.map((mk) => (
                      <td key={mk} className={`text-right ${row.level === "group" ? "font-bold" : ""}`}>
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
