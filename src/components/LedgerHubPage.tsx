import React, { useMemo, useState } from "react";
import { BookOpen, Inbox, Layers, Settings2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { LedgerInboxPanel } from "@/components/LedgerInboxPanel";
import { filterLedgerInboxTransactions } from "@/utils/ledgerInboxUtils";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { ErpUser } from "@/utils/erpApi";
import {
  fixedCycleLabel,
  formatFixedExpensePaymentDay,
  formatKRW,
  getMonthKey,
  shiftMonthKey,
  todayISO,
  type CompanyExpense,
  type FixedExpense,
} from "@/utils/companyLedger";
import {
  buildAccountCodeSummary,
  buildAllLedgerEntries,
  buildLedgerGapSummary,
  exemptBankTransactionLedger,
  findAccountCode,
  formatLedgerGapLine,
  makeLedgerCategoryId,
  resetBankTransactionLedger,
  resolveBankTxLedgerStatus,
  type AccountCode,
  type LedgerCategory,
  type LedgerCategoryKind,
} from "@/utils/ledgerSystem";
import { syncLegacyExpenseCategoriesFromLedgerCategories } from "@/utils/ledgerMigration";
import type { AnalysisHubTab } from "@/utils/analysisHub";

function HubInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`erp-input rounded-xl border border-slate-200 px-3 py-2 ${props.className || ""}`} />;
}

type HubTab = "inbox" | "entries" | "accounts" | "fixed";

const L = {
  inbox: "\uC791\uC5C5\uD568",
  entries: "\uD655\uC815 \uB0B4\uC5ED",
  monthly: "\uC6D4\uBCC4",
  accounts: "\uACC4\uC815\u00B7\uCE74\uD14C\uACE0\uB9AC",
  fixed: "\uACE0\uC815\uBE44",
  pageTitle: "\uD68C\uC0AC \uAC00\uACC4\uBD80",
  pageDesc: "\uC0C1\uB300\uBC29\uBCC4\uB85C \uBBF8\uBD84\uB958 \uD1B5\uC7A5\uC744 \uBE14\uB9AC \uBD84\uB958 \uB610\uB294 \uADF8\uB8F9 \uC77C\uAD04 \uCC98\uB9AC\uD558\uC138\uC694.",
  prevMonth: "\uC774\uC804 \uB2EC",
  nextMonth: "\uB2E4\uC74C \uB2EC",
  year: "\uB144",
  month: "\uC6D4",
  confirmedExpense: "\uD655\uC815 \uC9C0\uCD9C",
  confirmedIncome: "\uD655\uC815 \uC785\uAE08",
  unclassifiedWithdrawal: "\uBBF8\uBD84\uB958 \uCD9C\uAE08",
  inboxCount: "\uC791\uC5C5\uD568",
  inboxHint: "\uC804\uCCB4 \uBBF8\uBD84\uB958",
  searchPlaceholder: "\uC801\uC694, \uC0C1\uB300\uBC29, \uCE74\uD14C\uACE0\uB9AC \uAC80\uC0C9",
  bankTx: "\uD1B5\uC7A5 \uAC70\uB798",
  expense: "\uC9C0\uCD9C",
  income: "\uC785\uAE08",
  amount: "\uAE08\uC561",
  counterparty: "\uC0C1\uB300\uBC29",
  classify: "\uBD84\uB958",
  exempt: "\uC81C\uC678",
  emptyInbox: "\uC774\uBC88 \uB2EC \uBBF8\uBD84\uB958 \uD1B5\uC7A5 \uAC70\uB798\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  datetime: "\uC77C\uC2DC",
  flow: "\uAD6C\uBD84",
  description: "\uC801\uC694",
  date: "\uC77C\uC790",
  category: "\uCE74\uD14C\uACE0\uB9AC",
  account: "\uACC4\uC815",
  cancel: "\uCDE8\uC18C",
  offline: "\uC624\uD504\uB77C\uC778",
  emptyEntries: "\uD655\uC815\uB41C \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  net: "\uC21C\uC561",
  count: "\uAC74\uC218",
  categoryToCode: "\uCE74\uD14C\uACE0\uB9AC \u2192 \uACC4\uC815\uCF54\uB4DC",
  categoryName: "\uCE74\uD14C\uACE0\uB9AC \uC774\uB984",
  code: "\uCF54\uB4DC",
  add: "\uCD94\uAC00",
  kind: "\uAD6C\uBD84",
  accountName: "\uACC4\uC815\uBA85",
  accountSummary: "\uACC4\uC815\uACFC\uBAA9\uBCC4 \uC9D1\uACC4",
  accountMaster: "\uACC4\uC815\uACFC\uBAA9 \uB9C8\uC2A4\uD130",
  type: "\uC720\uD615",
  fixedDesc:
    "\uACE0\uC815\uBE44 \uD56D\uBAA9\uACFC \uC774\uBC88 \uB2EC \uD1B5\uC7A5 \uB9E4\uCE6D \uD604\uD669\uC785\uB2C8\uB2E4. \uC791\uC5C5\uD568\uC5D0\uC11C \uBD84\uB958 \uC2DC \uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC5F0\uACB0\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  item: "\uD56D\uBAA9",
  paymentDay: "\uB0A9\uBD80\uC77C",
  cycle: "\uC8FC\uAE30",
  matched: "\uC5F0\uACB0\uB428",
  unmatched: "\uBBF8\uC5F0\uACB0",
  thisMonthMatch: "\uC774\uBC88 \uB2EC \uB9E4\uCE6D",
  classifyTitle: "\uD1B5\uC7A5 \uBD84\uB958",
  fixedItemOptional: "\uACE0\uC815\uBE44 \uD56D\uBAA9 (\uC120\uD0DD)",
  none: "\uC5C6\uC74C",
  memo: "\uBA54\uBAA8",
  confirm: "\uD655\uC815",
  caseSuffix: "\uAC74",
  openAnalysis: "\uBD84\uC11D\uC5D0\uC11C \uBCF4\uAE30",
};

const TAB_ITEMS: Array<{ key: HubTab; label: string; icon: React.ReactNode }> = [
  { key: "inbox", label: L.inbox, icon: <Inbox className="h-4 w-4" /> },
  { key: "entries", label: L.entries, icon: <BookOpen className="h-4 w-4" /> },
  { key: "accounts", label: L.accounts, icon: <Settings2 className="h-4 w-4" /> },
  { key: "fixed", label: L.fixed, icon: <Layers className="h-4 w-4" /> },
];

const KIND_LABELS: Record<LedgerCategoryKind, string> = {
  expense: L.expense,
  income: L.income,
  fixed: L.fixed,
  ceo_advance: "\uAC00\uC9C0\uAE09",
  ceo_receivable: "\uAC00\uC218\uAE08",
};

type LedgerHubPageProps = {
  bankTransactions: BankTransaction[];
  setBankTransactions: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  companyExpenses: CompanyExpense[];
  fixedExpenses: FixedExpense[];
  accountCodes: AccountCode[];
  setAccountCodes: React.Dispatch<React.SetStateAction<AccountCode[]>>;
  ledgerCategories: LedgerCategory[];
  setLedgerCategories: React.Dispatch<React.SetStateAction<LedgerCategory[]>>;
  setExpenseCategories?: React.Dispatch<React.SetStateAction<string[]>>;
  setFixedExpenseCategories?: React.Dispatch<React.SetStateAction<string[]>>;
  currentUser?: ErpUser | null;
  onOpenAnalysis?: (tab?: AnalysisHubTab) => void;
};


function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="erp-text-caption text-slate-500">{label}</div>
      <div className="erp-text-section-title mt-1 text-slate-950">{value}</div>
      {hint ? <div className="erp-text-caption mt-1 text-slate-400">{hint}</div> : null}
    </div>
  );
}

export function LedgerHubPage({
  bankTransactions,
  setBankTransactions,
  companyExpenses,
  fixedExpenses,
  accountCodes,
  ledgerCategories,
  setLedgerCategories,
  setExpenseCategories,
  setFixedExpenseCategories,
  currentUser,
  onOpenAnalysis,
}: LedgerHubPageProps) {
  const [activeTab, setActiveTab] = useState<HubTab>("inbox");
  const [monthKey, setMonthKey] = useState(getMonthKey(todayISO()));
  const [search, setSearch] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryCode, setNewCategoryCode] = useState("900");
  const [newCategoryKind, setNewCategoryKind] = useState<LedgerCategoryKind>("expense");

  const entries = useMemo(
    () =>
      buildAllLedgerEntries({
        bankTransactions,
        companyExpenses,
        categories: ledgerCategories,
        accountCodes,
      }),
    [bankTransactions, companyExpenses, ledgerCategories, accountCodes],
  );

  const gap = useMemo(
    () => buildLedgerGapSummary(bankTransactions, entries, monthKey),
    [bankTransactions, entries, monthKey],
  );

  const allInboxCount = useMemo(
    () => filterLedgerInboxTransactions(bankTransactions, { allMonths: true, monthKey }).length,
    [bankTransactions, monthKey],
  );

  const confirmedEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((row) => row.status === "confirmed")
      .filter((row) => getMonthKey(row.date) === monthKey)
      .filter((row) => {
        if (!q) return true;
        return [row.categoryName, row.accountCode, row.accountName, row.description, row.memo]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [entries, monthKey, search]);

  const accountRows = useMemo(
    () => buildAccountCodeSummary(entries.filter((row) => getMonthKey(row.date) === monthKey), accountCodes),
    [entries, monthKey, accountCodes],
  );

  const activeCategories = useMemo(
    () => ledgerCategories.filter((row) => row.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [ledgerCategories],
  );

  const updateTx = (txId: string, updater: (tx: BankTransaction) => BankTransaction) => {
    setBankTransactions((prev) => prev.map((row) => (row.id === txId ? updater(row) : row)));
  };

  const addCategory = () => {
    const name = newCategoryName.trim();
    const accountCode = newCategoryCode.trim();
    if (!name || !accountCode) return;
    const next = [
      ...ledgerCategories,
      {
        id: makeLedgerCategoryId(),
        name,
        accountCode,
        kind: newCategoryKind,
        sortOrder: ledgerCategories.length,
        isActive: true,
      },
    ];
    setLedgerCategories(next);
    syncLegacyCategories(next);
    setNewCategoryName("");
  };

  const syncLegacyCategories = (next: LedgerCategory[]) => {
    const synced = syncLegacyExpenseCategoriesFromLedgerCategories(next);
    setExpenseCategories?.(synced.expenseCategories);
    setFixedExpenseCategories?.(synced.fixedExpenseCategories);
  };

  const updateCategoryAccountCode = (id: string, accountCode: string) => {
    setLedgerCategories((prev) => prev.map((row) => (row.id === id ? { ...row, accountCode } : row)));
  };

  return (
    <div className="erp-ledger-hub-page space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="erp-text-page-title text-slate-900">{L.pageTitle}</h2>
              <p className="mt-1 erp-text-body text-slate-600">{L.pageDesc}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onOpenAnalysis ? (
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenAnalysis("accountSummary")}>
                  {L.openAnalysis}
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))}>
                {L.prevMonth}
              </Button>
              <span className="erp-text-body min-w-[7rem] text-center font-bold text-slate-800">
                {monthKey.slice(0, 4)}
                {L.year} {Number(monthKey.slice(5))}
                {L.month}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))}>
                {L.nextMonth}
              </Button>
            </div>
          </div>

          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 erp-text-body text-amber-900">
            {formatLedgerGapLine(gap)}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label={L.confirmedExpense} value={formatKRW(gap.confirmedExpenseTotal)} />
            <SummaryCard label={L.confirmedIncome} value={formatKRW(gap.confirmedIncomeTotal)} />
            <SummaryCard label={L.unclassifiedWithdrawal} value={formatKRW(gap.unclassifiedWithdrawal)} />
            <SummaryCard
              label={L.inboxCount}
              value={`${allInboxCount}${L.caseSuffix}`}
              hint={L.inboxHint}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
            {TAB_ITEMS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`erp-text-body inline-flex items-center gap-2 rounded-xl px-4 py-2 font-bold ${
                  activeTab === tab.key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {(activeTab === "entries") && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <HubInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={L.searchPlaceholder}
              className="max-w-md"
            />
          </CardContent>
        </Card>
      )}

      {activeTab === "inbox" ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4 md:p-5">
            <LedgerInboxPanel
              bankTransactions={bankTransactions}
              setBankTransactions={setBankTransactions}
              ledgerCategories={ledgerCategories}
              accountCodes={accountCodes}
              monthKey={monthKey}
              currentUserName={currentUser?.name}
            />
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "entries" ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-0 md:p-2">
            <DesktopTableWrap>
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <th>{L.date}</th>
                    <th>{L.flow}</th>
                    <th>{L.category}</th>
                    <th>{L.account}</th>
                    <th>{L.description}</th>
                    <th className="text-right">{L.amount}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {confirmedEntries.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date}</td>
                      <td>{row.flow === "income" ? L.income : L.expense}</td>
                      <td>{row.categoryName}</td>
                      <td>
                        <span className="font-mono text-xs text-slate-500">{row.accountCode}</span> {row.accountName}
                      </td>
                      <td>{row.description}</td>
                      <td className="text-right font-bold">{formatKRW(row.amount)}</td>
                      <td className="text-right">
                        {row.bankTransactionId ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => updateTx(row.bankTransactionId!, resetBankTransactionLedger)}
                          >
                            {L.cancel}
                          </Button>
                        ) : (
                          <span className="erp-text-caption text-slate-400">{L.offline}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DesktopTableWrap>
            {confirmedEntries.length === 0 ? (
              <div className="p-8 text-center erp-text-body text-slate-500">{L.emptyEntries}</div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "accounts" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <h3 className="erp-text-section-title mb-3 text-slate-900">{L.categoryToCode}</h3>
              <div className="mb-4 flex flex-wrap gap-2">
                <HubInput
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder={L.categoryName}
                  className="max-w-[10rem]"
                />
                <HubInput
                  value={newCategoryCode}
                  onChange={(e) => setNewCategoryCode(e.target.value)}
                  placeholder={L.code}
                  className="max-w-[5rem] font-mono"
                />
                <select
                  value={newCategoryKind}
                  onChange={(e) => setNewCategoryKind(e.target.value as LedgerCategoryKind)}
                  className="erp-input rounded-xl border border-slate-200 px-3 py-2"
                >
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <Button type="button" onClick={addCategory}>
                  {L.add}
                </Button>
              </div>
              <DesktopTableWrap>
                <table className="erp-table w-full">
                  <thead>
                    <tr>
                      <th>{L.category}</th>
                      <th>{L.kind}</th>
                      <th>{L.code}</th>
                      <th>{L.accountName}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCategories.map((row) => {
                      const account = findAccountCode(accountCodes, row.accountCode);
                      return (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td>{KIND_LABELS[row.kind]}</td>
                          <td>
                            <HubInput
                              value={row.accountCode}
                              onChange={(e) => updateCategoryAccountCode(row.id, e.target.value)}
                              className="max-w-[5rem] font-mono"
                            />
                          </td>
                          <td>{account?.name || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DesktopTableWrap>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <h3 className="erp-text-section-title mb-3 text-slate-900">
                {L.accountSummary} ({monthKey})
              </h3>
              <DesktopTableWrap>
                <table className="erp-table w-full">
                  <thead>
                    <tr>
                      <th>{L.code}</th>
                      <th>{L.account}</th>
                      <th className="text-right">{L.expense}</th>
                      <th className="text-right">{L.income}</th>
                      <th className="text-right">{L.count}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountRows.map((row) => (
                      <tr key={row.accountCode}>
                        <td className="font-mono text-sm">{row.accountCode}</td>
                        <td>{row.accountName}</td>
                        <td className="text-right">{formatKRW(row.expenseTotal)}</td>
                        <td className="text-right">{formatKRW(row.incomeTotal)}</td>
                        <td className="text-right">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DesktopTableWrap>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm xl:col-span-2">
            <CardContent className="p-4">
              <h3 className="erp-text-section-title mb-3 text-slate-900">{L.accountMaster}</h3>
              <DesktopTableWrap>
                <table className="erp-table w-full">
                  <thead>
                    <tr>
                      <th>{L.code}</th>
                      <th>{L.accountName}</th>
                      <th>{L.type}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountCodes
                      .filter((row) => row.isActive)
                      .map((row) => (
                        <tr key={row.code}>
                          <td className="font-mono">{row.code}</td>
                          <td>{row.name}</td>
                          <td>{row.type}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </DesktopTableWrap>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === "fixed" ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <p className="erp-text-body mb-4 text-slate-600">{L.fixedDesc}</p>
            <DesktopTableWrap>
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <th>{L.item}</th>
                    <th>{L.category}</th>
                    <th>{L.paymentDay}</th>
                    <th>{L.cycle}</th>
                    <th className="text-right">{L.amount}</th>
                    <th>{L.thisMonthMatch}</th>
                  </tr>
                </thead>
                <tbody>
                  {fixedExpenses
                    .filter((row) => row.isActive)
                    .map((row) => {
                      const matched = bankTransactions.some(
                        (tx) =>
                          tx.ledgerFixedExpenseId === row.id &&
                          resolveBankTxLedgerStatus(tx) === "confirmed" &&
                          getMonthKey(String(tx.transactionAt || "").slice(0, 10)) === monthKey,
                      );
                      return (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td>{row.category}</td>
                          <td>{formatFixedExpensePaymentDay(row.paymentDayOfMonth)}</td>
                          <td>{fixedCycleLabel(row.cycle)}</td>
                          <td className="text-right">{formatKRW(row.amount)}</td>
                          <td>
                            {matched ? (
                              <span className="font-bold text-emerald-600">{L.matched}</span>
                            ) : (
                              L.unmatched
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </DesktopTableWrap>
          </CardContent>
        </Card>
      ) : null}

    </div>
  );
}
