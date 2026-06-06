import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, ExternalLink, List, PieChart, Repeat, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { FixedExpenseManagePanel } from "@/components/FixedExpenseManagePanel";
import { FixedExpenseLinkCell } from "@/components/FixedExpenseLinkCell";
import { formatBankTransactionDateTime, type BankTransaction } from "@/utils/bankTransactions";
import type { ErpUser } from "@/utils/erpApi";
import type { BankLearnRule } from "@/utils/bankCompanyLedger";
import {
  fixedMonthlyAmount,
  formatKRW,
  getMonthKey,
  shiftMonthKey,
  todayISO,
  type CompanyExpense,
  type FixedExpense,
  type FixedExpensePayment,
} from "@/utils/companyLedger";
import {
  linkBankTransactionToFixedExpense,
  resolveBankTxFixedExpenseDraft,
} from "@/utils/ledgerBankBridge";
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

export type LedgerViewerSubTab = "list" | "monthly" | "account" | "fixed";

const L = {
  title: "\uAC00\uACC4\uBD80 \uC870\uD68C",
  desc: "\uD655\uC815\uB41C \uD1B5\uC7A5 \uAC70\uB798 \uB0B4\uC5ED\uACFC \uACE0\uC815\uBE44 \uC5F0\uACB0\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4. \uBBF8\uBD84\uB958 \uD1B5\uC7A5\uC740 \uD1B5\uC7A5 \uD0ED\uC5D0\uC11C \uCC98\uB9AC\uD558\uC138\uC694.",
  goBank: "\uD1B5\uC7A5\uC5D0\uC11C \uBD84\uB958\uD558\uAE30",
  list: "\uB0B4\uC5ED",
  monthly: "\uC6D4\uBCC4 \uAC00\uACC4\uBD80",
  account: "\uACC4\uC815\uACFC\uBAA9",
  fixed: "\uACE0\uC815\uBE44",
  monthlyBookTitle: (year: string, month: number) => `${year}\uB144 ${month}\uC6D4 \uAC00\uACC4\uBD80`,
  monthlyTrend: "\uC6D4\uBCC4 \uCD94\uC774",
  monthlyTrendHint: "\uD589\uC744 \uD074\uB9AD\uD558\uBA74 \uD574\uB2F9 \uC6D4 \uAC00\uACC4\uBD80\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4.",
  prevMonth: "\uC774\uC804 \uB2EC",
  nextMonth: "\uB2E4\uC74C \uB2EC",
  year: "\uB144",
  month: "\uC6D4",
  allMonths: "\uC804\uCCB4 \uAE30\uAC04",
  thisMonth: "\uC774\uBC88 \uB2EC\uB9CC",
  allFlow: "\uC804\uCCB4",
  expense: "\uCD9C\uAE08",
  income: "\uC785\uAE08",
  allAccount: "\uC804\uCCB4 \uACC4\uC815",
  search: "\uC801\uC694, \uACC4\uC815 \uAC80\uC0C9",
  empty: "\uD655\uC815\uB41C \uAC00\uACC4\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  date: "\uC77C\uC790",
  flow: "\uAD6C\uBD84",
  accountCol: "\uACC4\uC815",
  fixedExpenseCol: "\uACE0\uC815\uBE44",
  fixedExpensePlaceholder: "\uACE0\uC815\uBE44 \uC120\uD0DD",
  editFixedExpenseTitle: "\uACE0\uC815\uBE44 \uD56D\uBAA9 \uC5F0\uACB0",
  fixedExpenseRequired: "\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  linkFailed: "\uACE0\uC815\uBE44 \uC5F0\uACB0\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  save: "\uC800\uC7A5",
  cancel: "\uCDE8\uC18C",
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
  fixedExpensePayments?: FixedExpensePayment[];
  fixedExpenses?: FixedExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
  onOpenBankTab?: () => void;
  initialSubTab?: LedgerViewerSubTab;
  onSubTabConsumed?: () => void;
  setFixedExpenses?: React.Dispatch<React.SetStateAction<FixedExpense[]>>;
  setFixedExpensePayments?: React.Dispatch<React.SetStateAction<FixedExpensePayment[]>>;
  fixedExpenseCategories?: string[];
  setFixedExpenseCategories?: React.Dispatch<React.SetStateAction<string[]>>;
  setBankTransactions?: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  setBankLedgerRules?: React.Dispatch<React.SetStateAction<BankLearnRule[]>>;
  currentUser?: ErpUser | null;
  onRequestImmediateSave?: (patch?: {
    fixedExpenses?: FixedExpense[];
    fixedExpensePayments?: FixedExpensePayment[];
    fixedExpenseCategories?: string[];
    bankTransactions?: BankTransaction[];
  }) => void | Promise<void>;
};

export function LedgerViewerPage({
  bankTransactions,
  companyExpenses,
  fixedExpensePayments = [],
  fixedExpenses = [],
  ledgerCategories,
  accountCodes,
  onOpenBankTab,
  initialSubTab,
  onSubTabConsumed,
  setFixedExpenses,
  setFixedExpensePayments,
  fixedExpenseCategories = [],
  setFixedExpenseCategories,
  setBankTransactions,
  setBankLedgerRules,
  currentUser,
  onRequestImmediateSave,
}: LedgerViewerPageProps) {
  const canManageFixed =
    Boolean(setFixedExpenses && setFixedExpensePayments && setFixedExpenseCategories && setBankTransactions);
  const [activeTab, setActiveTab] = useState<LedgerViewerSubTab>("list");
  const [monthKey, setMonthKey] = useState(getMonthKey(todayISO()));
  const [allMonths, setAllMonths] = useState(false);
  const [flowFilter, setFlowFilter] = useState<LedgerFlow | "all">("all");
  const [accountFilter, setAccountFilter] = useState("");
  const [search, setSearch] = useState("");
  const [fixedExpenseModal, setFixedExpenseModal] = useState<{ tx: BankTransaction; draft: string } | null>(null);
  const [fixedExpenseModalError, setFixedExpenseModalError] = useState("");

  const canLinkFixed = Boolean(setBankTransactions && setFixedExpensePayments);
  const savedBy = currentUser?.name || currentUser?.email || undefined;

  useEffect(() => {
    if (!initialSubTab) return;
    setActiveTab(initialSubTab);
    onSubTabConsumed?.();
  }, [initialSubTab, onSubTabConsumed]);

  const allEntries = useMemo(
    () =>
      buildAllLedgerEntries({
        bankTransactions,
        companyExpenses,
        fixedExpensePayments,
        fixedExpenses,
        categories: ledgerCategories,
        accountCodes,
        bankLinkedOnly: true,
      }),
    [bankTransactions, companyExpenses, fixedExpensePayments, fixedExpenses, ledgerCategories, accountCodes],
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
      .filter((row) => (accountFilter ? row.accountCode === accountFilter : true))
      .filter((row) => {
        if (!q) return true;
        return [row.accountCode, row.accountName, row.description, row.memo]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [allEntries, allMonths, monthKey, flowFilter, accountFilter, search]);

  const monthEntries = useMemo(
    () =>
      allEntries
        .filter((row) => row.status === "confirmed")
        .filter((row) => getMonthKey(row.date) === monthKey),
    [allEntries, monthKey],
  );

  const monthlyRows = useMemo(() => buildMonthlyLedgerSummary(allEntries), [allEntries]);

  const accountRows = useMemo(
    () => buildAccountCodeSummary(activeTab === "monthly" ? monthEntries : entries, accountCodes),
    [activeTab, monthEntries, entries, accountCodes],
  );

  const accountFilterOptions = useMemo(() => {
    const source = activeTab === "monthly" ? monthEntries : entries;
    const codes = new Set(source.map((row) => row.accountCode).filter(Boolean));
    return accountCodes
      .filter((row) => row.isActive !== false && codes.has(row.code))
      .sort((a, b) => a.code.localeCompare(b.code, "ko"));
  }, [activeTab, monthEntries, entries, accountCodes]);

  const expenseTotal = (activeTab === "monthly" ? monthEntries : entries)
    .filter((r) => r.flow === "expense")
    .reduce((s, r) => s + r.amount, 0);
  const incomeTotal = (activeTab === "monthly" ? monthEntries : entries)
    .filter((r) => r.flow === "income")
    .reduce((s, r) => s + r.amount, 0);

  const jumpToMonth = (nextMonthKey: string) => {
    setMonthKey(nextMonthKey);
    setAllMonths(false);
    setActiveTab("monthly");
  };

  const fixedExpenseSelectOptions = useMemo(
    () =>
      [...fixedExpenses]
        .filter((row) => row.isActive !== false)
        .map((row) => ({
          value: row.id,
          label: `${row.name} (${formatKRW(fixedMonthlyAmount(row))})`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "ko")),
    [fixedExpenses],
  );

  const openFixedExpenseLinkModal = useCallback(
    (tx: BankTransaction) => {
      setFixedExpenseModalError("");
      setFixedExpenseModal({
        tx,
        draft: resolveBankTxFixedExpenseDraft(tx, fixedExpensePayments),
      });
    },
    [fixedExpensePayments],
  );

  const saveFixedExpenseLinkModal = useCallback(() => {
    if (!fixedExpenseModal || !setBankTransactions || !setFixedExpensePayments) return;
    const fixedExpenseId = fixedExpenseModal.draft.trim();
    if (!fixedExpenseId) {
      setFixedExpenseModalError(L.fixedExpenseRequired);
      return;
    }
    const result = linkBankTransactionToFixedExpense({
      tx: fixedExpenseModal.tx,
      fixedExpenseId,
      fixedExpenses,
      fixedExpensePayments,
      ledgerCategories,
      accountCodes,
      confirmedBy: savedBy,
    });
    if (!result.ok) {
      setFixedExpenseModalError(L.linkFailed);
      return;
    }
    const nextTransactions = bankTransactions.map((row) =>
      row.id === fixedExpenseModal.tx.id ? result.tx : row,
    );
    setBankTransactions(nextTransactions);
    setFixedExpensePayments(result.payments);
    setFixedExpenseModal(null);
    setFixedExpenseModalError("");
    void onRequestImmediateSave?.({
      bankTransactions: nextTransactions,
      fixedExpensePayments: result.payments,
    });
  }, [
    accountCodes,
    bankTransactions,
    fixedExpenseModal,
    fixedExpensePayments,
    fixedExpenses,
    ledgerCategories,
    onRequestImmediateSave,
    savedBy,
    setBankTransactions,
    setFixedExpensePayments,
  ]);

  const entryListLinkProps = {
    bankTransactions,
    fixedExpenses,
    canLinkFixed,
    onEditFixedExpenseLink: openFixedExpenseLinkModal,
  };

  const tabItems: Array<{ key: LedgerViewerSubTab; label: string; icon: React.ReactNode }> = [
    { key: "list", label: L.list, icon: <List className="h-4 w-4" /> },
    { key: "monthly", label: L.monthly, icon: <CalendarDays className="h-4 w-4" /> },
    { key: "account", label: L.account, icon: <PieChart className="h-4 w-4" /> },
  ];
  if (canManageFixed) {
    tabItems.push({ key: "fixed", label: L.fixed, icon: <Repeat className="h-4 w-4" /> });
  }

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

          {activeTab !== "fixed" ? (
            <>
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
                {activeTab === "list" ? (
                  <div className="ml-2 flex gap-1 rounded-xl bg-slate-100 p-1">
                    <FilterChip active={allMonths} onClick={() => setAllMonths(true)} label={L.allMonths} />
                    <FilterChip active={!allMonths} onClick={() => setAllMonths(false)} label={L.thisMonth} />
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
            {tabItems.map((tab) => (
              <TabBtn
                key={tab.key}
                active={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                icon={tab.icon}
                label={tab.label}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {activeTab === "fixed" && canManageFixed ? (
        <FixedExpenseManagePanel
          embedded
          fixedExpenses={fixedExpenses}
          setFixedExpenses={setFixedExpenses!}
          fixedExpensePayments={fixedExpensePayments}
          setFixedExpensePayments={setFixedExpensePayments!}
          fixedExpenseCategories={fixedExpenseCategories}
          setFixedExpenseCategories={setFixedExpenseCategories!}
          bankTransactions={bankTransactions}
          setBankTransactions={setBankTransactions!}
          setBankLedgerRules={setBankLedgerRules}
          currentUser={currentUser}
          onRequestImmediateSave={onRequestImmediateSave}
          onOpenBankTab={onOpenBankTab}
        />
      ) : null}

      {activeTab !== "fixed" ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            {activeTab !== "monthly" ? (
              <div className="mb-4 flex flex-wrap gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={L.search}
                  className="erp-input min-w-[12rem] flex-1 rounded-xl border border-slate-200 px-3 py-2"
                />
                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="erp-input rounded-xl border border-slate-200 px-3 py-2"
                >
                  <option value="">{L.allAccount}</option>
                  {accountFilterOptions.map((row) => (
                    <option key={row.code} value={row.code}>
                      {row.code} {row.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                  <FilterChip active={flowFilter === "all"} onClick={() => setFlowFilter("all")} label={L.allFlow} />
                  <FilterChip active={flowFilter === "expense"} onClick={() => setFlowFilter("expense")} label={L.expense} />
                  <FilterChip active={flowFilter === "income"} onClick={() => setFlowFilter("income")} label={L.income} />
                </div>
              </div>
            ) : null}

            {activeTab === "list" ? <EntryList rows={entries} {...entryListLinkProps} /> : null}
            {activeTab === "monthly" ? (
              <MonthlyLedgerBook
                monthKey={monthKey}
                rows={monthEntries}
                accountRows={accountRows}
                trendRows={monthlyRows}
                onSelectMonth={jumpToMonth}
                entryListLinkProps={entryListLinkProps}
              />
            ) : null}
            {activeTab === "account" ? <AccountTable rows={accountRows} /> : null}
          </CardContent>
        </Card>
      ) : null}

      {fixedExpenseModal ? (
        <div
          className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFixedExpenseModal(null);
          }}
        >
          <div
            className="erp-ledger-modal max-w-lg"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={L.editFixedExpenseTitle}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="erp-text-section font-bold">{L.editFixedExpenseTitle}</h2>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setFixedExpenseModal(null)}
                aria-label={L.cancel}
              >
                <X size={18} />
              </button>
            </div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">{L.fixedExpenseCol}</label>
            <select
              className="erp-input w-full rounded-xl"
              value={fixedExpenseModal.draft}
              onChange={(event) => {
                setFixedExpenseModalError("");
                setFixedExpenseModal((prev) => (prev ? { ...prev, draft: event.target.value } : prev));
              }}
            >
              <option value="">{L.fixedExpensePlaceholder}</option>
              {fixedExpenseSelectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fixedExpenseModalError ? (
              <p className="mt-3 text-sm font-semibold text-red-600">{fixedExpenseModalError}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setFixedExpenseModal(null)}>
                {L.cancel}
              </Button>
              <Button type="button" className="rounded-2xl" onClick={saveFixedExpenseLinkModal}>
                {L.save}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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

function resolveEntryFixedExpenseLabel(row: LedgerEntry, fixedExpenses: FixedExpense[]) {
  if (!row.fixedExpenseId) return "";
  return fixedExpenses.find((item) => item.id === row.fixedExpenseId)?.name?.trim() || "";
}

function canLinkEntryToFixedExpense(row: LedgerEntry, bankTx?: BankTransaction) {
  if (row.source !== "bank" || !bankTx) return false;
  if (row.flow !== "expense") return false;
  return Number(bankTx.withdrawal || 0) > 0;
}

type EntryListLinkProps = {
  bankTransactions: BankTransaction[];
  fixedExpenses: FixedExpense[];
  canLinkFixed: boolean;
  onEditFixedExpenseLink: (tx: BankTransaction) => void;
};

function EntryList({
  rows,
  bankTransactions,
  fixedExpenses,
  canLinkFixed,
  onEditFixedExpenseLink,
}: { rows: LedgerEntry[] } & EntryListLinkProps) {
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
            <th>{L.accountCol}</th>
            <th>{L.fixedExpenseCol}</th>
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
            const fixedLabel = resolveEntryFixedExpenseLabel(row, fixedExpenses);
            const linkable = canLinkFixed && canLinkEntryToFixedExpense(row, bankTx);
            const offlineFixed = row.source === "offline" && Boolean(row.fixedExpenseId);
            return (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>{row.flow === "income" ? L.income : L.expense}</td>
                <td>
                  <span className="font-mono text-xs text-slate-500">{row.accountCode}</span> {row.accountName}
                </td>
                <td className="max-w-[9rem]">
                  {linkable && bankTx ? (
                    <FixedExpenseLinkCell
                      value={fixedLabel}
                      placeholder={L.fixedExpensePlaceholder}
                      onClick={() => onEditFixedExpenseLink(bankTx)}
                    />
                  ) : (
                    <FixedExpenseLinkCell
                      value={offlineFixed ? fixedLabel : null}
                      placeholder="-"
                      disabled
                    />
                  )}
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

function MonthlyLedgerBook({
  monthKey,
  rows,
  accountRows,
  trendRows,
  onSelectMonth,
  entryListLinkProps,
}: {
  monthKey: string;
  rows: LedgerEntry[];
  accountRows: ReturnType<typeof buildAccountCodeSummary>;
  trendRows: ReturnType<typeof buildMonthlyLedgerSummary>;
  onSelectMonth: (monthKey: string) => void;
  entryListLinkProps: EntryListLinkProps;
}) {
  const expenseTotal = rows.filter((r) => r.flow === "expense").reduce((s, r) => s + r.amount, 0);
  const incomeTotal = rows.filter((r) => r.flow === "income").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="erp-text-section mb-1 font-bold text-slate-900">
          {L.monthlyBookTitle(monthKey.slice(0, 4), Number(monthKey.slice(5)))}
        </h3>
        <p className="erp-text-caption text-slate-500">
          {L.expense} {formatKRW(expenseTotal)} · {L.income} {formatKRW(incomeTotal)} · {L.net}{" "}
          {formatKRW(incomeTotal - expenseTotal)} · {rows.length}
          {L.caseSuffix}
        </p>
      </div>

      <div>
        <h4 className="erp-text-body mb-2 font-bold text-slate-800">{L.accountCol}</h4>
        <AccountTable rows={accountRows} />
      </div>

      <div>
        <h4 className="erp-text-body mb-2 font-bold text-slate-800">{L.list}</h4>
        <EntryList rows={rows} {...entryListLinkProps} />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-slate-500" />
          <h4 className="erp-text-body font-bold text-slate-800">{L.monthlyTrend}</h4>
        </div>
        <p className="erp-text-caption mb-3 text-slate-500">{L.monthlyTrendHint}</p>
        <MonthlyTrendTable rows={trendRows} activeMonthKey={monthKey} onSelectMonth={onSelectMonth} />
      </div>
    </div>
  );
}

function MonthlyTrendTable({
  rows,
  activeMonthKey,
  onSelectMonth,
}: {
  rows: ReturnType<typeof buildMonthlyLedgerSummary>;
  activeMonthKey: string;
  onSelectMonth: (monthKey: string) => void;
}) {
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
            <tr
              key={row.monthKey}
              className={`cursor-pointer ${row.monthKey === activeMonthKey ? "bg-slate-50" : "hover:bg-slate-50/70"}`}
              onClick={() => onSelectMonth(row.monthKey)}
            >
              <td className="font-semibold text-slate-900">{row.label}</td>
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

function AccountTable({ rows }: { rows: ReturnType<typeof buildAccountCodeSummary> }) {
  if (!rows.length) {
    return <div className="py-6 text-center erp-text-body text-slate-500">{L.empty}</div>;
  }
  return (
    <DesktopTableWrap>
      <table className="erp-table w-full">
        <thead>
          <tr>
            <th>{L.accountCol}</th>
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
