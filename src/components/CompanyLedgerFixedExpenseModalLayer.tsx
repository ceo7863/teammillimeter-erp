import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useState, startTransition } from "react";
import { useAudit } from "@/context/AuditContext";
import type { ErpUser } from "@/utils/erpApi";
import type { AccountCode, LedgerCategory } from "@/utils/ledgerSystem";
import { inferFixedExpenseCategoryFromAccountCode, resolveFixedExpenseAccountCode } from "@/utils/ledgerSystem";
import { FIXED_EXPENSE_AUDIT_FIELDS, FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS, snapshotFixedExpenseForAudit, snapshotFixedExpensePaymentForAudit } from "@/utils/auditLog";
import type { BankLearnRule } from "@/utils/bankCompanyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import {
  currentFixedExpenseStartMonthISO,
  formatKRW,
  getMonthKey,
  isFixedExpensePaymentBankLinked,
  makeLedgerId,
  mergeFixedExpenseCategory,
  normalizeFixedExpenseCategories,
  normalizeFixedExpenseStartDate,
  normalizeFixedExpensePaymentDay,
  parseLedgerAmount,
  validateFixedExpenseInput,
  type FixedExpense,
  type FixedExpensePayment,
} from "@/utils/companyLedger";
import {
  CompanyLedgerFixedExpenseModal,
  emptyFixedExpenseForm,
  fixedExpenseRowToModalState,
  type FixedExpenseModalLabels,
  type FixedExpenseModalState,
} from "@/components/CompanyLedgerFixedExpenseModal";
import { FixedExpenseBankLinkModal } from "@/components/FixedExpenseBankLinkModal";

const SCREEN_TITLE = "\uD68C\uC0AC \uAC00\uACC4\uBD80";

const FIXED_EXPENSE_MODAL_LABELS: FixedExpenseModalLabels = {
  addFixedItem: "\uACE0\uC815\uBE44 \uD56D\uBAA9 \uCD94\uAC00",
  editFixedItem: "\uACE0\uC815\uBE44 \uD56D\uBAA9 \uC218\uC815",
  itemName: "\uD56D\uBAA9 \uC774\uB984",
  accountCode: "\uACC4\uC815\uACFC\uBAA9",
  accountCodeHint:
    "\uAC00\uACC4\uBD80\uC5D0 \uBC18\uC601\uB420 \uACC4\uC815\uACFC\uBAA9\uC785\uB2C8\uB2E4.",
  amountWon: "\uAE08\uC561 (\uC6D0)",
  cycle: "\uC8FC\uAE30",
  paymentDay: "\uB9E4\uC6D4 \uCD9C\uAE08\uC77C",
  applyStartDate: "\uC801\uC6A9 \uC2DC\uC791\uC6D4",
  applyStartDateHint: "\uC774 \uC6D4 \uC774\uC804 \uB0A9\uBD80 \uAE30\uB85D\uC740 \uC790\uB3D9 \uC815\uB9AC\uB429\uB2C8\uB2E4.",
  memoOptional: "\uBA54\uBAA8 (\uC120\uD0DD)",
  activeStatus: "\uD65C\uC131 \uC0C1\uD0DC",
  viewBankLinks: "\uD1B5\uC7A5 \uC5F0\uB3D9 \uD655\uC778",
  cancel: "\uCDE8\uC18C",
  save: "\uC800\uC7A5",
  delete: "\uC0AD\uC81C",
};

function isBankLinkedPayment(row: FixedExpensePayment, bankTransactions: BankTransaction[] = []) {
  if (Boolean(row.bankTransactionId?.trim())) return true;
  return bankTransactions.some((tx) => tx.linkedFixedExpensePaymentId === row.id);
}

export type CompanyLedgerFixedExpenseModalHandle = {
  openCreateFixedExpense: () => void;
  openEditFixedExpense: (row: FixedExpense) => void;
};

type CompanyLedgerFixedExpenseModalLayerProps = {
  fixedExpenses: FixedExpense[];
  setFixedExpenses?: React.Dispatch<React.SetStateAction<FixedExpense[]>>;
  fixedExpenseCategories: string[];
  accountCodes?: AccountCode[];
  ledgerCategories?: LedgerCategory[];
  setFixedExpenseCategories: React.Dispatch<React.SetStateAction<string[]>>;
  fixedExpensePayments: FixedExpensePayment[];
  setFixedExpensePayments?: React.Dispatch<React.SetStateAction<FixedExpensePayment[]>>;
  bankTransactions: BankTransaction[];
  setBankTransactions?: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  setBankLedgerRules?: React.Dispatch<React.SetStateAction<BankLearnRule[]>>;
  currentUser?: ErpUser | null;
  onOpenBankLinkView?: (view: { fixedExpenseId: string; title: string }) => void;
  onCloseBankLinkView?: () => void;
  onRequestImmediateSave?: (patch?: {
    fixedExpenses?: FixedExpense[];
    fixedExpensePayments?: FixedExpensePayment[];
    fixedExpenseCategories?: string[];
    bankTransactions?: BankTransaction[];
  }) => void | Promise<void>;
};

export const CompanyLedgerFixedExpenseModalLayer = React.memo(
  forwardRef<CompanyLedgerFixedExpenseModalHandle, CompanyLedgerFixedExpenseModalLayerProps>(
    function CompanyLedgerFixedExpenseModalLayer(
      {
        fixedExpenses,
        setFixedExpenses,
        fixedExpenseCategories,
        accountCodes = [],
        ledgerCategories = [],
        setFixedExpenseCategories,
        fixedExpensePayments,
        setFixedExpensePayments,
        bankTransactions,
        setBankTransactions,
        setBankLedgerRules,
        currentUser,
        onOpenBankLinkView,
        onCloseBankLinkView,
        onRequestImmediateSave,
      },
      ref,
    ) {
      const { recordAudit } = useAudit();
      const [modal, setModal] = useState<FixedExpenseModalState | null>(null);
      const [formError, setFormError] = useState("");
      const [bankLinkView, setBankLinkView] = useState<{ fixedExpenseId: string; title: string } | null>(null);

      useEffect(() => {
        if (!modal) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
          document.body.style.overflow = previousOverflow;
        };
      }, [modal]);

      const sessionKey = modal ? `${modal.mode}-${modal.id ?? "create"}` : "";

      const closeModal = useCallback(() => {
        setModal(null);
        setFormError("");
        setBankLinkView(null);
      }, []);

      const openCreateFixedExpense = useCallback(() => {
        setFormError("");
        startTransition(() => {
          setModal(emptyFixedExpenseForm());
        });
      }, []);

      const openEditFixedExpense = useCallback(
        (row: FixedExpense) => {
          setFormError("");
          startTransition(() => {
            setModal(fixedExpenseRowToModalState(row, ledgerCategories));
          });
        },
        [ledgerCategories],
      );

      useImperativeHandle(
        ref,
        () => ({
          openCreateFixedExpense,
          openEditFixedExpense,
        }),
        [openCreateFixedExpense, openEditFixedExpense],
      );

      const unlinkBankFixedPayment = useCallback(
        (paymentId: string) => {
          if (!setBankTransactions) return;
          setBankTransactions((prev) =>
            prev.map((tx) =>
              tx.linkedFixedExpensePaymentId === paymentId
                ? { ...tx, linkedFixedExpensePaymentId: undefined, ledgerFixedExpenseId: undefined }
                : tx,
            ),
          );
        },
        [setBankTransactions],
      );

      const saveFixedExpense = useCallback(
        (draft: FixedExpenseModalState) => {
          if (!setFixedExpenses) return;
          const error = validateFixedExpenseInput(draft);
          if (error) {
            setFormError(error);
            return;
          }

          const normalizedStartDate =
            normalizeFixedExpenseStartDate(draft.startDate) || currentFixedExpenseStartMonthISO();
          const accountCode = String(draft.accountCode || "").trim();
          const existingFixed = draft.id ? fixedExpenses.find((row) => row.id === draft.id) : null;
          const previousAccountCode = existingFixed
            ? resolveFixedExpenseAccountCode(existingFixed, ledgerCategories)
            : "";
          const category =
            existingFixed?.category?.trim() && previousAccountCode === accountCode
              ? existingFixed.category.trim()
              : inferFixedExpenseCategoryFromAccountCode(accountCode, ledgerCategories);
          const payload: FixedExpense = {
            id: draft.id || makeLedgerId(),
            name: draft.name.trim(),
            category,
            accountCode: accountCode || undefined,
            amount: parseLedgerAmount(draft.amount),
            cycle: draft.cycle,
            paymentDayOfMonth: normalizeFixedExpensePaymentDay(draft.paymentDayOfMonth),
            startDate: normalizedStartDate,
            memo: draft.memo.trim() || undefined,
            isActive: draft.isActive,
          };

          recordAudit({
            entityType: "fixedExpense",
            entityId: payload.id,
            entityLabel: payload.name,
            screen: SCREEN_TITLE,
            action: draft.mode === "edit" ? "update" : "create",
            before: existingFixed ? snapshotFixedExpenseForAudit(existingFixed) : undefined,
            after: snapshotFixedExpenseForAudit(payload),
            fields: FIXED_EXPENSE_AUDIT_FIELDS,
            user: currentUser,
          });

          if (draft.mode === "edit" && draft.id) {
            const editingId = draft.id;
            const nextFixedExpenses = fixedExpenses.map((row) =>
              row.id === editingId
                ? {
                    ...row,
                    name: payload.name,
                    category: payload.category,
                    accountCode: payload.accountCode,
                    amount: payload.amount,
                    cycle: payload.cycle,
                    paymentDayOfMonth: payload.paymentDayOfMonth,
                    startDate: payload.startDate,
                    memo: payload.memo,
                    isActive: payload.isActive,
                  }
                : row,
            );
            setFixedExpenses(nextFixedExpenses);
            let nextFixedExpensePayments = fixedExpensePayments;
            if (setFixedExpensePayments && existingFixed) {
              const previousStartKey = getMonthKey(normalizeFixedExpenseStartDate(existingFixed.startDate));
              const startKey = getMonthKey(normalizedStartDate);
              if (startKey && previousStartKey && startKey > previousStartKey) {
                nextFixedExpensePayments = fixedExpensePayments.filter((row) => {
                  if (row.fixedExpenseId !== payload.id) return true;
                  const monthKey = getMonthKey(row.date);
                  if (!monthKey || monthKey >= startKey) return true;
                  if (isFixedExpensePaymentBankLinked(row, bankTransactions)) return true;
                  return false;
                });
                setFixedExpensePayments(nextFixedExpensePayments);
              }
            }
            const nextFixedExpenseCategories = mergeFixedExpenseCategory(
              fixedExpenseCategories,
              payload.category,
              fixedExpenses,
            );
            setFixedExpenseCategories(nextFixedExpenseCategories);
            void onRequestImmediateSave?.({
              fixedExpenses: nextFixedExpenses,
              fixedExpensePayments: nextFixedExpensePayments,
              fixedExpenseCategories: nextFixedExpenseCategories,
            });
          } else {
            const nextFixedExpenses = [payload, ...fixedExpenses];
            setFixedExpenses(nextFixedExpenses);
            const nextFixedExpenseCategories = mergeFixedExpenseCategory(
              fixedExpenseCategories,
              payload.category,
              fixedExpenses,
            );
            setFixedExpenseCategories(nextFixedExpenseCategories);
            void onRequestImmediateSave?.({
              fixedExpenses: nextFixedExpenses,
              fixedExpenseCategories: nextFixedExpenseCategories,
            });
          }
          closeModal();
        },
        [
          bankTransactions,
          closeModal,
          currentUser,
          fixedExpenseCategories,
          fixedExpensePayments,
          fixedExpenses,
          ledgerCategories,
          onRequestImmediateSave,
          recordAudit,
          setFixedExpenseCategories,
          setFixedExpensePayments,
          setFixedExpenses,
        ],
      );

      const deleteFixedExpense = useCallback(
        (draft: FixedExpenseModalState) => {
          if (!draft.id || !setFixedExpenses) return;
          const fixedExpenseId = draft.id;
          const row = fixedExpenses.find((item) => item.id === fixedExpenseId);
          if (!row) return;

          const relatedPayments = fixedExpensePayments.filter((payment) => payment.fixedExpenseId === fixedExpenseId);
          const hasBankLinkedPayment = relatedPayments.some((payment) =>
            isBankLinkedPayment(payment, bankTransactions),
          );
          const message = hasBankLinkedPayment
            ? "\uD1B5\uC7A5 \uC5F0\uB3D9\uB41C \uB0A9\uBD80\uAC00 \uC788\uC2B5\uB2C8\uB2E4. \uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?"
            : "\uC774 \uACE0\uC815\uBE44 \uD56D\uBAA9\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?";
          if (!window.confirm(message)) return;

          recordAudit({
            entityType: "fixedExpense",
            entityId: row.id,
            entityLabel: row.name,
            screen: SCREEN_TITLE,
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
              screen: SCREEN_TITLE,
              action: "delete",
              before: snapshotFixedExpensePaymentForAudit(payment),
              fields: FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS,
              user: currentUser,
            });
            if (isBankLinkedPayment(payment, bankTransactions)) unlinkBankFixedPayment(payment.id);
          });

          const nextFixedExpenses = fixedExpenses.filter((item) => item.id !== fixedExpenseId);
          const nextFixedExpensePayments = fixedExpensePayments.filter(
            (payment) => payment.fixedExpenseId !== fixedExpenseId,
          );
          const shouldClearBankTxLinks = bankTransactions.some(
            (tx) => tx.ledgerFixedExpenseId === fixedExpenseId,
          );
          const nextBankTransactions = shouldClearBankTxLinks
            ? bankTransactions.map((tx) =>
                tx.ledgerFixedExpenseId === fixedExpenseId
                  ? { ...tx, ledgerFixedExpenseId: undefined }
                  : tx,
              )
            : bankTransactions;
          setFixedExpenses(nextFixedExpenses);
          setFixedExpensePayments?.(nextFixedExpensePayments);
          if (setBankTransactions && shouldClearBankTxLinks) {
            setBankTransactions(nextBankTransactions);
          }
          setBankLedgerRules?.((prev) =>
            prev.filter((rule) => !(rule.kind === "fixed" && rule.fixedExpenseId === fixedExpenseId)),
          );
          const nextFixedExpenseCategories = normalizeFixedExpenseCategories(
            fixedExpenseCategories,
            nextFixedExpenses,
          );
          setFixedExpenseCategories(nextFixedExpenseCategories);
          void onRequestImmediateSave?.({
            fixedExpenses: nextFixedExpenses,
            fixedExpensePayments: nextFixedExpensePayments,
            fixedExpenseCategories: nextFixedExpenseCategories,
            bankTransactions: nextBankTransactions,
          });
          onCloseBankLinkView?.();
          setBankLinkView(null);
          closeModal();
        },
        [
          bankTransactions,
          closeModal,
          currentUser,
          fixedExpensePayments,
          fixedExpenses,
          onCloseBankLinkView,
          onRequestImmediateSave,
          recordAudit,
          setBankLedgerRules,
          setFixedExpenseCategories,
          setFixedExpensePayments,
          setFixedExpenses,
          unlinkBankFixedPayment,
        ],
      );

      const handleViewBankLinks = useCallback(
        (draft: FixedExpenseModalState) => {
          if (!draft.id) return;
          const view = {
            fixedExpenseId: draft.id,
            title: draft.name.trim() || draft.id,
          };
          if (onOpenBankLinkView) {
            onOpenBankLinkView(view);
            return;
          }
          setBankLinkView(view);
        },
        [onOpenBankLinkView],
      );

      if (!modal && !bankLinkView) return null;

      return (
        <>
          {modal ? (
        <CompanyLedgerFixedExpenseModal
          initial={modal}
          sessionKey={sessionKey}
          accountCodes={accountCodes}
          formError={formError}
          labels={FIXED_EXPENSE_MODAL_LABELS}
          onClose={closeModal}
          onSave={saveFixedExpense}
          onDelete={deleteFixedExpense}
          onViewBankLinks={handleViewBankLinks}
        />
          ) : null}

          {bankLinkView ? (
            <FixedExpenseBankLinkModal
              fixedExpenseId={bankLinkView.fixedExpenseId}
              title={bankLinkView.title}
              fixedExpensePayments={fixedExpensePayments}
              bankTransactions={bankTransactions}
              onClose={() => setBankLinkView(null)}
            />
          ) : null}
        </>
      );
    },
  ),
);
