import { buildAccountDisplayRows, findAccountCodeByCode } from "./accountCodeTree";
import {
  CATEGORY_ACCOUNT_DEFAULTS,
  filterAccountCodesByFlow,
  findAccountCode,
  resolveAccountCodeLabel,
  type AccountCode,
  type LedgerCategory,
} from "./ledgerSystem";

export type BankLedgerAccountOption = {
  value: string;
  label: string;
};

export function buildBankLedgerAccountSelectOptions(accountCodes: AccountCode[]): BankLedgerAccountOption[] {
  const expenseRows = filterAccountCodesByFlow(accountCodes, "expense");
  return buildAccountDisplayRows(expenseRows)
    .map(({ account, parentAccount }) => ({
      value: account.code,
      label: parentAccount
        ? `${account.code} \u00B7 ${parentAccount.name} > ${account.name}`
        : `${account.code} \u00B7 ${account.name}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

export function getDefaultExpenseAccountCode(accountCodes: AccountCode[]) {
  return buildBankLedgerAccountSelectOptions(accountCodes)[0]?.value || "900";
}

export function resolveCompanyExpenseCategoryFromAccount(accountCodes: AccountCode[], accountCode: string) {
  const code = String(accountCode || "").trim();
  if (!code) return "";
  const row = findAccountCodeByCode(accountCodes, code);
  if (!row) return code;
  return resolveAccountCodeLabel(accountCodes, code) || row.name || code;
}

export function findLedgerCategoryIdForAccountCode(ledgerCategories: LedgerCategory[], accountCode: string) {
  const code = String(accountCode || "").trim();
  if (!code) return undefined;
  return ledgerCategories.find((row) => row.isActive && row.accountCode === code)?.id;
}

export function migrateExpenseCategoryToAccountCode(
  category: string,
  ledgerCategories: LedgerCategory[] = [],
): string | undefined {
  const trimmed = String(category || "").trim();
  if (!trimmed) return undefined;
  const fromLedger = ledgerCategories.find((row) => row.name === trimmed && row.isActive)?.accountCode;
  if (fromLedger) return fromLedger;
  const fromDefaults = CATEGORY_ACCOUNT_DEFAULTS[trimmed];
  return fromDefaults || undefined;
}

export function resolveAccountCodeFromLedgerTarget(
  parsed: { kind: string; accountCode?: string; category?: string } | null,
  accountCodes: AccountCode[],
  ledgerCategories: LedgerCategory[] = [],
) {
  if (!parsed || parsed.kind !== "manual") return "";
  if (parsed.accountCode) return parsed.accountCode;
  if (parsed.category) {
    if (findAccountCodeByCode(accountCodes, parsed.category)) return parsed.category;
    return migrateExpenseCategoryToAccountCode(parsed.category, ledgerCategories) || "";
  }
  return "";
}

export function formatBankLedgerAccountLabel(accountCodes: AccountCode[], accountCode: string) {
  const code = String(accountCode || "").trim();
  if (!code) return "";
  return resolveAccountCodeLabel(accountCodes, code) || findAccountCode(accountCodes, code)?.name || code;
}
