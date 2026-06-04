import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BankLearnRule } from "@/utils/bankCompanyLedger";
import {
  CEO_ADVANCE_CATEGORY,
  CEO_RECEIVABLE_CATEGORY,
  type CompanyExpense,
  type FixedExpense,
  type FixedExpensePayment,
  mergeExpenseCategory,
  normalizeExpenseCategoryName,
  normalizeFixedExpenseCategories,
} from "@/utils/companyLedger";
import {
  applyExpenseCategoryRename,
  countExpenseCategoryUsage,
  removeExpenseCategoryFromList,
  reorderExpenseCategories,
} from "@/utils/expenseCategoryManage";
import { ExpenseCategorySelect } from "@/components/ExpenseCategorySelect";

const L = {
  title: "\uAC00\uACC4\uBD80 \uCE74\uD14C\uACE0\uB9AC",
  desc: "\uBD84\uB958 \uC774\uB984\uC744 \uCD94\uAC00\u00B7\uC21C\uC11C \uBCC0\uACBD\u00B7\uC0AD\uC81C\uD569\uB2C8\uB2E4. \uC774\uB984 \uBCC0\uACBD \uC2DC \uAE30\uC874 \uB0B4\uC5ED\uC5D0\uB3C4 \uBC18\uC601\uB429\uB2C8\uB2E4.",
  variableSection: "\uC9C0\uCD9C \u00B7 \uC785\uAE08",
  fixedSection: "\uACE0\uC815\uBE44",
  addPlaceholder: "\uC0C8 \uCE74\uD14C\uACE0\uB9AC",
  add: "\uCD94\uAC00",
  rename: "\uC774\uB984 \uBCC0\uACBD",
  delete: "\uC0AD\uC81C",
  moveUp: "\uC704\uB85C",
  moveDown: "\uC544\uB798",
  migrateTo: "\uC774\uB3D9 \uCE74\uD14C\uACE0\uB9AC",
  close: "\uB2EB\uAE30",
  save: "\uC800\uC7A5",
  cancel: "\uCDE8\uC18C",
  empty: "\uB4F1\uB85D\uB41C \uCE74\uD14C\uACE0\uB9AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  systemFixed: "\uC2DC\uC2A4\uC15C",
  deleteListOnly: "\uBAA9\uB85D\uC5D0\uC11C\uB9CC \uC81C\uAC70\uD569\uB2C8\uB2E4.",
  deleteMigrateHint: (count: number) =>
    `${count}\uAC74 \uC0AC\uC6A9 \uC911\uC785\uB2C8\uB2E4. \uC774\uB3D9\uD560 \uCE74\uD14C\uACE0\uB9AC\uB97C \uC120\uD0DD\uD55C \uB4A4 \uC0AD\uC81C\uD558\uC138\uC694.`,
  usageCount: (count: number) => `${count}\uAC74`,
  ceoLocked: "\uB300\uD45C\uC774\uC0AC \uC804\uC6A9 \uCE74\uD14C\uACE0\uB9AC\uB294 \uC5EC\uAE30\uC11C \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  deleteBlocked: "\uC774\uB3D9\uD560 \uCE74\uD14C\uACE0\uB9AC\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  duplicate: "\uC774\uBBF8 \uC788\uB294 \uCE74\uD14C\uACE0\uB9AC\uC785\uB2C8\uB2E4.",
  invalidName: "\uCE74\uD14C\uACE0\uB9AC \uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
};

type ExpenseCategoryManageModalProps = {
  open: boolean;
  onClose: () => void;
  expenseCategories: string[];
  setExpenseCategories: React.Dispatch<React.SetStateAction<string[]>>;
  fixedExpenseCategories: string[];
  setFixedExpenseCategories: React.Dispatch<React.SetStateAction<string[]>>;
  companyExpenses: CompanyExpense[];
  setCompanyExpenses: React.Dispatch<React.SetStateAction<CompanyExpense[]>>;
  fixedExpensePayments: FixedExpensePayment[];
  setFixedExpensePayments?: React.Dispatch<React.SetStateAction<FixedExpensePayment[]>>;
  fixedExpenses: FixedExpense[];
  setFixedExpenses?: React.Dispatch<React.SetStateAction<FixedExpense[]>>;
  bankLedgerRules?: BankLearnRule[];
  setBankLedgerRules?: React.Dispatch<React.SetStateAction<BankLearnRule[]>>;
};

function isProtectedCategory(category: string) {
  const normalized = normalizeExpenseCategoryName(category);
  return normalized === CEO_ADVANCE_CATEGORY || normalized === CEO_RECEIVABLE_CATEGORY;
}

function CategoryManageActions({
  index,
  total,
  protectedRow,
  onMoveUp,
  onMoveDown,
  onRename,
  onDelete,
}: {
  index: number;
  total: number;
  protectedRow: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="erp-ledger-category-manage-actions">
      <button type="button" className="erp-ledger-icon-btn" disabled={index === 0} onClick={onMoveUp} title={L.moveUp} aria-label={L.moveUp}>
        <ArrowUp size={14} />
      </button>
      <button
        type="button"
        className="erp-ledger-icon-btn"
        disabled={index >= total - 1}
        onClick={onMoveDown}
        title={L.moveDown}
        aria-label={L.moveDown}
      >
        <ArrowDown size={14} />
      </button>
      {!protectedRow ? (
        <button type="button" className="erp-ledger-icon-btn" onClick={onRename} title={L.rename} aria-label={L.rename}>
          <Pencil size={14} />
        </button>
      ) : null}
      {!protectedRow ? (
        <button type="button" className="erp-ledger-icon-btn danger" onClick={onDelete} title={L.delete} aria-label={L.delete}>
          <Trash2 size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function ExpenseCategoryManageModal({
  open,
  onClose,
  expenseCategories,
  setExpenseCategories,
  fixedExpenseCategories,
  setFixedExpenseCategories,
  companyExpenses,
  setCompanyExpenses,
  fixedExpensePayments,
  setFixedExpensePayments,
  fixedExpenses,
  setFixedExpenses,
  bankLedgerRules = [],
  setBankLedgerRules,
}: ExpenseCategoryManageModalProps) {
  const [newVariableName, setNewVariableName] = useState("");
  const [newFixedName, setNewFixedName] = useState("");
  const [message, setMessage] = useState("");
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteMigrateTo, setDeleteMigrateTo] = useState("");

  const variableUsageMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof countExpenseCategoryUsage>>();
    for (const category of expenseCategories) {
      map.set(
        category,
        countExpenseCategoryUsage(category, companyExpenses, fixedExpensePayments, fixedExpenses, bankLedgerRules),
      );
    }
    return map;
  }, [expenseCategories, companyExpenses, fixedExpensePayments, fixedExpenses, bankLedgerRules]);

  if (!open) return null;

  const applyRename = (from: string, to: string) => {
    const result = applyExpenseCategoryRename(from, to, {
      expenseCategories,
      fixedExpenseCategories,
      companyExpenses,
      fixedExpensePayments,
      fixedExpenses,
      bankLedgerRules,
    });
    if (!result) {
      setMessage(L.invalidName);
      return;
    }
    setExpenseCategories(result.expenseCategories);
    setFixedExpenseCategories(result.fixedExpenseCategories);
    setCompanyExpenses(result.companyExpenses);
    setFixedExpensePayments?.(result.fixedExpensePayments);
    setFixedExpenses?.(result.fixedExpenses);
    setBankLedgerRules?.(result.bankLedgerRules);
    setRenamingCategory(null);
    setRenameDraft("");
    setMessage(`\u300C${from}\u300D \u2192 \u300C${to}\u300D\uB85C \uBCC0\uACBD\uD588\uC2B5\uB2C8\uB2E4.`);
  };

  const addVariableCategory = () => {
    const trimmed = normalizeExpenseCategoryName(newVariableName);
    if (!trimmed) {
      setMessage(L.invalidName);
      return;
    }
    if (isProtectedCategory(trimmed)) {
      setMessage(L.ceoLocked);
      return;
    }
    if (expenseCategories.includes(trimmed)) {
      setMessage(L.duplicate);
      return;
    }
    setExpenseCategories((prev) => mergeExpenseCategory(prev, trimmed));
    setNewVariableName("");
    setMessage(`\u300C${trimmed}\u300D\uC744 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4.`);
  };

  const addFixedCategory = () => {
    const trimmed = String(newFixedName || "").trim();
    if (!trimmed) {
      setMessage(L.invalidName);
      return;
    }
    if (fixedExpenseCategories.includes(trimmed)) {
      setMessage(L.duplicate);
      return;
    }
    setFixedExpenseCategories(normalizeFixedExpenseCategories([...fixedExpenseCategories, trimmed], fixedExpenses));
    setNewFixedName("");
    setMessage(`\u300C${trimmed}\u300D\uC744 \uACE0\uC815\uBE44\uC5D0 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4.`);
  };

  const confirmDeleteVariable = (category: string) => {
    if (isProtectedCategory(category)) {
      setMessage(L.ceoLocked);
      return;
    }
    const usage = variableUsageMap.get(category);
    if (!usage?.total) {
      setExpenseCategories((prev) => removeExpenseCategoryFromList(prev, category));
      setDeleteTarget(null);
      setMessage(`\u300C${category}\u300D\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.`);
      return;
    }
    const migrateTo = normalizeExpenseCategoryName(deleteMigrateTo);
    if (!migrateTo || migrateTo === category) {
      setMessage(L.deleteBlocked);
      return;
    }
    applyRename(category, migrateTo);
    setExpenseCategories((prev) => removeExpenseCategoryFromList(prev, category));
    setDeleteTarget(null);
    setDeleteMigrateTo("");
    setMessage(`\u300C${category}\u300D \uB0B4\uC5ED\uC744 \u300C${migrateTo}\u300D\uB85C \uC635\uAE34 \uD6C4 \uBAA9\uB85D\uC5D0\uC11C \uC81C\uAC70\uD588\uC2B5\uB2C8\uB2E4.`);
  };

  const confirmDeleteFixed = (category: string) => {
    const usage = countExpenseCategoryUsage(category, [], [], fixedExpenses, []);
    if (usage.fixedItemCount > 0) {
      setMessage(L.deleteBlocked);
      return;
    }
    setFixedExpenseCategories((prev) => prev.filter((row) => row !== category));
    setMessage(`\u300C${category}\u300D\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.`);
  };

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-ledger-modal--category-manage"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-category-manage-title"
      >
        <div className="erp-ledger-category-manage-head">
          <div className="min-w-0">
            <h2 id="expense-category-manage-title" className="text-lg font-bold text-slate-900">
              {L.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">{L.desc}</p>
          </div>
          <button type="button" className="erp-ledger-icon-btn shrink-0" onClick={onClose} aria-label={L.close}>
            <X size={18} />
          </button>
        </div>

        {message ? <p className="erp-ledger-category-manage-message">{message}</p> : null}

        <section className="erp-ledger-category-manage-section">
          <h3 className="erp-ledger-category-manage-section-title">{L.variableSection}</h3>
          <div className="erp-ledger-category-manage-add-row">
            <input
              className="erp-input erp-ledger-category-manage-add-input"
              lang="ko"
              value={newVariableName}
              placeholder={L.addPlaceholder}
              onChange={(event) => setNewVariableName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addVariableCategory();
              }}
            />
            <Button type="button" className="shrink-0 rounded-xl" onClick={addVariableCategory}>
              <Plus size={16} className="mr-1" />
              {L.add}
            </Button>
          </div>

          <ul className="erp-ledger-category-manage-list">
            {expenseCategories.length ? (
              expenseCategories.map((category, index) => {
                const usage = variableUsageMap.get(category);
                const protectedRow = isProtectedCategory(category);
                const isRenaming = renamingCategory === category;
                const isDeleting = deleteTarget === category;

                return (
                  <li key={category} className="erp-ledger-category-manage-item">
                    <div className="erp-ledger-category-manage-main">
                      <div className="erp-ledger-category-manage-name-wrap">
                        <span className="erp-ledger-category-manage-name" title={category}>
                          {category}
                        </span>
                        {protectedRow ? (
                          <span className="erp-ledger-category-manage-tag">{L.systemFixed}</span>
                        ) : null}
                      </div>
                      <span className="erp-ledger-category-manage-meta">{L.usageCount(usage?.total ?? 0)}</span>
                      <CategoryManageActions
                        index={index}
                        total={expenseCategories.length}
                        protectedRow={protectedRow}
                        onMoveUp={() => setExpenseCategories((prev) => reorderExpenseCategories(prev, index, index - 1))}
                        onMoveDown={() => setExpenseCategories((prev) => reorderExpenseCategories(prev, index, index + 1))}
                        onRename={() => {
                          setRenamingCategory(category);
                          setRenameDraft(category);
                          setDeleteTarget(null);
                        }}
                        onDelete={() => {
                          setDeleteTarget(category);
                          setDeleteMigrateTo(expenseCategories.find((row) => row !== category) || "");
                          setRenamingCategory(null);
                        }}
                      />
                    </div>

                    {isRenaming ? (
                      <div className="erp-ledger-category-manage-subpanel">
                        <label className="erp-ledger-category-manage-subpanel-label">{L.rename}</label>
                        <div className="erp-ledger-category-manage-subpanel-row">
                          <input
                            className="erp-input min-w-0 flex-1"
                            lang="ko"
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                          />
                          <Button type="button" size="sm" className="shrink-0 rounded-lg" onClick={() => applyRename(category, renameDraft)}>
                            {L.save}
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="shrink-0 rounded-lg" onClick={() => setRenamingCategory(null)}>
                            {L.cancel}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {isDeleting ? (
                      <div className="erp-ledger-category-manage-subpanel is-warning">
                        <p className="erp-ledger-category-manage-subpanel-hint">
                          {usage?.total ? L.deleteMigrateHint(usage.total) : L.deleteListOnly}
                        </p>
                        {usage?.total ? (
                          <label className="erp-ledger-category-manage-migrate-field">
                            <span className="erp-ledger-category-manage-subpanel-label">{L.migrateTo}</span>
                            <ExpenseCategorySelect
                              value={deleteMigrateTo}
                              categories={expenseCategories.filter((row) => row !== category)}
                              onChange={setDeleteMigrateTo}
                              aria-label={L.migrateTo}
                            />
                          </label>
                        ) : null}
                        <div className="erp-ledger-category-manage-subpanel-actions">
                          <Button type="button" size="sm" className="rounded-lg" onClick={() => confirmDeleteVariable(category)}>
                            {L.delete}
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => setDeleteTarget(null)}>
                            {L.cancel}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })
            ) : (
              <li className="erp-ledger-category-manage-empty">{L.empty}</li>
            )}
          </ul>
        </section>

        <section className="erp-ledger-category-manage-section is-divided">
          <h3 className="erp-ledger-category-manage-section-title">{L.fixedSection}</h3>
          <div className="erp-ledger-category-manage-add-row">
            <input
              className="erp-input erp-ledger-category-manage-add-input"
              lang="ko"
              value={newFixedName}
              placeholder={L.addPlaceholder}
              onChange={(event) => setNewFixedName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addFixedCategory();
              }}
            />
            <Button type="button" variant="outline" className="shrink-0 rounded-xl" onClick={addFixedCategory}>
              <Plus size={16} className="mr-1" />
              {L.add}
            </Button>
          </div>
          <ul className="erp-ledger-category-manage-list">
            {fixedExpenseCategories.length ? (
              fixedExpenseCategories.map((category) => {
                const usage = countExpenseCategoryUsage(category, [], [], fixedExpenses, []);
                return (
                  <li key={category} className="erp-ledger-category-manage-item">
                    <div className="erp-ledger-category-manage-main">
                      <div className="erp-ledger-category-manage-name-wrap">
                        <span className="erp-ledger-category-manage-name" title={category}>
                          {category}
                        </span>
                      </div>
                      <span className="erp-ledger-category-manage-meta">{L.usageCount(usage.fixedItemCount)}</span>
                      <div className="erp-ledger-category-manage-actions">
                        <button
                          type="button"
                          className="erp-ledger-icon-btn danger"
                          disabled={usage.fixedItemCount > 0}
                          onClick={() => confirmDeleteFixed(category)}
                          title={usage.fixedItemCount > 0 ? L.deleteBlocked : L.delete}
                          aria-label={L.delete}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="erp-ledger-category-manage-empty">{L.empty}</li>
            )}
          </ul>
        </section>

        <div className="erp-ledger-category-manage-foot">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            {L.close}
          </Button>
        </div>
      </div>
    </div>
  );
}
