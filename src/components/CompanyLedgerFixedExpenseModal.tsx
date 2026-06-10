import React, { useEffect, useMemo, useState } from "react";
import { Link2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildAccountCodePickerOptions, findAccountCodeByCode, formatAccountCodeLabel } from "@/utils/accountCodeTree";
import {
  FIXED_CYCLE_OPTIONS,
  currentFixedExpenseStartMonthISO,
  fixedExpenseStartMonthInputValue,
  formatFixedExpensePaymentDay,
  normalizeFixedExpenseStartDate,
  normalizeFixedExpensePaymentDay,
  type FixedExpense,
  type FixedExpenseCycle,
} from "@/utils/companyLedger";
import { resolveFixedExpenseAccountCode, type AccountCode, type LedgerCategory } from "@/utils/ledgerSystem";

const PAYMENT_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => String(index + 1));

export type FixedExpenseModalState = {
  mode: "create" | "edit";
  id?: string;
  name: string;
  accountCode: string;
  amount: string;
  cycle: FixedExpenseCycle;
  paymentDayOfMonth: string;
  startDate: string;
  memo: string;
  isActive: boolean;
};

export type FixedExpenseModalLabels = {
  addFixedItem: string;
  editFixedItem: string;
  itemName: string;
  accountCode: string;
  accountCodeHint: string;
  amountWon: string;
  cycle: string;
  paymentDay: string;
  applyStartDate: string;
  applyStartDateHint: string;
  memoOptional: string;
  activeStatus: string;
  viewBankLinks: string;
  cancel: string;
  save: string;
  delete: string;
};

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

export function emptyFixedExpenseForm(): FixedExpenseModalState {
  return {
    mode: "create",
    name: "",
    accountCode: "",
    amount: "",
    cycle: "monthly",
    paymentDayOfMonth: "1",
    startDate: currentFixedExpenseStartMonthISO(),
    memo: "",
    isActive: true,
  };
}

export function fixedExpenseRowToModalState(
  row: FixedExpense,
  ledgerCategories: LedgerCategory[] = [],
): FixedExpenseModalState {
  return {
    mode: "edit",
    id: row.id,
    name: row.name,
    accountCode: resolveFixedExpenseAccountCode(row, ledgerCategories),
    amount: String(row.amount || ""),
    cycle: row.cycle,
    paymentDayOfMonth: String(normalizeFixedExpensePaymentDay(row.paymentDayOfMonth)),
    startDate: normalizeFixedExpenseStartDate(row.startDate) || currentFixedExpenseStartMonthISO(),
    memo: row.memo || "",
    isActive: row.isActive,
  };
}

type CompanyLedgerFixedExpenseModalProps = {
  initial: FixedExpenseModalState;
  sessionKey: string;
  accountCodes: AccountCode[];
  formError: string;
  labels: FixedExpenseModalLabels;
  onClose: () => void;
  onSave: (draft: FixedExpenseModalState) => void;
  onDelete: (draft: FixedExpenseModalState) => void;
  onViewBankLinks: (draft: FixedExpenseModalState) => void;
};

export const CompanyLedgerFixedExpenseModal = React.memo(function CompanyLedgerFixedExpenseModal({
  initial,
  sessionKey,
  accountCodes,
  formError,
  labels: L,
  onClose,
  onSave,
  onDelete,
  onViewBankLinks,
}: CompanyLedgerFixedExpenseModalProps) {
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft(initial);
  }, [sessionKey, initial]);

  const accountCodeOptions = useMemo(
    () => buildAccountCodePickerOptions(accountCodes, "expense"),
    [accountCodes],
  );

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
            {draft.mode === "create" ? L.addFixedItem : L.editFixedItem}
          </h2>
          <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <Field label={L.itemName}>
            <Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
          </Field>
          <Field label={L.accountCode}>
            <select
              className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-900 md:px-4 md:py-3"
              value={draft.accountCode}
              onChange={(e) => setDraft((prev) => ({ ...prev, accountCode: e.target.value }))}
            >
              {!draft.accountCode ? (
                <option value="">{"\uACC4\uC815\uACFC\uBAA9\uC744 \uC120\uD0DD\uD558\uC138\uC694"}</option>
              ) : null}
              {accountCodeOptions.map((option) => {
                const account = findAccountCodeByCode(accountCodes, option.code);
                const label = account
                  ? `${option.code} · ${formatAccountCodeLabel(account, accountCodes)}`
                  : `${option.code} · ${option.label}`;
                return (
                  <option key={option.code} value={option.code}>
                    {label}
                  </option>
                );
              })}
            </select>
            <p className="mt-1.5 text-xs font-semibold text-slate-500">{L.accountCodeHint}</p>
          </Field>
          <Field label={L.amountWon}>
            <Input
              inputMode="numeric"
              value={draft.amount}
              onChange={(e) => setDraft((prev) => ({ ...prev, amount: e.target.value }))}
            />
          </Field>
          <Field label={L.cycle}>
            <div className="flex flex-wrap gap-2">
              {FIXED_CYCLE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={draft.cycle === option.value ? "default" : "outline"}
                  className="rounded-2xl"
                  onClick={() => setDraft((prev) => ({ ...prev, cycle: option.value }))}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </Field>
          <Field label={L.paymentDay}>
            <select
              className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-900 md:px-4 md:py-3"
              value={draft.paymentDayOfMonth}
              onChange={(e) => setDraft((prev) => ({ ...prev, paymentDayOfMonth: e.target.value }))}
            >
              {PAYMENT_DAY_OPTIONS.map((day) => (
                <option key={day} value={day}>
                  {formatFixedExpensePaymentDay(Number(day))}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L.applyStartDate}>
            <Input
              type="month"
              lang="ko"
              value={fixedExpenseStartMonthInputValue(draft.startDate)}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  startDate: normalizeFixedExpenseStartDate(event.target.value) || prev.startDate,
                }))
              }
            />
            <p className="erp-text-caption mt-1 text-slate-500">{L.applyStartDateHint}</p>
          </Field>
          <Field label={L.memoOptional}>
            <Input value={draft.memo} onChange={(e) => setDraft((prev) => ({ ...prev, memo: e.target.value }))} />
          </Field>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => setDraft((prev) => ({ ...prev, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="erp-text-caption font-semibold text-slate-600">{L.activeStatus}</span>
          </label>
          {formError ? <p className="erp-text-caption font-semibold text-rose-600">{formError}</p> : null}
          {draft.mode === "edit" && draft.id ? (
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
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {draft.mode === "edit" && draft.id ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => onDelete(draft)}
              >
                <Trash2 size={16} className="mr-2" />
                {L.delete}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-2xl" onClick={onClose}>
                {L.cancel}
              </Button>
              <Button className="rounded-2xl" onClick={() => onSave(draft)}>
                {L.save}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
