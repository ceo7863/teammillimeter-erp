import { makeLedgerId } from "./companyLedger";
import type { BankLearnRule } from "./bankCompanyLedger";
import { formatBankLedgerAccountLabel } from "./bankLedgerAccounts";
import type { AccountCode } from "./ledgerSystem";

export type BankLearnRuleDirection = "all" | "deposit" | "withdrawal";

export type BankLearnConditionField = "counterpartyName" | "description" | "memo" | "amount";

export type BankLearnConditionOperator = "contains_any" | "equals_any";

export type BankLearnCondition = {
  field: BankLearnConditionField;
  operator: BankLearnConditionOperator;
  values: string[];
};

export type BankLearnConditionGroup = {
  conditions: BankLearnCondition[];
};

export const BANK_LEARN_CONDITION_FIELD_LABELS: Record<BankLearnConditionField, string> = {
  counterpartyName: "거래자명",
  description: "적요",
  memo: "메모",
  amount: "금액",
};

export const BANK_LEARN_CONDITION_OPERATOR_LABELS: Record<BankLearnConditionOperator, string> = {
  contains_any: "중 하나를 포함할 때",
  equals_any: "중 하나와 같을 때",
};

export function createEmptyBankLearnCondition(): BankLearnCondition {
  return { field: "counterpartyName", operator: "contains_any", values: [] };
}

export function createEmptyBankLearnConditionGroup(): BankLearnConditionGroup {
  return { conditions: [createEmptyBankLearnCondition()] };
}

export function createEmptyCustomBankLearnRuleDraft(): BankLearnRule {
  return {
    id: makeLedgerId(),
    kind: "custom",
    name: "",
    direction: "all",
    descriptionTokens: [],
    conditionGroups: [createEmptyBankLearnConditionGroup()],
    createdAt: new Date().toISOString(),
  };
}

function normalizeConditionValues(field: BankLearnConditionField, values: unknown[]) {
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => (field === "amount" ? value.replace(/[^\d]/g, "") : value))
    .filter(Boolean);
}

export function normalizeBankLearnCondition(raw: unknown): BankLearnCondition | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<BankLearnCondition>;
  const field = row.field;
  if (field !== "counterpartyName" && field !== "description" && field !== "memo" && field !== "amount") {
    return null;
  }
  const operator = row.operator === "equals_any" ? "equals_any" : "contains_any";
  const values = normalizeConditionValues(field, Array.isArray(row.values) ? row.values : []);
  return { field, operator, values };
}

export function normalizeBankLearnConditionGroups(rows: unknown): BankLearnConditionGroup[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((group) => {
      if (!group || typeof group !== "object") return null;
      const conditions = Array.isArray((group as BankLearnConditionGroup).conditions)
        ? (group as BankLearnConditionGroup).conditions
            .map((condition) => normalizeBankLearnCondition(condition))
            .filter((condition): condition is BankLearnCondition => Boolean(condition))
            .filter((condition) => condition.values.length > 0)
        : [];
      return conditions.length ? { conditions } : null;
    })
    .filter((group): group is BankLearnConditionGroup => Boolean(group));
}

export function normalizeCustomBankLearnRuleDirection(value: unknown): BankLearnRuleDirection {
  if (value === "deposit" || value === "withdrawal") return value;
  return "all";
}

export function buildCustomBankLearnRuleFromDraft(
  draft: BankLearnRule,
  createdBy?: string,
): BankLearnRule | null {
  const groups = normalizeBankLearnConditionGroups(draft.conditionGroups);
  if (!groups.length) return null;
  const hasAction = Boolean(
    String(draft.accountCode || "").trim() ||
      String(draft.fixedExpenseId || "").trim() ||
      String(draft.actionClientName || "").trim(),
  );
  if (!hasAction) return null;

  return {
    ...draft,
    kind: "custom",
    name: String(draft.name || "").trim() || "이름 없는 규칙",
    direction: normalizeCustomBankLearnRuleDirection(draft.direction),
    conditionGroups: groups,
    accountCode: String(draft.accountCode || "").trim() || undefined,
    category: undefined,
    ledgerCategoryId: undefined,
    fixedExpenseId: String(draft.fixedExpenseId || "").trim() || undefined,
    actionClientName: String(draft.actionClientName || "").trim() || undefined,
    createdAt: draft.createdAt || new Date().toISOString(),
    createdBy: createdBy || draft.createdBy,
  };
}

export function isCustomBankLearnRule(rule: BankLearnRule) {
  return rule.kind === "custom";
}

export function listEditableCustomBankLearnRules(rules: BankLearnRule[]) {
  return rules.filter((rule) => rule.kind === "custom");
}

export function summarizeCustomBankLearnRule(rule: BankLearnRule, accountCodes: AccountCode[] = []) {
  const name = String(rule.name || "").trim() || "이름 없는 규칙";
  const actions: string[] = [];
  if (rule.accountCode) {
    actions.push(formatBankLedgerAccountLabel(accountCodes, rule.accountCode) || rule.accountCode);
  } else if (rule.category) {
    actions.push(rule.category);
  }
  if (rule.actionClientName) actions.push(`거래처 ${rule.actionClientName}`);
  if (rule.fixedExpenseId) actions.push("고정비");
  const direction =
    rule.direction === "deposit" ? "입금" : rule.direction === "withdrawal" ? "출금" : "전체";
  return { name, actions, direction };
}
