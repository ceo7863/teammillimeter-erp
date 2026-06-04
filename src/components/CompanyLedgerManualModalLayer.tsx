import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CompanyLedgerManualModal,
  isManualRecordTypeSwitch,
  type CompanyLedgerManualModalLabels,
  type ManualModalState,
} from "@/components/CompanyLedgerManualModal";
import { useAudit } from "@/context/AuditContext";
import type { ErpUser } from "@/utils/erpApi";
import {
  COMPANY_EXPENSE_AUDIT_FIELDS,
  FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS,
  snapshotCompanyExpenseForAudit,
  snapshotFixedExpensePaymentForAudit,
} from "@/utils/auditLog";
import {
  clearVariableExpenseLinkForBankTx,
  getLinkedCompanyExpenseForBankTx,
  listBankTransactionsForCompanyExpenseLink,
  listBankTransactionsForFixedPaymentLink,
  mergeBankTransactionsById,
  resolveBankTxLedgerAmount,
  resolveBankTxLedgerFlow,
  searchBankTransactionsForLedgerLink,
  type BankLearnRule,
} from "@/utils/bankCompanyLedger";
import { formatBankTransactionDateTime, type BankTransaction } from "@/utils/bankTransactions";
import {
  EXPENSE_CATEGORY_OPTIONS,
  formatKRW,
  getMonthKey,
  isCeoDedicatedLedgerCategory,
  linkFixedExpensePaymentToBankTx,
  makeLedgerId,
  mergeExpenseCategory,
  mergeFixedExpenseCategory,
  parseLedgerAmount,
  resolveCompanyExpenseKind,
  resolveCompanyExpenseFlow,
  getCompanyExpenseAccountContent,
  getCompanyExpenseBankRecord,
  resolveFixedPaymentAccountContent,
  resolveFixedPaymentCategory,
  resolveFixedPaymentFieldsFromBankTx,
  todayISO,
  validateCompanyExpenseInput,
  validateFixedExpensePaymentInput,
  type CompanyExpense,
  type CompanyLedgerFlow,
  type FixedExpense,
  type FixedExpensePayment,
} from "@/utils/companyLedger";

const MANUAL_MODAL_LABELS: CompanyLedgerManualModalLabels = {
  addIncome: "\uC785\uAE08 \uCD94\uAC00",
  addManual: "\uC9C0\uCD9C \uCD94\uAC00",
  editIncome: "\uC785\uAE08 \uC218\uC815",
  editFixed: "\uACE0\uC815\uBE44 \uC218\uC815",
  editManual: "\uC9C0\uCD9C \uC218\uC815",
  editKind: "\uAD6C\uBD84",
  incomeDate: "\uC785\uAE08\uC77C",
  expenseDate: "\uC9C0\uCD9C\uC77C",
  fixedItemSection: "\uACE0\uC815\uBE44 \uD56D\uBAA9",
  fixedPaymentItemHint:
    "\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD558\uBA74 \uC774 \uB0A9\uBD80 \uAE30\uB85D\uC774 \uD574\uB2F9 \uD56D\uBAA9\uC5D0 \uC5F0\uACB0\uB429\uB2C8\uB2E4.",
  category: "\uCE74\uD14C\uACE0\uB9AC",
  ceoCategoryLockedHint: "\uCE74\uD14C\uACE0\uB9AC\uB294 \uC774 \uD0ED\uC5D0\uC11C \uACE0\uC815\uB429\uB2C8\uB2E4.",
  fixedPaymentCategoryHint:
    "\uCE74\uD14C\uACE0\uB9AC \uBCC0\uACBD\uC740 \uC774 \uB0A9\uBD80 \uAE30\uB85D\uC5D0\uB9CC \uC801\uC6A9\uB429\uB2C8\uB2E4.",
  accountContent: "\uACC4\uC815\uB0B4\uC6A9",
  bankRecord: "\uD1B5\uC7A5\uAE30\uB85D",
  amountWon: "\uAE08\uC561 (\uC6D0)",
  memoOptional: "\uBA54\uBAA8 (\uC120\uD0DD)",
  linkFromBank: "\uD1B5\uC7A5\uB0B4\uC5ED\uC5D0\uC11C \uC5F0\uACB0\uD558\uAE30",
  viewBankLinks: "\uD1B5\uC7A5 \uC5F0\uB3D9 \uD655\uC778",
  cancel: "\uCDE8\uC18C",
  save: "\uC800\uC7A5",
  kindChangeSaveFixed: "\uC720\uD615 \uBCC0\uACBD \u00B7 \uACE0\uC815\uBE44\uB85C \uC800\uC7A5",
  kindChangeSaveManual: "\uC720\uD615 \uBCC0\uACBD \u00B7 \uBCC0\uB3D9\uC9C0\uCD9C\uB85C \uC800\uC7A5",
};

const SCREEN_TITLE = "\uD68C\uC0AC \uAC00\uACC4\uBD80";

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
    accountContent: "",
    description: "",
    amount: "",
    memo: "",
  };
}

function isBankLinkedExpense(row: CompanyExpense, bankTransactions: BankTransaction[] = []) {
  if (Boolean(row.bankTransactionId?.trim())) return true;
  return bankTransactions.some((tx) => tx.linkedCompanyExpenseId === row.id);
}

function isBankLinkedPayment(row: FixedExpensePayment, bankTransactions: BankTransaction[] = []) {
  if (Boolean(row.bankTransactionId?.trim())) return true;
  return bankTransactions.some((tx) => tx.linkedFixedExpensePaymentId === row.id);
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

function resolvePaymentBankRecord(payment: FixedExpensePayment, bankTransactions: BankTransaction[] = []) {
  const paymentId = String(payment.id || "");
  const txId = resolvePaymentBankTransactionId(payment, paymentId, bankTransactions);
  const tx = txId ? bankTransactions.find((row) => row.id === txId) : null;
  if (!tx) return "";
  const descriptionText = String(tx.description || "").trim();
  const counterparty = String(tx.counterpartyName || "").trim();
  return [descriptionText, counterparty].filter(Boolean).join(" \u00B7 ");
}

function resolveFixedExpenseCategory(fixedExpenseId: string, fixedExpenses: FixedExpense[]) {
  return fixedExpenses.find((row) => row.id === fixedExpenseId)?.category || "-";
}

function BankLinkSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      lang="ko"
      autoComplete="off"
      className="erp-input mb-3 w-full rounded-xl border bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-900"
    />
  );
}

export type CompanyLedgerManualModalHandle = {
  openCreateManual: (defaultCategory?: string) => void;
  openCreateIncome: (defaultCategory?: string) => void;
  openCreateCeoEntry: (category: string, flow: CompanyLedgerFlow) => void;
  openEditManual: (row: CompanyExpense) => void;
  openEditFixedPayment: (row: FixedExpensePayment) => void;
};

export type BankLinkViewRequest = {
  fixedExpenseId: string;
  paymentId?: string;
  title: string;
};

type CompanyLedgerManualModalLayerProps = {
  companyExpenses: CompanyExpense[];
  setCompanyExpenses: React.Dispatch<React.SetStateAction<CompanyExpense[]>>;
  expenseCategories: string[];
  setExpenseCategories: React.Dispatch<React.SetStateAction<string[]>>;
  fixedExpenseCategories: string[];
  setFixedExpenseCategories: React.Dispatch<React.SetStateAction<string[]>>;
  fixedExpenses: FixedExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  setFixedExpensePayments?: React.Dispatch<React.SetStateAction<FixedExpensePayment[]>>;
  bankTransactions: BankTransaction[];
  setBankTransactions?: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  bankLedgerRules?: BankLearnRule[];
  expenseCategoryOptions: Array<{ label: string; value: string }>;
  currentUser?: ErpUser | null;
  onOpenBankLinkView: (view: BankLinkViewRequest) => void;
  onRequestImmediateSave?: (patch?: {
    fixedExpenses?: FixedExpense[];
    fixedExpensePayments?: FixedExpensePayment[];
    fixedExpenseCategories?: string[];
    companyExpenses?: CompanyExpense[];
    expenseCategories?: string[];
    bankTransactions?: BankTransaction[];
  }) => void | Promise<void>;
};

export const CompanyLedgerManualModalLayer = React.memo(
  forwardRef<CompanyLedgerManualModalHandle, CompanyLedgerManualModalLayerProps>(
    function CompanyLedgerManualModalLayer(
      {
        companyExpenses,
        setCompanyExpenses,
        expenseCategories,
        setExpenseCategories,
        fixedExpenseCategories,
        setFixedExpenseCategories,
        fixedExpenses,
        fixedExpensePayments,
        setFixedExpensePayments,
        bankTransactions,
        setBankTransactions,
        expenseCategoryOptions,
        currentUser,
        onOpenBankLinkView,
        onRequestImmediateSave,
      },
      ref,
    ) {
      const { recordAudit } = useAudit();
      const [manualModal, setManualModal] = useState<ManualModalState | null>(null);
      const [manualModalPatch, setManualModalPatch] = useState<Partial<ManualModalState> | null>(null);
      const bankLinkDraftRef = useRef<ManualModalState | null>(null);
      const [bankLinkModalOpen, setBankLinkModalOpen] = useState(false);
      const [bankLinkSearch, setBankLinkSearch] = useState("");
      const [formError, setFormError] = useState("");
      const [linkMessage, setLinkMessage] = useState("");

      useEffect(() => {
        if (!manualModal && !bankLinkModalOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
          document.body.style.overflow = previousOverflow;
        };
      }, [manualModal, bankLinkModalOpen]);

      const manualModalSessionKey = manualModal
        ? `${manualModal.mode}-${manualModal.source ?? ""}-${manualModal.id ?? "create"}-${manualModal.flow}`
        : "";

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
        if (!bankLinkModalOpen) return [];
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
        bankLinkModalOpen,
        bankTransactions,
        bankLinkSearch,
        companyExpenses,
        fixedExpensePayments,
        fixedExpenses,
        editingCompanyExpense,
        editingFixedPayment,
        manualModal?.id,
      ]);

      const closeManualModal = useCallback(() => {
        setBankLinkModalOpen(false);
        setManualModal(null);
        setManualModalPatch(null);
        bankLinkDraftRef.current = null;
        setFormError("");
      }, []);

      const openCreateManual = useCallback(
        (defaultCategory?: string) => {
          setFormError("");
          startTransition(() => {
            setManualModal(
              emptyManualForm(
                defaultCategory || expenseCategories[0] || EXPENSE_CATEGORY_OPTIONS[0],
                "expense",
              ),
            );
          });
        },
        [expenseCategories],
      );

      const openCreateIncome = useCallback(
        (defaultCategory?: string) => {
          setFormError("");
          startTransition(() => {
            setManualModal(
              emptyManualForm(
                defaultCategory || expenseCategories[0] || EXPENSE_CATEGORY_OPTIONS[0],
                "income",
              ),
            );
          });
        },
        [expenseCategories],
      );

      const openCreateCeoEntry = useCallback((category: string, flow: CompanyLedgerFlow) => {
        setFormError("");
        startTransition(() => {
          setManualModal({ ...emptyManualForm(category, flow), categoryLocked: true });
        });
      }, []);

      const openEditManual = useCallback((row: CompanyExpense) => {
        setFormError("");
        const kind = resolveCompanyExpenseKind(row);
        const flow = resolveCompanyExpenseFlow(row);
        startTransition(() => {
          setManualModal({
            mode: "edit",
            source: "expense",
            id: row.id,
            kind,
            initialKind: kind,
            flow,
            date: row.date,
            category: row.category,
            accountContent: getCompanyExpenseAccountContent(row),
            description: getCompanyExpenseBankRecord(row),
            amount: String(row.amount || ""),
            memo: row.memo || "",
            categoryLocked: isCeoDedicatedLedgerCategory(row.category),
          });
        });
      }, []);

      const openEditFixedPayment = useCallback(
        (row: FixedExpensePayment) => {
          setFormError("");
          setLinkMessage("");
          setBankLinkModalOpen(false);
          startTransition(() => {
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
              accountContent: resolveFixedPaymentAccountContent(row, fixedExpenses),
              description: resolvePaymentBankRecord(row, bankTransactions),
              amount: String(row.amount || ""),
              memo: row.memo || "",
            });
          });
        },
        [bankTransactions, fixedExpenses],
      );

      useImperativeHandle(
        ref,
        () => ({
          openCreateManual,
          openCreateIncome,
          openCreateCeoEntry,
          openEditManual,
          openEditFixedPayment,
        }),
        [openCreateCeoEntry, openCreateIncome, openCreateManual, openEditFixedPayment, openEditManual],
      );

      const linkBankTransactionToFixedPayment = useCallback(
        (tx: BankTransaction) => {
          const paymentId = manualModal?.id;
          if (!paymentId || !setFixedExpensePayments || !setBankTransactions) return;

          const payment = fixedExpensePayments.find((row) => row.id === paymentId);
          const synced = resolveFixedPaymentFieldsFromBankTx(tx);
          const {
            expenses: clearedExpenses,
            transactions: clearedTransactions,
            removedExpense,
          } = clearVariableExpenseLinkForBankTx(tx.id, companyExpenses, bankTransactions);

          if (removedExpense) {
            recordAudit({
              entityType: "companyExpense",
              entityId: removedExpense.id,
              entityLabel: `${removedExpense.date} \u00B7 ${removedExpense.description || removedExpense.category}`,
              screen: SCREEN_TITLE,
              action: "delete",
              before: snapshotCompanyExpenseForAudit(removedExpense),
              fields: COMPANY_EXPENSE_AUDIT_FIELDS,
              user: currentUser,
            });
            setCompanyExpenses(clearedExpenses);
          }

          setFixedExpensePayments((prev) => linkFixedExpensePaymentToBankTx(prev, paymentId, tx.id, tx));
          setManualModalPatch({
            ...(synced.date ? { date: synced.date } : {}),
            ...(synced.amount != null ? { amount: String(synced.amount) } : {}),
          });
          if (bankLinkDraftRef.current?.id === paymentId) {
            bankLinkDraftRef.current = {
              ...bankLinkDraftRef.current,
              ...(synced.date ? { date: synced.date } : {}),
              ...(synced.amount != null ? { amount: String(synced.amount) } : {}),
            };
          }
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
              screen: SCREEN_TITLE,
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
          setLinkMessage("\uD1B5\uC7A5 \uB0B4\uC5ED\uC774 \uC5F0\uACB0\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
        },
        [
          bankTransactions,
          companyExpenses,
          currentUser,
          fixedExpensePayments,
          manualModal?.id,
          recordAudit,
          setBankTransactions,
          setCompanyExpenses,
          setFixedExpensePayments,
        ],
      );

      const linkBankTransactionToCompanyExpense = useCallback(
        (tx: BankTransaction) => {
          const expenseId = manualModal?.id;
          if (!expenseId || !setBankTransactions) return;

          const expense = companyExpenses.find((row) => row.id === expenseId);
          const ledgerAmount = resolveBankTxLedgerAmount(tx);
          const ledgerDate = String(tx.transactionAt || "").slice(0, 10) || todayISO();
          const linkDraft = bankLinkDraftRef.current;
          const nextExpense: CompanyExpense = {
            ...(expense || {
              id: expenseId,
              date: ledgerDate,
              category: linkDraft?.category || EXPENSE_CATEGORY_OPTIONS[0],
              description: linkDraft?.description || "",
              amount: ledgerAmount || 0,
              kind: linkDraft?.kind === "fixed" ? "fixed" : "variable",
              flow: linkDraft?.flow || resolveBankTxLedgerFlow(tx),
            }),
            bankTransactionId: tx.id,
            flow: resolveBankTxLedgerFlow(tx),
            ...(ledgerDate ? { date: ledgerDate } : {}),
            ...(ledgerAmount > 0 ? { amount: ledgerAmount } : {}),
          };

          setCompanyExpenses((prev) => prev.map((row) => (row.id === expenseId ? nextExpense : row)));
          setManualModalPatch({
            ...(ledgerDate ? { date: ledgerDate } : {}),
            ...(ledgerAmount > 0 ? { amount: String(ledgerAmount) } : {}),
            flow: resolveBankTxLedgerFlow(tx),
          });
          if (bankLinkDraftRef.current?.id === expenseId) {
            bankLinkDraftRef.current = {
              ...bankLinkDraftRef.current,
              ...(ledgerDate ? { date: ledgerDate } : {}),
              ...(ledgerAmount > 0 ? { amount: String(ledgerAmount) } : {}),
              flow: resolveBankTxLedgerFlow(tx),
            };
          }
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
              screen: SCREEN_TITLE,
              action: "update",
              before: snapshotCompanyExpenseForAudit(expense),
              after: snapshotCompanyExpenseForAudit(nextExpense),
              fields: COMPANY_EXPENSE_AUDIT_FIELDS,
              user: currentUser,
            });
          }
          setBankLinkModalOpen(false);
          setBankLinkSearch("");
          setLinkMessage("\uD1B5\uC7A5 \uB0B4\uC5ED\uC774 \uC5F0\uACB0\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
        },
        [companyExpenses, currentUser, manualModal?.id, recordAudit, setBankTransactions, setCompanyExpenses],
      );

      const linkBankTransactionToManualRecord = useCallback(
        (tx: BankTransaction) => {
          if (manualModal?.source === "fixedPayment") {
            linkBankTransactionToFixedPayment(tx);
            return;
          }
          if (manualModal?.source === "expense") {
            linkBankTransactionToCompanyExpense(tx);
          }
        },
        [linkBankTransactionToCompanyExpense, linkBankTransactionToFixedPayment, manualModal?.source],
      );

      const saveManual = useCallback(
        (modal: ManualModalState) => {
          if (
            modal.mode === "edit" &&
            modal.source === "fixedPayment" &&
            modal.id &&
            modal.kind === "fixed" &&
            !isManualRecordTypeSwitch(modal)
          ) {
            const category = modal.category.trim();
            const fixedExpenseId = String(modal.fixedExpenseId || "").trim();
            if (!fixedExpenseId) {
              setFormError("\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
              return;
            }
            if (!category) {
              setFormError("\uCE74\uD14C\uACE0\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
              return;
            }
            const inputError = validateFixedExpensePaymentInput({
              date: modal.date,
              fixedExpenseId,
              amount: modal.amount,
            });
            if (inputError) {
              setFormError(inputError);
              return;
            }

            const beforePayment = fixedExpensePayments.find((row) => row.id === modal.id);
            const nextPayment: FixedExpensePayment = {
              ...(beforePayment || {
                id: modal.id,
                fixedExpenseId,
                date: modal.date,
                amount: parseLedgerAmount(modal.amount),
                createdBy: currentUser?.name || currentUser?.loginId || "",
                createdAt: new Date().toISOString(),
              }),
              fixedExpenseId,
              date: modal.date,
              amount: parseLedgerAmount(modal.amount),
              category,
              accountContent: modal.accountContent.trim(),
              memo: modal.memo.trim(),
            };
            const nextFixedExpensePayments = fixedExpensePayments.map((row) =>
              row.id === modal.id ? nextPayment : row,
            );
            const nextFixedExpenseCategories = mergeFixedExpenseCategory(
              fixedExpenseCategories,
              category,
              fixedExpenses,
            );

            if (!setFixedExpensePayments) {
              setFormError("\uACE0\uC815\uBE44 \uB0A9\uBD80 \uC800\uC7A5\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
              return;
            }

            setFixedExpensePayments(nextFixedExpensePayments);
            setFixedExpenseCategories(nextFixedExpenseCategories);
            if (beforePayment) {
              recordAudit({
                entityType: "fixedExpensePayment",
                entityId: modal.id,
                entityLabel: `${beforePayment.date} \u00B7 ${formatKRW(beforePayment.amount)}`,
                screen: SCREEN_TITLE,
                action: "update",
                before: snapshotFixedExpensePaymentForAudit(beforePayment),
                after: snapshotFixedExpensePaymentForAudit(nextPayment),
                fields: FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS,
                user: currentUser,
              });
            }
            void onRequestImmediateSave?.({
              fixedExpensePayments: nextFixedExpensePayments,
              fixedExpenseCategories: nextFixedExpenseCategories,
            });
            closeManualModal();
            return;
          }

          const error = validateCompanyExpenseInput(modal);
          if (error && !isManualRecordTypeSwitch(modal)) {
            setFormError(error);
            return;
          }

          const savedBy = currentUser?.name || currentUser?.loginId || "";

          if (isManualRecordTypeSwitch(modal) && modal.source === "fixedPayment" && modal.kind === "variable") {
            const paymentId = modal.id;
            if (!paymentId || !setFixedExpensePayments) return;
            const category = modal.category.trim();
            if (!category) {
              setFormError("\uCE74\uD14C\uACE0\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
              return;
            }
            const inputError = validateCompanyExpenseInput(modal);
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
              date: modal.date,
              category,
              accountContent: modal.accountContent.trim(),
              description: modal.description.trim(),
              amount: parseLedgerAmount(modal.amount),
              memo: modal.memo.trim(),
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
                screen: SCREEN_TITLE,
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
              screen: SCREEN_TITLE,
              action: "create",
              after: snapshotCompanyExpenseForAudit(expense),
              fields: COMPANY_EXPENSE_AUDIT_FIELDS,
              user: currentUser,
            });
            setExpenseCategories((prev) => mergeExpenseCategory(prev, category));
            closeManualModal();
            return;
          }

          if (isManualRecordTypeSwitch(modal) && modal.source === "expense" && modal.kind === "fixed") {
            const expenseId = modal.id;
            if (!expenseId || !setFixedExpensePayments) return;
            const fixedExpenseId = String(modal.fixedExpenseId || "").trim();
            const category = modal.category.trim();
            if (!fixedExpenseId) {
              setFormError("\uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
              return;
            }
            if (!category) {
              setFormError("\uCE74\uD14C\uACE0\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
              return;
            }
            const inputError = validateFixedExpensePaymentInput({
              date: modal.date,
              fixedExpenseId,
              amount: modal.amount,
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
              date: modal.date,
              amount: parseLedgerAmount(modal.amount),
              category,
              accountContent: modal.accountContent.trim(),
              memo: modal.memo.trim(),
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
                screen: SCREEN_TITLE,
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
              screen: SCREEN_TITLE,
              action: "create",
              after: snapshotFixedExpensePaymentForAudit(payment),
              fields: FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS,
              user: currentUser,
            });
            setFixedExpenseCategories((prev) => mergeFixedExpenseCategory(prev, category, fixedExpenses));
            closeManualModal();
            return;
          }

          const payload: CompanyExpense = {
            id: modal.id || makeLedgerId(),
            date: modal.date,
            category: modal.category,
            accountContent: modal.accountContent.trim(),
            description: modal.description.trim(),
            amount: parseLedgerAmount(modal.amount),
            memo: modal.memo.trim(),
            kind: modal.mode === "create" ? "variable" : modal.kind,
            flow: modal.flow,
            createdBy: currentUser?.name || currentUser?.loginId || "",
            createdAt: new Date().toISOString(),
          };
          const existingExpense = modal.id ? companyExpenses.find((row) => row.id === modal.id) : null;
          recordAudit({
            entityType: "companyExpense",
            entityId: payload.id,
            entityLabel: `${payload.date} \u00B7 ${payload.description || payload.category}`,
            screen: SCREEN_TITLE,
            action: modal.mode === "edit" ? "update" : "create",
            before: existingExpense ? snapshotCompanyExpenseForAudit(existingExpense) : undefined,
            after: snapshotCompanyExpenseForAudit(payload),
            fields: COMPANY_EXPENSE_AUDIT_FIELDS,
            user: currentUser,
          });
          if (modal.mode === "edit" && modal.id) {
            setCompanyExpenses((prev) =>
              prev.map((row) =>
                row.id === modal.id
                  ? { ...row, ...payload, createdAt: row.createdAt, createdBy: row.createdBy || payload.createdBy }
                  : row,
              ),
            );
          } else {
            setCompanyExpenses((prev) => [payload, ...prev]);
          }
          setExpenseCategories((prev) => mergeExpenseCategory(prev, payload.category));
          closeManualModal();
        },
        [
          bankTransactions,
          closeManualModal,
          companyExpenses,
          currentUser,
          fixedExpenseCategories,
          fixedExpensePayments,
          fixedExpenses,
          recordAudit,
          setBankTransactions,
          setCompanyExpenses,
          setExpenseCategories,
          setFixedExpenseCategories,
          setFixedExpensePayments,
          onRequestImmediateSave,
        ],
      );

      const handleOpenBankLink = useCallback((draft: ManualModalState) => {
        bankLinkDraftRef.current = draft;
        setLinkMessage("");
        setBankLinkSearch("");
        setBankLinkModalOpen(true);
      }, []);

      const handleViewBankLinks = useCallback(
        (draft: ManualModalState) => {
          onOpenBankLinkView({
            fixedExpenseId: draft.fixedExpenseId!,
            paymentId: draft.id,
            title: draft.description || resolveFixedExpenseCategory(draft.fixedExpenseId!, fixedExpenses),
          });
        },
        [fixedExpenses, onOpenBankLinkView],
      );

      const resolveFixedCategory = useCallback(
        (fixedExpenseId: string) => resolveFixedExpenseCategory(fixedExpenseId, fixedExpenses),
        [fixedExpenses],
      );

      const handleExternalPatchConsumed = useCallback(() => setManualModalPatch(null), []);

      return (
        <>
          {manualModal ? (
            <CompanyLedgerManualModal
              initial={manualModal}
              sessionKey={manualModalSessionKey}
              expenseCategories={expenseCategories}
              fixedExpenses={fixedExpenses}
              fixedExpenseCategories={fixedExpenseCategories}
              expenseCategoryOptions={expenseCategoryOptions}
              formError={formError}
              linkMessage={linkMessage}
              canLinkBankFromManualEdit={canLinkBankFromManualEdit}
              externalPatch={manualModalPatch}
              onExternalPatchConsumed={handleExternalPatchConsumed}
              labels={MANUAL_MODAL_LABELS}
              resolveFixedExpenseCategory={resolveFixedCategory}
              onClose={closeManualModal}
              onSave={saveManual}
              onOpenBankLink={handleOpenBankLink}
              onViewBankLinks={handleViewBankLinks}
            />
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
                    aria-label={"\uD1B5\uC7A5 \uB0B4\uC5ED \uC5F0\uACB0"}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h2 className="erp-text-section font-bold">{"\uD1B5\uC7A5 \uB0B4\uC5ED \uC5F0\uACB0"}</h2>
                        <p className="mt-1 erp-text-caption text-slate-500">
                          {
                            "\uAC19\uC740 \uB2EC\u00B7\uBE44\uC2B7\uD55C \uAE08\uC561\u00B7\uC774\uB984\uC774 \uB9DE\uB294 \uCD9C\uAE08 \uB0B4\uC5ED\uC785\uB2C8\uB2E4."
                          }
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
                        onClick={() => setBankLinkModalOpen(false)}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <BankLinkSearchInput
                      value={bankLinkSearch}
                      onChange={setBankLinkSearch}
                      placeholder={"\uAC70\uB798\uB0B4\uC6A9 \u00B7 \uBA54\uBAA8 \u00B7 \uAE08\uC561 \uAC80\uC0C9"}
                    />
                    <div className="max-h-96 space-y-2 overflow-auto">
                      {linkableBankTransactions.length ? (
                        linkableBankTransactions.map((tx) => {
                          const variableLinkedExpense = getLinkedCompanyExpenseForBankTx(tx, companyExpenses);
                          const showVariableLinkedBadge =
                            variableLinkedExpense && resolveCompanyExpenseKind(variableLinkedExpense) === "variable";
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
                                      {"\uBCC0\uB3D9\uC9C0\uCD9C \uC5F0\uACB0\uC74C"}
                                    </span>
                                  ) : null}
                                  <span className="text-sm font-bold text-red-600">
                                    {formatKRW(tx.withdrawal)}
                                    {"\uC6D0"}
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
                          {"\uAE08\uC561\uACFC \uC774\uB984\uC774 \uB9DE\uB294 \uC5F0\uACB0 \uAC00\uB2A5\uD55C \uCD9C\uAE08 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}
        </>
      );
    },
  ),
);
