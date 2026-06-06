import type { AccountCode } from "./ledgerSystem";

export type AccountDisplayRow = {
  kind: "secondary" | "tertiary";
  account: AccountCode;
  parentAccount?: AccountCode;
};

export function isSecondaryAccountCode(row: AccountCode) {
  return !String(row.parentAccountCode || "").trim();
}

export function isTertiaryAccountCode(row: AccountCode) {
  return Boolean(String(row.parentAccountCode || "").trim());
}

export function findAccountCodeByCode(rows: AccountCode[], code: string) {
  return rows.find((row) => row.code === code);
}

export function listChildAccountCodes(rows: AccountCode[], parentCode: string) {
  return rows.filter((row) => row.parentAccountCode === parentCode);
}

export function resolveAccountCodeSearchText(row: AccountCode, rows: AccountCode[]) {
  const parts = [row.parentGroup, row.name, row.code];
  if (row.parentAccountCode) {
    const parent = findAccountCodeByCode(rows, row.parentAccountCode);
    if (parent) parts.unshift(parent.name);
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function createAccountCodeIndex(rows: AccountCode[]) {
  const activeRows = rows.filter((row) => row.isActive !== false);
  const codeByCode = new Map(activeRows.map((row) => [row.code, row]));
  const flowMemo = new Map<string, boolean>();

  const matchesFlow = (code: string, flow: "income" | "expense"): boolean => {
    const key = `${code}\0${flow}`;
    const cached = flowMemo.get(key);
    if (cached != null) return cached;

    const row = codeByCode.get(code);
    if (!row) {
      flowMemo.set(key, false);
      return false;
    }

    const rowFlow = row.flow || (row.type === "income" ? "income" : row.type === "expense" ? "expense" : "both");
    let ok = rowFlow === flow || rowFlow === "both";
    if (!ok && row.parentAccountCode) {
      ok = matchesFlow(row.parentAccountCode, flow);
    }
    flowMemo.set(key, ok);
    return ok;
  };

  const formatLabel = (row: AccountCode): string => {
    if (!row.parentAccountCode) return row.name;
    const parent = codeByCode.get(row.parentAccountCode);
    return parent ? `${parent.name} > ${row.name}` : row.name;
  };

  return { activeRows, codeByCode, matchesFlow, formatLabel };
}

export function accountCodeMatchesFlow(row: AccountCode, rows: AccountCode[], flow: "income" | "expense") {
  if (!row.isActive) return false;
  const { matchesFlow } = createAccountCodeIndex(rows);
  return matchesFlow(row.code, flow);
}

export function filterAccountCodesForManageView(
  rows: AccountCode[],
  flow: "all" | "income" | "expense",
  search: string,
) {
  const q = search.trim().toLowerCase();
  const flowOk = (row: AccountCode) =>
    flow === "all" ? row.isActive !== false : accountCodeMatchesFlow(row, rows, flow);

  const matched = new Set<string>();
  for (const row of rows) {
    if (!flowOk(row)) continue;
    if (!q || resolveAccountCodeSearchText(row, rows).includes(q)) {
      matched.add(row.code);
      if (row.parentAccountCode) matched.add(row.parentAccountCode);
      if (!row.parentAccountCode) {
        for (const child of listChildAccountCodes(rows, row.code)) {
          if (flowOk(child) && (!q || resolveAccountCodeSearchText(child, rows).includes(q))) {
            matched.add(child.code);
          }
        }
      }
    }
  }

  return rows.filter((row) => matched.has(row.code));
}

export function buildAccountDisplayRows(rows: AccountCode[]): AccountDisplayRow[] {
  const secondaries = rows
    .filter(isSecondaryAccountCode)
    .sort(
      (a, b) =>
        String(a.parentGroup || "").localeCompare(String(b.parentGroup || ""), "ko") ||
        a.name.localeCompare(b.name, "ko"),
    );

  const result: AccountDisplayRow[] = [];
  for (const secondary of secondaries) {
    result.push({ kind: "secondary", account: secondary });
    const children = listChildAccountCodes(rows, secondary.code)
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    for (const child of children) {
      result.push({ kind: "tertiary", account: child, parentAccount: secondary });
    }
  }

  for (const orphan of rows.filter((row) => isTertiaryAccountCode(row) && !findAccountCodeByCode(rows, row.parentAccountCode || ""))) {
    if (!result.some((item) => item.account.code === orphan.code)) {
      result.push({ kind: "tertiary", account: orphan });
    }
  }

  return result;
}

export function formatAccountCodeLabel(row: AccountCode, rows: AccountCode[]) {
  if (!row.parentAccountCode) return row.name;
  const parent = findAccountCodeByCode(rows, row.parentAccountCode);
  return parent ? `${parent.name} > ${row.name}` : row.name;
}

export type AccountCodePickerOption = {
  code: string;
  label: string;
  parentGroup: string;
};

export function buildAccountCodePickerOptions(
  accountCodes: AccountCode[],
  flow?: "income" | "expense",
): AccountCodePickerOption[] {
  const { activeRows, matchesFlow, formatLabel } = createAccountCodeIndex(accountCodes);
  const rows = buildAccountDisplayRows(activeRows).filter(({ account }) =>
    !flow ? true : matchesFlow(account.code, flow),
  );

  return rows
    .map(({ account }) => ({
      code: account.code,
      label: formatLabel(account),
      parentGroup: account.parentGroup || "\uAE30\uD0C0",
    }))
    .sort(
      (a, b) =>
        a.parentGroup.localeCompare(b.parentGroup, "ko") || a.label.localeCompare(b.label, "ko"),
    );
}

export type AccountCodeAutocompleteOption = {
  value: string;
  label: string;
  parentGroup: string;
};

export function buildAccountCodeAutocompleteOptionsByFlow(accountCodes: AccountCode[]) {
  return {
    income: buildAccountCodePickerOptions(accountCodes, "income").map((option) => ({
      value: option.code,
      label: option.label,
      parentGroup: option.parentGroup,
    })),
    expense: buildAccountCodePickerOptions(accountCodes, "expense").map((option) => ({
      value: option.code,
      label: option.label,
      parentGroup: option.parentGroup,
    })),
  };
}

export function groupAccountCodePickerOptions(options: AccountCodePickerOption[]) {
  const map = new Map<string, AccountCodePickerOption[]>();
  for (const option of options) {
    const current = map.get(option.parentGroup) || [];
    current.push(option);
    map.set(option.parentGroup, current);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "ko"));
}
