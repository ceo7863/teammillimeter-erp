import type { AccountCode } from "./ledgerSystem";

/** 1차 그룹 표시 우선순위 (분류 계정 관리 등) */
const PRIORITY_PARENT_GROUPS = ["\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44"];

export function compareAccountParentGroups(a: string, b: string) {
  const aRank = PRIORITY_PARENT_GROUPS.indexOf(a);
  const bRank = PRIORITY_PARENT_GROUPS.indexOf(b);
  const aOrder = aRank === -1 ? PRIORITY_PARENT_GROUPS.length : aRank;
  const bOrder = bRank === -1 ? PRIORITY_PARENT_GROUPS.length : bRank;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.localeCompare(b, "ko");
}

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
        compareAccountParentGroups(String(a.parentGroup || ""), String(b.parentGroup || "")) ||
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
  /** 0 = 2차, 1 = 2차 하위(3차) */
  depth: 0 | 1;
};

export function buildAccountCodePickerOptions(
  accountCodes: AccountCode[],
  flow?: "income" | "expense",
): AccountCodePickerOption[] {
  const { activeRows, matchesFlow } = createAccountCodeIndex(accountCodes);
  const visibleCodes = new Set(activeRows.map((row) => row.code));
  const result: AccountCodePickerOption[] = [];

  for (const row of buildAccountDisplayRows(activeRows)) {
    const account = row.account;
    if (!visibleCodes.has(account.code)) continue;
    if (flow && !matchesFlow(account.code, flow)) continue;
    result.push({
      code: account.code,
      label: account.name,
      parentGroup: account.parentGroup || "\uAE30\uD0C0",
      depth: row.kind === "tertiary" ? 1 : 0,
    });
  }

  return result;
}

export type AccountCodeAutocompleteOption = {
  value: string;
  label: string;
  parentGroup: string;
  depth?: 0 | 1;
};

function formatAccountPickerIndentLabel(label: string, depth: 0 | 1) {
  return depth ? `\u3000\u3000${label}` : label;
}

export function buildAccountCodeAutocompleteOptionsByFlow(accountCodes: AccountCode[]) {
  return {
    income: buildAccountCodePickerOptions(accountCodes, "income").map((option) => ({
      value: option.code,
      label: formatAccountPickerIndentLabel(option.label, option.depth),
      parentGroup: option.parentGroup,
      depth: option.depth,
    })),
    expense: buildAccountCodePickerOptions(accountCodes, "expense").map((option) => ({
      value: option.code,
      label: formatAccountPickerIndentLabel(option.label, option.depth),
      parentGroup: option.parentGroup,
      depth: option.depth,
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
  return [...map.entries()].sort(([a], [b]) => compareAccountParentGroups(a, b));
}

export type AccountCodePickerFlatItem = {
  code: string;
  label: string;
  groupName: string;
  depth: 0 | 1;
};

/** Pre-build picker rows once per flow (avoid recomputing on every popover open). */
export function buildAccountCodePickerFlatItems(
  accountCodes: AccountCode[],
  flow: "income" | "expense",
): AccountCodePickerFlatItem[] {
  const groups = groupAccountCodePickerOptions(buildAccountCodePickerOptions(accountCodes, flow));
  const items: AccountCodePickerFlatItem[] = [];
  for (const [groupName, groupItems] of groups) {
    for (const item of groupItems) {
      items.push({
        code: item.code,
        label: item.label,
        groupName,
        depth: item.depth,
      });
    }
  }
  return items;
}

export function filterAccountCodePickerFlatItems(
  items: AccountCodePickerFlatItem[],
  query: string,
): AccountCodePickerFlatItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.groupName.toLowerCase().includes(q) ||
      item.code.includes(q),
  );
}
