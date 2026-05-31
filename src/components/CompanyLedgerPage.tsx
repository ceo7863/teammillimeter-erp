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
  normalizeExpenseCategories,
  normalizeFixedExpenseCategories,
  resolveFixedPaymentCategory,
  normalizeFixedExpensePaymentDay,
  parseLedgerAmount,
  resolveCompanyExpenseKind,
  resolveCompanyExpenseFlow,
  isCompanyExpenseIncome,
  sumCompanyExpensesByFlow,
  type CompanyLedgerFlow,
  resolveFixedPaymentFieldsFromBankTx,
  getMonthKey,
  isFixedExpensePaymentBankLinked,
  isFixedExpensePaymentSettled,
  monthRangeISO,
  shiftMonthKey,
  sumExpensesForMonthByKind,
  todayISO,
  validateCompanyExpenseInput,
  validateFixedExpenseInput,
  validateFixedExpensePaymentInput,
  type CompanyExpense,
  type CompanyExpenseKind,
  type FixedExpense,
  type FixedExpenseCycle,
  type FixedExpensePayment,
  type LedgerPeriodKey,
} from "@/utils/companyLedger";
import type { ErpUser } from "@/utils/erpApi";
import { AutocompleteInput, CategorySuggestInput } from "@/components/AutocompleteInput";
import { CompanyLedgerCalendar } from "@/components/CompanyLedgerCalendar";
import type { LedgerCalendarEntry } from "@/utils/ledgerCalendar";
import { getLedgerCategoryColorStyle } from "@/utils/ledgerCalendar";
import { formatBankLearnAutoMessage, getLinkedCompanyExpenseForBankTx, listBankTransactionsForCompanyExpenseLink, listBankTransactionsForFixedPaymentLink, clearVariableExpenseLinkForBankTx, mergeBankTransactionsById, searchBankTransactionsForLedgerLink, resolveBankTxLedgerFlow, resolveBankTxLedgerAmount, type BankLearnRule } from "@/utils/bankCompanyLedger";
import { loadSmartLedgerRunSummary } from "@/utils/bankSmartLedger";
import { formatBankTransactionDateTime, type BankTransaction } from "@/utils/bankTransactions";
import { reconcileLedgerBankLinks, refreshCompanyLedgerFromBankTransactions } from "@/utils/fixedExpenseAutomation";
import { useAudit } from "@/context/AuditContext";
import { confirmDelete } from "@/utils/confirmDelete";
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
  { key: "calendar", label: "\uCE98\uB9B0\uB354" },
  { key: "manual", label: "\uC9C0\uCD9C \uB0B4\uC5ED" },
  { key: "monthly", label: "\uC6D4\uBCC4 \uC694\uC57D" },
  { key: "stats", label: "\uCE74\uD14C\uACE0\uB9AC \uBE44\uC911" },
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
  addIncome: "\uC785\uAE08 \uCD94\uAC00",
  editIncome: "\uC785\uAE08 \uC218\uC815",
  incomeEntry: "\uC785\uAE08 \uB0B4\uC5ED",
  emptyIncome: "\uD45C\uC2DC\uD560 \uC785\uAE08 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  thisMonthIncome: "\uC774\uBC88 \uB2EC \uC785\uAE08",
  incomeDate: "\uC785\uAE08\uC77C",
  ledgerFlow: "\uAD6C\uBD84",
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
  deleteFixedItemConfirm:
    "\uC774 \uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?\n\uC5F0\uACB0\uB41C \uB0A9\uBD80 \uB0B4\uC5ED\uACFC \uD1B5\uC7A5 \uD559\uC2B5 \uADDC\uCE59\uB3C4 \uD568\uAED8 \uC0AD\uC81C\uB429\uB2C8\uB2E4.",
  deleteFixedItemBankLinkedConfirm:
    "\uC774 \uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?\n\uC5F0\uACB0\uB41C \uB0A9\uBD80 \uB0B4\uC5ED\uACFC \uD1B5\uC7A5 \uD559\uC2B5 \uADDC\uCE59\uB3C4 \uD568\uAED8 \uC0AD\uC81C\uB429\uB2C8\uB2E4.\n\uD1B5\uC7A5 \uC5F0\uB3D9 \uB0A9\uBD80\uAC00 \uC788\uC73C\uBA74 \uAC00\uACC4\uBD80 \uC5F0\uB3D9\uB3C4 \uD574\uC81C\uB429\uB2C8\uB2E4.",
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
  fixedPaymentCategoryHint:
    "\uCE74\uD14C\uACE0\uB9AC \uBCC0\uACBD\uC740 \uC774 \uB0A9\uBD80 \uAE30\uB85D\uC5D0\uB9CC \uC801\uC6A9\uB429\uB2C8\uB2E4.",
  fixedPaymentItemHint:
    "\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD558\uBA74 \uC774 \uB0A9\uBD80 \uAE30\uB85D\uC774 \uD574\uB2F9 \uD56D\uBAA9\uC5D0 \uC5F0\uACB0\uB429\uB2C8\uB2E4.",
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
  editKind: "\uAD6C\uBD84",
  kindChangeDone: "\uB4F1\uB85D \uC720\uD615\uC774 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  kindChangeSaveManual: "\uC720\uD615 \uBCC0\uACBD \u00B7 \uBCC0\uB3D9\uC9C0\uCD9C\uB85C \uC800\uC7A5",
  kindChangeSaveFixed: "\uC720\uD615 \uBCC0\uACBD \u00B7 \uACE0\uC815\uBE44\uB85C \uC800\uC7A5",
  addFixedItem: "\uACE0\uC815\uBE44 \uD56D\uBAA9 \uCD94\uAC00",
  editFixedItem: "\uACE0\uC815\uBE44 \uD56D\uBAA9 \uC218\uC815",
  emptyFixedItems: "\uB4F1\uB85D\uB41C \uACE0\uC815\uBE44 \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  paymentDay: "\uB9E4\uC6D4 \uCD9C\uAE08\uC77C",
  unpaidFixedExpense: "\uD1B5\uC7A5 \uBBF8\uC5F0\uACB0 \uACE0\uC815\uBE44",
  paidFixedExpense: "\uD1B5\uC7A5 \uC5F0\uB3D9 \uACE0\uC815\uBE44",
  emptyUnpaidFixed: "\uD1B5\uC7A5 \uBBF8\uC5F0\uACB0 \uACE0\uC815\uBE44\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyPaidFixed: "\uD1B5\uC7A5 \uC5F0\uB3D9 \uC644\uB8CC \uACE0\uC815\uBE44\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  unpaidFixedBadge: "\uD1B5\uC7A5 \uBBF8\uC5F0\uACB0",
  unpaidFixedHint: "\uB0A9\uBD80 \uB4F1\uB85D\uC740 \uC788\uC9C0\uB9CC \uD1B5\uC7A5 \uAC70\uB798\uC640 \uC544\uC9C1 \uC5F0\uACB0\uB418\uC9C0 \uC54A\uC74C",
  paidFixedHint: "\uD1B5\uC7A5 \uAC70\uB798\uB0B4\uC5ED\uACFC \uC5F0\uB3D9 \uC644\uB8CC",
  linkFromBank: "\uD1B5\uC7A5\uB0B4\uC5ED\uC5D0\uC11C \uC5F0\uACB0\uD558\uAE30",
  linkFromBankTitle: "\uD1B5\uC7A5 \uB0B4\uC5ED \uC5F0\uACB0",
  linkFromBankDesc:
    "\uAC19\uC740 \uB2EC\u00B7\uBE44\uC2B7\uD55C \uAE08\uC561\u00B7\uC774\uB984\uC774 \uB9DE\uB294 \uCD9C\uAE08 \uB0B4\uC5ED\uC785\uB2C8\uB2E4. \uBCC0\uB3D9\uC9C0\uCD9C\uC5D0 \uC774\uBBF8 \uC5F0\uACB0\uB41C \uB0B4\uC5ED\uB3C4 \uD45C\uC2DC\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  linkFromBankSearch: "\uAC70\uB798\uB0B4\uC6A9 \u00B7 \uBA54\uBAA8 \u00B7 \uAE08\uC561 \uAC80\uC0C9",
  linkFromBankEmpty: "\uAE08\uC561\uACFC \uC774\uB984\uC774 \uB9DE\uB294 \uC5F0\uACB0 \uAC00\uB2A5\uD55C \uCD9C\uAE08 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  linkFromBankVariableLinkedBadge: "\uBCC0\uB3D9\uC9C0\uCD9C \uC5F0\uACB0\uC74C",
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
  resetLedger: "\uAC00\uACC4\uBD80 \uCD08\uAE30\uD654",
  resetLedgerConfirm:
    "\uD68C\uC0AC \uAC00\uACC4\uBD80 \uB370\uC774\uD130\uB97C \uCD08\uAE30\uD654\uD560\uAE4C\uC694?\n\n\uC0AD\uC81C \uB300\uC0C1:\n- \uBCC0\uB3D9\uC9C0\uCD9C \uB0B4\uC5ED\n- \uACE0\uC815\uBE44 \uB0A9\uBD80 \uB0B4\uC5ED\n- \uC9C0\uCD9C \uCE74\uD14C\uACE0\uB9AC\n- \uAC00\uACC4\uBD80 \uD559\uC2B5 \uADDC\uCE59(\uACE0\uC815\uBE44/\uBCC0\uB3D9\uC9C0\uCD9C)\n\n\uACE0\uC815\uBE44 \uB9C8\uC2A4\uD130(\uD56D\uBAA9 \uC815\uC758)\uB294 \uC720\uC9C0\uB429\uB2C8\uB2E4.\n\uD1B5\uC7A5 \uAC70\uB798\uC758 \uAC00\uACC4\uBD80 \uC5F0\uB3D9\uC774 \uD574\uC81C\uB429\uB2C8\uB2E4.\n(\uD3F4\uB354/\uC120\uACB0\uC81C \uD559\uC2B5 \uADDC\uCE59\uC740 \uC720\uC9C0)",
  resetLedgerDone: "\uAC00\uACC4\uBD80 \uB370\uC774\uD130\uB97C \uCD08\uAE30\uD654\uD588\uC2B5\uB2C8\uB2E4.",
  bankAutoLinked: "\uD1B5\uC7A5 \uC790\uB3D9 \uB4F1\uB85D",
  bankManualEntry: "\uC218\uAE30 \uC785\uB825",
  smartLedgerLastRun: "\uB9C8\uC9C0\uB9C9 \uC790\uB3D9 \uAC00\uACC4\uBD80",
  smartLedgerLastRunEmpty: "\uD1B5\uC7A5 \uD654\uBA74\uC5D0\uC11C \uC790\uB3D9 \uAC00\uACC4\uBD80\uB97C \uC2E4\uD589\uD558\uBA74 \uC694\uC57D\uC774 \uD45C\uC2DC\uB429\uB2C8\uB2E4.",
  atAGlanceTitle: "\uC774\uBC88 \uB2EC \uD55C\uB208\uC5D0",
  atAGlanceRecent: "\uCD5C\uADFC \uC9C0\uCD9C",
  atAGlanceCategories: "\uCE74\uD14C\uACE0\uB9AC\uBCC4",
  atAGlanceViewAll: "\uC804\uCCB4 \uB0B4\uC5ED",
  atAGlanceViewStats: "\uBE44\uC911 \uBCF4\uAE30",
  atAGlanceEmpty: "\uC774\uBC88 \uB2EC \uB4F1\uB85D\uB41C \uC9C0\uCD9C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  atAGlanceUnpaidAlert: (count: number, amount: string) =>
    `\uD1B5\uC7A5 \uBBF8\uC5F0\uACB0 \uACE0\uC815\uBE44 ${count}\uAC74 \u00B7 ${amount}\uC6D0`,
  atAGlanceBankLinked: (auto: number, manual: number) =>
    `\uD1B5\uC7A5 \uC5F0\uB3D9 ${auto}\uAC74 \u00B7 \uC218\uAE08 ${manual}\uAC74`,
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
  setBankLedgerRules?: React.Dispatch<React.SetStateAction<BankLearnRule[]>>;
  currentUser?: ErpUser | null;
};

type ManualModalState = {
  mode: "create" | "edit";
  source?: "expense" | "fixedPayment";
  id?: string;
  fixedExpenseId?: string;
  kind: CompanyExpenseKind;
  initialKind?: CompanyExpenseKind;
  flow: CompanyLedgerFlow;
  date: string;
  category: string;
  description: string;
  amount: string;
  memo: string;
};

const MANUAL_KIND_TOGGLE_OPTIONS: Array<{
  key: CompanyExpenseKind;
  label: string;
  tone: string;
  activeTone: string;
}> = [
  {
    key: "variable",
    label: "\uBCC0\uB3D9 \uC9C0\uCD9C",
    tone: "border-slate-200 bg-white text-slate-600",
    activeTone: "border-slate-900 bg-slate-900 text-white",
  },
  {
    key: "fixed",
    label: "\uACE0\uC815\uBE44",
    tone: "border-slate-200 bg-white text-slate-600",
    activeTone: "border-amber-600 bg-amber-600 text-white",
  },
];

function isManualRecordTypeSwitch(modal: ManualModalState) {
  if (modal.mode !== "edit" || !modal.id) return false;
  if (modal.source === "fixedPayment" && modal.kind === "variable") return true;
  if (modal.source === "expense" && modal.initialKind === "variable" && modal.kind === "fixed") return true;
  return false;
}

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
  return (
    item.type === "expense" &&
    resolveCompanyExpenseKind(item.row) === "variable" &&
    !isCompanyExpenseIncome(item.row)
  );
}

function isIncomeLedgerRow(item: ManualLedgerRow) {
  return item.type === "expense" && isCompanyExpenseIncome(item.row);
}

function isFixedLedgerRow(item: ManualLedgerRow) {
  if (item.type === "fixedPayment") return true;
  return item.type === "expense" && resolveCompanyExpenseKind(item.row) === "fixed";
}

function isPaidFixedLedgerRow(
  item: ManualLedgerRow,
  bankTransactions: BankTransaction[] = [],
  fixedExpensePayments: FixedExpensePayment[] = [],
  fixedExpenses: FixedExpense[] = [],
) {
  if (item.type === "fixedPayment") {
    return isFixedExpensePaymentSettled(
      item.row,
      fixedExpensePayments,
      bankTransactions,
      fixedExpenses,
    );
  }
  return isBankLinkedExpense(item.row, bankTransactions);
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

function LedgerAtAGlancePanel({
  monthLabel,
  variableTotal,
  incomeTotal,
  fixedTotal,
  grandTotal,
  categoryRows,
  recentRows,
  unpaidFixedCount,
  unpaidFixedTotal,
  bankAutoCount,
  bankManualCount,
  onViewAll,
  onViewStats,
  fixedExpenses,
  bankTransactions,
}: {
  monthLabel: string;
  variableTotal: number;
  incomeTotal: number;
  fixedTotal: number;
  grandTotal: number;
  categoryRows: Array<{ category: string; grandTotal: number; sharePercent: number }>;
  recentRows: ManualLedgerRow[];
  unpaidFixedCount: number;
  unpaidFixedTotal: number;
  bankAutoCount: number;
  bankManualCount: number;
  onViewAll: () => void;
  onViewStats: () => void;
  fixedExpenses: FixedExpense[];
  bankTransactions: BankTransaction[];
}) {
  const variableRatio = grandTotal > 0 ? Math.round((variableTotal / grandTotal) * 1000) / 10 : 0;
  const fixedRatio = grandTotal > 0 ? Math.round((fixedTotal / grandTotal) * 1000) / 10 : 0;
  const topCategories = categoryRows.slice(0, 6);

  return (
    <Card className="erp-ledger-at-a-glance rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="erp-text-caption font-bold text-slate-500">
              {L.atAGlanceTitle} · {monthLabel}
            </div>
            <div className="erp-ledger-at-a-glance-total mt-1 font-black text-slate-900">
              {formatKRW(grandTotal)}
              {L.won}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 erp-text-caption">
              <span className="erp-ledger-at-a-glance-chip chip-variable">
                {L.variableExpense} {formatKRW(variableTotal)}
                {L.won}
              </span>
              {incomeTotal > 0 ? (
                <span className="erp-ledger-at-a-glance-chip chip-income">
                  {L.incomeEntry} {formatKRW(incomeTotal)}
                  {L.won}
                </span>
              ) : null}
              <span className="erp-ledger-at-a-glance-chip chip-fixed">
                {L.fixedExpense} {formatKRW(fixedTotal)}
                {L.won}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onViewAll}>
              {L.atAGlanceViewAll}
            </Button>
            <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={onViewStats}>
              {L.atAGlanceViewStats}
            </Button>
          </div>
        </div>

        {grandTotal > 0 ? (
          <div className="erp-ledger-at-a-glance-split-wrap">
            <div className="erp-ledger-at-a-glance-split">
              {variableTotal > 0 ? (
                <div className="split-variable" style={{ width: `${variableRatio}%` }} title={`${L.variableExpense} ${variableRatio}%`} />
              ) : null}
              {fixedTotal > 0 ? (
                <div className="split-fixed" style={{ width: `${fixedRatio}%` }} title={`${L.fixedExpense} ${fixedRatio}%`} />
              ) : null}
            </div>
            <div className="mt-1 flex justify-between erp-text-caption text-slate-500">
              <span>{L.variableExpense} {variableRatio}%</span>
              <span>{L.fixedExpense} {fixedRatio}%</span>
            </div>
          </div>
        ) : null}

        {(unpaidFixedCount > 0 || bankAutoCount + bankManualCount > 0) && (
          <div className="flex flex-wrap gap-2">
            {unpaidFixedCount > 0 ? (
              <span className="erp-ledger-at-a-glance-alert">
                {L.atAGlanceUnpaidAlert(unpaidFixedCount, formatKRW(unpaidFixedTotal))}
              </span>
            ) : null}
            {bankAutoCount + bankManualCount > 0 ? (
              <span className="erp-ledger-at-a-glance-note">
                {L.atAGlanceBankLinked(bankAutoCount, bankManualCount)}
              </span>
            ) : null}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <section>
            <h3 className="mb-2 erp-text-caption font-bold text-slate-600">{L.atAGlanceCategories}</h3>
            {topCategories.length ? (
              <div className="space-y-2">
                {topCategories.map((row) => (
                  <div key={row.category} className="erp-ledger-at-a-glance-category-row">
                    <span
                      className="erp-ledger-at-a-glance-category-dot"
                      style={getLedgerCategoryColorStyle(row.category) as React.CSSProperties}
                    />
                    <span className="min-w-0 truncate font-semibold text-slate-800">{row.category}</span>
                    <div className="erp-ledger-at-a-glance-category-bar-wrap">
                      <div
                        className="erp-ledger-at-a-glance-category-bar"
                        style={{
                          width: `${Math.max(row.sharePercent, 4)}%`,
                          ...(getLedgerCategoryColorStyle(row.category) as React.CSSProperties),
                        }}
                      />
                    </div>
                    <span className="text-right text-xs font-bold tabular-nums text-slate-700">
                      {formatKRW(row.grandTotal)}
                      {L.won}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="erp-text-caption text-slate-400">{L.atAGlanceEmpty}</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 erp-text-caption font-bold text-slate-600">{L.atAGlanceRecent}</h3>
            {recentRows.length ? (
              <ul className="erp-ledger-at-a-glance-recent-list">
                {recentRows.map((item) => {
                  const isExpenseRow = item.type === "expense";
                  const row = item.row;
                  const isIncome = isExpenseRow && isCompanyExpenseIncome(row);
                  const category = isExpenseRow
                    ? row.category
                    : resolveFixedPaymentCategory(row, fixedExpenses);
                  const label = isExpenseRow
                    ? row.description || row.category
                    : resolveFixedExpenseName(row.fixedExpenseId, fixedExpenses);
                  const bankLinked = isExpenseRow
                    ? isBankLinkedExpense(row, bankTransactions)
                    : isBankLinkedPayment(row, bankTransactions);
                  return (
                    <li key={`recent-${item.type}-${row.id}`} className="erp-ledger-at-a-glance-recent-item">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-slate-500">{row.date}</span>
                          <CategoryBadge label={category} />
                          {bankLinked ? <BankSourceBadge /> : null}
                        </div>
                        <div className="truncate text-sm font-semibold text-slate-900">{label}</div>
                      </div>
                      <div className={`shrink-0 text-sm font-bold tabular-nums ${isIncome ? "text-emerald-600" : "text-rose-600"}`}>
                        {formatKRW(row.amount)}
                        {L.won}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="erp-text-caption text-slate-400">{L.atAGlanceEmpty}</p>
            )}
          </section>
        </div>
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

function isBankLinkedExpense(row: CompanyExpense, bankTransactions: BankTransaction[] = []): boolean {
  if (Boolean(row.bankTransactionId?.trim())) return true;
  return bankTransactions.some((tx) => tx.linkedCompanyExpenseId === row.id);
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

function isBankLinkedPayment(row: FixedExpensePayment, bankTransactions: BankTransaction[] = []): boolean {
  return isFixedExpensePaymentBankLinked(row, bankTransactions);
}

function resolveExpenseBankTransactionId(
  expense: CompanyExpense,
  expenseId: string,
  bankTransactions: BankTransaction[],
) {
  const direct = String(expense.bankTransactionId || "").trim();
  if (direct) return direct;
  return bankTransactions.find((tx) => tx.linkedCompanyExpenseId === expenseId)?.id || "";
}

function resolvePaymentBankTransactionId(
  payment: FixedExpensePayment,
  paymentId: string,
  bankTransactions: BankTransaction[],
) {
  const direct = String(payment.bankTransactionId || "").trim();
  if (direct) return direct;
  return bankTransactions.find((tx) => tx.linkedFixedExpensePaymentId === paymentId)?.id || "";
}

function resolveFixedExpenseName(fixedExpenseId: string, fixedExpenses: FixedExpense[]) {
  return fixedExpenses.find((row) => row.id === fixedExpenseId)?.name || fixedExpenseId;
}

function resolveFixedExpenseCategory(fixedExpenseId: string, fixedExpenses: FixedExpense[]) {
  return fixedExpenses.find((row) => row.id === fixedExpenseId)?.category || "-";
}

function resolveFixedPaymentDescription(payment: FixedExpensePayment, fixedExpenses: FixedExpense[]) {
  return resolveFixedExpenseName(payment.fixedExpenseId, fixedExpenses);
}

function ExpenseCategoryBadges({
  row,
  bankTransactions = [],
}: {
  row: CompanyExpense;
  bankTransactions?: BankTransaction[];
}) {
  if (isBankLinkedExpense(row, bankTransactions)) {
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
  bankTransactions = [],
}: {
  payment: FixedExpensePayment;
  fixedExpenses: FixedExpense[];
  bankTransactions?: BankTransaction[];
}) {
  const category = resolveFixedPaymentCategory(payment, fixedExpenses);
  const itemName = resolveFixedExpenseName(payment.fixedExpenseId, fixedExpenses);
  if (isBankLinkedPayment(payment, bankTransactions)) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="erp-ledger-fixed-item-name font-semibold text-slate-900">{itemName}</span>
        <CategoryBadge label={category} />
        <BankSourceBadge />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="erp-ledger-fixed-item-name font-semibold text-slate-900">{itemName}</span>
      <CategoryBadge label={category} />
    </div>
  );
}

function FixedLedgerRowsPanel({
  rows,
  emptyLabel,
  showUnpaidBadge,
  fixedExpenses,
  bankTransactions = [],
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
  bankTransactions?: BankTransaction[];
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
              const bankLinked = isBankLinkedExpense(row, bankTransactions);
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
                  badge={<ExpenseCategoryBadges row={row} bankTransactions={bankTransactions} />}
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
            const bankLinked = isBankLinkedPayment(row, bankTransactions);
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
                badge={<FixedPaymentBadges payment={row} fixedExpenses={fixedExpenses} bankTransactions={bankTransactions} />}
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
                  const bankLinked = isBankLinkedExpense(row, bankTransactions);
                  return (
                    <tr key={`expense-${row.id}`} className={bankLinkedRowClass(bankLinked)}>
                      <td>{row.date}</td>
                      <td>
                        <ExpenseCategoryBadges row={row} bankTransactions={bankTransactions} />
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
                const bankLinked = isBankLinkedPayment(row, bankTransactions);
                return (
                  <tr key={`fixed-pay-${row.id}`} className={bankLinkedRowClass(bankLinked)}>
                    <td>{row.date}</td>
                    <td>
                      <FixedPaymentBadges payment={row} fixedExpenses={fixedExpenses} bankTransactions={bankTransactions} />
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

function emptyManualForm(
  category = EXPENSE_CATEGORY_OPTIONS[0],
  flow: CompanyLedgerFlow = "expense",
): ManualModalState {
  return {
    mode: "create",
    kind: "variable",
    flow,
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
  setBankLedgerRules,
  currentUser,
}: CompanyLedgerPageProps) {
  const { recordAudit, recordSummaryAudit } = useAudit();
  const isAdmin = currentUser?.role === "admin";
  const [activeTab, setActiveTab] = useState<LedgerTab>("calendar");
  const [periodKey, setPeriodKey] = useState<LedgerPeriodKey>("thisMonth");
  const [manualQuery, setManualQuery] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => todayISO().slice(0, 7));
  const [manualModal, setManualModal] = useState<ManualModalState | null>(null);
  const [fixedExpenseModal, setFixedExpenseModal] = useState<FixedExpenseModalState | null>(null);
  const [bankLinkModalOpen, setBankLinkModalOpen] = useState(false);
  const [bankLinkSearch, setBankLinkSearch] = useState("");
  const [bankLinkView, setBankLinkView] = useState<{ fixedExpenseId: string; paymentId?: string; title: string } | null>(
    null,
  );
  const [formError, setFormError] = useState("");
  const [linkMessage, setLinkMessage] = useState("");
  const [bankRefreshMessage, setBankRefreshMessage] = useState("");
  const [bankRefreshLoading, setBankRefreshLoading] = useState(false);
  const reconciledOnMountRef = React.useRef(false);

  React.useEffect(() => {
    if (reconciledOnMountRef.current) return;
    if (!setBankTransactions || !setFixedExpensePayments || !bankTransactions.length) return;
    reconciledOnMountRef.current = true;

    const result = reconcileLedgerBankLinks({
      bankTransactions,
      fixedExpensePayments,
      companyExpenses,
      fixedExpenses,
    });
    if (!result.linkedCount && !result.removedDuplicateCount) return;

    setFixedExpensePayments(result.fixedExpensePayments);
    setBankTransactions(result.bankTransactions);
    if (result.linkedCount || result.removedDuplicateCount) {
      setBankRefreshMessage(
        `\uD1B5\uC7A5 \uC5F0\uACB0 \uC815\uB9AC: ${result.linkedCount}\uAC74 \uC5F0\uACB0${result.removedDuplicateCount ? `, \uC911\uBCF5 \uBBF8\uC5F0\uACB0 ${result.removedDuplicateCount}\uAC74 \uC81C\uAC70` : ""}`,
      );
    }
  }, [
    bankTransactions,
    companyExpenses,
    fixedExpensePayments,
    fixedExpenses,
    setBankTransactions,
    setFixedExpensePayments,
  ]);
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

  const thisMonthIncomeTotal = useMemo(
    () =>
      sumCompanyExpensesByFlow(
        companyExpenses.filter((row) => getMonthKey(row.date) === currentMonthKey),
        "income",
      ),
    [companyExpenses, currentMonthKey],
  );

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

  const filteredIncomeRows = useMemo(
    () => filteredManualRows.filter(isIncomeLedgerRow),
    [filteredManualRows],
  );

  const filteredFixedRows = useMemo(
    () => filteredManualRows.filter(isFixedLedgerRow),
    [filteredManualRows],
  );

  const filteredUnpaidFixedRows = useMemo(
    () =>
      filteredFixedRows.filter(
        (row) => !isPaidFixedLedgerRow(row, bankTransactions, fixedExpensePayments, fixedExpenses),
      ),
    [filteredFixedRows, bankTransactions, fixedExpensePayments, fixedExpenses],
  );

  const filteredPaidFixedRows = useMemo(
    () =>
      filteredFixedRows.filter((row) =>
        isPaidFixedLedgerRow(row, bankTransactions, fixedExpensePayments, fixedExpenses),
      ),
    [filteredFixedRows, bankTransactions, fixedExpensePayments, fixedExpenses],
  );

  const bankLedgerLinkStats = useMemo(() => {
    const monthPrefix = `${currentMonthKey}-`;
    const monthExpenses = companyExpenses.filter((row) => String(row.date || "").startsWith(monthPrefix));
    const monthPayments = (fixedExpensePayments || []).filter((row) =>
      String(row.date || "").startsWith(monthPrefix),
    );
    let autoExpense = 0;
    let manualExpense = 0;
    let autoPayment = 0;
    let manualPayment = 0;
    for (const row of monthExpenses) {
      if (isBankLinkedExpense(row, bankTransactions)) autoExpense += 1;
      else manualExpense += 1;
    }
    for (const row of monthPayments) {
      if (isBankLinkedPayment(row, bankTransactions)) autoPayment += 1;
      else manualPayment += 1;
    }
    return {
      autoCount: autoExpense + autoPayment,
      manualCount: manualExpense + manualPayment,
    };
  }, [companyExpenses, fixedExpensePayments, currentMonthKey, bankTransactions]);

  const smartLedgerSummary = useMemo(() => loadSmartLedgerRunSummary(), [bankRefreshMessage]);

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
      if (
        isFixedExpensePaymentSettled(row, payments, bankTransactions, fixedExpenses)
      ) {
        paidTotal += Number(row.amount) || 0;
        paidCount += 1;
      } else {
        unpaidTotal += Number(row.amount) || 0;
        unpaidCount += 1;
      }
    }
    for (const row of legacy) {
      if (isBankLinkedExpense(row, bankTransactions)) {
        paidTotal += Number(row.amount) || 0;
        paidCount += 1;
      } else {
        unpaidTotal += Number(row.amount) || 0;
        unpaidCount += 1;
      }
    }
    return { unpaidTotal, paidTotal, unpaidCount, paidCount };
  }, [companyExpenses, fixedExpensePayments, fixedExpenses, currentMonthKey, bankTransactions]);

  const hasBankLinkedManualRows = useMemo(
    () =>
      filteredManualRows.some((item) =>
        item.type === "expense"
          ? isBankLinkedExpense(item.row, bankTransactions)
          : isBankLinkedPayment(item.row, bankTransactions),
      ),
    [filteredManualRows, bankTransactions],
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

  const thisMonthRange = useMemo(() => monthRangeISO(0), []);

  const thisMonthCategoryStats = useMemo(
    () =>
      buildLedgerCategoryStats(
        companyExpenses,
        fixedExpensePayments,
        fixedExpenses,
        thisMonthRange.startDate,
        thisMonthRange.endDate,
      ),
    [companyExpenses, fixedExpensePayments, fixedExpenses, thisMonthRange],
  );

  const thisMonthRecentRows = useMemo(() => {
    const rangedExpenses = filterCompanyExpenses(
      companyExpenses,
      thisMonthRange.startDate,
      thisMonthRange.endDate,
    );
    const rangedPayments = filterFixedExpensePayments(
      fixedExpensePayments,
      thisMonthRange.startDate,
      thisMonthRange.endDate,
    );
    const merged: ManualLedgerRow[] = [
      ...rangedExpenses.map((row) => ({ type: "expense" as const, row })),
      ...rangedPayments.map((row) => ({ type: "fixedPayment" as const, row })),
    ];
    return merged.sort((a, b) => String(b.row.date).localeCompare(String(a.row.date))).slice(0, 5);
  }, [companyExpenses, fixedExpensePayments, thisMonthRange]);

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
        manualModal?.kind === "fixed" ? manualModal.category : "",
      ),
    [fixedExpenses, fixedExpenseCategories, manualModal?.category, manualModal?.kind],
  );

  const fixedExpenseSelectOptions = useMemo(() => {
    const selectedId = manualModal?.kind === "fixed" ? manualModal.fixedExpenseId : "";
    return fixedExpenses
      .filter((row) => row.isActive || row.id === selectedId)
      .map((row) => ({
        value: row.id,
        label: `${row.name} \u00B7 ${row.category} \u00B7 ${formatFixedExpensePaymentDay(row.paymentDayOfMonth)}`,
        raw: row,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "ko"));
  }, [fixedExpenses, manualModal?.fixedExpenseId, manualModal?.kind]);

  const setManualKind = (kind: CompanyExpenseKind) => {
    setManualModal((prev) => {
      if (!prev || prev.kind === kind || prev.mode !== "edit") return prev;
      const next = { ...prev, kind };
      if (kind === "fixed") {
        if (!next.fixedExpenseId) {
          next.fixedExpenseId = fixedExpenses.find((row) => row.isActive)?.id || "";
        }
        const fixedItem = fixedExpenses.find((row) => row.id === next.fixedExpenseId);
        if (fixedItem) {
          next.category = fixedItem.category?.trim() || next.category;
          if (!prev.description.trim()) {
            next.description = fixedItem.name;
          }
        }
      } else if (!next.category.trim()) {
        next.category = expenseCategories[0] || EXPENSE_CATEGORY_OPTIONS[0];
        next.fixedExpenseId = undefined;
      }
      return next;
    });
  };

  const openCreateManual = () => {
    setFormError("");
    setManualModal(emptyManualForm(expenseCategories[0] || EXPENSE_CATEGORY_OPTIONS[0], "expense"));
  };

  const openCreateIncome = () => {
    setFormError("");
    setManualModal(emptyManualForm(expenseCategories[0] || EXPENSE_CATEGORY_OPTIONS[0], "income"));
  };

  const openEditManual = (row: CompanyExpense) => {
    setFormError("");
    const kind = resolveCompanyExpenseKind(row);
    const flow = resolveCompanyExpenseFlow(row);
    setManualModal({
      mode: "edit",
      source: "expense",
      id: row.id,
      kind,
      initialKind: kind,
      flow,
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
      initialKind: "fixed",
      flow: "expense",
      date: row.date,
      category: resolveFixedPaymentCategory(row, fixedExpenses),
      description: row.memo || "",
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
    if (error && !isManualRecordTypeSwitch(manualModal)) {
      setFormError(error);
      return;
    }

    const savedBy = currentUser?.name || currentUser?.loginId || "";

    if (isManualRecordTypeSwitch(manualModal) && manualModal.source === "fixedPayment" && manualModal.kind === "variable") {
      const paymentId = manualModal.id;
      if (!paymentId || !setFixedExpensePayments) return;
      const category = manualModal.category.trim();
      if (!category) {
        setFormError("\uCE74\uD14C\uACE0\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
        return;
      }
      const inputError = validateCompanyExpenseInput(manualModal);
      if (inputError) {
        setFormError(inputError);
        return;
      }

      const beforePayment = fixedExpensePayments.find((row) => row.id === paymentId);
      const bankTransactionId = beforePayment
        ? resolvePaymentBankTransactionId(beforePayment, paymentId, bankTransactions)
        : "";
      const expenseId = makeLedgerId();
      const expense: CompanyExpense = {
        id: expenseId,
        date: manualModal.date,
        category,
        description: manualModal.description.trim(),
        amount: parseLedgerAmount(manualModal.amount),
        memo: manualModal.memo.trim(),
        kind: "variable",
        flow: "expense",
        bankTransactionId: bankTransactionId || undefined,
        createdBy: savedBy,
        createdAt: new Date().toISOString(),
      };

      setFixedExpensePayments((prev) => prev.filter((row) => row.id !== paymentId));
      setCompanyExpenses((prev) => [expense, ...prev]);
      if (bankTransactionId && setBankTransactions) {
        setBankTransactions((prev) =>
          prev.map((tx) => {
            if (tx.id === bankTransactionId) {
              return { ...tx, linkedCompanyExpenseId: expenseId, linkedFixedExpensePaymentId: undefined };
            }
            if (tx.linkedFixedExpensePaymentId === paymentId) {
              return { ...tx, linkedFixedExpensePaymentId: undefined, linkedCompanyExpenseId: expenseId };
            }
            return tx;
          }),
        );
      }
      if (beforePayment) {
        const fixedItem = fixedExpenses.find((row) => row.id === beforePayment.fixedExpenseId);
        recordAudit({
          entityType: "fixedExpensePayment",
          entityId: paymentId,
          entityLabel: fixedItem?.name || paymentId,
          screen: L.pageTitle,
          action: "delete",
          before: snapshotFixedExpensePaymentForAudit(beforePayment),
          fields: FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS,
          user: currentUser,
        });
      }
      recordAudit({
        entityType: "companyExpense",
        entityId: expenseId,
        entityLabel: `${expense.date} \u00B7 ${expense.description || expense.category}`,
        screen: L.pageTitle,
        action: "create",
        after: snapshotCompanyExpenseForAudit(expense),
        fields: COMPANY_EXPENSE_AUDIT_FIELDS,
        user: currentUser,
      });
      setExpenseCategories((prev) => mergeExpenseCategory(prev, category));
      setManualModal(null);
      setFormError("");
      return;
    }

    if (isManualRecordTypeSwitch(manualModal) && manualModal.source === "expense" && manualModal.kind === "fixed") {
      const expenseId = manualModal.id;
      if (!expenseId || !setFixedExpensePayments) return;
      const fixedExpenseId = String(manualModal.fixedExpenseId || "").trim();
      const category = manualModal.category.trim();
      if (!fixedExpenseId) {
        setFormError("\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
        return;
      }
      if (!category) {
        setFormError("\uCE74\uD14C\uACE0\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
        return;
      }
      const inputError = validateFixedExpensePaymentInput({
        date: manualModal.date,
        fixedExpenseId,
        amount: manualModal.amount,
      });
      if (inputError) {
        setFormError(inputError);
        return;
      }

      const beforeExpense = companyExpenses.find((row) => row.id === expenseId);
      const bankTransactionId = beforeExpense
        ? resolveExpenseBankTransactionId(beforeExpense, expenseId, bankTransactions)
        : "";
      const paymentId = makeLedgerId();
      const payment: FixedExpensePayment = {
        id: paymentId,
        fixedExpenseId,
        date: manualModal.date,
        amount: parseLedgerAmount(manualModal.amount),
        category,
        memo: manualModal.description.trim() || manualModal.memo.trim(),
        bankTransactionId: bankTransactionId || undefined,
        createdBy: savedBy,
        createdAt: new Date().toISOString(),
      };

      setCompanyExpenses((prev) => prev.filter((row) => row.id !== expenseId));
      setFixedExpensePayments((prev) => [payment, ...prev]);
      if (bankTransactionId && setBankTransactions) {
        setBankTransactions((prev) =>
          prev.map((tx) => {
            if (tx.id === bankTransactionId) {
              return { ...tx, linkedFixedExpensePaymentId: paymentId, linkedCompanyExpenseId: undefined };
            }
            if (tx.linkedCompanyExpenseId === expenseId) {
              return { ...tx, linkedCompanyExpenseId: undefined, linkedFixedExpensePaymentId: paymentId };
            }
            return tx;
          }),
        );
      }
      if (beforeExpense) {
        recordAudit({
          entityType: "companyExpense",
          entityId: expenseId,
          entityLabel: `${beforeExpense.date} \u00B7 ${beforeExpense.description || beforeExpense.category}`,
          screen: L.pageTitle,
          action: "delete",
          before: snapshotCompanyExpenseForAudit(beforeExpense),
          fields: COMPANY_EXPENSE_AUDIT_FIELDS,
          user: currentUser,
        });
      }
      const fixedItem = fixedExpenses.find((row) => row.id === fixedExpenseId);
      recordAudit({
        entityType: "fixedExpensePayment",
        entityId: paymentId,
        entityLabel: fixedItem?.name || paymentId,
        screen: L.pageTitle,
        action: "create",
        after: snapshotFixedExpensePaymentForAudit(payment),
        fields: FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS,
        user: currentUser,
      });
      setFixedExpenseCategories((prev) => mergeFixedExpenseCategory(prev, category, fixedExpenses));
      setManualModal(null);
      setFormError("");
      return;
    }

    if (manualModal.mode === "edit" && manualModal.source === "fixedPayment" && manualModal.id && manualModal.kind === "fixed") {
      const category = manualModal.category.trim();
      const fixedExpenseId = String(manualModal.fixedExpenseId || "").trim();
      if (!fixedExpenseId) {
        setFormError("\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
        return;
      }
      if (!category) {
        setFormError("\uCE74\uD14C\uACE0\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
        return;
      }

      setFixedExpensePayments?.((prev) =>
        prev.map((row) =>
          row.id === manualModal.id
            ? {
                ...row,
                fixedExpenseId,
                date: manualModal.date,
                amount: parseLedgerAmount(manualModal.amount),
                category,
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
      flow: manualModal.flow,
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

  const editingCompanyExpense = useMemo(() => {
    if (!manualModal?.id || manualModal.source !== "expense") return null;
    return companyExpenses.find((row) => row.id === manualModal.id) || null;
  }, [companyExpenses, manualModal?.id, manualModal?.source]);

  const canLinkBankFromManualEdit = Boolean(
    manualModal?.mode === "edit" &&
      manualModal.id &&
      setBankTransactions &&
      ((manualModal.source === "fixedPayment" &&
        editingFixedPayment &&
        !isBankLinkedPayment(editingFixedPayment, bankTransactions) &&
        setFixedExpensePayments) ||
        (manualModal.source === "expense" &&
          editingCompanyExpense &&
          !isBankLinkedExpense(editingCompanyExpense, bankTransactions))),
  );

  const linkableBankTransactions = useMemo(() => {
    const context = { companyExpenses, fixedExpensePayments };
    const keyword = bankLinkSearch.trim().toLowerCase();
    let autoMatched: BankTransaction[] = [];

    if (editingFixedPayment) {
      autoMatched = listBankTransactionsForFixedPaymentLink(
        editingFixedPayment,
        bankTransactions,
        context,
        fixedExpenses,
        { excludePaymentId: manualModal?.id, includeVariableLinked: true },
      );
    } else if (editingCompanyExpense) {
      autoMatched = listBankTransactionsForCompanyExpenseLink(
        editingCompanyExpense,
        bankTransactions,
        context,
        { excludeExpenseId: manualModal?.id },
      );
    }

    if (!keyword) return autoMatched;

    const monthKey = editingFixedPayment
      ? getMonthKey(editingFixedPayment.date)
      : editingCompanyExpense
        ? getMonthKey(editingCompanyExpense.date)
        : "";

    const searchMatches = searchBankTransactionsForLedgerLink(bankTransactions, context, {
      excludePaymentId: manualModal?.id,
      includeVariableLinked: Boolean(editingFixedPayment),
      monthKey,
      keyword,
    });

    return mergeBankTransactionsById(autoMatched, searchMatches);
  }, [
    bankTransactions,
    bankLinkSearch,
    companyExpenses,
    fixedExpensePayments,
    fixedExpenses,
    editingCompanyExpense,
    editingFixedPayment,
    manualModal?.id,
  ]);

  const linkBankTransactionToFixedPayment = (tx: BankTransaction) => {
    const paymentId = manualModal?.id;
    if (!paymentId || !setFixedExpensePayments || !setBankTransactions) return;

    const payment = fixedExpensePayments.find((row) => row.id === paymentId);
    const synced = resolveFixedPaymentFieldsFromBankTx(tx);
    const {
      expenses: clearedExpenses,
      transactions: clearedTransactions,
      removedExpense,
    } = clearVariableExpenseLinkForBankTx(tx.id, companyExpenses, bankTransactions);

    if (removedExpense && setCompanyExpenses) {
      recordAudit({
        entityType: "companyExpense",
        entityId: removedExpense.id,
        entityLabel: `${removedExpense.date} \u00B7 ${removedExpense.description || removedExpense.category}`,
        screen: L.pageTitle,
        action: "delete",
        before: snapshotCompanyExpenseForAudit(removedExpense),
        fields: COMPANY_EXPENSE_AUDIT_FIELDS,
        user: currentUser,
      });
      setCompanyExpenses(clearedExpenses);
    }

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
    setBankTransactions(
      clearedTransactions.map((row) =>
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
    setBankLinkSearch("");
    setLinkMessage(L.linkFromBankDone);
  };

  const linkBankTransactionToCompanyExpense = (tx: BankTransaction) => {
    const expenseId = manualModal?.id;
    if (!expenseId || !setCompanyExpenses || !setBankTransactions) return;

    const expense = companyExpenses.find((row) => row.id === expenseId);
    const ledgerAmount = resolveBankTxLedgerAmount(tx);
    const ledgerDate = String(tx.transactionAt || "").slice(0, 10) || todayISO();
    const nextExpense: CompanyExpense = {
      ...(expense || {
        id: expenseId,
        date: ledgerDate,
        category: manualModal?.category || EXPENSE_CATEGORY_OPTIONS[0],
        description: manualModal?.description || "",
        amount: ledgerAmount || 0,
        kind: manualModal?.kind === "fixed" ? "fixed" : "variable",
        flow: manualModal?.flow || resolveBankTxLedgerFlow(tx),
      }),
      bankTransactionId: tx.id,
      flow: resolveBankTxLedgerFlow(tx),
      ...(ledgerDate ? { date: ledgerDate } : {}),
      ...(ledgerAmount > 0 ? { amount: ledgerAmount } : {}),
    };

    setCompanyExpenses((prev) => prev.map((row) => (row.id === expenseId ? nextExpense : row)));
    setManualModal((prev) =>
      prev && prev.id === expenseId
        ? {
            ...prev,
            ...(ledgerDate ? { date: ledgerDate } : {}),
            ...(ledgerAmount > 0 ? { amount: String(ledgerAmount) } : {}),
            flow: resolveBankTxLedgerFlow(tx),
          }
        : prev,
    );
    setBankTransactions((prev) =>
      prev.map((row) =>
        row.id === tx.id
          ? { ...row, linkedCompanyExpenseId: expenseId, linkedFixedExpensePaymentId: undefined }
          : row,
      ),
    );
    if (expense) {
      recordAudit({
        entityType: "companyExpense",
        entityId: expenseId,
        entityLabel: `${nextExpense.date} \u00B7 ${nextExpense.description || nextExpense.category}`,
        screen: L.pageTitle,
        action: "update",
        before: snapshotCompanyExpenseForAudit(expense),
        after: snapshotCompanyExpenseForAudit(nextExpense),
        fields: COMPANY_EXPENSE_AUDIT_FIELDS,
        user: currentUser,
      });
    }
    setBankLinkModalOpen(false);
    setBankLinkSearch("");
    setLinkMessage(L.linkFromBankDone);
  };

  const linkBankTransactionToManualRecord = (tx: BankTransaction) => {
    if (manualModal?.source === "fixedPayment") {
      linkBankTransactionToFixedPayment(tx);
      return;
    }
    if (manualModal?.source === "expense") {
      linkBankTransactionToCompanyExpense(tx);
    }
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
    const message = isBankLinkedExpense(row, bankTransactions) ? L.deleteBankLinkedConfirm : L.deleteConfirm;
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
    if (isBankLinkedExpense(row, bankTransactions)) unlinkBankCompanyExpense(row.id);
  };

  const deleteFixedPayment = (row: FixedExpensePayment) => {
    const message = isBankLinkedPayment(row, bankTransactions) ? L.deleteBankLinkedConfirm : L.deleteConfirm;
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
    if (isBankLinkedPayment(row, bankTransactions)) unlinkBankFixedPayment(row.id);
  };

  const deleteFixedExpense = () => {
    if (!fixedExpenseModal?.id || !setFixedExpenses) return;
    const fixedExpenseId = fixedExpenseModal.id;
    const row = fixedExpenses.find((item) => item.id === fixedExpenseId);
    if (!row) return;

    const relatedPayments = fixedExpensePayments.filter((payment) => payment.fixedExpenseId === fixedExpenseId);
    const hasBankLinkedPayment = relatedPayments.some((payment) => isBankLinkedPayment(payment, bankTransactions));
    const message = hasBankLinkedPayment ? L.deleteFixedItemBankLinkedConfirm : L.deleteFixedItemConfirm;
    if (!window.confirm(message)) return;

    recordAudit({
      entityType: "fixedExpense",
      entityId: row.id,
      entityLabel: row.name,
      screen: L.pageTitle,
      action: "delete",
      before: snapshotFixedExpenseForAudit(row),
      fields: FIXED_EXPENSE_AUDIT_FIELDS,
      user: currentUser,
    });

    relatedPayments.forEach((payment) => {
      recordAudit({
        entityType: "fixedExpensePayment",
        entityId: payment.id,
        entityLabel: `${payment.date} \u00B7 ${formatKRW(payment.amount)}`,
        screen: L.pageTitle,
        action: "delete",
        before: snapshotFixedExpensePaymentForAudit(payment),
        fields: FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS,
        user: currentUser,
      });
      if (isBankLinkedPayment(payment, bankTransactions)) unlinkBankFixedPayment(payment.id);
    });

    const nextFixedExpenses = fixedExpenses.filter((item) => item.id !== fixedExpenseId);
    setFixedExpenses(nextFixedExpenses);
    setFixedExpensePayments?.((prev) => prev.filter((payment) => payment.fixedExpenseId !== fixedExpenseId));
    setBankLedgerRules?.((prev) =>
      prev.filter((rule) => !(rule.kind === "fixed" && rule.fixedExpenseId === fixedExpenseId)),
    );
    setFixedExpenseCategories((prev) => normalizeFixedExpenseCategories(prev, nextFixedExpenses));
    setFixedExpenseModal(null);
    setBankLinkView(null);
    setFormError("");
  };

  const resetCompanyLedger = () => {
    if (!isAdmin) return;
    if (!confirmDelete(L.resetLedgerConfirm)) return;

    const expenseCount = companyExpenses.length;
    const paymentCount = fixedExpensePayments.length;
    const preservedFixedCount = fixedExpenses.length;
    const clearedRules = bankLedgerRules.filter((rule) => rule.kind === "fixed" || rule.kind === "manual").length;
    const unlinkedTxCount = bankTransactions.filter(
      (row) => row.linkedCompanyExpenseId || row.linkedFixedExpensePaymentId,
    ).length;

    setCompanyExpenses([]);
    setFixedExpensePayments?.([]);
    setExpenseCategories(normalizeExpenseCategories([]));
    setFixedExpenseCategories(normalizeFixedExpenseCategories([], fixedExpenses));
    setBankLedgerRules?.((prev) => prev.filter((rule) => rule.kind === "folder" || rule.kind === "preauth_net"));
    setBankTransactions?.((prev) =>
      prev.map((row) => ({
        ...row,
        linkedCompanyExpenseId: undefined,
        linkedFixedExpensePaymentId: undefined,
      })),
    );

    recordSummaryAudit({
      entityType: "companyExpense",
      entityId: "ledger-reset",
      entityLabel: L.resetLedger,
      screen: L.pageTitle,
      action: "delete",
      fieldLabel: L.resetLedger,
      after: `\uC9C0\uCD9C ${expenseCount}\u00B7\uB0A9\uBD80 ${paymentCount}\u00B7\uACE0\uC815\uBE44\uB9C8\uC2A4\uD130\uC720\uC9C0 ${preservedFixedCount}\u00B7\uD559\uC2B5\uADDC\uCE59 ${clearedRules}\u00B7\uC5F0\uB3D9\uD574\uC81C ${unlinkedTxCount}`,
      user: currentUser,
    });
    setBankRefreshMessage(L.resetLedgerDone);
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
          {isAdmin &&
          setCompanyExpenses &&
          setFixedExpensePayments &&
          setFixedExpenses &&
          setExpenseCategories &&
          setFixedExpenseCategories &&
          setBankTransactions &&
          setBankLedgerRules ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl border-red-200 text-red-700 hover:bg-red-50"
              onClick={resetCompanyLedger}
            >
              <Trash2 size={16} className="mr-2" />
              {L.resetLedger}
            </Button>
          ) : null}
          {activeTab === "manual" ? (
            <>
              <Button className="rounded-2xl" onClick={openCreateManual}>
                <Plus size={16} /> {L.addManual}
              </Button>
              <Button variant="outline" className="rounded-2xl border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={openCreateIncome}>
                <Plus size={16} /> {L.addIncome}
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

      <LedgerAtAGlancePanel
        monthLabel={formatMonthLabel(currentMonthKey)}
        variableTotal={thisMonthCategoryStats.summary.variableTotal}
        incomeTotal={thisMonthIncomeTotal}
        fixedTotal={thisMonthCategoryStats.summary.fixedTotal}
        grandTotal={thisMonthCategoryStats.summary.grandTotal}
        categoryRows={thisMonthCategoryStats.rows}
        recentRows={thisMonthRecentRows}
        unpaidFixedCount={thisMonthFixedBreakdown.unpaidCount}
        unpaidFixedTotal={thisMonthFixedBreakdown.unpaidTotal}
        bankAutoCount={bankLedgerLinkStats.autoCount}
        bankManualCount={bankLedgerLinkStats.manualCount}
        fixedExpenses={fixedExpenses}
        bankTransactions={bankTransactions}
        onViewAll={() => {
          setActiveTab("manual");
          setPeriodKey("thisMonth");
        }}
        onViewStats={() => {
          setActiveTab("stats");
          setPeriodKey("thisMonth");
        }}
      />

      {smartLedgerSummary ? (
        <details className="erp-ledger-smart-summary rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2 text-sm text-violet-900">
          <summary className="cursor-pointer font-semibold">{L.smartLedgerLastRun}</summary>
          <p className="mt-1 text-violet-800">
            {new Date(smartLedgerSummary.at).toLocaleString("ko-KR")} · 학습 고정{" "}
            {smartLedgerSummary.learnFixed} · 학습 지출 {smartLedgerSummary.learnManual} · AI 등록{" "}
            {smartLedgerSummary.heuristicRegistered + smartLedgerSummary.llmRegistered} · 확인 필요{" "}
            {smartLedgerSummary.pendingSuggestions}건
          </p>
        </details>
      ) : null}

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
                    const bankLinked = isBankLinkedExpense(row, bankTransactions);
                    return (
                      <MobileRecordCard
                        key={`expense-${row.id}`}
                        title={<DescriptionWithBankBadge text={row.description} bankLinked={bankLinked} />}
                        subtitle={row.date}
                        badge={<ExpenseCategoryBadges row={row} bankTransactions={bankTransactions} />}
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
                        const bankLinked = isBankLinkedExpense(row, bankTransactions);
                        return (
                          <tr key={`expense-${row.id}`} className={bankLinkedRowClass(bankLinked)}>
                            <td>{row.date}</td>
                            <td>
                              <ExpenseCategoryBadges row={row} bankTransactions={bankTransactions} />
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
                <h2 className="erp-text-section font-bold text-emerald-700">{L.incomeEntry}</h2>
                <span className="erp-text-caption font-semibold text-slate-500">
                  {filteredIncomeRows.length}
                  {L.count} · {formatKRW(sumManualLedgerRows(filteredIncomeRows))}
                  {L.won}
                </span>
              </div>
              <MobileRecordList>
                {filteredIncomeRows.length ? (
                  filteredIncomeRows.map((item) => {
                    const row = item.row;
                    const bankLinked = isBankLinkedExpense(row, bankTransactions);
                    return (
                      <MobileRecordCard
                        key={`income-${row.id}`}
                        title={<DescriptionWithBankBadge text={row.description} bankLinked={bankLinked} />}
                        subtitle={row.date}
                        badge={<ExpenseCategoryBadges row={row} bankTransactions={bankTransactions} />}
                        fields={[
                          { label: L.amount, value: `${formatKRW(row.amount)}${L.won}`, tone: "success" },
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
                  <MobileRecordCard empty emptyLabel={L.emptyIncome} />
                )}
              </MobileRecordList>
              <DesktopTableWrap>
                <table className="erp-ledger-table min-w-full">
                  <thead>
                    <tr>
                      <th>{L.incomeDate}</th>
                      <th>{L.category}</th>
                      <th>{L.description}</th>
                      <th className="text-right">{L.amount}</th>
                      <th>{L.memo}</th>
                      <th className="erp-table-export-skip">{L.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIncomeRows.length ? (
                      filteredIncomeRows.map((item) => {
                        const row = item.row;
                        const bankLinked = isBankLinkedExpense(row, bankTransactions);
                        return (
                          <tr key={`income-${row.id}`} className={bankLinkedRowClass(bankLinked)}>
                            <td>{row.date}</td>
                            <td>
                              <ExpenseCategoryBadges row={row} bankTransactions={bankTransactions} />
                            </td>
                            <td>
                              <DescriptionWithBankBadge text={row.description} bankLinked={bankLinked} />
                            </td>
                            <td className="text-right font-bold text-emerald-600">
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
                          {L.emptyIncome}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {filteredIncomeRows.length ? (
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="font-bold">
                          {L.total} ({filteredIncomeRows.length}
                          {L.count})
                        </td>
                        <td className="text-right font-black text-emerald-600">
                          {formatKRW(sumManualLedgerRows(filteredIncomeRows))}
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
                  bankTransactions={bankTransactions}
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
                  bankTransactions={bankTransactions}
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
                      const bankLinked = isBankLinkedExpense(row, bankTransactions);
                      return (
                        <MobileRecordCard
                          key={`manual-${row.id}`}
                          title={<DescriptionWithBankBadge text={row.description} bankLinked={bankLinked} />}
                          subtitle={row.date}
                          badge={<ExpenseCategoryBadges row={row} bankTransactions={bankTransactions} />}
                          fields={[
                            { label: L.section, value: <ExpenseKindBadge kind={resolveCompanyExpenseKind(row)} /> },
                            { label: L.amount, value: `${formatKRW(row.amount)}${L.won}`, tone: "danger" },
                          ]}
                        />
                      );
                    })}
                    {selectedMonthDetail.fixedPayments.map((row) => {
                      const name = resolveFixedExpenseName(row.fixedExpenseId, fixedExpenses);
                      const bankLinked = isBankLinkedPayment(row, bankTransactions);
                      return (
                        <MobileRecordCard
                          key={`fixed-pay-${row.id}`}
                          title={<DescriptionWithBankBadge text={name} bankLinked={bankLinked} />}
                          subtitle={row.date}
                          badge={<FixedPaymentBadges payment={row} fixedExpenses={fixedExpenses} bankTransactions={bankTransactions} />}
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
                      const bankLinked = isBankLinkedExpense(row, bankTransactions);
                      return (
                        <tr key={`manual-${row.id}`} className={bankLinkedRowClass(bankLinked)}>
                          <td>
                            <ExpenseKindBadge kind={resolveCompanyExpenseKind(row)} />
                          </td>
                          <td>{row.date}</td>
                          <td>
                            <ExpenseCategoryBadges row={row} bankTransactions={bankTransactions} />
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
                      const bankLinked = isBankLinkedPayment(row, bankTransactions);
                      const description = row.memo ? `${name} ${L.separator} ${row.memo}` : name;
                      return (
                        <tr key={`fixed-pay-${row.id}`} className={bankLinkedRowClass(bankLinked)}>
                          <td>
                            <ExpenseKindBadge kind="fixed" />
                          </td>
                          <td>{row.date}</td>
                          <td>
                            <FixedPaymentBadges payment={row} fixedExpenses={fixedExpenses} bankTransactions={bankTransactions} />
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
          bankTransactions={bankTransactions}
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
                <CategorySuggestInput
                  key={fixedExpenseModal.id || "create"}
                  value={fixedExpenseModal.category}
                  options={fixedCategorySelectOptions}
                  placeholder={L.category}
                  className="rounded-xl"
                  onChange={(value) =>
                    setFixedExpenseModal((prev) => (prev ? { ...prev, category: value.trim() } : prev))
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
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                {fixedExpenseModal.mode === "edit" && fixedExpenseModal.id ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={deleteFixedExpense}
                  >
                    <Trash2 size={16} className="mr-2" />
                    {L.delete}
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
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
                  ? manualModal.flow === "income"
                    ? L.addIncome
                    : L.addManual
                  : manualModal.flow === "income"
                    ? L.editIncome
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
              {manualModal.mode === "edit" && manualModal.flow === "expense" ? (
                <Field label={L.editKind}>
                  <div className="grid grid-cols-2 gap-2">
                    {MANUAL_KIND_TOGGLE_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                          manualModal.kind === option.key ? option.activeTone : option.tone
                        }`}
                        onClick={() => setManualKind(option.key)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </Field>
              ) : null}
              <Field label={manualModal.flow === "income" ? L.incomeDate : L.expenseDate}>
                <KoreanDateInput
                  value={manualModal.date}
                  onChange={(event) => setManualModal((prev) => (prev ? { ...prev, date: event.target.value } : prev))}
                />
              </Field>
              {manualModal.mode === "edit" && manualModal.kind === "fixed" && manualModal.flow === "expense" ? (
                <Field label={L.fixedItemSection}>
                  <AutocompleteInput
                    value={manualModal.fixedExpenseId || ""}
                    options={fixedExpenseSelectOptions}
                    placeholder={L.fixedItemSection}
                    freeSolo={false}
                    showOptionsOnFocus
                    commitFreeSoloOnBlur
                    keepOpenUntilSelect
                    compact={false}
                    limit={24}
                    inputProps={{ className: "rounded-xl" }}
                    onChange={(value) => {
                      const fixedExpenseId = String(value || "").trim();
                      const fixedItem = fixedExpenses.find((row) => row.id === fixedExpenseId);
                      setManualModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              fixedExpenseId,
                              category: fixedItem?.category?.trim() || prev.category,
                            }
                          : prev,
                      );
                    }}
                  />
                  <p className="mt-1.5 text-xs font-semibold text-slate-500">{L.fixedPaymentItemHint}</p>
                </Field>
              ) : null}
              <Field label={L.category}>
                {manualModal.kind === "fixed" && manualModal.flow === "expense" ? (
                  <>
                    <CategorySuggestInput
                      key={`${manualModal.id || "create"}-${manualModal.source || "expense"}-${manualModal.kind}`}
                      value={manualModal.category}
                      options={manualFixedCategoryOptions}
                      placeholder={L.category}
                      className="rounded-xl"
                      onChange={(value) =>
                        setManualModal((prev) => (prev ? { ...prev, category: value.trim() } : prev))
                      }
                    />
                    <p className="mt-1.5 text-xs font-semibold text-slate-500">
                      {manualModal.source === "fixedPayment"
                        ? L.fixedPaymentCategoryHint
                        : "\uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uCE74\uD14C\uACE0\uB9AC\uB294 \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694."}
                    </p>
                  </>
                ) : (
                  <>
                    <CategorySuggestInput
                      key={`${manualModal.id || "create"}-variable`}
                      value={manualModal.category}
                      options={expenseCategoryOptions}
                      placeholder={L.category}
                      className="rounded-xl"
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
              {canLinkBankFromManualEdit ? (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-2xl"
                    onClick={() => {
                      setLinkMessage("");
                      setBankLinkSearch("");
                      setBankLinkModalOpen(true);
                    }}
                  >
                    <Link2 size={16} className="mr-2" />
                    {L.linkFromBank}
                  </Button>
                </div>
              ) : null}
              {manualModal.mode === "edit" &&
              manualModal.kind === "fixed" &&
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
                  {isManualRecordTypeSwitch(manualModal)
                    ? manualModal.kind === "fixed"
                      ? L.kindChangeSaveFixed
                      : L.kindChangeSaveManual
                    : L.save}
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
                <Input
                  value={bankLinkSearch}
                  onChange={(event) => setBankLinkSearch(event.target.value)}
                  placeholder={L.linkFromBankSearch}
                  className="mb-3 rounded-xl"
                />
                <div className="max-h-96 space-y-2 overflow-auto">
                  {linkableBankTransactions.length ? (
                    linkableBankTransactions.map((tx) => {
                      const variableLinkedExpense = getLinkedCompanyExpenseForBankTx(tx, companyExpenses);
                      const showVariableLinkedBadge =
                        variableLinkedExpense &&
                        resolveCompanyExpenseKind(variableLinkedExpense) === "variable";
                      return (
                      <button
                        key={tx.id}
                        type="button"
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-amber-300 hover:bg-amber-50"
                        onClick={() => linkBankTransactionToManualRecord(tx)}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">
                            {tx.description || tx.counterpartyName || "-"}
                          </span>
                          <span className="flex flex-wrap items-center gap-2">
                            {showVariableLinkedBadge ? (
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                                {L.linkFromBankVariableLinkedBadge}
                              </span>
                            ) : null}
                            <span className="text-sm font-bold text-red-600">
                              {formatKRW(tx.withdrawal)}
                              {L.won}
                            </span>
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {formatBankTransactionDateTime(tx.transactionAt)}
                          {tx.counterpartyName ? ` \u00B7 ${tx.counterpartyName}` : ""}
                          {tx.memo ? ` \u00B7 ${tx.memo}` : ""}
                        </div>
                      </button>
                      );
                    })
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
