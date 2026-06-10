import React, { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { formatBankTransactionDateTime, type BankTransaction } from "@/utils/bankTransactions";
import { formatKRW } from "@/utils/companyLedger";
import {
  filterLedgerInboxTransactions,
  groupLedgerInboxTransactions,
  readLastLedgerCategoryId,
  storeLastLedgerCategoryId,
} from "@/utils/ledgerInboxUtils";
import {
  confirmBankTransactionLedger,
  exemptBankTransactionLedger,
  findAccountCode,
  findLedgerCategory,
  resolveBankTxLedgerAmount,
  resolveBankTxLedgerFlow,
  type AccountCode,
  type LedgerCategory,
} from "@/utils/ledgerSystem";

const L = {
  allMonths: "\uC804\uCCB4 \uAE30\uAC04",
  thisMonth: "\uC774\uBC88 \uB2EC\uB9CC",
  withdrawalOnly: "\uCD9C\uAE08\uB9CC",
  depositOnly: "\uC785\uAE08\uB9CC",
  allFlow: "\uC804\uCCB4",
  quickPick: "\uBE14\uB9AC \uBD84\uB958",
  applyGroup: "\uADF8\uB8F9 \uC804\uCCB4",
  apply: "\uC801\uC6A9",
  searchPlaceholder: "\uC801\uC694, \uC0C1\uB300\uBC29 \uAC80\uC0C9",
  empty: "\uBBF8\uBD84\uB958 \uD1B5\uC7A5 \uAC70\uB798\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  groupCount: (n: number) => `${n}\uAC74`,
  total: "\uD569\uACC4",
  datetime: "\uC77C\uC2DC",
  flow: "\uAD6C\uBD84",
  description: "\uC801\uC694",
  amount: "\uAE08\uC561",
  category: "\uCE74\uD14C\uACE0\uB9AC",
  expense: "\uCD9C\uAE08",
  income: "\uC785\uAE08",
};

type LedgerInboxPanelProps = {
  bankTransactions: BankTransaction[];
  setBankTransactions: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
  monthKey: string;
  currentUserName?: string;
};

export function LedgerInboxPanel({
  bankTransactions,
  setBankTransactions,
  ledgerCategories,
  accountCodes,
  monthKey,
  currentUserName,
}: LedgerInboxPanelProps) {
  const [search, setSearch] = useState("");
  const [allMonths, setAllMonths] = useState(true);
  const [flowFilter, setFlowFilter] = useState<"all" | "expense" | "income">("all");
  const [activeCategoryId, setActiveCategoryId] = useState(() => readLastLedgerCategoryId());
  const [rowCategoryDraft, setRowCategoryDraft] = useState<Record<string, string>>({});
  const [groupCategoryDraft, setGroupCategoryDraft] = useState<Record<string, string>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const activeCategories = useMemo(
    () => ledgerCategories.filter((row) => row.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [ledgerCategories],
  );

  const expenseCategories = useMemo(
    () => activeCategories.filter((row) => row.kind === "expense" || row.kind === "fixed" || row.kind === "ceo_advance"),
    [activeCategories],
  );

  const incomeCategories = useMemo(
    () => activeCategories.filter((row) => row.kind === "income" || row.kind === "ceo_receivable"),
    [activeCategories],
  );

  const quickCategories = expenseCategories.slice(0, 10);

  const inboxRows = useMemo(
    () =>
      filterLedgerInboxTransactions(bankTransactions, {
        monthKey,
        allMonths,
        flow: flowFilter,
        search,
      }),
    [bankTransactions, monthKey, allMonths, flowFilter, search],
  );

  const groups = useMemo(() => groupLedgerInboxTransactions(inboxRows), [inboxRows]);

  const categoriesForTx = (tx: BankTransaction) => {
    const flow = resolveBankTxLedgerFlow(tx);
    return flow === "income" ? incomeCategories : expenseCategories;
  };

  const resolveRowCategoryId = (tx: BankTransaction) =>
    rowCategoryDraft[tx.id] || tx.ledgerCategoryId || activeCategoryId || categoriesForTx(tx)[0]?.id || "";

  const resolveGroupCategoryId = (groupKey: string, sample: BankTransaction) =>
    groupCategoryDraft[groupKey] || activeCategoryId || categoriesForTx(sample)[0]?.id || "";

  const applyCategory = (tx: BankTransaction, categoryId: string) => {
    const category = findLedgerCategory(ledgerCategories, categoryId);
    if (!category) return;
    storeLastLedgerCategoryId(category.id);
    setActiveCategoryId(category.id);
    setBankTransactions((prev) =>
      prev.map((row) =>
        row.id === tx.id
          ? confirmBankTransactionLedger({ tx: row, category, accountCodes, confirmedBy: currentUserName })
          : row,
      ),
    );
  };

  const applyGroup = (groupKey: string, transactions: BankTransaction[]) => {
    const categoryId = resolveGroupCategoryId(groupKey, transactions[0]!);
    const category = findLedgerCategory(ledgerCategories, categoryId);
    if (!category) return;
    storeLastLedgerCategoryId(category.id);
    setActiveCategoryId(category.id);
    const ids = new Set(transactions.map((row) => row.id));
    setBankTransactions((prev) =>
      prev.map((row) =>
        ids.has(row.id)
          ? confirmBankTransactionLedger({ tx: row, category, accountCodes, confirmedBy: currentUserName })
          : row,
      ),
    );
  };

  const exemptTx = (txId: string) => {
    setBankTransactions((prev) => prev.map((row) => (row.id === txId ? exemptBankTransactionLedger(row) : row)));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={L.searchPlaceholder}
          className="erp-input min-w-[12rem] flex-1 rounded-xl border border-slate-200 px-3 py-2"
        />
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          <FilterChip active={allMonths} onClick={() => setAllMonths(true)} label={L.allMonths} />
          <FilterChip active={!allMonths} onClick={() => setAllMonths(false)} label={L.thisMonth} />
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          <FilterChip active={flowFilter === "all"} onClick={() => setFlowFilter("all")} label={L.allFlow} />
          <FilterChip active={flowFilter === "expense"} onClick={() => setFlowFilter("expense")} label={L.withdrawalOnly} />
          <FilterChip active={flowFilter === "income"} onClick={() => setFlowFilter("income")} label={L.depositOnly} />
        </div>
      </div>

      <div>
        <div className="erp-text-caption mb-2 text-slate-500">{L.quickPick}</div>
        <div className="flex flex-wrap gap-2">
          {quickCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setActiveCategoryId(cat.id);
                storeLastLedgerCategoryId(cat.id);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                activeCategoryId === cat.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {cat.name}
              <span className="ml-1 font-mono text-xs opacity-70">{cat.accountCode}</span>
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center erp-text-body text-slate-500">
          {L.empty}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const collapsed = collapsedGroups[group.key];
            const groupCategoryId = resolveGroupCategoryId(group.key, group.transactions[0]!);
            return (
              <div key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                    className="inline-flex items-center gap-1 font-bold text-slate-900"
                  >
                    {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {group.label}
                    <span className="ml-1 erp-text-caption font-normal text-slate-500">
                      {L.groupCount(group.transactions.length)}{" \u00B7 "}{L.total} {formatKRW(group.totalAmount)}
                    </span>
                  </button>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <select
                      value={groupCategoryId}
                      onChange={(e) => setGroupCategoryDraft((prev) => ({ ...prev, [group.key]: e.target.value }))}
                      className="erp-input max-w-[12rem] rounded-lg border border-slate-200 px-2 py-1 text-sm"
                    >
                      {categoriesForTx(group.transactions[0]!).map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                    <Button type="button" size="sm" onClick={() => applyGroup(group.key, group.transactions)}>
                      {L.applyGroup}
                    </Button>
                  </div>
                </div>
                {!collapsed ? (
                  <DesktopTableWrap>
                    <table className="erp-table w-full">
                      <thead>
                        <tr>
                          <th>{L.datetime}</th>
                          <th>{L.flow}</th>
                          <th>{L.description}</th>
                          <th className="text-right">{L.amount}</th>
                          <th>{L.category}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {group.transactions.map((tx) => {
                          const flow = resolveBankTxLedgerFlow(tx);
                          const amount = resolveBankTxLedgerAmount(tx);
                          const categoryId = resolveRowCategoryId(tx);
                          return (
                            <tr key={tx.id}>
                              <td className="whitespace-nowrap">{formatBankTransactionDateTime(tx.transactionAt)}</td>
                              <td>{flow === "income" ? L.income : L.expense}</td>
                              <td>{tx.description || "-"}</td>
                              <td className="text-right font-bold">{formatKRW(amount)}</td>
                              <td>
                                <select
                                  value={categoryId}
                                  onChange={(e) =>
                                    setRowCategoryDraft((prev) => ({ ...prev, [tx.id]: e.target.value }))
                                  }
                                  className="erp-input w-full min-w-[8rem] rounded-lg border border-slate-200 px-2 py-1 text-sm"
                                >
                                  {categoriesForTx(tx).map((row) => (
                                    <option key={row.id} value={row.id}>
                                      {row.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="whitespace-nowrap text-right">
                                <Button type="button" size="sm" className="mr-1" onClick={() => applyCategory(tx, categoryId)}>
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                  {L.apply}
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => exemptTx(tx.id)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </DesktopTableWrap>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
        active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
      }`}
    >
      {label}
    </button>
  );
}
