import { isErpPageKey, type ErpPageKey } from "./pageAccess";
import type { ErpUser } from "./erpApi";

export type BasicInfoHubTab = "clients" | "workers" | "officeStaff" | "company";

export const BASIC_INFO_TAB_STORAGE_KEY = "teammillimeter-erp-basic-info-tab";

export const LEGACY_BASIC_INFO_PAGE_KEYS = ["clients", "workers", "companyProfile"] as const;

export type LegacyBasicInfoPageKey = (typeof LEGACY_BASIC_INFO_PAGE_KEYS)[number];

const LEGACY_TO_TAB: Record<LegacyBasicInfoPageKey, BasicInfoHubTab> = {
  clients: "clients",
  workers: "workers",
  companyProfile: "company",
};

export type BasicInfoTabAccess = {
  clients: boolean;
  workers: boolean;
  officeStaff: boolean;
  company: boolean;
};

export function isLegacyBasicInfoPageKey(value: string): value is LegacyBasicInfoPageKey {
  return (LEGACY_BASIC_INFO_PAGE_KEYS as readonly string[]).includes(value);
}

export function legacyPageKeyToBasicInfoTab(value: string): BasicInfoHubTab | null {
  if (!isLegacyBasicInfoPageKey(value)) return null;
  return LEGACY_TO_TAB[value];
}

export function migrateBasicInfoPageKey(value: string): { page: ErpPageKey; basicInfoTab?: BasicInfoHubTab } {
  const tab = legacyPageKeyToBasicInfoTab(value);
  if (tab) return { page: "basicInfo", basicInfoTab: tab };
  if (isErpPageKey(value)) return { page: value };
  return { page: "dashboard" };
}

export function migrateSidebarOrderKeys(order: ErpPageKey[] | null | undefined): ErpPageKey[] | null {
  if (!order?.length) return order ?? null;
  const next: ErpPageKey[] = [];
  let hasBasicInfo = false;

  for (const key of order) {
    if (key === "basicInfo") {
      if (!hasBasicInfo) {
        next.push("basicInfo");
        hasBasicInfo = true;
      }
      continue;
    }
    if (isLegacyBasicInfoPageKey(key)) {
      if (!hasBasicInfo) {
        next.push("basicInfo");
        hasBasicInfo = true;
      }
      continue;
    }
    next.push(key);
  }

  return next.length ? next : null;
}

export function migrateAllowedPageKeys(pages: ErpPageKey[]): ErpPageKey[] {
  const hasLegacy = pages.some((key) => isLegacyBasicInfoPageKey(key));
  const next = pages.filter((key) => !isLegacyBasicInfoPageKey(key) && key !== "basicInfo");
  if (hasLegacy || pages.includes("basicInfo")) next.push("basicInfo");
  return next;
}

export function readStoredBasicInfoTab(): BasicInfoHubTab {
  if (typeof window === "undefined") return "clients";
  const stored = window.sessionStorage.getItem(BASIC_INFO_TAB_STORAGE_KEY);
  if (stored === "clients" || stored === "workers" || stored === "officeStaff" || stored === "company") return stored;
  return "clients";
}

export function storeBasicInfoTab(tab: BasicInfoHubTab) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(BASIC_INFO_TAB_STORAGE_KEY, tab);
}

export function resolveBasicInfoTabAccess(
  user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
): BasicInfoTabAccess {
  if (!user) return { clients: false, workers: false, officeStaff: false, company: false };
  if (user.role === "admin") return { clients: true, workers: true, officeStaff: true, company: true };

  const rawPages = user.allowedPages;
  if (Array.isArray(rawPages) && rawPages.length) {
    const rawSet = new Set(rawPages.filter((page): page is string => typeof page === "string"));
    const hasBasicInfo = rawSet.has("basicInfo");
    return {
      clients: hasBasicInfo || rawSet.has("clients"),
      workers: hasBasicInfo || rawSet.has("workers"),
      officeStaff: hasBasicInfo || rawSet.has("officeStaff") || rawSet.has("workers"),
      company: hasBasicInfo || rawSet.has("companyProfile"),
    };
  }

  return { clients: true, workers: true, officeStaff: true, company: false };
}

export function canAccessBasicInfoHub(user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined): boolean {
  const access = resolveBasicInfoTabAccess(user);
  return access.clients || access.workers || access.officeStaff || access.company;
}

export function firstAccessibleBasicInfoTab(access: BasicInfoTabAccess): BasicInfoHubTab {
  if (access.clients) return "clients";
  if (access.workers) return "workers";
  if (access.officeStaff) return "officeStaff";
  return "company";
}
