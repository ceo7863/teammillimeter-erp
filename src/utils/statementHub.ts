import { isErpPageKey, type ErpPageKey } from "./pageAccess";

export type StatementHubTab = "create" | "archive" | "pdf";

export const STATEMENT_TAB_STORAGE_KEY = "teammillimeter-erp-statement-tab";

export const LEGACY_STATEMENT_PAGE_KEYS = ["pdfArchive"] as const;

export type LegacyStatementPageKey = (typeof LEGACY_STATEMENT_PAGE_KEYS)[number];

const LEGACY_TO_TAB: Record<LegacyStatementPageKey, StatementHubTab> = {
  pdfArchive: "pdf",
};

export function isLegacyStatementPageKey(value: string): value is LegacyStatementPageKey {
  return (LEGACY_STATEMENT_PAGE_KEYS as readonly string[]).includes(value);
}

export function legacyPageKeyToStatementTab(value: string): StatementHubTab | null {
  if (!isLegacyStatementPageKey(value)) return null;
  return LEGACY_TO_TAB[value];
}

export function migrateStatementPageKey(value: string): { page: ErpPageKey; statementTab?: StatementHubTab } {
  const tab = legacyPageKeyToStatementTab(value);
  if (tab) return { page: "statements", statementTab: tab };
  if (isErpPageKey(value)) return { page: value };
  return { page: "dashboard" };
}

export function migrateSidebarOrderKeys(order: ErpPageKey[] | null | undefined): ErpPageKey[] | null {
  if (!order?.length) return order ?? null;
  const next: ErpPageKey[] = [];
  let hasStatements = false;

  for (const key of order) {
    if (key === "statements") {
      if (!hasStatements) {
        next.push("statements");
        hasStatements = true;
      }
      continue;
    }
    if (isLegacyStatementPageKey(key)) {
      if (!hasStatements) {
        next.push("statements");
        hasStatements = true;
      }
      continue;
    }
    next.push(key);
  }

  return next.length ? next : null;
}

export function migrateAllowedPageKeys(pages: ErpPageKey[]): ErpPageKey[] {
  const hasLegacy = pages.some((key) => isLegacyStatementPageKey(key));
  const next = pages.filter((key) => !isLegacyStatementPageKey(key) && key !== "statements");
  if (hasLegacy || pages.includes("statements")) next.push("statements");
  return next;
}

export function readStoredStatementTab(): StatementHubTab {
  if (typeof window === "undefined") return "create";
  const stored = window.sessionStorage.getItem(STATEMENT_TAB_STORAGE_KEY);
  if (stored === "create" || stored === "archive" || stored === "pdf") return stored;
  return "create";
}

export function storeStatementTab(tab: StatementHubTab) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STATEMENT_TAB_STORAGE_KEY, tab);
}
