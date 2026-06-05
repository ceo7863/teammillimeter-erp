import { isErpPageKey, type ErpPageKey } from "./pageAccess";

export type AccountingHubTab = "bank" | "ledger" | "tax" | "classify";

export const ACCOUNTING_TAB_STORAGE_KEY = "teammillimeter-erp-accounting-tab";

export const LEGACY_ACCOUNTING_PAGE_KEYS = ["companyLedger", "taxInvoices", "bankTransactions"] as const;

export type LegacyAccountingPageKey = (typeof LEGACY_ACCOUNTING_PAGE_KEYS)[number];

const LEGACY_TO_TAB: Record<LegacyAccountingPageKey, AccountingHubTab> = {
  bankTransactions: "bank",
  companyLedger: "ledger",
  taxInvoices: "tax",
};

export function isLegacyAccountingPageKey(value: string): value is LegacyAccountingPageKey {
  return (LEGACY_ACCOUNTING_PAGE_KEYS as readonly string[]).includes(value);
}

export function legacyPageKeyToAccountingTab(value: string): AccountingHubTab | null {
  if (!isLegacyAccountingPageKey(value)) return null;
  return LEGACY_TO_TAB[value];
}

export function migrateActivePageKey(value: string): { page: ErpPageKey; accountingTab?: AccountingHubTab } {
  const tab = legacyPageKeyToAccountingTab(value);
  if (tab) return { page: "accounting", accountingTab: tab };
  if (isErpPageKey(value)) return { page: value };
  return { page: "dashboard" };
}

export function migrateSidebarOrderKeys(order: ErpPageKey[] | null | undefined): ErpPageKey[] | null {
  if (!order?.length) return order ?? null;
  const next: ErpPageKey[] = [];
  let hasAccounting = false;

  for (const key of order) {
    if (key === "accounting") {
      if (!hasAccounting) {
        next.push("accounting");
        hasAccounting = true;
      }
      continue;
    }
    if (isLegacyAccountingPageKey(key)) {
      if (!hasAccounting) {
        next.push("accounting");
        hasAccounting = true;
      }
      continue;
    }
    next.push(key);
  }

  return next.length ? next : null;
}

export function migrateAllowedPageKeys(pages: ErpPageKey[]): ErpPageKey[] {
  const hasLegacy = pages.some((key) => isLegacyAccountingPageKey(key));
  const next = pages.filter((key) => !isLegacyAccountingPageKey(key) && key !== "accounting");
  if (hasLegacy || pages.includes("accounting")) next.push("accounting");
  return next;
}

export function readStoredAccountingTab(): AccountingHubTab {
  if (typeof window === "undefined") return "bank";
  const stored = window.sessionStorage.getItem(ACCOUNTING_TAB_STORAGE_KEY);
  if (stored === "ledger" || stored === "tax" || stored === "bank" || stored === "classify") return stored;
  return "bank";
}

export function storeAccountingTab(tab: AccountingHubTab) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ACCOUNTING_TAB_STORAGE_KEY, tab);
}
