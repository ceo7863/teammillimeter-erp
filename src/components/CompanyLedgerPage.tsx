import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { TableExportToolbar } from "@/components/TableExportSection";
import { DesktopTableWrap, MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import {
  buildMonthlyLedgerDetail,
  buildMonthlyLedgerRows,
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_KIND_OPTIONS,
  filterCompanyExpenses,
  filterFixedExpensePayments,
  formatKRW,
  formatMonthLabel,
  ledgerDateFilter,
  ledgerPeriodLabel,
  makeLedgerId,
  mergeExpenseCategory,
  parseLedgerAmount,
  resolveCompanyExpenseKind,
  shiftMonthKey,
  sumExpensesForMonthByKind,
  todayISO,
  validateCompanyExpenseInput,
  type CompanyExpense,
  type CompanyExpenseKind,
  type FixedExpense,
  type FixedExpensePayment,
  type LedgerPeriodKey,
} from "@/utils/companyLedger";
import type { ErpUser } from "@/utils/erpApi";
import { AutocompleteInput } from "@/components/AutocompleteInput";

type LedgerTab = "manual" | "monthly";

const TAB_ITEMS: Array<{ key: LedgerTab; label: string }> = [
  { key: "manual", label: "\uC9C0\uCD9C \uB4F1\uB85D" },
  { key: "monthly", label: "\uC6D4\uBCC4 \uAC00\uACC4\uBD80" },
];

const PERIOD_OPTIONS: Array<{ key: LedgerPeriodKey; label: string }> = [
  { key: "today", label: "\uC624\uB298" },
  { key: "thisMonth", label: "\uC774\uBC88 \uB2EC" },
  { key: "lastMonth", label: "\uC9C0\uB09C \uB2EC" },
  { key: "all", label: "\uC804\uCCB4" },
];

const L = {
  pageTitle: "\uD68C\uC0AC \uAC00\uACC4\uBD80",
  pageDesc: "\uC218\uC785 \uC678 \uD68C\uC0AC \uC9C0\uCD9C\uACFC \uACE0\uC815\uBE44\uB97C \uD55C \uACF3\uC5D0\uC11C \uB4F1\uB85D\uD558\uACE0 \uC870\uD68C\uD569\uB2C8\uB4F1.",
  addManual: "\uC9C0\uCD9C \uCD94\uAC00",
  addFixed: "\uACE0\uC815\uBE44 \uCD94\uAC00",
  editManual: "\uC9C0\uCD9C \uC218\uC815",
  editFixed: "\uACE0\uC815\uBE44 \uC218\uC815",
  thisMonthManual: "\uC774\uBC88 \uB2EC \uC9C0\uCD9C",
  fixedMonthlyTotal: "\uACE0\uC815\uBE44 \uD569\uACC4",
  grandTotal: "\uCD1D \uD569\uACC4",
  fixedMonthlyHint: "\uC6D4 \uD658\uC0B0 \uAE30\uC900",
  thisMonthGrandHint: "\uC774\uBC88 \uB2EC \uCD1D \uC608\uC0C1",
  emptyManual: "\uD45C\uC2DC\uD560 \uC9C0\uCD9C \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyFixed: "\uB4F1\uB85D\uB41C \uACE0\uC815\uBE44\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyMonth: "\uD574\uB2F9 \uC6D4 \uC9C0\uCD9C \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  deleteConfirm: "\uC774 \uD56D\uBAA9\uC744 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?",
  save: "\uC800\uC7A5",
  cancel: "\uCDE8\uC18C",
  edit: "\uC218\uC815",
  delete: "\uC0AD\uC81C",
  searchManual: "\uB0B4\uC6A9, \uCE74\uD14C\uACE0\uB9AC, \uBA54\uBAA8 \uAC80\uC0C9",
  searchFixed: "\uD56D\uBAA9\uBA85, \uCE74\uD14C\uACE0\uB9AC, \uBA54\uBAA8 \uAC80\uC0C9",
  date: "\uC9C0\uCD9C\uC77C",
  category: "\uCE74\uD14C\uACE0\uB9AC",
  description: "\uB0B4\uC6A9",
  amount: "\uAE08\uC561",
  memo: "\uBA54\uBAA8",
  actions: "\uC791\uC5C5",
  total: "\uD569\uACC4",
  item: "\uD56D\uBAA9",
  cycle: "\uC8FC\uAE30",
  monthlyEquiv: "\uC6D4 \uD658\uC0B0",
  startDate: "\uC801\uC6A9 \uC2DC\uC791",
  status: "\uC0C1\uD0DC",
  activeFixedTotal: "\uD65C\uC131 \uACE0\uC815\uBE44 \uC6D4 \uD569\uACC4",
  thisMonthBtn: "\uC774\uBC88 \uB2EC",
  variableExpense: "\uBCC0\uB3D9 \uC9C0\uCD9C",
  fixedExpense: "\uACE0\uC815\uBE44",
  fixedPayment: "\uACE0\uC815\uBE44 \uB0A9\uBD80",
  monthTotal: "\uC6D4 \uCD1D\uD569",
  monthSummary: "\uC6D4\uBCC4 \uC694\uC57D",
  month: "\uC6D4",
  monthDetail: "\uC0C1\uC138",
  section: "\uAD6C\uBD84",
  dateOrItem: "\uC77C\uC790/\uD56D\uBAA9",
  view: "\uBCF4\uAE30",
  expenseDate: "\uC9C0\uCD9C \uC77C\uC790",
  itemName: "\uD56D\uBAA9 \uC774\uB984",
  amountWon: "\uAE08\uC561 (\uC6D0)",
  memoOptional: "\uBA54\uBAA8 (\uC120\uD0DD)",
  applyStartDate: "\uC801\uC6A9 \uC2DC\uC791\uC77C",
  activeStatus: "\uD65C\uC131 \uC0C1\uD0DC",
  activate: "\uD65C\uC131\uD654",
  deactivate: "\uBE44\uD65C\uC131\uD654",
  active: "\uC801\uC6A9\uC911",
  inactive: "\uBE44\uD65C\uC131",
  won: "\uC6D0",
  count: "\uAC74",
  separator: "\u00B7",
  bankSourceBadge: "\uD1B5\uC7A5\uC5F0\uB3D9",
  bankSourceTitle: "\uD1B5\uC7A5\uAC70\uB798\uB0B4\uC5ED\uC5D0\uC11C \uB4F1\uB85D\uB428",
  bankSourceLegend: "\uD1B5\uC7A5\uAC70\uB798\uB0B4\uC5ED\uC5D0\uC11C \uB4F1\uB85D\uB41C \uC9C0\uCD9C\uC785\uB2C8\uB2E4.",
  deleteBankLinkedConfirm:
    "\uD1B5\uC7A5 \uC5F0\uB3D9 \uC9C0\uCD9C\uC785\uB2C8\uB2E4. \uC0AD\uC81C\uD558\uBA74 \uAC00\uACC4\uBD80\uC5D0\uC11C \uC81C\uAC70\uB418\uACE0 \uD1B5\uC7A5 \uAC70\uB798 \uC5F0\uB3D9\uB3C4 \uD574\uC81C\uB429\uB2C8\uB2E4. \uC0AD\uC81C\uD560\uAE4C\uC694?",
};

type CompanyLedgerPageProps = {
  companyExpenses: CompanyExpense[];
  setCompanyExpenses: React.Dispatch<React.SetStateAction<CompanyExpense[]>>;
  expenseCategories: string[];
  setExpenseCategories: React.Dispatch<React.SetStateAction<string[]>>;
  fixedExpenses: FixedExpense[];
  setFixedExpenses: React.Dispatch<React.SetStateAction<FixedExpense[]>>;
  fixedExpensePayments?: FixedExpensePayment[];
  setFixedExpensePayments?: React.Dispatch<React.SetStateAction<FixedExpensePayment[]>>;
  bankTransactions?: Array<{ id: string; linkedCompanyExpenseId?: string; linkedFixedExpensePaymentId?: string }>;
  setBankTransactions?: React.Dispatch<
    React.SetStateAction<Array<{ id: string; linkedCompanyExpenseId?: string; linkedFixedExpensePaymentId?: string }>>
  >;
  currentUser?: ErpUser | null;
};

type ManualModalState = {
  mode: "create" | "edit";
  source?: "expense" | "fixedPayment";
  id?: string;
  kind: CompanyExpenseKind;
  date: string;
  category: string;
  description: string;
  amount: string;
  memo: string;
};

type ManualLedgerRow =
  | { type: "expense"; row: CompanyExpense }
  | { type: "fixedPayment"; row: FixedExpensePayment };

function isVariableLedgerRow(item: ManualLedgerRow) {
  return item.type === "expense" && resolveCompanyExpenseKind(item.row) === "variable";
}

function isFixedLedgerRow(item: ManualLedgerRow) {
  if (item.type === "fixedPayment") return true;
  return item.type === "expense" && resolveCompanyExpenseKind(item.row) === "fixed";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input
      {...props}
      lang={props.lang ?? "ko"}
      className={`erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-900 md:px-4 md:py-3 ${className}`}
    />
  );
}

function SummaryCard({
  label,
  value,
  tone = "text-slate-900",
  sub,
}: {
  label: string;
  value: string;
  tone?: string;
  sub?: string;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="p-4 md:p-5">
        <div className="erp-text-caption font-bold text-slate-500">{label}</div>
        <div className={`erp-text-stat mt-1 font-black ${tone}`}>{value}</div>
        {sub ? <div className="erp-text-caption mt-1 text-slate-400">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function CategoryBadge({ label }: { label: string }) {
  return <span className="erp-ledger-category-badge">{label || "-"}</span>;
}

function ExpenseKindBadge({ kind }: { kind: CompanyExpenseKind }) {
  return (
    <span className={`erp-ledger-kind-badge kind-${kind}`}>
      {EXPENSE_KIND_OPTIONS.find((row) => row.value === kind)?.label || kind}
    </span>
  );
}

function isBankLinkedExpense(row: CompanyExpense): boolean {
  return Boolean(row.bankTransactionId?.trim());
}

function BankSourceBadge() {
  return (
    <span className="erp-ledger-bank-source-badge" title={L.bankSourceTitle}>
      {L.bankSourceBadge}
    </span>
  );
}

function bankLinkedRowClass(isLinked: boolean) {
  return isLinked ? "erp-ledger-row-bank-linked" : "";
}

function DescriptionWithBankBadge({ text, bankLinked }: { text: string; bankLinked?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-semibold text-slate-900">{text}</span>
      {bankLinked ? <BankSourceBadge /> : null}
    </div>
  );
}

function sumManualLedgerRows(rows: ManualLedgerRow[]) {
  return rows.reduce((sum, item) => sum + (item.row.amount || 0), 0);
}

function isBankLinkedPayment(row: FixedExpensePayment): boolean {
  return Boolean(row.bankTransactionId?.trim());
}

function resolveFixedExpenseName(fixedExpenseId: string, fixedExpenses: FixedExpense[]) {
  return fixedExpenses.find((row) => row.id === fixedExpenseId)?.name || fixedExpenseId;
}

function resolveFixedExpenseCategory(fixedExpenseId: string, fixedExpenses: FixedExpense[]) {
  return fixedExpenses.find((row) => row.id === fixedExpenseId)?.category || "-";
}

function resolveFixedPaymentDescription(payment: FixedExpensePayment, fixedExpenses: FixedExpense[]) {
  const memo = String(payment.memo || "").trim();
  if (memo) return memo;
  return resolveFixedExpenseName(payment.fixedExpenseId, fixedExpenses);
}

function ExpenseCategoryBadges({ row }: { row: CompanyExpense }) {
  if (isBankLinkedExpense(row)) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryBadge label={row.category} />
        <BankSourceBadge />
      </div>
    );
  }
  return <CategoryBadge label={row.category} />;
}

function FixedPaymentBadges({
  payment,
  fixedExpenses,
}: {
  payment: FixedExpensePayment;
  fixedExpenses: FixedExpense[];
}) {
  const category = resolveFixedExpenseCategory(payment.fixedExpenseId, fixedExpenses);
  if (isBankLinkedPayment(payment)) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryBadge label={category} />
        <BankSourceBadge />
      </div>
    );
  }
  return <CategoryBadge label={category} />;
}

function emptyManualForm(category = EXPENSE_CATEGORY_OPTIONS[0]): ManualModalState {
  return {
    mode: "create",
    kind: "variable",
    date: todayISO(),
    category,
    description: "",
    amount: "",
    memo: "",
  };
}

export function CompanyLedgerPage({
  companyExpenses = [],
  setCompanyExpenses,
  expenseCategories,
  setExpenseCategories,
  fixedExpenses = [],
  fixedExpensePayments = [],
  setFixedExpensePayments,
  setBankTransactions,
  currentUser,
}: CompanyLedgerPageProps) {
  const [activeTab, setActiveTab] = useState<LedgerTab>("manual");
  const [periodKey, setPeriodKey] = useState<LedgerPeriodKey>("thisMonth");
  const [manualQuery, setManualQuery] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => todayISO().slice(0, 7));
  const [manualModal, setManualModal] = useState<ManualModalState | null>(null);
  const [formError, setFormError] = useState("");
  const monthlyTableRef = useRef<HTMLTableElement | null>(null);

  useEffect(() => {
    if (!manualModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [manualModal]);

  const currentMonthKey = todayISO().slice(0, 7);
  const periodFilter = useMemo(() => ledgerDateFilter(periodKey), [periodKey]);
  const periodLabel = useMemo(() => ledgerPeriodLabel(periodKey), [periodKey]);

  const thisMonthVariableTotal = useMemo(
    () => sumExpensesForMonthByKind(companyExpenses, fixedExpensePayments, currentMonthKey, "variable"),
    [companyExpenses, fixedExpensePayments, currentMonthKey],
  );

  const thisMonthFixedTotal = useMemo(
    () => sumExpensesForMonthByKind(companyExpenses, fixedExpensePayments, currentMonthKey, "fixed"),
    [companyExpenses, fixedExpensePayments, currentMonthKey],
  );

  const filteredManualRows = useMemo(() => {
    const rangedExpenses = filterCompanyExpenses(companyExpenses, periodFilter.startDate, periodFilter.endDate);
    const rangedPayments = filterFixedExpensePayments(
      fixedExpensePayments,
      periodFilter.startDate,
      periodFilter.endDate,
    );
    const merged: ManualLedgerRow[] = [
      ...rangedExpenses.map((row) => ({ type: "expense" as const, row })),
      ...rangedPayments.map((row) => ({ type: "fixedPayment" as const, row })),
    ];
    const keyword = manualQuery.trim().toLowerCase();
    const filtered = keyword
      ? merged.filter((item) => {
          if (item.type === "expense") {
            const row = item.row;
            return [row.description, row.category, row.memo, row.createdBy]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(keyword);
          }
          const row = item.row;
          const name = resolveFixedExpenseName(row.fixedExpenseId, fixedExpenses);
          const category = resolveFixedExpenseCategory(row.fixedExpenseId, fixedExpenses);
          return [name, category, row.memo, L.fixedPayment]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(keyword);
        })
      : merged;
    return filtered.sort((a, b) => String(b.row.date).localeCompare(String(a.row.date)));
  }, [companyExpenses, fixedExpensePayments, fixedExpenses, manualQuery, periodFilter.endDate, periodFilter.startDate]);

  const filteredVariableRows = useMemo(
    () => filteredManualRows.filter(isVariableLedgerRow),
    [filteredManualRows],
  );

  const filteredFixedRows = useMemo(
    () => filteredManualRows.filter(isFixedLedgerRow),
    [filteredManualRows],
  );

  const hasBankLinkedManualRows = useMemo(
    () =>
      filteredManualRows.some((item) =>
        item.type === "expense" ? isBankLinkedExpense(item.row) : isBankLinkedPayment(item.row),
      ),
    [filteredManualRows],
  );

  const monthlyRows = useMemo(
    () => buildMonthlyLedgerRows(companyExpenses, fixedExpensePayments),
    [companyExpenses, fixedExpensePayments],
  );

  const selectedMonthDetail = useMemo(
    () => buildMonthlyLedgerDetail(companyExpenses, selectedMonthKey, fixedExpensePayments),
    [companyExpenses, fixedExpensePayments, selectedMonthKey],
  );

  const expenseCategoryOptions = useMemo(() => {
    const categories = [...expenseCategories];
    if (manualModal?.category && !categories.includes(manualModal.category)) {
      categories.unshift(manualModal.category);
    }
    return categories.map((category) => ({ label: category, value: category }));
  }, [expenseCategories, manualModal?.category]);

  const openCreateManual = () => {
    setFormError("");
    setManualModal(emptyManualForm(expenseCategories[0] || EXPENSE_CATEGORY_OPTIONS[0]));
  };

  const openEditManual = (row: CompanyExpense) => {
    setFormError("");
    setManualModal({
      mode: "edit",
      source: "expense",
      id: row.id,
      kind: resolveCompanyExpenseKind(row),
      date: row.date,
      category: row.category,
      description: row.description,
      amount: String(row.amount || ""),
      memo: row.memo || "",
    });
  };

  const openEditFixedPayment = (row: FixedExpensePayment) => {
    setFormError("");
    setManualModal({
      mode: "edit",
      source: "fixedPayment",
      id: row.id,
      kind: "fixed",
      date: row.date,
      category: resolveFixedExpenseCategory(row.fixedExpenseId, fixedExpenses),
      description: resolveFixedPaymentDescription(row, fixedExpenses),
      amount: String(row.amount || ""),
      memo: row.memo || "",
    });
  };

  const saveManual = () => {
    if (!manualModal) return;
    const error = validateCompanyExpenseInput(manualModal);
    if (error) {
      setFormError(error);
      return;
    }
    if (manualModal.mode === "edit" && manualModal.source === "fixedPayment" && manualModal.id) {
      setFixedExpensePayments?.((prev) =>
        prev.map((row) =>
          row.id === manualModal.id
            ? {
                ...row,
                date: manualModal.date,
                amount: parseLedgerAmount(manualModal.amount),
                memo: manualModal.description.trim() || manualModal.memo.trim(),
              }
            : row,
        ),
      );
      setExpenseCategories((prev) => mergeExpenseCategory(prev, manualModal.category));
      setManualModal(null);
      setFormError("");
      return;
    }
    const payload: CompanyExpense = {
      id: manualModal.id || makeLedgerId(),
      date: manualModal.date,
      category: manualModal.category,
      description: manualModal.description.trim(),
      amount: parseLedgerAmount(manualModal.amount),
      memo: manualModal.memo.trim(),
      kind: manualModal.kind,
      createdBy: currentUser?.name || currentUser?.loginId || "",
      createdAt: new Date().toISOString(),
    };
    if (manualModal.mode === "edit" && manualModal.id) {
      setCompanyExpenses((prev) =>
        prev.map((row) =>
          row.id === manualModal.id
            ? { ...row, ...payload, createdAt: row.createdAt, createdBy: row.createdBy || payload.createdBy }
            : row,
        ),
      );
    } else {
      setCompanyExpenses((prev) => [payload, ...prev]);
    }
    setExpenseCategories((prev) => mergeExpenseCategory(prev, payload.category));
    setManualModal(null);
    setFormError("");
  };

  const unlinkBankCompanyExpense = (expenseId: string) => {
    if (!setBankTransactions) return;
    setBankTransactions((prev) =>
      prev.map((tx) => (tx.linkedCompanyExpenseId === expenseId ? { ...tx, linkedCompanyExpenseId: undefined } : tx)),
    );
  };

  const unlinkBankFixedPayment = (paymentId: string) => {
    if (!setBankTransactions) return;
    setBankTransactions((prev) =>
      prev.map((tx) =>
        tx.linkedFixedExpensePaymentId === paymentId ? { ...tx, linkedFixedExpensePaymentId: undefined } : tx,
      ),
    );
  };

  const deleteManual = (row: CompanyExpense) => {
    const message = isBankLinkedExpense(row) ? L.deleteBankLinkedConfirm : L.deleteConfirm;
    if (!window.confirm(message)) return;
    setCompanyExpenses((prev) => prev.filter((item) => item.id !== row.id));
    if (isBankLinkedExpense(row)) unlinkBankCompanyExpense(row.id);
  };

  const deleteFixedPayment = (row: FixedExpensePayment) => {
    const message = isBankLinkedPayment(row) ? L.deleteBankLinkedConfirm : L.deleteConfirm;
    if (!window.confirm(message)) return;
    setFixedExpensePayments?.((prev) => prev.filter((item) => item.id !== row.id));
    if (isBankLinkedPayment(row)) unlinkBankFixedPayment(row.id);
  };

  return (
    <div className="erp-company-ledger-page space-y-5 md:space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen size={22} className="text-slate-700" />
            <h1 className="erp-text-page-title font-black text-slate-900">{L.pageTitle}</h1>
          </div>
          <p className="erp-text-body mt-1 text-slate-500">{L.pageDesc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTab === "manual" ? (
            <Button className="rounded-2xl" onClick={openCreateManual}>
              <Plus size={16} /> {L.addManual}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label={L.variableExpense}
          value={`${formatKRW(thisMonthVariableTotal)}${L.won}`}
          tone="text-rose-600"
          sub={formatMonthLabel(currentMonthKey)}
        />
        <SummaryCard
          label={L.fixedExpense}
          value={`${formatKRW(thisMonthFixedTotal)}${L.won}`}
          tone="text-amber-600"
          sub={formatMonthLabel(currentMonthKey)}
        />
        <SummaryCard
          label={L.grandTotal}
          value={`${formatKRW(thisMonthVariableTotal + thisMonthFixedTotal)}${L.won}`}
          tone="text-slate-900"
          sub={L.thisMonthGrandHint}
        />
      </div>

      <div className="erp-ledger-tabs flex flex-wrap gap-2">
        {TAB_ITEMS.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "default" : "outline"}
            className="erp-touch-target shrink-0 rounded-2xl"
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "manual" ? (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="space-y-4 p-4 md:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="erp-dashboard-period-tabs flex flex-wrap gap-2">
                {PERIOD_OPTIONS.map(({ key, label }) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={periodKey === key ? "default" : "outline"}
                    className="erp-touch-target shrink-0 rounded-2xl"
                    onClick={() => setPeriodKey(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <span className="erp-text-caption text-slate-500">{periodLabel}</span>
            </div>

            <div className="flex max-w-xl items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
              <Search size={18} className="text-slate-400" />
              <input
                lang="ko"
                className="erp-input w-full bg-transparent outline-none"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder={L.searchManual}
              />
            </div>

            {hasBankLinkedManualRows ? (
              <p className="erp-ledger-bank-legend erp-text-caption text-slate-500">
                <BankSourceBadge /> {L.bankSourceLegend}
              </p>
            ) : null}

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="erp-text-section font-bold text-rose-700">{L.variableExpense}</h2>
                <span className="erp-text-caption font-semibold text-slate-500">
                  {filteredVariableRows.length}
                  {L.count} · {formatKRW(sumManualLedgerRows(filteredVariableRows))}
                  {L.won}
                </span>
              </div>
              <MobileRecordList>
                {filteredVariableRows.length ? (
                  filteredVariableRows.map((item) => {
                    const row = item.row;
                    const bankLinked = isBankLinkedExpense(row);
                    return (
                      <MobileRecordCard
                        key={`expense-${row.id}`}
                        title={<DescriptionWithBankBadge text={row.description} bankLinked={bankLinked} />}
                        subtitle={row.date}
                        badge={<ExpenseCategoryBadges row={row} />}
                        fields={[
                          { label: L.amount, value: `${formatKRW(row.amount)}${L.won}`, tone: "danger" },
                          { label: L.memo, value: row.memo || "-", tone: "muted" },
                        ]}
                        actions={
                          <>
                            <button type="button" className="erp-mobile-action-btn" onClick={() => openEditManual(row)}>
                              <Pencil size={15} /> {L.edit}
                            </button>
                            <button type="button" className="erp-mobile-action-btn danger" onClick={() => deleteManual(row)}>
                              <Trash2 size={15} /> {L.delete}
                            </button>
                          </>
                        }
                      />
                    );
                  })
                ) : (
                  <MobileRecordCard empty emptyLabel={L.emptyManual} />
                )}
              </MobileRecordList>
              <DesktopTableWrap>
                <table className="erp-ledger-table min-w-full">
                  <thead>
                    <tr>
                      <th>{L.date}</th>
                      <th>{L.category}</th>
                      <th>{L.description}</th>
                      <th className="text-right">{L.amount}</th>
                      <th>{L.memo}</th>
                      <th className="erp-table-export-skip">{L.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVariableRows.length ? (
                      filteredVariableRows.map((item) => {
                        const row = item.row;
                        const bankLinked = isBankLinkedExpense(row);
                        return (
                          <tr key={`expense-${row.id}`} className={bankLinkedRowClass(bankLinked)}>
                            <td>{row.date}</td>
                            <td>
                              <ExpenseCategoryBadges row={row} />
                            </td>
                            <td>
                              <DescriptionWithBankBadge text={row.description} bankLinked={bankLinked} />
                            </td>
                            <td className="text-right font-bold text-rose-600">
                              {formatKRW(row.amount)}
                              {L.won}
                            </td>
                            <td className="text-slate-500">{row.memo || "-"}</td>
                            <td className="erp-table-export-skip">
                              <div className="erp-ledger-row-actions">
                                <button type="button" className="erp-ledger-icon-btn" onClick={() => openEditManual(row)} aria-label={L.edit}>
                                  <Pencil size={15} />
                                </button>
                                <button type="button" className="erp-ledger-icon-btn danger" onClick={() => deleteManual(row)} aria-label={L.delete}>
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="erp-ledger-empty">
                          {L.emptyManual}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {filteredVariableRows.length ? (
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="font-bold">
                          {L.total} ({filteredVariableRows.length}
                          {L.count})
                        </td>
                        <td className="text-right font-black text-rose-600">
                          {formatKRW(sumManualLedgerRows(filteredVariableRows))}
                          {L.won}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </DesktopTableWrap>
            </section>

            <section className="space-y-3 border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="erp-text-section font-bold text-amber-700">{L.fixedExpense}</h2>
                <span className="erp-text-caption font-semibold text-slate-500">
                  {filteredFixedRows.length}
                  {L.count} · {formatKRW(sumManualLedgerRows(filteredFixedRows))}
                  {L.won}
                </span>
              </div>
              <MobileRecordList>
                {filteredFixedRows.length ? (
                  filteredFixedRows.map((item) => {
                    if (item.type === "expense") {
                      const row = item.row;
                      const bankLinked = isBankLinkedExpense(row);
                      return (
                        <MobileRecordCard
                          key={`expense-${row.id}`}
                          title={<DescriptionWithBankBadge text={row.description} bankLinked={bankLinked} />}
                          subtitle={row.date}
                          badge={<ExpenseCategoryBadges row={row} />}
                          fields={[
                            { label: L.amount, value: `${formatKRW(row.amount)}${L.won}`, tone: "danger" },
                            { label: L.memo, value: row.memo || "-", tone: "muted" },
                          ]}
                          actions={
                            <>
                              <button type="button" className="erp-mobile-action-btn" onClick={() => openEditManual(row)}>
                                <Pencil size={15} /> {L.edit}
                              </button>
                              <button type="button" className="erp-mobile-action-btn danger" onClick={() => deleteManual(row)}>
                                <Trash2 size={15} /> {L.delete}
                              </button>
                            </>
                          }
                        />
                      );
                    }
                    const row = item.row;
                    const name = resolveFixedPaymentDescription(row, fixedExpenses);
                    const bankLinked = isBankLinkedPayment(row);
                    return (
                      <MobileRecordCard
                        key={`fixed-pay-${row.id}`}
                        title={<DescriptionWithBankBadge text={name} bankLinked={bankLinked} />}
                        subtitle={row.date}
                        badge={<FixedPaymentBadges payment={row} fixedExpenses={fixedExpenses} />}
                        fields={[
                          { label: L.amount, value: `${formatKRW(row.amount)}${L.won}`, tone: "danger" },
                          { label: L.memo, value: row.memo || "-", tone: "muted" },
                        ]}
                        actions={
                          setFixedExpensePayments ? (
                            <>
                              <button type="button" className="erp-mobile-action-btn" onClick={() => openEditFixedPayment(row)}>
                                <Pencil size={15} /> {L.edit}
                              </button>
                              <button type="button" className="erp-mobile-action-btn danger" onClick={() => deleteFixedPayment(row)}>
                                <Trash2 size={15} /> {L.delete}
                              </button>
                            </>
                          ) : undefined
                        }
                      />
                    );
                  })
                ) : (
                  <MobileRecordCard empty emptyLabel={L.emptyFixed} />
                )}
              </MobileRecordList>
              <DesktopTableWrap>
                <table className="erp-ledger-table min-w-full">
                  <thead>
                    <tr>
                      <th>{L.date}</th>
                      <th>{L.category}</th>
                      <th>{L.description}</th>
                      <th className="text-right">{L.amount}</th>
                      <th>{L.memo}</th>
                      <th className="erp-table-export-skip">{L.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFixedRows.length ? (
                      filteredFixedRows.map((item) => {
                        if (item.type === "expense") {
                          const row = item.row;
                          const bankLinked = isBankLinkedExpense(row);
                          return (
                            <tr key={`expense-${row.id}`} className={bankLinkedRowClass(bankLinked)}>
                              <td>{row.date}</td>
                              <td>
                                <ExpenseCategoryBadges row={row} />
                              </td>
                              <td>
                                <DescriptionWithBankBadge text={row.description} bankLinked={bankLinked} />
                              </td>
                              <td className="text-right font-bold text-rose-600">
                                {formatKRW(row.amount)}
                                {L.won}
                              </td>
                              <td className="text-slate-500">{row.memo || "-"}</td>
                              <td className="erp-table-export-skip">
                                <div className="erp-ledger-row-actions">
                                  <button type="button" className="erp-ledger-icon-btn" onClick={() => openEditManual(row)} aria-label={L.edit}>
                                    <Pencil size={15} />
                                  </button>
                                  <button type="button" className="erp-ledger-icon-btn danger" onClick={() => deleteManual(row)} aria-label={L.delete}>
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        const row = item.row;
                        const name = resolveFixedPaymentDescription(row, fixedExpenses);
                        const bankLinked = isBankLinkedPayment(row);
                        return (
                          <tr key={`fixed-pay-${row.id}`} className={bankLinkedRowClass(bankLinked)}>
                            <td>{row.date}</td>
                            <td>
                              <FixedPaymentBadges payment={row} fixedExpenses={fixedExpenses} />
                            </td>
                            <td>
                              <DescriptionWithBankBadge text={name} bankLinked={bankLinked} />
                            </td>
                            <td className="text-right font-bold text-rose-600">
                              {formatKRW(row.amount)}
                              {L.won}
                            </td>
                            <td className="text-slate-500">{row.memo || "-"}</td>
                            <td className="erp-table-export-skip">
                              {setFixedExpensePayments ? (
                                <div className="erp-ledger-row-actions">
                                  <button type="button" className="erp-ledger-icon-btn" onClick={() => openEditFixedPayment(row)} aria-label={L.edit}>
                                    <Pencil size={15} />
                                  </button>
                                  <button type="button" className="erp-ledger-icon-btn danger" onClick={() => deleteFixedPayment(row)} aria-label={L.delete}>
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              ) : (
                                <span className="erp-text-caption text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="erp-ledger-empty">
                          {L.emptyFixed}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {filteredFixedRows.length ? (
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="font-bold">
                          {L.total} ({filteredFixedRows.length}
                          {L.count})
                        </td>
                        <td className="text-right font-black text-amber-600">
                          {formatKRW(sumManualLedgerRows(filteredFixedRows))}
                          {L.won}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </DesktopTableWrap>
            </section>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "monthly" ? (
        <div className="space-y-4">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4 md:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="erp-worker-month-nav">
                  <button type="button" className="erp-worker-month-nav-btn" onClick={() => setSelectedMonthKey((prev) => shiftMonthKey(prev, -1))}>
                    <ChevronLeft size={18} />
                  </button>
                  <div className="erp-worker-month-nav-label">{formatMonthLabel(selectedMonthKey)}</div>
                  <button type="button" className="erp-worker-month-nav-btn" onClick={() => setSelectedMonthKey((prev) => shiftMonthKey(prev, 1))}>
                    <ChevronRight size={18} />
                  </button>
                  <Button variant="outline" className="rounded-2xl" onClick={() => setSelectedMonthKey(currentMonthKey)}>
                    {L.thisMonthBtn}
                  </Button>
                </div>
                <TableExportToolbar
                  getTable={() => monthlyTableRef.current}
                  fileName={`${L.pageTitle}_${selectedMonthKey}`}
                  title={`${formatMonthLabel(selectedMonthKey)} ${L.pageTitle}`}
                  hidePdf
                  className="justify-end"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard label={L.variableExpense} value={`${formatKRW(selectedMonthDetail.manualTotal)}${L.won}`} tone="text-rose-600" />
                <SummaryCard label={L.fixedExpense} value={`${formatKRW(selectedMonthDetail.fixedTotal)}${L.won}`} tone="text-amber-600" />
                <SummaryCard label={L.monthTotal} value={`${formatKRW(selectedMonthDetail.grandTotal)}${L.won}`} tone="text-slate-900" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4 md:p-5">
              <h2 className="erp-text-section font-bold text-slate-900">{L.monthSummary}</h2>
              <MobileRecordList>
                {monthlyRows.length ? (
                  monthlyRows.map((row) => (
                    <MobileRecordCard
                      key={row.monthKey}
                      title={row.label}
                      selected={row.monthKey === selectedMonthKey}
                      onClick={() => setSelectedMonthKey(row.monthKey)}
                      fields={[
                        { label: L.variableExpense, value: `${formatKRW(row.manualTotal)}${L.won}`, tone: "danger" },
                        { label: L.fixedExpense, value: `${formatKRW(row.fixedTotal)}${L.won}`, tone: "muted" },
                        { label: L.grandTotal, value: `${formatKRW(row.grandTotal)}${L.won}` },
                      ]}
                      actions={
                        <button type="button" className="erp-mobile-action-btn" onClick={() => setSelectedMonthKey(row.monthKey)}>
                          {L.view}
                        </button>
                      }
                    />
                  ))
                ) : (
                  <MobileRecordCard empty emptyLabel={L.emptyMonth} />
                )}
              </MobileRecordList>
              <DesktopTableWrap>
                <table className="erp-ledger-table min-w-full">
                  <thead>
                    <tr>
                      <th>{L.month}</th>
                      <th className="text-right">{L.variableExpense}</th>
                      <th className="text-right">{L.fixedExpense}</th>
                      <th className="text-right">{L.grandTotal}</th>
                      <th className="erp-table-export-skip">{L.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyRows.map((row) => (
                      <tr key={row.monthKey} className={row.monthKey === selectedMonthKey ? "is-selected" : ""}>
                        <td className="font-semibold">{row.label}</td>
                        <td className="text-right text-rose-600">{formatKRW(row.manualTotal)}{L.won}</td>
                        <td className="text-right text-amber-600">{formatKRW(row.fixedTotal)}{L.won}</td>
                        <td className="text-right font-bold">{formatKRW(row.grandTotal)}{L.won}</td>
                        <td className="erp-table-export-skip">
                          <Button size="sm" variant="outline" className="rounded-2xl" onClick={() => setSelectedMonthKey(row.monthKey)}>
                            {L.view}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DesktopTableWrap>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4 md:p-5">
              <h2 className="erp-text-section font-bold text-slate-900">{selectedMonthDetail.label} {L.monthDetail}</h2>
              <MobileRecordList>
                {selectedMonthDetail.manualExpenses.length || selectedMonthDetail.fixedPayments.length ? (
                  <>
                    {selectedMonthDetail.manualExpenses.map((row) => {
                      const bankLinked = isBankLinkedExpense(row);
                      return (
                        <MobileRecordCard
                          key={`manual-${row.id}`}
                          title={<DescriptionWithBankBadge text={row.description} bankLinked={bankLinked} />}
                          subtitle={row.date}
                          badge={<ExpenseCategoryBadges row={row} />}
                          fields={[
                            { label: L.section, value: <ExpenseKindBadge kind={resolveCompanyExpenseKind(row)} /> },
                            { label: L.amount, value: `${formatKRW(row.amount)}${L.won}`, tone: "danger" },
                          ]}
                        />
                      );
                    })}
                    {selectedMonthDetail.fixedPayments.map((row) => {
                      const name = resolveFixedExpenseName(row.fixedExpenseId, fixedExpenses);
                      const bankLinked = isBankLinkedPayment(row);
                      return (
                        <MobileRecordCard
                          key={`fixed-pay-${row.id}`}
                          title={<DescriptionWithBankBadge text={name} bankLinked={bankLinked} />}
                          subtitle={row.date}
                          badge={<FixedPaymentBadges payment={row} fixedExpenses={fixedExpenses} />}
                          fields={[
                            { label: L.section, value: <ExpenseKindBadge kind="fixed" /> },
                            { label: L.amount, value: `${formatKRW(row.amount)}${L.won}`, tone: "danger" },
                            ...(row.memo ? [{ label: L.memoOptional, value: row.memo, tone: "muted" as const }] : []),
                          ]}
                        />
                      );
                    })}
                    <MobileRecordCard
                      title={L.grandTotal}
                      fields={[
                        { label: L.monthTotal, value: `${formatKRW(selectedMonthDetail.grandTotal)}${L.won}` },
                      ]}
                    />
                  </>
                ) : (
                  <MobileRecordCard empty emptyLabel={L.emptyMonth} />
                )}
              </MobileRecordList>
              <DesktopTableWrap>
                <table ref={monthlyTableRef} className="erp-ledger-table min-w-full">
                  <thead>
                    <tr>
                      <th>{L.section}</th>
                      <th>{L.dateOrItem}</th>
                      <th>{L.category}</th>
                      <th>{L.description}</th>
                      <th className="text-right">{L.amount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedMonthDetail.manualExpenses.map((row) => {
                      const bankLinked = isBankLinkedExpense(row);
                      return (
                        <tr key={`manual-${row.id}`} className={bankLinkedRowClass(bankLinked)}>
                          <td>
                            <ExpenseKindBadge kind={resolveCompanyExpenseKind(row)} />
                          </td>
                          <td>{row.date}</td>
                          <td>
                            <ExpenseCategoryBadges row={row} />
                          </td>
                          <td>
                            <DescriptionWithBankBadge text={row.description} bankLinked={bankLinked} />
                          </td>
                          <td className="text-right">
                            {formatKRW(row.amount)}
                            {L.won}
                          </td>
                        </tr>
                      );
                    })}
                    {selectedMonthDetail.fixedPayments.map((row) => {
                      const name = resolveFixedExpenseName(row.fixedExpenseId, fixedExpenses);
                      const bankLinked = isBankLinkedPayment(row);
                      const description = row.memo ? `${name} ${L.separator} ${row.memo}` : name;
                      return (
                        <tr key={`fixed-pay-${row.id}`} className={bankLinkedRowClass(bankLinked)}>
                          <td>
                            <ExpenseKindBadge kind="fixed" />
                          </td>
                          <td>{row.date}</td>
                          <td>
                            <FixedPaymentBadges payment={row} fixedExpenses={fixedExpenses} />
                          </td>
                          <td>
                            <DescriptionWithBankBadge text={description} bankLinked={bankLinked} />
                          </td>
                          <td className="text-right">
                            {formatKRW(row.amount)}
                            {L.won}
                          </td>
                        </tr>
                      );
                    })}
                    {!selectedMonthDetail.manualExpenses.length && !selectedMonthDetail.fixedPayments.length ? (
                      <tr>
                        <td colSpan={5} className="erp-ledger-empty">
                          {L.emptyMonth}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="font-bold">
                        {L.grandTotal}
                      </td>
                      <td className="text-right font-black">{formatKRW(selectedMonthDetail.grandTotal)}{L.won}</td>
                    </tr>
                  </tfoot>
                </table>
              </DesktopTableWrap>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {manualModal ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setManualModal(null)}>
          <div className="erp-ledger-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="erp-text-section font-bold">
                {manualModal.mode === "create"
                  ? manualModal.kind === "fixed"
                    ? L.addFixed
                    : L.addManual
                  : manualModal.kind === "fixed"
                    ? L.editFixed
                    : L.editManual}
              </h2>
              <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={() => setManualModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              {manualModal.mode === "create" ? (
                <div className="flex flex-wrap gap-2">
                  {EXPENSE_KIND_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={manualModal.kind === option.value ? "default" : "outline"}
                      className="rounded-2xl"
                      onClick={() => setManualModal((prev) => (prev ? { ...prev, kind: option.value } : prev))}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="erp-text-caption font-semibold text-slate-500">{L.section}</span>
                  <ExpenseKindBadge kind={manualModal.kind} />
                </div>
              )}
              <Field label={L.expenseDate}>
                <KoreanDateInput
                  value={manualModal.date}
                  onChange={(event) => setManualModal((prev) => (prev ? { ...prev, date: event.target.value } : prev))}
                />
              </Field>
              <Field label={L.category}>
                <AutocompleteInput
                  value={manualModal.category}
                  options={expenseCategoryOptions}
                  placeholder={L.category}
                  freeSolo
                  compact={false}
                  inputProps={{ className: "rounded-xl" }}
                  onChange={(value) => setManualModal((prev) => (prev ? { ...prev, category: value.trim() } : prev))}
                />
                <p className="mt-1.5 text-xs font-semibold text-slate-500">
                  {"\uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uCE74\uD14C\uACE0\uB9AC\uB294 \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694."}
                </p>
              </Field>
              <Field label={L.description}>
                <Input value={manualModal.description} onChange={(e) => setManualModal((prev) => (prev ? { ...prev, description: e.target.value } : prev))} />
              </Field>
              <Field label={L.amountWon}>
                <Input
                  inputMode="numeric"
                  value={manualModal.amount}
                  onChange={(e) => setManualModal((prev) => (prev ? { ...prev, amount: e.target.value } : prev))}
                />
              </Field>
              <Field label={L.memoOptional}>
                <Input value={manualModal.memo} onChange={(e) => setManualModal((prev) => (prev ? { ...prev, memo: e.target.value } : prev))} />
              </Field>
              {formError ? <p className="erp-text-caption font-semibold text-rose-600">{formError}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" className="rounded-2xl" onClick={() => setManualModal(null)}>
                  {L.cancel}
                </Button>
                <Button className="rounded-2xl" onClick={saveManual}>
                  {L.save}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
