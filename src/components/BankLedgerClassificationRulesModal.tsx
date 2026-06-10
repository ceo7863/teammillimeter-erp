import React, { useEffect, useMemo, useState } from "react";
import { ListChecks, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LedgerAccountCodeSelect } from "@/components/LedgerAccountCodeSelect";
import { BufferedTextInput } from "@/components/AutocompleteInput";
import type { BankLearnRule } from "@/utils/bankCompanyLedger";
import {
  applyCustomBankLearnRuleMetadata,
  autoApplyBankLearnRules,
  upsertBankLearnRule,
} from "@/utils/bankCompanyLedger";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { AccountCode, LedgerCategory } from "@/utils/ledgerSystem";
import { migrateExpenseCategoryToAccountCode } from "@/utils/bankLedgerAccounts";
import {
  BANK_LEARN_CONDITION_FIELD_LABELS,
  BANK_LEARN_CONDITION_OPERATOR_LABELS,
  buildCustomBankLearnRuleFromDraft,
  createEmptyBankLearnCondition,
  createEmptyBankLearnConditionGroup,
  createEmptyCustomBankLearnRuleDraft,
  listEditableCustomBankLearnRules,
  summarizeCustomBankLearnRule,
  type BankLearnCondition,
  type BankLearnConditionGroup,
  type BankLearnConditionField,
  type BankLearnRuleDirection,
} from "@/utils/bankLearnCustomRules";

const L = {
  panelTitle: "\uBD84\uB958 \uADDC\uCE59",
  panelDesc:
    "\uD1B5\uC7A5 \uB0B4\uC5ED\uC774 \uC870\uAC74\uC5D0 \uB9DE\uC73C\uBA74 \uBD84\uB958 \uACC4\uC815 \uAD00\uB9AC\uC758 \uACC4\uC815\u00B7\uAC70\uB798\uCC98\uB97C \uC790\uB3D9 \uC801\uC6A9\uD569\uB2C8\uB2E4.",
  createRule: "\uADDC\uCE59 \uB9CC\uB4E4\uAE30",
  editRule: "\uADDC\uCE59 \uC218\uC815",
  empty: "\uC800\uC7A5\uB41C \uADDC\uCE59\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  close: "\uB2EB\uAE30",
  cancel: "\uCDE8\uC18C",
  saveRule: "\uADDC\uCE59 \uB9CC\uB4E4\uAE30",
  saveChanges: "\uBCC0\uACBD \uC800\uC7A5",
  delete: "\uC0AD\uC81C",
  edit: "\uC218\uC815",
  unnamedRule: "\uC774\uB984 \uC5C6\uB294 \uADDC\uCE59",
  conditionLead: "\uC544\uB798\uC640 \uAC19\uC740 \uD1B5\uC7A5 \uB0B4\uC5ED\uC774 \uC0DD\uAE30\uBA74...",
  actionLead: "\uB2E4\uC74C \uAC12\uC744 \uC801\uC6A9...",
  directionAll: "\uC804\uCCB4",
  directionDeposit: "\uC785\uAE08",
  directionWithdrawal: "\uCD9C\uAE08",
  addAnd: "+ AND",
  addOr: "+ OR",
  addClient: "+ \uAC70\uB798\uCC98",
  account: "\uACC4\uC815",
  client: "\uAC70\uB798\uCC98",
  selectAccount: "\uACC4\uC815 \uC120\uD0DD",
  validation:
    "\uC870\uAC74 \uD0A4\uC6CC\uB4DC\uC640 \uC801\uC6A9\uD560 \uACC4\uC815 \uB610\uB294 \uAC70\uB798\uCC98 \uC911 \uD558\uB098 \uC774\uC0C1\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  saved: (count: number) =>
    `\uADDC\uCE59\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4. ${count}\uAC74\uC774 \uAC31\uC2E0\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`,
  deleted: "\uADDC\uCE59\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.",
};

type BankLedgerClassificationRulesModalProps = {
  open: boolean;
  onClose: () => void;
  bankLedgerRules: BankLearnRule[];
  setBankLedgerRules: React.Dispatch<React.SetStateAction<BankLearnRule[]>>;
  bankTransactions: BankTransaction[];
  setBankTransactions: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  companyExpenses: CompanyExpense[];
  setCompanyExpenses: React.Dispatch<React.SetStateAction<CompanyExpense[]>>;
  fixedExpensePayments: FixedExpensePayment[];
  setFixedExpensePayments: React.Dispatch<React.SetStateAction<FixedExpensePayment[]>>;
  fixedExpenses: FixedExpense[];
  accountCodes: AccountCode[];
  ledgerCategories: LedgerCategory[];
  clients: Array<{ id?: number | string; name?: string }>;
  savedBy?: string;
  onMessage?: (message: string) => void;
};

type BuilderView = "list" | "builder";

function KeywordChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  const addValue = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (values.some((value) => value === trimmed)) {
      setDraft("");
      return;
    }
    onChange([...values, trimmed]);
    setDraft("");
  };

  return (
    <div className="erp-bank-rule-keyword-wrap">
      <div className="erp-bank-rule-keyword-chips">
        {values.map((value) => (
          <span key={value} className="erp-bank-rule-keyword-chip">
            {value}
            <button
              type="button"
              className="erp-bank-rule-keyword-chip-remove"
              aria-label={`${value} \uC81C\uAC70`}
              onClick={() => onChange(values.filter((row) => row !== value))}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <BufferedTextInput
          className="erp-bank-rule-keyword-input"
          value={draft}
          onDraftChange={setDraft}
          commitOnBlurOnly
          placeholder={placeholder}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addValue((event.target as HTMLInputElement).value);
            }
          }}
          onCommit={(value) => addValue(value)}
        />
      </div>
    </div>
  );
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
  canRemove,
}: {
  condition: BankLearnCondition;
  onChange: (next: BankLearnCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="erp-bank-rule-condition-row">
      <select
        className="erp-input erp-input-compact erp-bank-rule-select"
        value={condition.field}
        onChange={(event) =>
          onChange({ ...condition, field: event.target.value as BankLearnConditionField, values: [] })
        }
      >
        {Object.entries(BANK_LEARN_CONDITION_FIELD_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        className="erp-input erp-input-compact erp-bank-rule-select erp-bank-rule-select--operator"
        value={condition.operator}
        onChange={(event) =>
          onChange({
            ...condition,
            operator: event.target.value as BankLearnCondition["operator"],
          })
        }
      >
        {Object.entries(BANK_LEARN_CONDITION_OPERATOR_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <KeywordChipInput
        values={condition.values}
        onChange={(values) => onChange({ ...condition, values })}
        placeholder="\uC785\uB825 \uD6C4 Enter"
      />
      {canRemove ? (
        <button type="button" className="erp-ledger-icon-btn" onClick={onRemove} aria-label="\uC870\uAC74 \uC0AD\uC81C">
          <Trash2 size={14} />
        </button>
      ) : null}
    </div>
  );
}

function ConditionGroupEditor({
  group,
  groupIndex,
  onChange,
  onRemove,
  canRemove,
}: {
  group: BankLearnConditionGroup;
  groupIndex: number;
  onChange: (next: BankLearnConditionGroup) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="erp-bank-rule-condition-group">
      {groupIndex > 0 ? <div className="erp-bank-rule-or-divider">OR</div> : null}
      {group.conditions.map((condition, index) => (
        <React.Fragment key={`${groupIndex}-${index}`}>
          <ConditionRow
            condition={condition}
            canRemove={group.conditions.length > 1}
            onChange={(next) => {
              const conditions = [...group.conditions];
              conditions[index] = next;
              onChange({ conditions });
            }}
            onRemove={() => onChange({ conditions: group.conditions.filter((_, idx) => idx !== index) })}
          />
        </React.Fragment>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="erp-bank-rule-inline-btn"
        onClick={() => onChange({ conditions: [...group.conditions, createEmptyBankLearnCondition()] })}
      >
        {L.addAnd}
      </Button>
      {canRemove ? (
        <button type="button" className="erp-bank-rule-remove-group" onClick={onRemove}>
          \uC870\uAC74 \uADF8\uB8F9 \uC0AD\uC81C
        </button>
      ) : null}
    </div>
  );
}

export function BankLedgerRulesButton({ onClick, count = 0 }: { onClick: () => void; count?: number }) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg gap-1.5" onClick={onClick}>
      <ListChecks size={14} />
      {"\uBD84\uB958 \uADDC\uCE59"}
      {count > 0 ? ` (${count})` : ""}
    </Button>
  );
}

export function BankLedgerClassificationRulesModal({
  open,
  onClose,
  bankLedgerRules,
  setBankLedgerRules,
  bankTransactions,
  setBankTransactions,
  companyExpenses,
  setCompanyExpenses,
  fixedExpensePayments,
  setFixedExpensePayments,
  fixedExpenses,
  accountCodes,
  ledgerCategories,
  clients,
  savedBy,
  onMessage,
}: BankLedgerClassificationRulesModalProps) {
  const [view, setView] = useState<BuilderView>("list");
  const [draft, setDraft] = useState<BankLearnRule>(() => createEmptyCustomBankLearnRuleDraft());
  const [showClientAction, setShowClientAction] = useState(false);
  const [error, setError] = useState("");

  const customRules = useMemo(() => listEditableCustomBankLearnRules(bankLedgerRules), [bankLedgerRules]);
  const clientOptions = useMemo(
    () =>
      [...clients]
        .map((row) => String(row.name || "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ko")),
    [clients],
  );

  useEffect(() => {
    if (!open) return;
    setView("list");
    setDraft(createEmptyCustomBankLearnRuleDraft());
    setShowClientAction(false);
    setError("");
  }, [open]);

  if (!open) return null;

  const openCreate = () => {
    setDraft(createEmptyCustomBankLearnRuleDraft());
    setShowClientAction(false);
    setError("");
    setView("builder");
  };

  const openEdit = (rule: BankLearnRule) => {
    const migratedAccountCode =
      String(rule.accountCode || "").trim() ||
      migrateExpenseCategoryToAccountCode(String(rule.category || ""), ledgerCategories) ||
      undefined;
    setDraft({
      ...rule,
      accountCode: migratedAccountCode,
      category: undefined,
      ledgerCategoryId: undefined,
      conditionGroups: rule.conditionGroups?.length
        ? rule.conditionGroups.map((group) => ({
            conditions: group.conditions.map((condition) => ({ ...condition, values: [...condition.values] })),
          }))
        : [createEmptyBankLearnConditionGroup()],
    });
    setShowClientAction(Boolean(rule.actionClientName));
    setError("");
    setView("builder");
  };

  const applyRulesToTransactions = (rules: BankLearnRule[]) => {
    const metadata = applyCustomBankLearnRuleMetadata(bankTransactions, rules);
    const autoLearn = autoApplyBankLearnRules(
      metadata.transactions,
      fixedExpensePayments,
      companyExpenses,
      rules,
      fixedExpenses,
      { createdBy: savedBy, applyKinds: ["custom"], accountCodes },
    );
    setBankTransactions(autoLearn.transactions);
    if (autoLearn.newPayments.length) {
      setFixedExpensePayments((prev) => [...autoLearn.newPayments, ...prev]);
    }
    if (autoLearn.newExpenses.length) {
      setCompanyExpenses((prev) => [...autoLearn.newExpenses, ...prev]);
    }
    return metadata.updatedCount;
  };

  const handleSave = () => {
    const built = buildCustomBankLearnRuleFromDraft(draft, savedBy);
    if (!built) {
      setError(L.validation);
      return;
    }
    const nextRules = upsertBankLearnRule(bankLedgerRules, built);
    setBankLedgerRules(nextRules);
    const updatedCount = applyRulesToTransactions(nextRules);
    onMessage?.(L.saved(updatedCount));
    setView("list");
  };

  const handleDelete = (ruleId: string) => {
    const nextRules = bankLedgerRules.filter((rule) => rule.id !== ruleId);
    setBankLedgerRules(nextRules);
    applyRulesToTransactions(nextRules);
    onMessage?.(L.deleted);
  };

  const updateDirection = (direction: BankLearnRuleDirection) => {
    setDraft((prev) => ({ ...prev, direction }));
  };

  const title = view === "list" ? L.panelTitle : draft.name?.trim() ? draft.name : L.unnamedRule;

  return (
    <div className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-bank-rule-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="erp-bank-rule-head">
          {view === "builder" ? (
            <BufferedTextInput
              className="erp-bank-rule-name-input"
              value={draft.name || ""}
              onDraftChange={(value) => setDraft((prev) => ({ ...prev, name: value }))}
              placeholder={L.unnamedRule}
              aria-label={"\uADDC\uCE59 \uC774\uB984"}
            />
          ) : (
            <div>
              <h2 className="text-base font-bold text-slate-900 md:text-lg">{L.panelTitle}</h2>
              <p className="mt-1 text-sm text-slate-500">{L.panelDesc}</p>
            </div>
          )}
          <button type="button" className="erp-ledger-icon-btn" onClick={onClose} aria-label={L.close}>
            <X size={18} />
          </button>
        </div>

        {view === "list" ? (
          <div className="erp-bank-rule-body">
            {customRules.length ? (
              <ul className="erp-bank-rule-list">
                {customRules.map((rule) => {
                  const summary = summarizeCustomBankLearnRule(rule, accountCodes);
                  return (
                    <li key={rule.id} className="erp-bank-rule-list-item">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900">{summary.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {summary.direction}
                          {summary.actions.length ? ` \u00B7 ${summary.actions.join(" \u00B7 ")}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="erp-ledger-icon-btn"
                          onClick={() => openEdit(rule)}
                          aria-label={L.edit}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="erp-ledger-icon-btn erp-ledger-icon-btn--danger"
                          onClick={() => handleDelete(rule.id)}
                          aria-label={L.delete}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{L.empty}</p>
            )}
            <Button type="button" className="mt-3 rounded-xl" onClick={openCreate}>
              <Plus size={14} className="mr-1" />
              {L.createRule}
            </Button>
          </div>
        ) : (
          <div className="erp-bank-rule-body">
            <section className="erp-bank-rule-section">
              <h3 className="erp-bank-rule-section-title">{L.conditionLead}</h3>
              <div className="erp-bank-rule-tabs">
                {(
                  [
                    ["all", L.directionAll],
                    ["deposit", L.directionDeposit],
                    ["withdrawal", L.directionWithdrawal],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`erp-bank-rule-tab${draft.direction === value ? " is-active" : ""}`}
                    onClick={() => updateDirection(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {(draft.conditionGroups || [createEmptyBankLearnConditionGroup()]).map((group, groupIndex) => (
                <React.Fragment key={groupIndex}>
                  <ConditionGroupEditor
                    group={group}
                    groupIndex={groupIndex}
                    canRemove={(draft.conditionGroups || []).length > 1}
                    onChange={(next) => {
                      const groups = [...(draft.conditionGroups || [])];
                      groups[groupIndex] = next;
                      setDraft((prev) => ({ ...prev, conditionGroups: groups }));
                    }}
                    onRemove={() =>
                      setDraft((prev) => ({
                        ...prev,
                        conditionGroups: (prev.conditionGroups || []).filter((_, idx) => idx !== groupIndex),
                      }))
                    }
                  />
                </React.Fragment>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    conditionGroups: [...(prev.conditionGroups || []), createEmptyBankLearnConditionGroup()],
                  }))
                }
              >
                {L.addOr}
              </Button>
            </section>

            <section className="erp-bank-rule-section">
              <h3 className="erp-bank-rule-section-title">{L.actionLead}</h3>
              <div className="erp-bank-rule-actions">
                <label className="erp-bank-rule-action-field">
                  <span>{L.account}</span>
                  <LedgerAccountCodeSelect
                    value={draft.accountCode || ""}
                    accountCodes={accountCodes}
                    onChange={(value) => setDraft((prev) => ({ ...prev, accountCode: value || undefined }))}
                    aria-label={L.account}
                  />
                </label>

                {showClientAction ? (
                  <label className="erp-bank-rule-action-field">
                    <span>{L.client}</span>
                    <select
                      className="erp-input erp-input-compact"
                      value={draft.actionClientName || ""}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, actionClientName: event.target.value || undefined }))
                      }
                    >
                      <option value="">{L.selectClient}</option>
                      {clientOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setShowClientAction(true)}
                  >
                    {L.addClient}
                  </Button>
                )}

              </div>
            </section>

            {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
          </div>
        )}

        <div className="erp-bank-rule-foot">
          {view === "builder" ? (
            <>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setView("list")}>
                {L.cancel}
              </Button>
              <Button type="button" className="rounded-xl" onClick={handleSave}>
                {draft.createdAt && customRules.some((rule) => rule.id === draft.id) ? L.saveChanges : L.saveRule}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
              {L.close}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
