import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CategoryDatalistOptions,
  UncontrolledBufferedTextarea,
  UncontrolledCategoryInput,
} from "@/components/AutocompleteInput";
import { applyMemoCategoryToLedgerDraft } from "@/utils/bankCompanyLedger";
import { formatKRW, normalizeExpenseCategoryName, EXPENSE_CATEGORY_OPTIONS } from "@/utils/companyLedger";
import {
  formatBankTransactionDateTime,
  parseBankAmount,
  type BankTransaction,
} from "@/utils/bankTransactions";

export type LedgerRegisterKind = "fixed" | "manual";

export const BANK_TX_MANUAL_CATEGORY_LIST_ID = "erp-bank-tx-category-manual";
export const BANK_TX_FIXED_CATEGORY_LIST_ID = "erp-bank-tx-category-fixed";

const LEDGER_KIND_OPTIONS: Array<{ key: LedgerRegisterKind; label: string; tone: string; activeTone: string }> = [
  { key: "manual", label: "\uBCC0\uB3D9 \uC9C0\uCD9C", tone: "border-slate-200 bg-white text-slate-600", activeTone: "border-slate-900 bg-slate-900 text-white" },
  { key: "fixed", label: "\uACE0\uC815\uBE44", tone: "border-slate-200 bg-white text-slate-600", activeTone: "border-amber-600 bg-amber-600 text-white" },
];

const LABELS = {
  detailTitle: "\uD1B5\uC7A5 \uAC70\uB798 \uC804\uD45C",
  detailInfoSection: "\uAC70\uB798 \uC815\uBCF4",
  detailEditSection: "\uC218\uC815 \uD56D\uBAA9",
  detailSave: "\uC800\uC7A5",
  memoEditHint: "\uBA54\uBAA8 \u00B7 \uBD84\uB958 \u00B7 \uAC00\uACC4\uBD80 \uD56D\uBAA9\uC744 \uC218\uC815\uD55C \uB92C \uC800\uC7A5\uC744 \uB204\uB974\uBA74 \uBC18\uC601\uB429\uB2C8\uB2E4.",
  memo: "\uBA54\uBAA8",
  memoPlaceholder: "\uBA54\uBAA8 \uC785\uB825",
  deposit: "\uC785\uAE08",
  withdrawal: "\uCD9C\uAE08",
  balance: "\uC794\uC561",
  description: "\uAC70\uB798\uB0B4\uC6A9",
  counterpartyName: "\uC0C1\uB300\uC608\uAE08\uC8FC",
  counterpartyBank: "\uC0C1\uB300\uC740\uD589",
  accountNumber: "\uACC4\uC88C\uBC88\uD638",
  bankName: "\uC740\uD589",
  transactionType: "\uAC70\uB798\uAD6C\uBD84",
  classification: "\uBD84\uB958",
  ledgerCategoryColumn: "\uAC00\uACC4\uBD80",
  matchStatus: "\uBBF8\uC218 \uC5F0\uACB0",
  linkedSubject: "\uC5F0\uACB0 \uC774\uB984",
  unfiled: "\uBBF8\uBD84\uB958",
  cancel: "\uCDE8\uC18C",
  clientFolders: "\uAC70\uB798\uCC98 \uC785\uAE08",
  cardFolders: "\uCE74\uB4DC\uB9E4\uCD9C",
  workerFolders: "\uC2DC\uACF5\uC790 \uC9C0\uCD9C",
  detailLedgerKindHint: "\uBCC0\uB3D9 \uC9C0\uCD9C\uC740 \uCE74\uD14C\uACE0\uB9AC\uB97C, \uACE0\uC815\uBE44\uB294 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD569\uB2C8\uB2E4.",
  ledgerKind: "\uB4F1\uB85D \uC720\uD615",
  ledgerFixedItem: "\uACE0\uC815\uBE44 \uD56D\uBAA9",
  ledgerManualCategory: "\uC9C0\uCD9C \uCE74\uD14C\uACE0\uB9AC",
  ledgerCategory: "\uCE74\uD14C\uACE0\uB9AC",
  ledgerCategoryAddHint: "\uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uCE74\uD14C\uACE0\uB9AC\uB294 \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694.",
  ledgerSendTo: "\uAC00\uACC4\uBD80\uB85C \uBCF4\uB0B4\uAE30",
  ledgerEditTitle: "\uAC00\uACC4\uBD80 \uB4F1\uB85D \uC218\uC815",
};

const FIXED_LABEL_SPLIT = " \u00B7 ";

export type DrawerFolderOption = { id: string; label: string };

export type DrawerCustomFolderOptgroup = {
  rootId: string;
  rootLabel: string;
  options: DrawerFolderOption[];
};

export type DrawerFolderSelectData = {
  clientOptions: DrawerFolderOption[];
  cardOptions: DrawerFolderOption[];
  workerOptions: DrawerFolderOption[];
  customOptgroups: DrawerCustomFolderOptgroup[];
};

export type BankTransactionDetailDrawerProps = {
  tx: BankTransaction;
  folderLabel: string;
  ledgerCategoryLabel: string | null;
  ledgerCategorySuggestion: string | null;
  matchStatusLabel: string;
  linkedSubject: string;
  initialLedgerKind: LedgerRegisterKind;
  initialLedgerCategory: string;
  initialFixedExpenseId: string;
  manualCategorySuggestions: readonly string[];
  fixedCategorySuggestions: readonly string[];
  fixedExpenseOptions: Array<{ label: string; value: string }>;
  folderSelectData: DrawerFolderSelectData;
  canLedger: boolean;
  onClose: () => void;
  onSave: (payload: {
    memo: string;
    folderId: string;
    ledgerKind: LedgerRegisterKind;
    ledgerCategory: string;
    fixedExpenseId: string;
  }) => void;
  onOpenLedgerRegister?: () => void;
  onOpenLedgerEdit?: () => void;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function DetailReadRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="erp-bank-tx-detail-row">
      <dt className="erp-bank-tx-detail-label">{label}</dt>
      <dd className="erp-bank-tx-detail-value">{value}</dd>
    </div>
  );
}

const DrawerFolderSelect = React.memo(function DrawerFolderSelect({
  folderId,
  onFolderChange,
  clientOptions,
  cardOptions,
  workerOptions,
  customOptgroups,
}: {
  folderId: string;
  onFolderChange: (value: string) => void;
  clientOptions: DrawerFolderOption[];
  cardOptions: DrawerFolderOption[];
  workerOptions: DrawerFolderOption[];
  customOptgroups: DrawerCustomFolderOptgroup[];
}) {
  return (
    <Field label={LABELS.classification}>
      <select
        className="erp-input w-full rounded-xl"
        value={folderId}
        onChange={(event) => onFolderChange(event.target.value)}
      >
        <option value="">{LABELS.unfiled}</option>
        <optgroup label={LABELS.clientFolders}>
          {clientOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </optgroup>
        <optgroup label={LABELS.cardFolders}>
          {cardOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </optgroup>
        <optgroup label={LABELS.workerFolders}>
          {workerOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </optgroup>
        {customOptgroups.map((group) => (
          <optgroup key={group.rootId} label={group.rootLabel}>
            {group.options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
});

const DrawerFixedExpenseSelect = React.memo(function DrawerFixedExpenseSelect({
  value,
  options,
  onChange,
  onPickCategory,
}: {
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
  onPickCategory: (category: string) => void;
}) {
  return (
    <Field label={LABELS.ledgerFixedItem}>
      <select
        className="erp-input w-full rounded-xl"
        value={value}
        onChange={(event) => {
          const nextFixedExpenseId = event.target.value;
          onChange(nextFixedExpenseId);
          const selected = options.find((row) => row.value === nextFixedExpenseId);
          const categoryFromLabel = selected?.label.split(FIXED_LABEL_SPLIT)[1]?.trim();
          if (categoryFromLabel) onPickCategory(categoryFromLabel);
        }}
      >
        <option value="">{LABELS.ledgerFixedItem}</option>
        {options.map((row) => (
          <option key={row.value} value={row.value}>
            {row.label}
          </option>
        ))}
      </select>
    </Field>
  );
});

const DrawerLedgerKindToggle = React.memo(function DrawerLedgerKindToggle({
  ledgerKind,
  onChange,
}: {
  ledgerKind: LedgerRegisterKind;
  onChange: (kind: LedgerRegisterKind) => void;
}) {
  return (
    <Field label={LABELS.ledgerKind}>
      <div className="grid grid-cols-2 gap-2">
        {LEDGER_KIND_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
              ledgerKind === option.key ? option.activeTone : option.tone
            }`}
            onClick={() => onChange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs font-semibold text-slate-500">{LABELS.detailLedgerKindHint}</p>
    </Field>
  );
});

const DrawerMemoField = React.memo(function DrawerMemoField({
  defaultMemo,
  draftRef,
  textareaRef,
}: {
  defaultMemo: string;
  draftRef: React.MutableRefObject<string>;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <Field label={LABELS.memo}>
      <UncontrolledBufferedTextarea
        defaultValue={defaultMemo}
        draftRef={draftRef}
        textareaRef={textareaRef}
        className="min-h-24 w-full rounded-2xl px-4 py-3"
        placeholder={LABELS.memoPlaceholder}
      />
    </Field>
  );
});

const DrawerCategoryField = React.memo(function DrawerCategoryField({
  defaultCategory,
  draftRef,
  inputRef,
  listId,
  label,
  placeholder,
}: {
  defaultCategory: string;
  draftRef: React.MutableRefObject<string>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  listId: string;
  label: string;
  placeholder: string;
}) {
  return (
    <Field label={label}>
      <UncontrolledCategoryInput
        defaultValue={defaultCategory}
        draftRef={draftRef}
        inputRef={inputRef}
        listId={listId}
        className="rounded-xl"
        placeholder={placeholder}
      />
      <p className="mt-1.5 text-xs font-semibold text-slate-500">{LABELS.ledgerCategoryAddHint}</p>
    </Field>
  );
});

const BankTxCategoryDatalistPool = React.memo(function BankTxCategoryDatalistPool({
  manualSuggestions,
  fixedSuggestions,
}: {
  manualSuggestions: readonly string[];
  fixedSuggestions: readonly string[];
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <CategoryDatalistOptions listId={BANK_TX_MANUAL_CATEGORY_LIST_ID} suggestions={manualSuggestions} />
      <CategoryDatalistOptions listId={BANK_TX_FIXED_CATEGORY_LIST_ID} suggestions={fixedSuggestions} />
    </>,
    document.body,
  );
});

function resolveDrawerCategory(
  memo: string,
  rawCategory: string,
  ledgerKind: LedgerRegisterKind,
): { ledgerKind: LedgerRegisterKind; ledgerCategory: string } {
  const draft = applyMemoCategoryToLedgerDraft(
    memo,
    { ledgerKind, ledgerCategory: rawCategory },
    EXPENSE_CATEGORY_OPTIONS,
  );
  const ledgerCategory = draft.ledgerCategory
    ? normalizeExpenseCategoryName(draft.ledgerCategory)
    : rawCategory.trim()
      ? normalizeExpenseCategoryName(rawCategory.trim())
      : "";
  return { ledgerKind: draft.ledgerKind, ledgerCategory };
}

function drawerPropsEqual(
  prev: BankTransactionDetailDrawerProps,
  next: BankTransactionDetailDrawerProps,
): boolean {
  return (
    prev.tx.id === next.tx.id &&
    prev.tx.memo === next.tx.memo &&
    prev.tx.folderId === next.tx.folderId &&
    prev.folderLabel === next.folderLabel &&
    prev.ledgerCategoryLabel === next.ledgerCategoryLabel &&
    prev.ledgerCategorySuggestion === next.ledgerCategorySuggestion &&
    prev.matchStatusLabel === next.matchStatusLabel &&
    prev.linkedSubject === next.linkedSubject &&
    prev.initialLedgerKind === next.initialLedgerKind &&
    prev.initialLedgerCategory === next.initialLedgerCategory &&
    prev.initialFixedExpenseId === next.initialFixedExpenseId &&
    prev.manualCategorySuggestions === next.manualCategorySuggestions &&
    prev.fixedCategorySuggestions === next.fixedCategorySuggestions &&
    prev.fixedExpenseOptions === next.fixedExpenseOptions &&
    prev.folderSelectData === next.folderSelectData &&
    prev.canLedger === next.canLedger &&
    prev.onClose === next.onClose &&
    prev.onSave === next.onSave &&
    prev.onOpenLedgerRegister === next.onOpenLedgerRegister &&
    prev.onOpenLedgerEdit === next.onOpenLedgerEdit
  );
}

export const BankTransactionDetailDrawer = React.memo(function BankTransactionDetailDrawer({
  tx,
  folderLabel,
  ledgerCategoryLabel,
  ledgerCategorySuggestion,
  matchStatusLabel,
  linkedSubject,
  initialLedgerKind,
  initialLedgerCategory,
  initialFixedExpenseId,
  manualCategorySuggestions,
  fixedCategorySuggestions,
  fixedExpenseOptions,
  folderSelectData,
  canLedger,
  onClose,
  onSave,
  onOpenLedgerRegister,
  onOpenLedgerEdit,
}: BankTransactionDetailDrawerProps) {
  const memoDraftRef = useRef(tx.memo || "");
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null);
  const categoryDraftRef = useRef(initialLedgerCategory);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const onSaveRef = useRef(onSave);
  const onOpenLedgerRegisterRef = useRef(onOpenLedgerRegister);
  const onOpenLedgerEditRef = useRef(onOpenLedgerEdit);

  onCloseRef.current = onClose;
  onSaveRef.current = onSave;
  onOpenLedgerRegisterRef.current = onOpenLedgerRegister;
  onOpenLedgerEditRef.current = onOpenLedgerEdit;

  const [folderId, setFolderId] = useState(tx.folderId || "");
  const [ledgerKind, setLedgerKind] = useState<LedgerRegisterKind>(initialLedgerKind);
  const [fixedExpenseId, setFixedExpenseId] = useState(initialFixedExpenseId);
  const [editReady, setEditReady] = useState(false);

  useEffect(() => {
    memoDraftRef.current = tx.memo || "";
    categoryDraftRef.current = initialLedgerCategory;
    if (categoryInputRef.current) categoryInputRef.current.value = initialLedgerCategory;
    setFolderId(tx.folderId || "");
    setLedgerKind(initialLedgerKind);
    setFixedExpenseId(initialFixedExpenseId);
  }, [tx.id, tx.memo, tx.folderId, initialLedgerKind, initialLedgerCategory, initialFixedExpenseId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEditReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const setCategoryFromFixedPick = useCallback((category: string) => {
    categoryDraftRef.current = category;
    if (categoryInputRef.current) categoryInputRef.current.value = category;
  }, []);

  const handleSave = useCallback(() => {
    const memo = (memoTextareaRef.current?.value ?? memoDraftRef.current).trim();
    memoDraftRef.current = memo;
    const rawCategory = (categoryInputRef.current?.value ?? categoryDraftRef.current).trim();
    const resolved = resolveDrawerCategory(memo, rawCategory, ledgerKind);
    categoryDraftRef.current = resolved.ledgerCategory;
    if (categoryInputRef.current && resolved.ledgerCategory !== rawCategory) {
      categoryInputRef.current.value = resolved.ledgerCategory;
    }

    let resolvedFixedId = fixedExpenseId.trim();
    if (resolved.ledgerKind === "fixed") {
      const selected = fixedExpenseOptions.find((row) => row.value === resolvedFixedId);
      if (!selected) {
        const byLabel = fixedExpenseOptions.find(
          (row) => row.label.split(FIXED_LABEL_SPLIT)[0]?.trim() === resolved.ledgerCategory,
        );
        if (byLabel) resolvedFixedId = byLabel.value;
      }
    }

    onSaveRef.current({
      memo,
      folderId,
      ledgerKind: resolved.ledgerKind,
      ledgerCategory: resolved.ledgerCategory,
      fixedExpenseId: resolvedFixedId,
    });
  }, [fixedExpenseId, fixedExpenseOptions, folderId, ledgerKind]);

  const categoryListId =
    ledgerKind === "fixed" ? BANK_TX_FIXED_CATEGORY_LIST_ID : BANK_TX_MANUAL_CATEGORY_LIST_ID;
  const categoryLabel =
    ledgerKind === "fixed" ? LABELS.ledgerCategory : LABELS.ledgerManualCategory;

  const deposit = parseBankAmount(tx.deposit);
  const withdrawal = parseBankAmount(tx.withdrawal);

  if (typeof document === "undefined") return null;

  return (
    <>
      <BankTxCategoryDatalistPool
        manualSuggestions={manualCategorySuggestions}
        fixedSuggestions={fixedCategorySuggestions}
      />
      {createPortal(
        <div
          className="erp-ledger-calendar-drawer-backdrop erp-ledger-calendar-drawer-backdrop--elevated"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCloseRef.current();
          }}
        >
          <aside
            className="erp-ledger-calendar-drawer erp-bank-tx-detail-drawer erp-calendar-side-panel"
            aria-label={LABELS.detailTitle}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="erp-calendar-side-panel-head">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{LABELS.detailTitle}</p>
                <strong className="erp-calendar-side-panel-date mt-1 block text-base">
                  {formatBankTransactionDateTime(tx.transactionAt)}
                </strong>
                <p className="mt-1 truncate text-sm font-semibold text-slate-900">{tx.description || "-"}</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {deposit > 0 ? (
                    <span className="text-emerald-700">
                      {LABELS.deposit} {formatKRW(deposit)}
                    </span>
                  ) : withdrawal > 0 ? (
                    <span className="text-red-600">
                      {LABELS.withdrawal} {formatKRW(withdrawal)}
                    </span>
                  ) : (
                    "-"
                  )}
                  {" \u00B7 "}
                  {LABELS.balance} {formatKRW(tx.balanceAfter)}
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
                onClick={() => onCloseRef.current()}
              >
                <X size={18} />
              </button>
            </div>

            <div className="erp-calendar-side-panel-body erp-bank-tx-detail-body">
              <section className="erp-bank-tx-detail-section">
                <h3 className="erp-bank-tx-detail-section-title">{LABELS.detailInfoSection}</h3>
                <dl className="erp-bank-tx-detail-grid">
                  <DetailReadRow label={LABELS.description} value={tx.description || "-"} />
                  <DetailReadRow label={LABELS.counterpartyName} value={tx.counterpartyName || "-"} />
                  <DetailReadRow label={LABELS.counterpartyBank} value={tx.counterpartyBank || "-"} />
                  <DetailReadRow label={LABELS.accountNumber} value={tx.accountNumber || "-"} />
                  <DetailReadRow label={LABELS.bankName} value={tx.bankName || "-"} />
                  <DetailReadRow label={LABELS.transactionType} value={tx.transactionType || "-"} />
                  <DetailReadRow label={LABELS.classification} value={folderLabel} />
                  <DetailReadRow
                    label={LABELS.ledgerCategoryColumn}
                    value={ledgerCategoryLabel || ledgerCategorySuggestion || "-"}
                  />
                  <DetailReadRow label={LABELS.matchStatus} value={matchStatusLabel} />
                  {linkedSubject ? <DetailReadRow label={LABELS.linkedSubject} value={linkedSubject} /> : null}
                  {tx.memo ? <DetailReadRow label={LABELS.memo} value={tx.memo} /> : null}
                </dl>
              </section>

              {editReady ? (
                <section className="erp-bank-tx-detail-section">
                  <h3 className="erp-bank-tx-detail-section-title">{LABELS.detailEditSection}</h3>
                  <p className="mb-3 text-xs font-semibold text-slate-500">{LABELS.memoEditHint}</p>
                  <div className="space-y-3">
                    <DrawerMemoField
                      key={tx.id}
                      defaultMemo={tx.memo || ""}
                      draftRef={memoDraftRef}
                      textareaRef={memoTextareaRef}
                    />
                    <DrawerFolderSelect
                      folderId={folderId}
                      onFolderChange={setFolderId}
                      clientOptions={folderSelectData.clientOptions}
                      cardOptions={folderSelectData.cardOptions}
                      workerOptions={folderSelectData.workerOptions}
                      customOptgroups={folderSelectData.customOptgroups}
                    />
                    <DrawerLedgerKindToggle ledgerKind={ledgerKind} onChange={setLedgerKind} />
                    {ledgerKind === "fixed" ? (
                      <DrawerFixedExpenseSelect
                        value={fixedExpenseId}
                        options={fixedExpenseOptions}
                        onChange={setFixedExpenseId}
                        onPickCategory={setCategoryFromFixedPick}
                      />
                    ) : null}
                    <DrawerCategoryField
                      key={`${tx.id}-${ledgerKind}`}
                      defaultCategory={initialLedgerCategory}
                      draftRef={categoryDraftRef}
                      inputRef={categoryInputRef}
                      listId={categoryListId}
                      label={categoryLabel}
                      placeholder={categoryLabel}
                    />
                  </div>
                </section>
              ) : null}

              {canLedger || onOpenLedgerEdit ? (
                <div className="flex flex-wrap gap-2">
                  {onOpenLedgerEdit ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-amber-200 bg-amber-50 text-amber-900"
                      onClick={() => onOpenLedgerEditRef.current?.()}
                    >
                      <BookOpen size={14} className="mr-1" />
                      {LABELS.ledgerEditTitle}
                    </Button>
                  ) : null}
                  {canLedger && onOpenLedgerRegister ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-amber-200 bg-amber-50 text-amber-900"
                      onClick={() => onOpenLedgerRegisterRef.current?.()}
                    >
                      <BookOpen size={14} className="mr-1" />
                      {LABELS.ledgerSendTo}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="erp-bank-tx-detail-footer">
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl"
                onClick={() => onCloseRef.current()}
              >
                {LABELS.cancel}
              </Button>
              <Button
                type="button"
                className="rounded-2xl"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleSave}
              >
                {LABELS.detailSave}
              </Button>
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}, drawerPropsEqual);
