import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, List, Repeat, X, BarChart3 } from "lucide-react";
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
  isCeoDedicatedLedgerCategory,
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
  buildAllLedgerEntries,
  buildLedgerGapSummary,
  formatLedgerGapLine,
  splitVariableLedgerExpenseRows,
  type AccountCode,
  type LedgerCategory,
  type LedgerEntry,
  type LedgerFlow,
} from "@/utils/ledgerSystem";
import type { AnalysisHubTab } from "@/utils/analysisHub";
import type { ClientDepositMatchSource, WorkerDepositMatchSource } from "@/utils/clientDepositAliases";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import { filterLedgerInboxTransactions } from "@/utils/ledgerInboxUtils";
import {
  DEFAULT_LEDGER_VIEWER_FILTERS,
  LedgerViewerFilterBar,
  matchesLedgerFixedExpenseFilter,
  matchesLedgerViewerPeriod,
  resolveLedgerViewerPeriod,
  type LedgerViewerAppliedFilters,
} from "@/components/LedgerViewerFilterBar";

export type LedgerViewerSubTab = "list" | "fixed";

const L = {
  title: "\uAC00\uACC4\uBD80 \uC870\uD68C",
  desc: "\uD655\uC815\uB41C \uD1B5\uC7A5 \uAC70\uB798 \uB0B4\uC5ED\uACFC \uACE0\uC815\uBE44 \uC5F0\uACB0\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4. \uBBF8\uBD84\uB958 \uD1B5\uC7A5\uC740 \uD1B5\uC7A5 \uD0ED\uC5D0\uC11C \uCC98\uB9AC\uD558\uC138\uC694.",
  goBank: "\uD1B5\uC7A5\uC5D0\uC11C \uBD84\uB958\uD558\uAE30",
  openAnalysis: "\uBD84\uC11D\uC5D0\uC11C \uBCF4\uAE30",
  list: "\uB0B4\uC5ED",
  fixed: "\uACE0\uC815\uBE44",
  expense: "\uCD9C\uAE08",
  income: "\uC785\uAE08",
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
  fixedExpenseSection: "\uACE0\uC815\uBE44",
  clientVendorExpenseSection: "\uC5C5\uCC98 \uCD9C\uAE08",
  variableExpenseSection: "\uC77C\uBC18 \uCD9C\uAE08",
  fixedExpenseTotal: (count: number, amount: number) =>
    `\uACE0\uC815\uBE44 ${count}${"\uAC74"} \u00B7 ${formatKRW(amount)}`,
  clientVendorExpenseTotal: (count: number, amount: number) =>
    `\uC5C5\uCC98 ${count}${"\uAC74"} \u00B7 ${formatKRW(amount)}`,
  variableExpenseTotal: (count: number, amount: number) =>
    `\uC77C\uBC18 ${count}${"\uAC74"} \u00B7 ${formatKRW(amount)}`,
};

type LedgerViewerPageProps = {
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
  clients?: ClientDepositMatchSource[];
  workers?: WorkerDepositMatchSource[];
  bankTransactionFolders?: BankTransactionFolder[];
  fixedExpensePayments?: FixedExpensePayment[];
  fixedExpenses?: FixedExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
  onOpenBankTab?: () => void;
  onOpenAnalysis?: (tab?: AnalysisHubTab) => void;
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
  clients = [],
  workers = [],
  bankTransactionFolders = [],
  fixedExpensePayments = [],
  fixedExpenses = [],
  ledgerCategories,
  accountCodes,
  onOpenBankTab,
  onOpenAnalysis,
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
  const [listFilters, setListFilters] = useState<LedgerViewerAppliedFilters>(DEFAULT_LEDGER_VIEWER_FILTERS);
  const [filterResetKey, setFilterResetKey] = useState(0);
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

  const listPeriodRange = useMemo(() => resolveLedgerViewerPeriod(listFilters), [listFilters]);

  const gap = useMemo(
    () =>
      buildLedgerGapSummary(
        bankTransactions,
        allEntries,
        listFilters.periodKey === "thisMonth"
          ? listFilters.viewMonthKey || getMonthKey(todayISO())
          : undefined,
      ),
    [bankTransactions, allEntries, listFilters.periodKey, listFilters.viewMonthKey],
  );

  const periodScopedEntries = useMemo(
    () =>
      allEntries
        .filter((row) => row.status === "confirmed")
        .filter((row) => matchesLedgerViewerPeriod(row.date, listPeriodRange)),
    [allEntries, listPeriodRange],
  );

  const fixedExpenseFilterCounts = useMemo(() => {
    const expenseRows = periodScopedEntries.filter((row) => row.flow === "expense");
    return {
      fixed: expenseRows.filter((row) => Boolean(row.fixedExpenseId)).length,
      variable: expenseRows.filter((row) => !row.fixedExpenseId).length,
    };
  }, [periodScopedEntries]);

  const listAccountFilterOptions = useMemo(() => {
    const codes = new Set(periodScopedEntries.map((row) => row.accountCode).filter(Boolean));
    return accountCodes
      .filter((row) => row.isActive !== false && codes.has(row.code))
      .sort((a, b) => a.code.localeCompare(b.code, "ko"));
  }, [periodScopedEntries, accountCodes]);

  const listEntries = useMemo(() => {
    const q = listFilters.searchQuery.trim().toLowerCase();
    return periodScopedEntries
      .filter((row) => (listFilters.flowFilter === "all" ? true : row.flow === listFilters.flowFilter))
      .filter((row) => matchesLedgerFixedExpenseFilter(row, listFilters.fixedExpenseFilter))
      .filter((row) => (listFilters.accountFilter ? row.accountCode === listFilters.accountFilter : true))
      .filter((row) => {
        if (!q) return true;
        return [row.accountCode, row.accountName, row.description, row.memo]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [periodScopedEntries, listFilters]);

  const expenseTotal = periodScopedEntries.filter((r) => r.flow === "expense").reduce((s, r) => s + r.amount, 0);
  const incomeTotal = periodScopedEntries.filter((r) => r.flow === "income").reduce((s, r) => s + r.amount, 0);

  const listExpenseSplit = useMemo(() => {
    const expenseRows = listEntries.filter((row) => row.flow === "expense");
    const fixedRows = expenseRows.filter((row) => Boolean(row.fixedExpenseId));
    const variableRows = expenseRows.filter((row) => !row.fixedExpenseId);
    const { clientVendorRows, generalRows } = splitVariableLedgerExpenseRows(
      variableRows,
      clients,
      bankTransactions,
      workers,
      bankTransactionFolders,
    );
    return {
      fixedRows,
      clientVendorRows,
      generalRows,
      fixedTotal: fixedRows.reduce((sum, row) => sum + row.amount, 0),
      clientVendorTotal: clientVendorRows.reduce((sum, row) => sum + row.amount, 0),
      generalTotal: generalRows.reduce((sum, row) => sum + row.amount, 0),
    };
  }, [listEntries, clients, workers, bankTransactionFolders, bankTransactions]);

  const resetListFilters = useCallback(() => {
    setListFilters(DEFAULT_LEDGER_VIEWER_FILTERS);
    setFilterResetKey((prev) => prev + 1);
  }, []);

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
        draft: resolveBankTxFixedExpenseDraft(tx, fixedExpensePayments, fixedExpenses),
      });
    },
    [fixedExpensePayments, fixedExpenses],
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
    bankTransactionFolders,
    fixedExpenses,
    clients,
    workers,
    canLinkFixed,
    onEditFixedExpenseLink: openFixedExpenseLinkModal,
  };

  const tabItems: Array<{ key: LedgerViewerSubTab; label: string; icon: React.ReactNode }> = [
    { key: "list", label: L.list, icon: <List className="h-4 w-4" /> },
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
            <div className="flex flex-wrap gap-2">
              {onOpenAnalysis ? (
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 rounded-xl"
                  onClick={() => onOpenAnalysis("accountSummary")}
                >
                  <BarChart3 className="mr-2 h-4 w-4" />
                  {L.openAnalysis}
                </Button>
              ) : null}
              {onOpenBankTab ? (
                <Button type="button" variant="outline" className="shrink-0 rounded-xl" onClick={onOpenBankTab}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {L.goBank}
                  {pendingCount > 0 ? ` (${pendingCount}${L.caseSuffix})` : ""}
                </Button>
              ) : null}
            </div>
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
          accountCodes={accountCodes}
          ledgerCategories={ledgerCategories}
          setFixedExpenseCategories={setFixedExpenseCategories!}
          bankTransactions={bankTransactions}
          setBankTransactions={setBankTransactions!}
          setBankLedgerRules={setBankLedgerRules}
          currentUser={currentUser}
          onRequestImmediateSave={onRequestImmediateSave}
          onOpenBankTab={onOpenBankTab}
        />
      ) : null}

      {activeTab === "list" ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <LedgerViewerFilterBar
              applied={listFilters}
              onApply={setListFilters}
              onApplySearch={(searchQuery) => setListFilters((prev) => ({ ...prev, searchQuery }))}
              accountSubjects={listAccountFilterOptions}
              fixedCounts={fixedExpenseFilterCounts}
              filterResetKey={filterResetKey}
              onReset={resetListFilters}
            />
            {(listExpenseSplit.fixedRows.length > 0 ||
              listExpenseSplit.clientVendorRows.length > 0 ||
              listExpenseSplit.generalRows.length > 0) &&
            listFilters.flowFilter !== "income" &&
            listFilters.fixedExpenseFilter === "all" ? (
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {listExpenseSplit.fixedRows.length > 0 ? (
                  <StatCard
                    label={L.fixedExpenseSection}
                    value={L.fixedExpenseTotal(listExpenseSplit.fixedRows.length, listExpenseSplit.fixedTotal)}
                  />
                ) : null}
                {listExpenseSplit.clientVendorRows.length > 0 ? (
                  <StatCard
                    label={L.clientVendorExpenseSection}
                    value={L.clientVendorExpenseTotal(
                      listExpenseSplit.clientVendorRows.length,
                      listExpenseSplit.clientVendorTotal,
                    )}
                  />
                ) : null}
                {listExpenseSplit.generalRows.length > 0 ? (
                  <StatCard
                    label={L.variableExpenseSection}
                    value={L.variableExpenseTotal(listExpenseSplit.generalRows.length, listExpenseSplit.generalTotal)}
                  />
                ) : null}
              </div>
            ) : null}
            <EntryList rows={listEntries} flowFilter={listFilters.flowFilter} {...entryListLinkProps} />
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
  if (Number(bankTx.withdrawal || 0) <= 0) return false;
  if (isCeoDedicatedLedgerCategory(row.accountName)) return false;
  return true;
}

type EntryListLinkProps = {
  bankTransactions: BankTransaction[];
  bankTransactionFolders: BankTransactionFolder[];
  fixedExpenses: FixedExpense[];
  clients: ClientDepositMatchSource[];
  workers: WorkerDepositMatchSource[];
  canLinkFixed: boolean;
  onEditFixedExpenseLink: (tx: BankTransaction) => void;
};

function EntryList({
  rows,
  flowFilter = "all",
  bankTransactions,
  bankTransactionFolders,
  fixedExpenses,
  clients,
  workers,
  canLinkFixed,
  onEditFixedExpenseLink,
}: { rows: LedgerEntry[]; flowFilter?: LedgerFlow | "all" } & EntryListLinkProps) {
  const { fixedRows, clientVendorRows, generalRows, otherRows } = useMemo(() => {
    const fixed: LedgerEntry[] = [];
    const variable: LedgerEntry[] = [];
    const other: LedgerEntry[] = [];
    for (const row of rows) {
      if (row.flow === "expense") {
        if (row.fixedExpenseId) fixed.push(row);
        else variable.push(row);
      } else {
        other.push(row);
      }
    }
    const { clientVendorRows: clientRows, generalRows: general } = splitVariableLedgerExpenseRows(
      variable,
      clients,
      bankTransactions,
      workers,
      bankTransactionFolders,
    );
    return { fixedRows: fixed, clientVendorRows: clientRows, generalRows: general, otherRows: other };
  }, [rows, clients, workers, bankTransactionFolders, bankTransactions]);

  const showExpenseSplit =
    flowFilter !== "income" &&
    (fixedRows.length > 0 || clientVendorRows.length > 0 || generalRows.length > 0);
  const sections = showExpenseSplit
    ? [
        {
          key: "fixed",
          title: L.fixedExpenseSection,
          subtitle: L.fixedExpenseTotal(
            fixedRows.length,
            fixedRows.reduce((sum, row) => sum + row.amount, 0),
          ),
          rows: fixedRows,
          tone: "bg-amber-50/80",
        },
        {
          key: "client-vendor",
          title: L.clientVendorExpenseSection,
          subtitle: L.clientVendorExpenseTotal(
            clientVendorRows.length,
            clientVendorRows.reduce((sum, row) => sum + row.amount, 0),
          ),
          rows: clientVendorRows,
          tone: "bg-sky-50/60",
        },
        {
          key: "variable",
          title: L.variableExpenseSection,
          subtitle: L.variableExpenseTotal(
            generalRows.length,
            generalRows.reduce((sum, row) => sum + row.amount, 0),
          ),
          rows: generalRows,
          tone: "bg-white",
        },
        ...(flowFilter === "all" && otherRows.length
          ? [
              {
                key: "income",
                title: L.income,
                subtitle: `${otherRows.length}${L.caseSuffix} · ${formatKRW(otherRows.reduce((sum, row) => sum + row.amount, 0))}`,
                rows: otherRows,
                tone: "bg-emerald-50/40",
              },
            ]
          : []),
      ].filter((section) => section.rows.length > 0)
    : [{ key: "all", title: "", subtitle: "", rows, tone: "bg-white" }];

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
          {sections.map((section) => (
            <React.Fragment key={section.key}>
              {showExpenseSplit && section.title ? (
                <tr className={section.tone}>
                  <td colSpan={7} className="px-3 py-2 font-bold text-slate-800">
                    {section.title}
                    <span className="ml-2 font-semibold text-slate-600">{section.subtitle}</span>
                  </td>
                </tr>
              ) : null}
              {section.rows.map((row) => (
                <EntryListRow
                  key={row.id}
                  row={row}
                  bankTransactions={bankTransactions}
                  fixedExpenses={fixedExpenses}
                  canLinkFixed={canLinkFixed}
                  onEditFixedExpenseLink={onEditFixedExpenseLink}
                  isFixedExpense={Boolean(row.fixedExpenseId && row.flow === "expense")}
                />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </DesktopTableWrap>
  );
}

function EntryListRow({
  row,
  bankTransactions,
  fixedExpenses,
  canLinkFixed,
  onEditFixedExpenseLink,
  isFixedExpense,
}: {
  row: LedgerEntry;
  isFixedExpense: boolean;
} & EntryListLinkProps) {
  const bankTx = row.bankTransactionId
    ? bankTransactions.find((tx) => tx.id === row.bankTransactionId)
    : undefined;
  const fixedLabel = resolveEntryFixedExpenseLabel(row, fixedExpenses);
  const linkable = canLinkFixed && canLinkEntryToFixedExpense(row, bankTx);
  const offlineFixed = row.source === "offline" && Boolean(row.fixedExpenseId);

  return (
    <tr className={isFixedExpense ? "bg-amber-50/30" : undefined}>
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
          <FixedExpenseLinkCell value={offlineFixed ? fixedLabel : null} placeholder="-" disabled />
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
}
