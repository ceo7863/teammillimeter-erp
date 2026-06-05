import React, { useMemo, useState } from "react";
import { BarChart3, ExternalLink, List, PieChart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { formatBankTransactionDateTime, type BankTransaction } from "@/utils/bankTransactions";
import {
  formatKRW,
  getMonthKey,
  shiftMonthKey,
  todayISO,
  type CompanyExpense,
} from "@/utils/companyLedger";
import {
  buildAccountCodeSummary,
  buildAllLedgerEntries,
  buildLedgerGapSummary,
  buildMonthlyLedgerSummary,
  formatLedgerGapLine,
  type AccountCode,
  type LedgerCategory,
  type LedgerEntry,
  type LedgerFlow,
} from "@/utils/ledgerSystem";
import { filterLedgerInboxTransactions } from "@/utils/ledgerInboxUtils";

type ViewerTab = "list" | "monthly" | "category" | "account";

const L = {
  title: "\uAC00\uACC4\uBD80 \uC870\uD68C",
  desc: "\uD1B5\uC7A5 \uAC70\uB798\uB97C \uBD84\uB958\uD55C \uACB0\uACFC\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4. \uBD84\uB958\uB294 \uD1B5\uC7A5 \uAC70\uB798\uB0B4\uC5ED \uD0ED\uC5D0\uC11C \uD569\uB2C8\uB2E4.",
  goBank: "\uD1B5\uC7A5\uC5D0\uC11C \uBD84\uB958\uD558\uAE30",
  list: "\uB0B4\uC5ED",
  monthly: "\uC6D4\uBCC4",
  category: "\uCE74\uD14C\uACE0\uB9AC",
  account: "\uACC4\uC815\uACFC\uBAA9",
  prevMonth: "\uC774\uC804 \uB2EC",
  nextMonth: "\uB2E4\uC74C \uB2EC",
  year: "\uB144",
  month: "\uC6D4",
  allMonths: "\uC804\uCCB4 \uAE30\uAC04",
  thisMonth: "\uC774\uBC88 \uB2EC\uB9CC",
  allFlow: "\uC804\uCCB4",
  expense: "\uCD9C\uAE08",
  income: "\uC785\uAE08",
  allCategory: "\uC804\uCCB4 \uCE74\uD14C\uACE0\uB9AC",
  search: "\uC801\uC694, \uCE74\uD14C\uACE0\uB9AC, \uACC4\uC815 \uAC80\uC0C9",
  empty: "\uD655\uC815\uB41C \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  date: "\uC77C\uC790",
  flow: "\uAD6C\uBD84",
  cat: "\uCE74\uD14C\uACE0\uB9AC",
  accountCol: "\uACC4\uC815",
  descCol: "\uC801\uC694",
  amount: "\uAE08\uC561",
  source: "\uCD9C\uCC98",
  bank: "\uD1B5\uC7A5",
  offline: "\uC624\uD504\uB77C\uC778",
  net: "\uC21C\uC561",
  count: "\uAC74\uC218",
  total: "\uD569\uACC4",
  caseSuffix: "\uAC74",
};

type LedgerViewerPageProps = {
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
  onOpenBankTab?: () => void;
};

export function LedgerViewerPage({
  bankTransactions,
  companyExpenses,
  ledgerCategories,
  accountCodes,
  onOpenBankTab,
}: LedgerViewerPageProps) {
  const [activeTab, setActiveTab] = useState<ViewerTab>("list");
  const [monthKey, setMonthKey] = useState(getMonthKey(todayISO()));
  const [allMonths, setAllMonths] = useState(false);
  const [flowFilter, setFlowFilter] = useState<LedgerFlow | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");

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

  const pendingCount = useMemo(
    () => filterLedgerInboxTransactions(bankTransactions, { allMonths: true }).length,
    [bankTransactions],
  );

  const gap = useMemo(
    () => buildLedgerGapSummary(bankTransactions, allEntries, allMonths ? undefined : monthKey),
    [bankTransactions, allEntries, allMonths, monthKey],
  );

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEntries
      .filter((row) => row.status === "confirmed")
      .filter((row) => (allMonths ? true : getMonthKey(row.date) === monthKey))
      .filter((row) => (flowFilter === "all" ? true : row.flow === flowFilter))
      .filter((row) => (categoryFilter ? row.categoryId === categoryFilter : true))
      .filter((row) => {
        if (!q) return true;
        return [row.categoryName, row.accountCode, row.accountName, row.description, row.memo]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [allEntries, allMonths, monthKey, flowFilter, categoryFilter, search]);

  const monthlyRows = useMemo(() => buildMonthlyLedgerSummary(allEntries), [allEntries]);

  const categoryRows = useMemo(() => {
    const bucket = new Map<string, { name: string; expense: number; income: number; count: number }>();
    for (const row of entries) {
      const key = row.categoryId || row.categoryName;
      const current = bucket.get(key) || { name: row.categoryName, expense: 0, income: 0, count: 0 };
      if (row.flow === "income") current.income += row.amount;
      else current.expense += row.amount;
      current.count += 1;
      bucket.set(key, current);
    }
    return [...bucket.values()].sort((a, b) => b.expense + b.income - (a.expense + a.income));
  }, [entries]);

  const accountRows = useMemo(() => buildAccountCodeSummary(entries, accountCodes), [entries, accountCodes]);

  const activeCategories = useMemo(
    () => ledgerCategories.filter((row) => row.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [ledgerCategories],
  );

  const expenseTotal = entries.filter((r) => r.flow === "expense").reduce((s, r) => s + r.amount, 0);
  const incomeTotal = entries.filter((r) => r.flow === "income").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="erp-ledger-viewer-page space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="erp-text-page-title text-slate-900">{L.title}</h2>
              <p className="mt-1 erp-text-body text-slate-600">{L.desc}</p>
            </div>
            {onOpenBankTab ? (
              <Button type="button" variant="outline" className="shrink-0 rounded-xl" onClick={onOpenBankTab}>
                <ExternalLink className="mr-2 h-4 w-4" />
                {L.goBank}
                {pendingCount > 0 ? ` (${pendingCount}${L.caseSuffix})` : ""}
              </Button>
            ) : null}
          </div>

          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 erp-text-body text-amber-900">
            {formatLedgerGapLine(gap)}
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatCard label={L.expense} value={formatKRW(expenseTotal)} />
            <StatCard label={L.income} value={formatKRW(incomeTotal)} />
            <StatCard label={L.net} value={formatKRW(incomeTotal - expenseTotal)} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
            <div className="ml-2 flex gap-1 rounded-xl bg-slate-100 p-1">
              <FilterChip active={allMonths} onClick={() => setAllMonths(true)} label={L.allMonths} />
              <FilterChip active={!allMonths} onClick={() => setAllMonths(false)} label={L.thisMonth} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
            <TabBtn active={activeTab === "list"} onClick={() => setActiveTab("list")} icon={<List className="h-4 w-4" />} label={L.list} />
            <TabBtn active={activeTab === "monthly"} onClick={() => setActiveTab("monthly")} icon={<BarChart3 className="h-4 w-4" />} label={L.monthly} />
            <TabBtn active={activeTab === "category"} onClick={() => setActiveTab("category")} icon={<PieChart className="h-4 w-4" />} label={L.category} />
            <TabBtn active={activeTab === "account"} onClick={() => setActiveTab("account")} icon={<PieChart className="h-4 w-4" />} label={L.account} />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={L.search}
              className="erp-input min-w-[12rem] flex-1 rounded-xl border border-slate-200 px-3 py-2"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="erp-input rounded-xl border border-slate-200 px-3 py-2"
            >
              <option value="">{L.allCategory}</option>
              {activeCategories.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
              <FilterChip active={flowFilter === "all"} onClick={() => setFlowFilter("all")} label={L.allFlow} />
              <FilterChip active={flowFilter === "expense"} onClick={() => setFlowFilter("expense")} label={L.expense} />
              <FilterChip active={flowFilter === "income"} onClick={() => setFlowFilter("income")} label={L.income} />
            </div>
          </div>

          {activeTab === "list" ? <EntryList rows={entries} bankTransactions={bankTransactions} /> : null}
          {activeTab === "monthly" ? <MonthlyTable rows={monthlyRows} /> : null}
          {activeTab === "category" ? <CategoryTable rows={categoryRows} /> : null}
          {activeTab === "account" ? <AccountTable rows={accountRows} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="erp-text-caption text-slate-500">{label}</div>
      <div className="erp-text-section-title mt-1 font-bold text-slate-950">{value}</div>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
    >
      {label}
    </button>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`erp-text-body inline-flex items-center gap-2 rounded-xl px-4 py-2 font-bold ${
        active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function EntryList({ rows, bankTransactions }: { rows: LedgerEntry[]; bankTransactions: BankTransaction[] }) {
  if (!rows.length) {
    return <div className="py-10 text-center erp-text-body text-slate-500">{L.empty}</div>;
  }
  return (
    <DesktopTableWrap>
      <table className="erp-table w-full">
        <thead>
          <tr>
            <th>{L.date}</th>
            <th>{L.flow}</th>
            <th>{L.cat}</th>
            <th>{L.accountCol}</th>
            <th>{L.descCol}</th>
            <th className="text-right">{L.amount}</th>
            <th>{L.source}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const bankTx = row.bankTransactionId
              ? bankTransactions.find((tx) => tx.id === row.bankTransactionId)
              : undefined;
            return (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>{row.flow === "income" ? L.income : L.expense}</td>
                <td>{row.categoryName}</td>
                <td>
                  <span className="font-mono text-xs text-slate-500">{row.accountCode}</span> {row.accountName}
                </td>
                <td>{row.description}</td>
                <td className="text-right font-bold">{formatKRW(row.amount)}</td>
                <td className="erp-text-caption text-slate-500">
                  {row.source === "bank" ? (
                    bankTx ? formatBankTransactionDateTime(bankTx.transactionAt).slice(0, 10) : L.bank
                  ) : (
                    L.offline
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DesktopTableWrap>
  );
}

function MonthlyTable({ rows }: { rows: ReturnType<typeof buildMonthlyLedgerSummary> }) {
  return (
    <DesktopTableWrap>
      <table className="erp-table w-full">
        <thead>
          <tr>
            <th>{L.monthly}</th>
            <th className="text-right">{L.expense}</th>
            <th className="text-right">{L.income}</th>
            <th className="text-right">{L.net}</th>
            <th className="text-right">{L.count}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.monthKey}>
              <td>{row.label}</td>
              <td className="text-right">{formatKRW(row.expenseTotal)}</td>
              <td className="text-right">{formatKRW(row.incomeTotal)}</td>
              <td className="text-right font-bold">{formatKRW(row.netTotal)}</td>
              <td className="text-right">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DesktopTableWrap>
  );
}

function CategoryTable({
  rows,
}: {
  rows: Array<{ name: string; expense: number; income: number; count: number }>;
}) {
  return (
    <DesktopTableWrap>
      <table className="erp-table w-full">
        <thead>
          <tr>
            <th>{L.cat}</th>
            <th className="text-right">{L.expense}</th>
            <th className="text-right">{L.income}</th>
            <th className="text-right">{L.count}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td className="text-right">{formatKRW(row.expense)}</td>
              <td className="text-right">{formatKRW(row.income)}</td>
              <td className="text-right">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DesktopTableWrap>
  );
}

function AccountTable({ rows }: { rows: ReturnType<typeof buildAccountCodeSummary> }) {
  return (
    <DesktopTableWrap>
      <table className="erp-table w-full">
        <thead>
          <tr>
            <th>{L.accountCol}</th>
            <th>{L.cat}</th>
            <th className="text-right">{L.expense}</th>
            <th className="text-right">{L.income}</th>
            <th className="text-right">{L.count}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.accountCode}>
              <td>
                <span className="font-mono">{row.accountCode}</span> {row.accountName}
              </td>
              <td />
              <td className="text-right">{formatKRW(row.expenseTotal)}</td>
              <td className="text-right">{formatKRW(row.incomeTotal)}</td>
              <td className="text-right">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DesktopTableWrap>
  );
}
