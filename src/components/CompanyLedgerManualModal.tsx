import React, { useEffect, useMemo, useState } from "react";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { ExpenseCategorySelect } from "@/components/ExpenseCategorySelect";
import {
  buildFixedCategorySelectOptions,
  formatFixedExpensePaymentDay,
  type CompanyExpenseKind,
  type CompanyLedgerFlow,
  type FixedExpense,
} from "@/utils/companyLedger";

export type ManualModalState = {
  mode: "create" | "edit";
  source?: "expense" | "fixedPayment";
  id?: string;
  fixedExpenseId?: string;
  kind: CompanyExpenseKind;
  initialKind?: CompanyExpenseKind;
  flow: CompanyLedgerFlow;
  date: string;
  category: string;
  accountContent: string;
  description: string;
  amount: string;
  memo: string;
  categoryLocked?: boolean;
};

export function isManualRecordTypeSwitch(modal: ManualModalState) {
  if (modal.mode !== "edit" || !modal.id) return false;
  if (modal.source === "fixedPayment" && modal.kind === "variable") return true;
  if (modal.source === "expense" && modal.initialKind === "variable" && modal.kind === "fixed") return true;
  return false;
}

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
      className={`erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-900 md:px-4 md:py-3 ${className}`}
    />
  );
}

export type CompanyLedgerManualModalLabels = {
  addIncome: string;
  addManual: string;
  editIncome: string;
  editFixed: string;
  editManual: string;
  editKind: string;
  incomeDate: string;
  expenseDate: string;
  fixedItemSection: string;
  fixedPaymentItemHint: string;
  category: string;
  accountContent: string;
  ceoCategoryLockedHint: string;
  fixedPaymentCategoryHint: string;
  bankRecord: string;
  amountWon: string;
  memoOptional: string;
  linkFromBank: string;
  viewBankLinks: string;
  cancel: string;
  save: string;
  kindChangeSaveFixed: string;
  kindChangeSaveManual: string;
};

type CompanyLedgerManualModalProps = {
  initial: ManualModalState;
  sessionKey: string;
  expenseCategories: string[];
  fixedExpenses: FixedExpense[];
  fixedExpenseCategories: string[];
  expenseCategoryOptions: Array<{ label: string; value: string }>;
  formError: string;
  linkMessage: string;
  canLinkBankFromManualEdit: boolean;
  externalPatch?: Partial<ManualModalState> | null;
  onExternalPatchConsumed?: () => void;
  labels: CompanyLedgerManualModalLabels;
  resolveFixedExpenseCategory: (fixedExpenseId: string) => string;
  onClose: () => void;
  onSave: (draft: ManualModalState) => void;
  onOpenBankLink: (draft: ManualModalState) => void;
  onViewBankLinks: (draft: ManualModalState) => void;
};

export const CompanyLedgerManualModal = React.memo(function CompanyLedgerManualModal({
  initial,
  sessionKey,
  expenseCategories,
  fixedExpenses,
  fixedExpenseCategories,
  expenseCategoryOptions,
  formError,
  linkMessage,
  canLinkBankFromManualEdit,
  externalPatch,
  onExternalPatchConsumed,
  labels: L,
  resolveFixedExpenseCategory,
  onClose,
  onSave,
  onOpenBankLink,
  onViewBankLinks,
}: CompanyLedgerManualModalProps) {
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft(initial);
  }, [sessionKey, initial]);

  useEffect(() => {
    if (!externalPatch || !Object.keys(externalPatch).length) return;
    setDraft((prev) => ({ ...prev, ...externalPatch }));
    onExternalPatchConsumed?.();
  }, [externalPatch, onExternalPatchConsumed]);

  const manualFixedCategoryOptions = useMemo(
    () =>
      buildFixedCategorySelectOptions(
        fixedExpenses,
        fixedExpenseCategories,
        draft.kind === "fixed" ? draft.category : "",
      ),
    [fixedExpenses, fixedExpenseCategories, draft.category, draft.kind],
  );

  const fixedExpenseSelectOptions = useMemo(() => {
    const selectedId = draft.kind === "fixed" ? draft.fixedExpenseId : "";
    return fixedExpenses
      .filter((row) => row.isActive || row.id === selectedId)
      .map((row) => ({
        value: row.id,
        label: `${row.name} \u00B7 ${row.category} \u00B7 ${formatFixedExpensePaymentDay(row.paymentDayOfMonth)}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "ko"));
  }, [fixedExpenses, draft.fixedExpenseId, draft.kind]);

  const setManualKind = (kind: CompanyExpenseKind) => {
    setDraft((prev) => {
      if (prev.kind === kind || prev.mode !== "edit") return prev;
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
        next.category = expenseCategories[0] || expenseCategoryOptions[0]?.value || "";
        next.fixedExpenseId = undefined;
      }
      return next;
    });
  };

  return (
    <div
      className="erp-ledger-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="erp-ledger-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="erp-text-section font-bold">
            {draft.mode === "create"
              ? draft.flow === "income"
                ? L.addIncome
                : L.addManual
              : draft.flow === "income"
                ? L.editIncome
                : draft.source === "fixedPayment" || draft.kind === "fixed"
                  ? L.editFixed
                  : L.editManual}
          </h2>
          <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          {draft.mode === "edit" && draft.flow === "expense" && !draft.categoryLocked ? (
            <Field label={L.editKind}>
              <div className="grid grid-cols-2 gap-2">
                {MANUAL_KIND_TOGGLE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                      draft.kind === option.key ? option.activeTone : option.tone
                    }`}
                    onClick={() => setManualKind(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}
          <Field label={draft.flow === "income" ? L.incomeDate : L.expenseDate}>
            <KoreanDateInput
              value={draft.date}
              onChange={(event) => setDraft((prev) => ({ ...prev, date: event.target.value }))}
            />
          </Field>
          {draft.mode === "edit" && draft.kind === "fixed" && draft.flow === "expense" ? (
            <Field label={L.fixedItemSection}>
              <AutocompleteInput
                value={draft.fixedExpenseId || ""}
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
                  setDraft((prev) => ({
                    ...prev,
                    fixedExpenseId,
                    category: fixedItem?.category?.trim() || prev.category,
                  }));
                }}
              />
              <p className="mt-1.5 text-xs font-semibold text-slate-500">{L.fixedPaymentItemHint}</p>
            </Field>
          ) : null}
          <Field label={L.category}>
            {draft.categoryLocked ? (
              <>
                <div className="erp-input w-full rounded-2xl border bg-slate-50 px-3 py-2.5 font-semibold text-slate-800 md:px-4 md:py-3">
                  {draft.category}
                </div>
                <p className="mt-1.5 text-xs font-semibold text-slate-500">{L.ceoCategoryLockedHint}</p>
              </>
            ) : draft.kind === "fixed" && draft.flow === "expense" ? (
              <>
                <ExpenseCategorySelect
                  value={draft.category}
                  categories={manualFixedCategoryOptions.map((row) => row.value)}
                  compact={false}
                  className="rounded-xl"
                  onChange={(value) => setDraft((prev) => ({ ...prev, category: value }))}
                />
                <p className="mt-1.5 text-xs font-semibold text-slate-500">
                  {draft.source === "fixedPayment"
                    ? L.fixedPaymentCategoryHint
                    : "\uACE0\uC815\uBE44 \uCE74\uD14C\uACE0\uB9AC \uBAA9\uB85D\uC5D0\uC11C \uC120\uD0DD\uD569\uB2C8\uB2E4."}
                </p>
              </>
            ) : (
              <>
                <ExpenseCategorySelect
                  value={draft.category}
                  categories={expenseCategories}
                  compact={false}
                  className="rounded-xl"
                  onChange={(value) => setDraft((prev) => ({ ...prev, category: value }))}
                />
                <p className="mt-1.5 text-xs font-semibold text-slate-500">
                  {"\uCE74\uD14C\uACE0\uB9AC \uAD00\uB9AC\uC5D0\uC11C \uBAA9\uB85D\uC744 \uD3B8\uC9D1\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."}
                </p>
              </>
            )}
          </Field>
          <Field label={L.accountContent}>
            <Input
              lang="ko"
              value={draft.accountContent}
              onChange={(e) => setDraft((prev) => ({ ...prev, accountContent: e.target.value }))}
            />
          </Field>
          <Field label={L.bankRecord}>
            <Input
              lang="ko"
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
            />
          </Field>
          <Field label={L.amountWon}>
            <Input
              inputMode="numeric"
              value={draft.amount}
              onChange={(e) => setDraft((prev) => ({ ...prev, amount: e.target.value }))}
            />
          </Field>
          <Field label={L.memoOptional}>
            <Input value={draft.memo} onChange={(e) => setDraft((prev) => ({ ...prev, memo: e.target.value }))} />
          </Field>
          {canLinkBankFromManualEdit ? (
            <div>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-2xl"
                onClick={() => onOpenBankLink(draft)}
              >
                <Link2 size={16} className="mr-2" />
                {L.linkFromBank}
              </Button>
            </div>
          ) : null}
          {draft.mode === "edit" &&
          draft.kind === "fixed" &&
          draft.source === "fixedPayment" &&
          draft.fixedExpenseId ? (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-2xl"
              onClick={() => onViewBankLinks(draft)}
            >
              <Link2 size={16} className="mr-2" />
              {L.viewBankLinks}
            </Button>
          ) : null}
          {linkMessage ? <p className="erp-text-caption font-semibold text-emerald-700">{linkMessage}</p> : null}
          {formError ? <p className="erp-text-caption font-semibold text-rose-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="rounded-2xl" onClick={onClose}>
              {L.cancel}
            </Button>
            <Button className="rounded-2xl" onClick={() => onSave(draft)}>
              {isManualRecordTypeSwitch(draft)
                ? draft.kind === "fixed"
                  ? L.kindChangeSaveFixed
                  : L.kindChangeSaveManual
                : L.save}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
