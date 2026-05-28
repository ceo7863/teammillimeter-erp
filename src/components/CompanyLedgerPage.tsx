import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
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
  buildLedgerCategoryStats,
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_KIND_OPTIONS,
  filterCompanyExpenses,
  filterFixedExpensePayments,
  FIXED_CATEGORY_OPTIONS,
  FIXED_CYCLE_OPTIONS,
  fixedCycleLabel,
  fixedMonthlyAmount,
  formatFixedExpensePaymentDay,
  formatKRW,
  formatMonthLabel,
  ledgerDateFilter,
  ledgerPeriodLabel,
  linkFixedExpensePaymentToBankTx,
  makeLedgerId,
  mergeExpenseCategory,
  mergeFixedExpenseCategory,
  buildFixedCategorySelectOptions,
  resolveFixedPaymentCategory,
  normalizeFixedExpensePaymentDay,
  parseLedgerAmount,
  resolveCompanyExpenseKind,
  resolveFixedPaymentFieldsFromBankTx,
  shiftMonthKey,
  sumExpensesForMonthByKind,
  todayISO,
  validateCompanyExpenseInput,
  validateFixedExpenseInput,
  type CompanyExpense,
  type CompanyExpenseKind,
  type FixedExpense,
  type FixedExpenseCycle,
  type FixedExpensePayment,
  type LedgerPeriodKey,
} from "@/utils/companyLedger";
import type { ErpUser } from "@/utils/erpApi";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { CompanyLedgerCalendar } from "@/components/CompanyLedgerCalendar";
import type { LedgerCalendarEntry } from "@/utils/ledgerCalendar";
import { formatBankLearnAutoMessage, listBankTransactionsForLedgerLink, type BankLearnRule } from "@/utils/bankCompanyLedger";
import { formatBankTransactionDateTime, type BankTransaction } from "@/utils/bankTransactions";
import { refreshCompanyLedgerFromBankTransactions } from "@/utils/fixedExpenseAutomation";
import { useAudit } from "@/context/AuditContext";
import {
  COMPANY_EXPENSE_AUDIT_FIELDS,
  FIXED_EXPENSE_AUDIT_FIELDS,
  FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS,
  snapshotCompanyExpenseForAudit,
  snapshotFixedExpenseForAudit,
  snapshotFixedExpensePaymentForAudit,
} from "@/utils/auditLog";

type LedgerTab = "manual" | "monthly" | "calendar" | "stats";

const TAB_ITEMS: Array<{ key: LedgerTab; label: string }> = [
  { key: "calendar", label: "\uAC00\uACC4\uBD80 \uCE98\uB9B0\uB354" },
  { key: "manual", label: "\uC9C0\uCD9C \uB4F1\uB85D" },
  { key: "monthly", label: "\uC6D4\uBCC4 \uAC00\uACC4\uBD80" },
  { key: "stats", label: "\uD1B5\uACC4" },
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
  statsTitle: "\uCE74\uD14C\uACE0\uB9AC\uBCC4 \uD86F\uACC4",
  statsDesc: "\uC120\uD0DD \uAE30\uAC04 \uB3D9\uC548 \uCE74\uD14C\uACE0\uB9AC\uBCC4 \uBCC0\uB3D9 \uC9C0\uCD9C\uACFC \uACE0\uC815\uBE44 \uD569\uACC4\uB97C \uBE44\uAD50\uD569\uB2C8\uB2E4.",
  statsEmpty: "\uC120\uD0DD \uAE30\uAC04\uC5D0 \uC9D1\uACC4\uD560 \uC9C0\uCD9C \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  share: "\uBE44\uC728",
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
  fixedItemSection: "\uACE0\uC815\uBE44 \uD56D\uBAA9",
  addFixedItem: "\uACE0\uC815\uBE44 \uD56D\uBAA9 \uCD94\uAC00",
  editFixedItem: "\uACE0\uC815\uBE44 \uD56D\uBAA9 \uC218\uC815",
  emptyFixedItems: "\uB4F1\uB85D\uB41C \uACE0\uC815\uBE44 \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  paymentDay: "\uB9E4\uC6D4 \uCD9C\uAE08\uC77C",
  unpaidFixedExpense: "\uC544\uC9C1 \uC9C0\uCD9C\uD558\uC9C0 \uC54A\uC740 \uACE0\uC815\uBE44",
  paidFixedExpense: "\uC9C0\uCD9C\uD55C \uACE0\uC815\uBE44",
  emptyUnpaidFixed: "\uC544\uC9C1 \uC9C0\uCD9C\uD558\uC9C0 \uC54A\uC740 \uACE0\uC815\uBE44\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyPaidFixed: "\uC9C0\uCD9C\uD55C \uACE0\uC815\uBE44\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  unpaidFixedBadge: "\uBBF8\uC9C0\uCD9C",
  unpaidFixedHint: "\uD1B5\uC7A5 \uC5F0\uB3D9 \uC804 \uACE0\uC815\uBE44",
  paidFixedHint: "\uD1B5\uC7A5 \uC5F0\uB3D9 \uC644\uB8CC",
  linkFromBank: "\uD1B5\uC7A5\uB0B4\uC5ED\uC5D0\uC11C \uC5F0\uACB0\uD558\uAE30",
  linkFromBankTitle: "\uBBF8\uBD84\uB958 \uD1B5\uC7A5 \uB0B4\uC5ED \uC5F0\uACB0",
  linkFromBankDesc: "\uC5F0\uACB0\uD560 \uCD9C\uAE08 \uB0B4\uC5ED\uC744 \uC120\uD0DD\uD558\uC138\uC694.",
  linkFromBankEmpty: "\uC5F0\uACB0 \uAC00\uB2A5\uD55C \uBBF8\uBD84\uB958 \uCD9C\uAE08 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  linkFromBankDone: "\uD1B5\uC7A5 \uB0B4\uC5ED\uC774 \uC5F0\uACB0\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  refreshBankLedger: "\uD1B5\uC7A5 \uC5F0\uB3D9 \uC0C8\uB85C\uACE0\uCE68",
  refreshBankLedgerHint: "\uD1B5\uC7A5 \uAC70\uB798\uB0B4\uC5ED\uC744 \uB2E4\uC2DC \uD655\uC778\uD558\uACE0 \uACE0\uC815\uBE44 \uB0A9\uBD80 \u00B7 \uD559\uC2B5 \uADDC\uCE59 \uC5F0\uACB0\uC744 \uAC31\uC2E0\uD569\uB2C8\uB2E4.",
  refreshBankLedgerDone: (generated: number, linked: number, learned: string) => {
    const parts: string[] = [];
    if (generated > 0) parts.push(`\uB0A9\uBD80 ${generated}\uAC74 \uC0DD\uC131`);
    if (linked > 0) parts.push(`\uD1B5\uC7A5 ${linked}\uAC74 \uC5F0\uACB0`);
    if (learned) parts.push(learned);
    return parts.length ? `\uD1B5\uC7A5 \uC5F0\uB3D9 \uC644\uB8CC \u00B7 ${parts.join(" \u00B7 ")}` : "\uD655\uC778 \uC644\uB8CC. \uC0C8\uB85C \uC5F0\uACB0\uD560 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.";
  },
  refreshBankLedgerEmpty: "\uD1B5\uC7A5 \uAC70\uB798\uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  viewBankLinks: "\uD1B5\uC7A5 \uC5F0\uB3D9 \uD655\uC778",
  viewBankLinksTitle: "\uD1B5\uC7A5 \uC5F0\uB3D9 \uB0B4\uC5ED",
  viewBankLinksDesc: "\uACE0\uC815\uBE44 \uB0A9\uBD80\uC640 \uC5F0\uACB0\uB41C \uD1B5\uC7A5 \uAC70\uB798 \uB0B4\uC5ED\uC785\uB2C8\uB2E4.",
  viewBankLinksEmpty: "\uC5F0\uACB0\uB41C \uD1B5\uC7A5 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  viewBankLinksPaymentDate: "\uB0A9\uBD80\uC77C",
  viewBankLinksPaymentAmount: "\uB0A9\uBD80\uAE08\uC561",
  viewBankLinksStatus: "\uC5F0\uACB0",
  viewBankLinksLinked: "\uC5F0\uB3D9\uC644\uB8CC",
  viewBankLinksUnlinked: "\uBBF8\uC5F0\uB3D9",
  viewBankLinksTxAt: "\uAC70\uB798\uC77C\uC2DC",
  viewBankLinksWithdrawal: "\uCD9C\uAE08",
  viewBankLinksDescription: "\uAC70\uB798\uB0B4\uC6A9",
  viewBankLinksCounterparty: "\uC0C1\uB300\uC608\uAE08\uC8FC",
};

type CompanyLedgerPageProps = {
  companyExpenses: CompanyExpense[];
  setCompanyExpenses: React.Dispatch<React.SetStateAction<CompanyExpense[]>>;
  expenseCategories: string[];
  setExpenseCategories: React.Dispatch<React.SetStateAction<string[]>>;
  fixedExpenseCategories: string[];
  setFixedExpenseCategories: React.Dispatch<React.SetStateAction<string[]>>;
  fixedExpenses: FixedExpense[];
  setFixedExpenses: React.Dispatch<React.SetStateAction<FixedExpense[]>>;
  fixedExpensePayments?: FixedExpensePayment[];
  setFixedExpensePayments?: React.Dispatch<React.SetStateAction<FixedExpensePayment[]>>;
  bankTransactions?: BankTransaction[];
  setBankTransactions?: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  bankLedgerRules?: BankLearnRule[];
  currentUser?: ErpUser | null;
};

type ManualModalState = {
  mode: "create" | "edit";
  source?: "expense" | "fixedPayment";
  id?: string;
  fixedExpenseId?: string;
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

type FixedExpenseModalState = {
  mode: "create" | "edit";
  id?: string;
  name: string;
  category: string;
  amount: string;
  cycle: FixedExpenseCycle;
  paymentDayOfMonth: string;
  startDate: string;
  memo: string;
  isActive: boolean;
};

type FixedExpenseBankLinkRow = {
  paymentId: string;
  paymentDate: string;
  paymentAmount: number;
  linked: boolean;
  bankTransactionId?: string;
  bankAt?: string;
  bankWithdrawal?: number;
  bankDescription?: string;
  bankCounterparty?: string;
};

function buildFixedExpenseBankLinkRows(
  fixedExpenseId: string,
  payments: FixedExpensePayment[],
  bankTransactions: BankTransaction[],
  options: { paymentId?: string } = {},
): FixedExpenseBankLinkRow[] {
  const bankById = new Map(bankTransactions.map((row) => [row.id, row]));
  const bankByPaymentId = new Map(
    bankTransactions
      .filter((row) => row.linkedFixedExpensePaymentId)
      .map((row) => [String(row.linkedFixedExpensePaymentId), row]),
  );

  return payments
    .filter((row) => row.fixedExpenseId === fixedExpenseId)
    .filter((row) => (options.paymentId ? row.id === options.paymentId : true))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((payment) => {
      const tx =
        (payment.bankTransactionId ? bankById.get(payment.bankTransactionId) : undefined) ||
        bankByPaymentId.get(payment.id);
      return {
        paymentId: payment.id,
        paymentDate: payment.date,
        paymentAmount: Number(payment.amount) || 0,
        linked: Boolean(tx),
        bankTransactionId: tx?.id,
        bankAt: tx?.transactionAt,
        bankWithdrawal: tx?.withdrawal,
        bankDescription: tx?.description,
        bankCounterparty: tx?.counterpartyName,
      };
    });
}

const PAYMENT_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => String(index + 1));

function isVariableLedgerRow(item: ManualLedgerRow) {
  return item.type === "expense" && resolveCompanyExpenseKind(item.row) === "variable";
}

function isFixedLedgerRow(item: ManualLedgerRow) {
  if (item.type === "fixedPayment") return true;
  return item.type === "expense" && resolveCompanyExpenseKind(item.row) === "fixed";
}

function isPaidFixedLedgerRow(item: ManualLedgerRow) {
  if (item.type === "fixedPayment") return isBankLinkedPayment(item.row);
  return isBankLinkedExpense(item.row);
}

function UnpaidFixedBadge() {
  return (
    <span className="erp-ledger-unpaid-badge" title={L.unpaidFixedHint}>
      {L.unpaidFixedBadge}
    </span>
  );
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
  compact = false,
}: {
  label: string;
  value: string;
  tone?: string;
  sub?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="erp-ledger-summary-tile">
        <div className="erp-ledger-summary-tile-label">{label}</div>
        <div className={`erp-ledger-summary-tile-value ${tone}`}>{value}</div>
        {sub ? <div className="erp-ledger-summary-tile-sub">{sub}</div> : null}
      </div>
    );
  }
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
  const category = resolveFixedPaymentCategory(payment, fixedExpenses);
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

function FixedLedgerRowsPanel({
  rows,
  emptyLabel,
  showUnpaidBadge,
  fixedExpenses,
  canEditPayments,
  onEditManual,
  onEditFixedPayment,
  onDeleteManual,
  onDeleteFixedPayment,
}: {
  rows: ManualLedgerRow[];
  emptyLabel: string;
  showUnpaidBadge: boolean;
  fixedExpenses: FixedExpense[];
  canEditPayments: boolean;
  onEditManual: (row: CompanyExpense) => void;
  onEditFixedPayment: (row: FixedExpensePayment) => void;
  onDeleteManual: (row: CompanyExpense) => void;
  onDeleteFixedPayment: (row: FixedExpensePayment) => void;
}) {
  return (
    <>
      <MobileRecordList>
        {rows.length ? (
          rows.map((item) => {
            if (item.type === "expense") {
              const row = item.row;
              const bankLinked = isBankLinkedExpense(row);
              return (
                <MobileRecordCard
                  key={`expense-${row.id}`}
                  title={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <DescriptionWithBankBadge text={row.description} bankLinked={bankLinked} />
                      {showUnpaidBadge && !bankLinked ? <UnpaidFixedBadge /> : null}
                    </div>
                  }
                  subtitle={row.date}
                  badge={<ExpenseCategoryBadges row={row} />}
                  fields={[
                    { label: L.amount, value: `${formatKRW(row.amount)}${L.won}`, tone: "danger" },
                    { label: L.memo, value: row.memo || "-", tone: "muted" },
                  ]}
                  actions={
                    <>
                      <button type="button" className="erp-mobile-action-btn" onClick={() => onEditManual(row)}>
                        <Pencil size={15} /> {L.edit}
                      </button>
                      <button type="button" className="erp-mobile-action-btn danger" onClick={() => onDeleteManual(row)}>
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
                title={
                  <div className="flex flex-wrap items-center gap-1.5">
                    <DescriptionWithBankBadge text={name} bankLinked={bankLinked} />
                    {showUnpaidBadge && !bankLinked ? <UnpaidFixedBadge /> : null}
                  </div>
                }
                subtitle={row.date}
                badge={<FixedPaymentBadges payment={row} fixedExpenses={fixedExpenses} />}
                fields={[
                  { label: L.amount, value: `${formatKRW(row.amount)}${L.won}`, tone: "danger" },
                  { label: L.memo, value: row.memo || "-", tone: "muted" },
                ]}
                actions={
                  canEditPayments ? (
                    <>
                      <button type="button" className="erp-mobile-action-btn" onClick={() => onEditFixedPayment(row)}>
                        <Pencil size={15} /> {L.edit}
                      </button>
                      <button type="button" className="erp-mobile-action-btn danger" onClick={() => onDeleteFixedPayment(row)}>
                        <Trash2 size={15} /> {L.delete}
                      </button>
                    </>
                  ) : undefined
                }
              />
            );
          })
        ) : (
          <MobileRecordCard empty emptyLabel={emptyLabel} />
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
            {rows.length ? (
              rows.map((item) => {
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <DescriptionWithBankBadge text={row.description} bankLinked={bankLinked} />
                          {showUnpaidBadge && !bankLinked ? <UnpaidFixedBadge /> : null}
                        </div>
                      </td>
                      <td className="text-right font-bold text-rose-600">
                        {formatKRW(row.amount)}
                        {L.won}
                      </td>
                      <td className="text-slate-500">{row.memo || "-"}</td>
                      <td className="erp-table-export-skip">
                        <div className="erp-ledger-row-actions">
                          <button type="button" className="erp-ledger-icon-btn" onClick={() => onEditManual(row)} aria-label={L.edit}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="erp-ledger-icon-btn danger" onClick={() => onDeleteManual(row)} aria-label={L.delete}>
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        <DescriptionWithBankBadge text={name} bankLinked={bankLinked} />
                        {showUnpaidBadge && !bankLinked ? <UnpaidFixedBadge /> : null}
                      </div>
                    </td>
                    <td className="text-right font-bold text-rose-600">
                      {formatKRW(row.amount)}
                      {L.won}
                    </td>
                    <td className="text-slate-500">{row.memo || "-"}</td>
                    <td className="erp-table-export-skip">
                      {canEditPayments ? (
                        <div className="erp-ledger-row-actions">
                          <button type="button" className="erp-ledger-icon-btn" onClick={() => onEditFixedPayment(row)} aria-label={L.edit}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="erp-ledger-icon-btn danger" onClick={() => onDeleteFixedPayment(row)} aria-label={L.delete}>
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
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
          {rows.length ? (
            <tfoot>
              <tr>
                <td colSpan={3} className="font-bold">
                  {L.total} ({rows.length}
                  {L.count})
                </td>
                <td className="text-right font-black text-amber-600">
                  {formatKRW(sumManualLedgerRows(rows))}
                  {L.won}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </DesktopTableWrap>
    </>
  );
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

function emptyFixedExpenseForm(category = FIXED_CATEGORY_OPTIONS[0]): FixedExpenseModalState {
  return {
    mode: "create",
    name: "",
    category,
    amount: "",
    cycle: "monthly",
    paymentDayOfMonth: "1",
    startDate: todayISO(),
    memo: "",
    isActive: true,
  };
}

const LEDGER_CATEGORY_AUTOCOMPLETE_PROPS = {
  freeSolo: true,
  showOptionsOnFocus: true,
  commitFreeSoloOnBlur: true,
  keepOpenUntilSelect: true,
  compact: false,
  limit: 24,
  inputProps: { className: "rounded-xl" },
} as const;

export function CompanyLedgerPage({
  companyExpenses = [],
  setCompanyExpenses,
  expenseCategories,
  setExpenseCategories,
  fixedExpenseCategories,
  setFixedExpenseCategories,
  fixedExpenses = [],
  fixedExpensePayments = [],
  setFixedExpenses,
  setFixedExpensePayments,
  bankTransactions = [],
  setBankTransactions,
  bankLedgerRules = [],
  currentUser,
}: CompanyLedgerPageProps) {
  const { recordAudit, recordSummaryAudit } = useAudit();
  const [activeTab, setActiveTab] = useState<LedgerTab>("calendar");
  const [periodKey, setPeriodKey] = useState<LedgerPeriodKey>("thisMonth");
  const [manualQuery, setManualQuery] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => todayISO().slice(0, 7));
  const [manualModal, setManualModal] = useState<ManualModalState | null>(null);
  const [fixedExpenseModal, setFixedExpenseModal] = useState<FixedExpenseModalState | null>(null);
  const [bankLinkModalOpen, setBankLinkModalOpen] = useState(false);
  const [bankLinkView, setBankLinkView] = useState<{ fixedExpenseId: string; paymentId?: string; title: string } | null>(
    null,
  );
  const [formError, setFormError] = useState("");
  const [linkMessage, setLinkMessage] = useState("");
  const [bankRefreshMessage, setBankRefreshMessage] = useState("");
  const [bankRefreshLoading, setBankRefreshLoading] = useState(false);
  const monthlyTableRef = useRef<HTMLTableElement | null>(null);
  const statsTableRef = useRef<HTMLTableElement | null>(null);

  useEffect(() => {
    if (!manualModal && !fixedExpenseModal && !bankLinkModalOpen && !bankLinkView) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [manualModal, fixedExpenseModal, bankLinkModalOpen, bankLinkView]);

  const bankLinkViewRows = useMemo(() => {
    if (!bankLinkView) return [];
    return buildFixedExpenseBankLinkRows(
      bankLinkView.fixedExpenseId,
      fixedExpensePayments || [],
      bankTransactions,
      { paymentId: bankLinkView.paymentId },
    );
  }, [bankLinkView, fixedExpensePayments, bankTransactions]);

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
          const category = resolveFixedPaymentCategory(row, fixedExpenses);
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

  const filteredUnpaidFixedRows = useMemo(
    () => filteredFixedRows.filter((row) => !isPaidFixedLedgerRow(row)),
    [filteredFixedRows],
  );

  const filteredPaidFixedRows = useMemo(
    () => filteredFixedRows.filter(isPaidFixedLedgerRow),
    [filteredFixedRows],
  );

  const thisMonthFixedBreakdown = useMemo(() => {
    const monthPrefix = `${currentMonthKey}-`;
    const payments = fixedExpensePayments.filter((row) => String(row.date || "").startsWith(monthPrefix));
    const legacy = companyExpenses.filter(
      (row) => resolveCompanyExpenseKind(row) === "fixed" && String(row.date || "").startsWith(monthPrefix),
    );
    let unpaidTotal = 0;
    let paidTotal = 0;
    let unpaidCount = 0;
    let paidCount = 0;
    for (const row of payments) {
      if (isBankLinkedPayment(row)) {
        paidTotal += Number(row.amount) || 0;
        paidCount += 1;
      } else {
        unpaidTotal += Number(row.amount) || 0;
        unpaidCount += 1;
      }
    }
    for (const row of legacy) {
      if (isBankLinkedExpense(row)) {
        paidTotal += Number(row.amount) || 0;
        paidCount += 1;
      } else {
        unpaidTotal += Number(row.amount) || 0;
        unpaidCount += 1;
      }
    }
    return { unpaidTotal, paidTotal, unpaidCount, paidCount };
  }, [companyExpenses, fixedExpensePayments, currentMonthKey]);

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

  const categoryStats = useMemo(
    () =>
      buildLedgerCategoryStats(
        companyExpenses,
        fixedExpensePayments,
        fixedExpenses,
        periodFilter.startDate,
        periodFilter.endDate,
      ),
    [companyExpenses, fixedExpensePayments, fixedExpenses, periodFilter.endDate, periodFilter.startDate],
  );

  const expenseCategoryOptions = useMemo(() => {
    const categories = [...expenseCategories];
    if (manualModal?.category && !categories.includes(manualModal.category)) {
      categories.unshift(manualModal.category);
    }
    return categories.map((category) => ({ label: category, value: category }));
  }, [expenseCategories, manualModal?.category]);

  const sortedFixedExpenses = useMemo(
    () => [...fixedExpenses].sort((a, b) => String(a.name).localeCompare(String(b.name), "ko")),
    [fixedExpenses],
  );

  const fixedCategorySelectOptions = useMemo(
    () =>
      buildFixedCategorySelectOptions(fixedExpenses, fixedExpenseCategories, fixedExpenseModal?.category),
    [fixedExpenses, fixedExpenseCategories, fixedExpenseModal?.category],
  );

  const manualFixedCategoryOptions = useMemo(
    () =>
      buildFixedCategorySelectOptions(
        fixedExpenses,
        fixedExpenseCategories,
        manualModal?.source === "fixedPayment" ? manualModal.category : "",
      ),
    [fixedExpenses, fixedExpenseCategories, manualModal?.category, manualModal?.source],
  );

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
    setLinkMessage("");
    setBankLinkModalOpen(false);
    setManualModal({
      mode: "edit",
      source: "fixedPayment",
      id: row.id,
      fixedExpenseId: row.fixedExpenseId,
      kind: "fixed",
      date: row.date,
      category: resolveFixedPaymentCategory(row, fixedExpenses),
      description: resolveFixedPaymentDescription(row, fixedExpenses),
      amount: String(row.amount || ""),
      memo: row.memo || "",
    });
  };

  const openCalendarEntryEdit = (entry: LedgerCalendarEntry) => {
    if (entry.source === "fixedPayment") {
      const row = fixedExpensePayments.find((item) => item.id === entry.id);
      if (row) openEditFixedPayment(row);
      return;
    }
    const row = companyExpenses.find((item) => item.id === entry.id);
    if (row) openEditManual(row);
  };

  const openCreateFixedExpense = () => {
    setFormError("");
    setFixedExpenseModal(
      emptyFixedExpenseForm(fixedExpenseCategories[0] || FIXED_CATEGORY_OPTIONS[0]),
    );
  };

  const openEditFixedExpense = (row: FixedExpense) => {
    setFormError("");
    setFixedExpenseModal({
      mode: "edit",
      id: row.id,
      name: row.name,
      category: row.category,
      amount: String(row.amount || ""),
      cycle: row.cycle,
      paymentDayOfMonth: String(normalizeFixedExpensePaymentDay(row.paymentDayOfMonth)),
      startDate: row.startDate || todayISO(),
      memo: row.memo || "",
      isActive: row.isActive,
    });
  };

  const saveFixedExpense = () => {
    if (!fixedExpenseModal || !setFixedExpenses) return;
    const error = validateFixedExpenseInput(fixedExpenseModal);
    if (error) {
      setFormError(error);
      return;
    }
    const payload: FixedExpense = {
      id: fixedExpenseModal.id || makeLedgerId(),
      name: fixedExpenseModal.name.trim(),
      category: fixedExpenseModal.category.trim(),
      amount: parseLedgerAmount(fixedExpenseModal.amount),
      cycle: fixedExpenseModal.cycle,
      paymentDayOfMonth: normalizeFixedExpensePaymentDay(fixedExpenseModal.paymentDayOfMonth),
      startDate: fixedExpenseModal.startDate || undefined,
      memo: fixedExpenseModal.memo.trim() || undefined,
      isActive: fixedExpenseModal.isActive,
    };
    const existingFixed = fixedExpenseModal.id
      ? fixedExpenses.find((row) => row.id === fixedExpenseModal.id)
      : null;
    recordAudit({
      entityType: "fixedExpense",
      entityId: payload.id,
      entityLabel: payload.name,
      screen: L.pageTitle,
      action: fixedExpenseModal.mode === "edit" ? "update" : "create",
      before: existingFixed ? snapshotFixedExpenseForAudit(existingFixed) : undefined,
      after: snapshotFixedExpenseForAudit(payload),
      fields: FIXED_EXPENSE_AUDIT_FIELDS,
      user: currentUser,
    });
    if (fixedExpenseModal.mode === "edit" && fixedExpenseModal.id) {
      const editingId = fixedExpenseModal.id;
      setFixedExpenses((prev) =>
        prev.map((row) =>
          row.id === editingId
            ? {
                ...row,
                name: payload.name,
                category: payload.category,
                amount: payload.amount,
                cycle: payload.cycle,
                paymentDayOfMonth: payload.paymentDayOfMonth,
                startDate: payload.startDate,
                memo: payload.memo,
                isActive: payload.isActive,
              }
            : row,
        ),
      );
    } else {
      setFixedExpenses((prev) => [payload, ...prev]);
    }
    setFixedExpenseCategories((prev) => mergeFixedExpenseCategory(prev, payload.category, fixedExpenses));
    setFixedExpenseModal(null);
    setFormError("");
  };

  const saveManual = () => {
    if (!manualModal) return;
    const error = validateCompanyExpenseInput(manualModal);
    if (error) {
      setFormError(error);
      return;
    }
    if (manualModal.mode === "edit" && manualModal.source === "fixedPayment" && manualModal.id) {
      const category = manualModal.category.trim();
      if (!category) {
        setFormError("\uCE74\uD14C\uACE0\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
        return;
      }

      setFixedExpensePayments?.((prev) =>
        prev.map((row) =>
          row.id === manualModal.id
            ? {
                ...row,
                date: manualModal.date,
                amount: parseLedgerAmount(manualModal.amount),
                category: category,
                memo: manualModal.description.trim() || manualModal.memo.trim(),
              }
            : row,
        ),
      );

      setFixedExpenseCategories((prev) => mergeFixedExpenseCategory(prev, category, fixedExpenses));
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
      kind: manualModal.mode === "create" ? "variable" : manualModal.kind,
      createdBy: currentUser?.name || currentUser?.loginId || "",
      createdAt: new Date().toISOString(),
    };
    const existingExpense = manualModal.id
      ? companyExpenses.find((row) => row.id === manualModal.id)
      : null;
    recordAudit({
      entityType: "companyExpense",
      entityId: payload.id,
      entityLabel: `${payload.date} · ${payload.description || payload.category}`,
      screen: L.pageTitle,
      action: manualModal.mode === "edit" ? "update" : "create",
      before: existingExpense ? snapshotCompanyExpenseForAudit(existingExpense) : undefined,
      after: snapshotCompanyExpenseForAudit(payload),
      fields: COMPANY_EXPENSE_AUDIT_FIELDS,
      user: currentUser,
    });
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

  const editingFixedPayment = useMemo(() => {
    if (!manualModal?.id || manualModal.source !== "fixedPayment") return null;
    return fixedExpensePayments.find((row) => row.id === manualModal.id) || null;
  }, [fixedExpensePayments, manualModal?.id, manualModal?.source]);

  const canLinkBankFromFixedPaymentEdit = Boolean(
    manualModal?.mode === "edit" &&
      manualModal.source === "fixedPayment" &&
      manualModal.id &&
      editingFixedPayment &&
      !isBankLinkedPayment(editingFixedPayment) &&
      setFixedExpensePayments &&
      setBankTransactions,
  );

  const linkableBankTransactions = useMemo(
    () =>
      listBankTransactionsForLedgerLink(
        bankTransactions,
        { companyExpenses, fixedExpensePayments },
        { excludePaymentId: manualModal?.id },
      ),
    [bankTransactions, companyExpenses, fixedExpensePayments, manualModal?.id],
  );

  const linkBankTransactionToFixedPayment = (tx: BankTransaction) => {
    const paymentId = manualModal?.id;
    if (!paymentId || !setFixedExpensePayments || !setBankTransactions) return;

    const payment = fixedExpensePayments.find((row) => row.id === paymentId);
    const synced = resolveFixedPaymentFieldsFromBankTx(tx);
    setFixedExpensePayments((prev) => linkFixedExpensePaymentToBankTx(prev, paymentId, tx.id, tx));
    setManualModal((prev) =>
      prev && prev.id === paymentId
        ? {
            ...prev,
            ...(synced.date ? { date: synced.date } : {}),
            ...(synced.amount != null ? { amount: String(synced.amount) } : {}),
          }
        : prev,
    );
    setBankTransactions((prev) =>
      prev.map((row) =>
        row.id === tx.id
          ? { ...row, linkedFixedExpensePaymentId: paymentId, linkedCompanyExpenseId: undefined }
          : row,
      ),
    );
    if (payment) {
      recordAudit({
        entityType: "fixedExpensePayment",
        entityId: paymentId,
        entityLabel: `${payment.date} \u00B7 ${formatKRW(payment.amount)}`,
        screen: L.pageTitle,
        action: "update",
        before: snapshotFixedExpensePaymentForAudit(payment),
        after: snapshotFixedExpensePaymentForAudit({
          ...payment,
          bankTransactionId: tx.id,
          ...(synced.amount != null ? { amount: synced.amount } : {}),
          ...(synced.date ? { date: synced.date } : {}),
        }),
        fields: FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS,
        user: currentUser,
      });
    }
    setBankLinkModalOpen(false);
    setLinkMessage(L.linkFromBankDone);
  };

  const refreshBankLedger = () => {
    if (!setBankTransactions || !setFixedExpensePayments) return;
    if (!bankTransactions.length) {
      setBankRefreshMessage(L.refreshBankLedgerEmpty);
      return;
    }

    setBankRefreshLoading(true);
    setBankRefreshMessage("");

    const result = refreshCompanyLedgerFromBankTransactions({
      bankTransactions,
      fixedExpenses,
      fixedExpensePayments: fixedExpensePayments || [],
      companyExpenses,
      bankLedgerRules,
      createdBy: currentUser?.name || currentUser?.loginId || "",
    });

    setFixedExpensePayments(result.fixedExpensePayments);
    setBankTransactions(result.bankTransactions);
    if (result.companyExpenses !== companyExpenses) {
      setCompanyExpenses(result.companyExpenses);
    }

    const learnedMessage = formatBankLearnAutoMessage({
      fixed: result.learnedFixedCount,
      manual: result.learnedManualCount,
      folder: result.learnedFolderCount,
    });

    const totalLinked = result.linkedPaymentCount + result.learnedFixedCount + result.learnedManualCount;
    recordSummaryAudit({
      entityType: "system",
      entityId: "company-ledger-bank-refresh",
      entityLabel: L.refreshBankLedger,
      screen: L.pageTitle,
      action: "import",
      fieldLabel: L.refreshBankLedger,
      after: L.refreshBankLedgerDone(result.generatedPaymentCount, totalLinked, learnedMessage),
      user: currentUser,
    });

    setBankRefreshMessage(
      L.refreshBankLedgerDone(result.generatedPaymentCount, totalLinked, learnedMessage),
    );
    setBankRefreshLoading(false);
  };

  const deleteManual = (row: CompanyExpense) => {
    const message = isBankLinkedExpense(row) ? L.deleteBankLinkedConfirm : L.deleteConfirm;
    if (!window.confirm(message)) return;
    recordAudit({
      entityType: "companyExpense",
      entityId: row.id,
      entityLabel: `${row.date} · ${row.description || row.category}`,
      screen: L.pageTitle,
      action: "delete",
      before: snapshotCompanyExpenseForAudit(row),
      fields: COMPANY_EXPENSE_AUDIT_FIELDS,
      user: currentUser,
    });
    setCompanyExpenses((prev) => prev.filter((item) => item.id !== row.id));
    if (isBankLinkedExpense(row)) unlinkBankCompanyExpense(row.id);
  };

  const deleteFixedPayment = (row: FixedExpensePayment) => {
    const message = isBankLinkedPayment(row) ? L.deleteBankLinkedConfirm : L.deleteConfirm;
    if (!window.confirm(message)) return;
    recordAudit({
      entityType: "fixedExpensePayment",
      entityId: row.id,
      entityLabel: `${row.date} \u00B7 ${formatKRW(row.amount)}`,
      screen: L.pageTitle,
      action: "delete",
      before: snapshotFixedExpensePaymentForAudit(row),
      fields: FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS,
      user: currentUser,
    });
    setFixedExpensePayments?.((prev) => prev.filter((item) => item.id !== row.id));
    if (isBankLinkedPayment(row)) unlinkBankFixedPayment(row.id);
  };

  return (
    <div className="erp-company-ledger-page space-y-4 md:space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen size={22} className="text-slate-700" />
            <h1 className="erp-text-page-title font-black text-slate-900">{L.pageTitle}</h1>
          </div>
          <p className="erp-text-body mt-1 text-slate-500">{L.pageDesc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {setBankTransactions && setFixedExpensePayments ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              disabled={bankRefreshLoading}
              title={L.refreshBankLedgerHint}
              onClick={refreshBankLedger}
            >
              <RefreshCw size={16} className={bankRefreshLoading ? "mr-2 animate-spin" : "mr-2"} />
              {L.refreshBankLedger}
            </Button>
          ) : null}
          {activeTab === "manual" ? (
            <>
              <Button className="rounded-2xl" onClick={openCreateManual}>
                <Plus size={16} /> {L.addManual}
              </Button>
              {setFixedExpenses ? (
                <Button variant="outline" className="rounded-2xl" onClick={openCreateFixedExpense}>
                  <Plus size={16} /> {L.addFixedItem}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {bankRefreshMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 erp-text-body font-semibold text-emerald-700">
          {bankRefreshMessage}
        </div>
      ) : null}

      <div className="erp-ledger-page-summary-grid">
        <SummaryCard
          compact
          label={L.variableExpense}
          value={`${formatKRW(thisMonthVariableTotal)}${L.won}`}
          tone="text-rose-600"
          sub={formatMonthLabel(currentMonthKey)}
        />
        <SummaryCard
          compact
          label={L.fixedExpense}
          value={`${formatKRW(thisMonthFixedTotal)}${L.won}`}
          tone="text-amber-600"
          sub={`${L.unpaidFixedExpense} ${thisMonthFixedBreakdown.unpaidCount}${L.count} ${formatKRW(thisMonthFixedBreakdown.unpaidTotal)}${L.won}`}
        />
        <SummaryCard
          compact
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
                <h2 className="erp-text-section font-bold text-amber-800">{L.fixedItemSection}</h2>
                <span className="erp-text-caption font-semibold text-slate-500">
                  {sortedFixedExpenses.length}
                  {L.count}
                </span>
              </div>
              <MobileRecordList>
                {sortedFixedExpenses.length ? (
                  sortedFixedExpenses.map((row) => (
                    <MobileRecordCard
                      key={`fixed-item-${row.id}`}
                      title={row.name}
                      subtitle={formatFixedExpensePaymentDay(row.paymentDayOfMonth)}
                      badge={<CategoryBadge label={row.category} />}
                      fields={[
                        { label: L.amount, value: `${formatKRW(row.amount)}${L.won}`, tone: "danger" },
                        { label: L.cycle, value: fixedCycleLabel(row.cycle), tone: "muted" },
                        {
                          label: L.monthlyEquiv,
                          value: `${formatKRW(fixedMonthlyAmount(row))}${L.won}`,
                          tone: "muted",
                        },
                        { label: L.status, value: row.isActive ? L.active : L.inactive, tone: "muted" },
                      ]}
                      actions={
                        setFixedExpenses ? (
                          <button type="button" className="erp-mobile-action-btn" onClick={() => openEditFixedExpense(row)}>
                            <Pencil size={15} /> {L.edit}
                          </button>
                        ) : undefined
                      }
                    />
                  ))
                ) : (
                  <MobileRecordCard empty emptyLabel={L.emptyFixedItems} />
                )}
              </MobileRecordList>
              <DesktopTableWrap>
                <table className="erp-ledger-table min-w-full">
                  <thead>
                    <tr>
                      <th>{L.itemName}</th>
                      <th>{L.category}</th>
                      <th className="text-right">{L.amount}</th>
                      <th>{L.cycle}</th>
                      <th>{L.paymentDay}</th>
                      <th>{L.status}</th>
                      <th className="erp-table-export-skip">{L.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFixedExpenses.length ? (
                      sortedFixedExpenses.map((row) => (
                        <tr key={`fixed-item-${row.id}`}>
                          <td className="font-semibold text-slate-900">{row.name}</td>
                          <td>
                            <CategoryBadge label={row.category} />
                          </td>
                          <td className="text-right font-bold text-rose-600">
                            {formatKRW(row.amount)}
                            {L.won}
                          </td>
                          <td>{fixedCycleLabel(row.cycle)}</td>
                          <td>{formatFixedExpensePaymentDay(row.paymentDayOfMonth)}</td>
                          <td>
                            <span className={row.isActive ? "text-emerald-600" : "text-slate-400"}>
                              {row.isActive ? L.active : L.inactive}
                            </span>
                          </td>
                          <td className="erp-table-export-skip">
                            {setFixedExpenses ? (
                              <div className="erp-ledger-row-actions">
                                <button
                                  type="button"
                                  className="erp-ledger-icon-btn"
                                  onClick={() => openEditFixedExpense(row)}
                                  aria-label={L.edit}
                                >
                                  <Pencil size={15} />
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="erp-ledger-empty">
                          {L.emptyFixedItems}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </DesktopTableWrap>
            </section>

            <section className="space-y-5 border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="erp-text-section font-bold text-amber-700">{L.fixedExpense}</h2>
                <span className="erp-text-caption font-semibold text-slate-500">
                  {filteredFixedRows.length}
                  {L.count} · {formatKRW(sumManualLedgerRows(filteredFixedRows))}
                  {L.won}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryCard
                  label={L.unpaidFixedExpense}
                  value={`${formatKRW(sumManualLedgerRows(filteredUnpaidFixedRows))}${L.won}`}
                  tone="text-amber-700"
                  sub={`${filteredUnpaidFixedRows.length}${L.count} · ${L.unpaidFixedHint}`}
                />
                <SummaryCard
                  label={L.paidFixedExpense}
                  value={`${formatKRW(sumManualLedgerRows(filteredPaidFixedRows))}${L.won}`}
                  tone="text-emerald-600"
                  sub={`${filteredPaidFixedRows.length}${L.count} · ${L.paidFixedHint}`}
                />
              </div>

              <div className="space-y-3 rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="erp-text-body font-bold text-amber-800">{L.unpaidFixedExpense}</h3>
                  <span className="erp-text-caption font-semibold text-amber-700">
                    {filteredUnpaidFixedRows.length}
                    {L.count} · {formatKRW(sumManualLedgerRows(filteredUnpaidFixedRows))}
                    {L.won}
                  </span>
                </div>
                <FixedLedgerRowsPanel
                  rows={filteredUnpaidFixedRows}
                  emptyLabel={L.emptyUnpaidFixed}
                  showUnpaidBadge
                  fixedExpenses={fixedExpenses}
                  canEditPayments={Boolean(setFixedExpensePayments)}
                  onEditManual={openEditManual}
                  onEditFixedPayment={openEditFixedPayment}
                  onDeleteManual={deleteManual}
                  onDeleteFixedPayment={deleteFixedPayment}
                />
              </div>

              <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="erp-text-body font-bold text-emerald-800">{L.paidFixedExpense}</h3>
                  <span className="erp-text-caption font-semibold text-emerald-700">
                    {filteredPaidFixedRows.length}
                    {L.count} · {formatKRW(sumManualLedgerRows(filteredPaidFixedRows))}
                    {L.won}
                  </span>
                </div>
                <FixedLedgerRowsPanel
                  rows={filteredPaidFixedRows}
                  emptyLabel={L.emptyPaidFixed}
                  showUnpaidBadge={false}
                  fixedExpenses={fixedExpenses}
                  canEditPayments={Boolean(setFixedExpensePayments)}
                  onEditManual={openEditManual}
                  onEditFixedPayment={openEditFixedPayment}
                  onDeleteManual={deleteManual}
                  onDeleteFixedPayment={deleteFixedPayment}
                />
              </div>
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

      {activeTab === "calendar" ? (
        <CompanyLedgerCalendar
          companyExpenses={companyExpenses}
          fixedExpensePayments={fixedExpensePayments}
          fixedExpenses={fixedExpenses}
          onEditEntry={openCalendarEntryEdit}
        />
      ) : null}

      {activeTab === "stats" ? (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="space-y-4 p-4 md:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 size={18} className="text-slate-600" />
                  <h2 className="erp-text-section font-bold text-slate-900">{L.statsTitle}</h2>
                </div>
                <p className="erp-text-caption mt-1 text-slate-500">{L.statsDesc}</p>
              </div>
              <TableExportToolbar
                getTable={() => statsTableRef.current}
                fileName={`${L.pageTitle}_stats_${periodKey}`}
                title={`${L.pageTitle} ${L.statsTitle}`}
                hidePdf
                className="justify-end"
              />
            </div>

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

            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard
                label={L.variableExpense}
                value={`${formatKRW(categoryStats.summary.variableTotal)}${L.won}`}
                tone="text-rose-600"
                sub={`${categoryStats.summary.variableCount}${L.count}`}
              />
              <SummaryCard
                label={L.fixedExpense}
                value={`${formatKRW(categoryStats.summary.fixedTotal)}${L.won}`}
                tone="text-amber-600"
                sub={`${categoryStats.summary.fixedCount}${L.count}`}
              />
              <SummaryCard
                label={L.grandTotal}
                value={`${formatKRW(categoryStats.summary.grandTotal)}${L.won}`}
                tone="text-slate-900"
                sub={`${categoryStats.summary.totalCount}${L.count}`}
              />
            </div>

            <MobileRecordList>
              {categoryStats.rows.length ? (
                categoryStats.rows.map((row) => (
                  <MobileRecordCard
                    key={row.category}
                    title={row.category}
                    subtitle={`${row.sharePercent}% ${L.share}`}
                    fields={[
                      { label: L.variableExpense, value: `${formatKRW(row.variableTotal)}${L.won}`, tone: "danger" },
                      { label: L.fixedExpense, value: `${formatKRW(row.fixedTotal)}${L.won}`, tone: "muted" },
                      { label: L.grandTotal, value: `${formatKRW(row.grandTotal)}${L.won}` },
                      { label: L.count, value: `${row.totalCount}${L.count}` },
                    ]}
                  />
                ))
              ) : (
                <MobileRecordCard empty emptyLabel={L.statsEmpty} />
              )}
            </MobileRecordList>

            <DesktopTableWrap>
              <table ref={statsTableRef} className="erp-ledger-table erp-ledger-stats-table min-w-full">
                <thead>
                  <tr>
                    <th>{L.category}</th>
                    <th className="text-right">{L.variableExpense}</th>
                    <th className="text-right">{L.fixedExpense}</th>
                    <th className="text-right">{L.grandTotal}</th>
                    <th className="text-right">{L.count}</th>
                    <th>{L.share}</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryStats.rows.length ? (
                    categoryStats.rows.map((row) => (
                      <tr key={row.category}>
                        <td>
                          <CategoryBadge label={row.category} />
                        </td>
                        <td className="text-right text-rose-600">
                          {row.variableTotal > 0 ? `${formatKRW(row.variableTotal)}${L.won}` : "-"}
                        </td>
                        <td className="text-right text-amber-600">
                          {row.fixedTotal > 0 ? `${formatKRW(row.fixedTotal)}${L.won}` : "-"}
                        </td>
                        <td className="text-right font-bold text-slate-900">
                          {formatKRW(row.grandTotal)}
                          {L.won}
                        </td>
                        <td className="text-right text-slate-600">
                          {row.totalCount}
                          {L.count}
                        </td>
                        <td>
                          <div className="erp-ledger-stat-share">
                            <div className="erp-ledger-stat-share-bar" aria-hidden="true">
                              <div className="erp-ledger-stat-share-fill" style={{ width: `${Math.min(row.sharePercent, 100)}%` }} />
                            </div>
                            <span className="erp-text-caption min-w-[3rem] font-semibold text-slate-600">{row.sharePercent}%</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="erp-ledger-empty">
                        {L.statsEmpty}
                      </td>
                    </tr>
                  )}
                </tbody>
                {categoryStats.rows.length ? (
                  <tfoot>
                    <tr>
                      <td className="font-bold">{L.total}</td>
                      <td className="text-right font-bold text-rose-600">
                        {formatKRW(categoryStats.summary.variableTotal)}
                        {L.won}
                      </td>
                      <td className="text-right font-bold text-amber-600">
                        {formatKRW(categoryStats.summary.fixedTotal)}
                        {L.won}
                      </td>
                      <td className="text-right font-black text-slate-900">
                        {formatKRW(categoryStats.summary.grandTotal)}
                        {L.won}
                      </td>
                      <td className="text-right font-bold text-slate-600">
                        {categoryStats.summary.totalCount}
                        {L.count}
                      </td>
                      <td className="font-bold text-slate-600">100%</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </DesktopTableWrap>
          </CardContent>
        </Card>
      ) : null}

      {fixedExpenseModal ? (
        <div
          className="erp-ledger-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFixedExpenseModal(null);
          }}
        >
          <div className="erp-ledger-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="erp-text-section font-bold">
                {fixedExpenseModal.mode === "create" ? L.addFixedItem : L.editFixedItem}
              </h2>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
                onClick={() => setFixedExpenseModal(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <Field label={L.itemName}>
                <Input
                  value={fixedExpenseModal.name}
                  onChange={(e) => setFixedExpenseModal((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                />
              </Field>
              <Field label={L.category}>
                <AutocompleteInput
                  key={fixedExpenseModal.id || "create"}
                  value={fixedExpenseModal.category}
                  options={fixedCategorySelectOptions}
                  placeholder={L.category}
                  {...LEDGER_CATEGORY_AUTOCOMPLETE_PROPS}
                  onChange={(value) =>
                    setFixedExpenseModal((prev) => (prev ? { ...prev, category: String(value || "").trim() } : prev))
                  }
                />
                <p className="mt-1.5 text-xs font-semibold text-slate-500">
                  {"\uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uCE74\uD14C\uACE0\uB9AC\uB294 \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694."}
                </p>
              </Field>
              <Field label={L.amountWon}>
                <Input
                  inputMode="numeric"
                  value={fixedExpenseModal.amount}
                  onChange={(e) => setFixedExpenseModal((prev) => (prev ? { ...prev, amount: e.target.value } : prev))}
                />
              </Field>
              <Field label={L.cycle}>
                <div className="flex flex-wrap gap-2">
                  {FIXED_CYCLE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={fixedExpenseModal.cycle === option.value ? "default" : "outline"}
                      className="rounded-2xl"
                      onClick={() => setFixedExpenseModal((prev) => (prev ? { ...prev, cycle: option.value } : prev))}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </Field>
              <Field label={L.paymentDay}>
                <select
                  className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-900 md:px-4 md:py-3"
                  value={fixedExpenseModal.paymentDayOfMonth}
                  onChange={(e) =>
                    setFixedExpenseModal((prev) => (prev ? { ...prev, paymentDayOfMonth: e.target.value } : prev))
                  }
                >
                  {PAYMENT_DAY_OPTIONS.map((day) => (
                    <option key={day} value={day}>
                      {formatFixedExpensePaymentDay(Number(day))}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={L.applyStartDate}>
                <KoreanDateInput
                  value={fixedExpenseModal.startDate}
                  onChange={(event) =>
                    setFixedExpenseModal((prev) => (prev ? { ...prev, startDate: event.target.value } : prev))
                  }
                />
              </Field>
              <Field label={L.memoOptional}>
                <Input
                  value={fixedExpenseModal.memo}
                  onChange={(e) => setFixedExpenseModal((prev) => (prev ? { ...prev, memo: e.target.value } : prev))}
                />
              </Field>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={fixedExpenseModal.isActive}
                  onChange={(e) => setFixedExpenseModal((prev) => (prev ? { ...prev, isActive: e.target.checked } : prev))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="erp-text-caption font-semibold text-slate-600">{L.activeStatus}</span>
              </label>
              {formError ? <p className="erp-text-caption font-semibold text-rose-600">{formError}</p> : null}
              {fixedExpenseModal.mode === "edit" && fixedExpenseModal.id ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-2xl"
                  onClick={() =>
                    setBankLinkView({
                      fixedExpenseId: fixedExpenseModal.id!,
                      title: fixedExpenseModal.name,
                    })
                  }
                >
                  <Link2 size={16} className="mr-2" />
                  {L.viewBankLinks}
                </Button>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" className="rounded-2xl" onClick={() => setFixedExpenseModal(null)}>
                  {L.cancel}
                </Button>
                <Button className="rounded-2xl" onClick={saveFixedExpense}>
                  {L.save}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {manualModal ? (
        <div
          className="erp-ledger-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setBankLinkModalOpen(false);
              setManualModal(null);
            }
          }}
        >
          <div className="erp-ledger-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="erp-text-section font-bold">
                {manualModal.mode === "create"
                  ? L.addManual
                  : manualModal.source === "fixedPayment" || manualModal.kind === "fixed"
                    ? L.editFixed
                    : L.editManual}
              </h2>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
                onClick={() => {
                  setBankLinkModalOpen(false);
                  setManualModal(null);
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              {manualModal.mode === "edit" && (manualModal.source === "fixedPayment" || manualModal.kind === "fixed") ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="erp-text-caption font-semibold text-slate-500">{L.section}</span>
                  <ExpenseKindBadge kind="fixed" />
                </div>
              ) : null}
              <Field label={L.expenseDate}>
                <KoreanDateInput
                  value={manualModal.date}
                  onChange={(event) => setManualModal((prev) => (prev ? { ...prev, date: event.target.value } : prev))}
                />
              </Field>
              <Field label={L.category}>
                {manualModal.source === "fixedPayment" || manualModal.kind === "fixed" ? (
                  <>
                    <AutocompleteInput
                      key={`${manualModal.id || "create"}-${manualModal.source || "expense"}`}
                      value={manualModal.category}
                      options={manualFixedCategoryOptions}
                      placeholder={L.category}
                      {...LEDGER_CATEGORY_AUTOCOMPLETE_PROPS}
                      onChange={(value) =>
                        setManualModal((prev) => (prev ? { ...prev, category: String(value || "").trim() } : prev))
                      }
                    />
                    <p className="mt-1.5 text-xs font-semibold text-slate-500">
                      {manualModal.source === "fixedPayment"
                        ? "\uC774 \uB0A9\uBD80 \uBAA9\uB85D\uC758 \uCE74\uD14C\uACE0\uB9AC\uB9CC \uBCC0\uACBD\uB429\uB2C8\uB2E4. \uACE0\uC815\uBE44 \uD56D\uBAA9 \uCE74\uD14C\uACE0\uB9AC\uB294 \uACE0\uC815\uBE44 \uD56D\uBAA9 \uC218\uC815\uC5D0\uC11C \uBCC0\uACBD\uD558\uC138\uC694."
                        : "\uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uCE74\uD14C\uACE0\uB9AC\uB294 \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694."}
                    </p>
                  </>
                ) : (
                  <>
                    <AutocompleteInput
                      key={`${manualModal.id || "create"}-variable`}
                      value={manualModal.category}
                      options={expenseCategoryOptions}
                      placeholder={L.category}
                      {...LEDGER_CATEGORY_AUTOCOMPLETE_PROPS}
                      onChange={(value) => setManualModal((prev) => (prev ? { ...prev, category: value.trim() } : prev))}
                    />
                    <p className="mt-1.5 text-xs font-semibold text-slate-500">
                      {"\uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uCE74\uD14C\uACE0\uB9AC\uB294 \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694."}
                    </p>
                  </>
                )}
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
              {canLinkBankFromFixedPaymentEdit ? (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-2xl"
                    onClick={() => {
                      setLinkMessage("");
                      setBankLinkModalOpen(true);
                    }}
                  >
                    <Link2 size={16} className="mr-2" />
                    {L.linkFromBank}
                  </Button>
                </div>
              ) : null}
              {manualModal.mode === "edit" &&
              manualModal.source === "fixedPayment" &&
              manualModal.fixedExpenseId ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-2xl"
                  onClick={() =>
                    setBankLinkView({
                      fixedExpenseId: manualModal.fixedExpenseId!,
                      paymentId: manualModal.id,
                      title: manualModal.description || resolveFixedExpenseCategory(manualModal.fixedExpenseId, fixedExpenses),
                    })
                  }
                >
                  <Link2 size={16} className="mr-2" />
                  {L.viewBankLinks}
                </Button>
              ) : null}
              {linkMessage ? <p className="erp-text-caption font-semibold text-emerald-700">{linkMessage}</p> : null}
              {formError ? <p className="erp-text-caption font-semibold text-rose-600">{formError}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => {
                    setBankLinkModalOpen(false);
                    setManualModal(null);
                  }}
                >
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

      {bankLinkModalOpen && manualModal && typeof document !== "undefined"
        ? createPortal(
            <div
              className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setBankLinkModalOpen(false);
              }}
            >
              <div
                className="erp-ledger-modal max-w-2xl"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={L.linkFromBankTitle}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="erp-text-section font-bold">{L.linkFromBankTitle}</h2>
                    <p className="mt-1 erp-text-caption text-slate-500">{L.linkFromBankDesc}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
                    onClick={() => setBankLinkModalOpen(false)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="max-h-96 space-y-2 overflow-auto">
                  {linkableBankTransactions.length ? (
                    linkableBankTransactions.map((tx) => (
                      <button
                        key={tx.id}
                        type="button"
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-amber-300 hover:bg-amber-50"
                        onClick={() => linkBankTransactionToFixedPayment(tx)}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">
                            {tx.description || tx.counterpartyName || "-"}
                          </span>
                          <span className="text-sm font-bold text-red-600">
                            {formatKRW(tx.withdrawal)}
                            {L.won}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {formatBankTransactionDateTime(tx.transactionAt)}
                          {tx.counterpartyName ? ` \u00B7 ${tx.counterpartyName}` : ""}
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                      {L.linkFromBankEmpty}
                    </p>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {bankLinkView && typeof document !== "undefined"
        ? createPortal(
            <div
              className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setBankLinkView(null);
              }}
            >
              <div
                className="erp-ledger-modal erp-ledger-modal--bank-links"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={L.viewBankLinksTitle}
              >
                <div className="erp-bank-links-modal-head">
                  <div className="min-w-0">
                    <h2 className="erp-text-section font-bold">{L.viewBankLinksTitle}</h2>
                    <p className="mt-1 erp-text-caption text-slate-500">{L.viewBankLinksDesc}</p>
                    <p className="mt-2 truncate text-sm font-bold text-slate-900">{bankLinkView.title}</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-100"
                    onClick={() => setBankLinkView(null)}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="erp-bank-links-table-wrap">
                  <table className="erp-bank-links-table">
                    <colgroup>
                      <col className="erp-bank-links-table__col-date" />
                      <col className="erp-bank-links-table__col-amount" />
                      <col className="erp-bank-links-table__col-status" />
                      <col className="erp-bank-links-table__col-tx" />
                      <col className="erp-bank-links-table__col-amount" />
                      <col className="erp-bank-links-table__col-desc" />
                      <col className="erp-bank-links-table__col-party" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>{L.viewBankLinksPaymentDate}</th>
                        <th className="text-right">{L.viewBankLinksPaymentAmount}</th>
                        <th>{L.viewBankLinksStatus}</th>
                        <th>{L.viewBankLinksTxAt}</th>
                        <th className="text-right">{L.viewBankLinksWithdrawal}</th>
                        <th>{L.viewBankLinksDescription}</th>
                        <th>{L.viewBankLinksCounterparty}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bankLinkViewRows.length ? (
                        bankLinkViewRows.map((row) => (
                          <tr key={row.paymentId}>
                            <td>{row.paymentDate}</td>
                            <td className="text-right font-semibold text-rose-600">
                              {formatKRW(row.paymentAmount)}
                            </td>
                            <td>
                              <span
                                className={
                                  row.linked ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"
                                }
                              >
                                {row.linked ? L.viewBankLinksLinked : L.viewBankLinksUnlinked}
                              </span>
                            </td>
                            <td className="text-slate-600">
                              {row.bankAt ? formatBankTransactionDateTime(row.bankAt) : "-"}
                            </td>
                            <td className="text-right font-semibold text-red-600">
                              {row.bankWithdrawal ? formatKRW(row.bankWithdrawal) : "-"}
                            </td>
                            <td className="font-medium text-slate-900" title={row.bankDescription || undefined}>
                              {row.bankDescription || "-"}
                            </td>
                            <td className="text-slate-700" title={row.bankCounterparty || undefined}>
                              {row.bankCounterparty || "-"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="erp-bank-links-table__empty">
                            {L.viewBankLinksEmpty}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="erp-bank-links-modal-foot">
                  <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setBankLinkView(null)}>
                    {L.cancel}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
