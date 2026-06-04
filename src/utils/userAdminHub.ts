import { isErpPageKey, type ErpPageKey } from "./pageAccess";
import type { ErpUser } from "./erpApi";

export type UserAdminHubTab = "users" | "audit" | "login";

export const USER_ADMIN_TAB_STORAGE_KEY = "teammillimeter-erp-user-admin-tab";

export const LEGACY_USER_ADMIN_PAGE_KEYS = ["auditLog", "loginHistory"] as const;

export type LegacyUserAdminPageKey = (typeof LEGACY_USER_ADMIN_PAGE_KEYS)[number];

const LEGACY_TO_TAB: Record<LegacyUserAdminPageKey, UserAdminHubTab> = {
  auditLog: "audit",
  loginHistory: "login",
};

export type UserAdminTabAccess = {
  users: boolean;
  audit: boolean;
  login: boolean;
};

export function isLegacyUserAdminPageKey(value: string): value is LegacyUserAdminPageKey {
  return (LEGACY_USER_ADMIN_PAGE_KEYS as readonly string[]).includes(value);
}

export function legacyPageKeyToUserAdminTab(value: string): UserAdminHubTab | null {
  if (!isLegacyUserAdminPageKey(value)) return null;
  return LEGACY_TO_TAB[value];
}

export function migrateUserAdminPageKey(value: string): { page: ErpPageKey; userAdminTab?: UserAdminHubTab } {
  const tab = legacyPageKeyToUserAdminTab(value);
  if (tab) return { page: "usersAdmin", userAdminTab: tab };
  if (isErpPageKey(value)) return { page: value };
  return { page: "dashboard" };
}

export function migrateAllowedPageKeys(pages: ErpPageKey[]): ErpPageKey[] {
  const hasLegacy = pages.some((key) => isLegacyUserAdminPageKey(key));
  const next = pages.filter((key) => !isLegacyUserAdminPageKey(key) && key !== "usersAdmin");
  if (hasLegacy || pages.includes("usersAdmin")) next.push("usersAdmin");
  return next;
}

export function readStoredUserAdminTab(): UserAdminHubTab {
  if (typeof window === "undefined") return "users";
  const stored = window.sessionStorage.getItem(USER_ADMIN_TAB_STORAGE_KEY);
  if (stored === "users" || stored === "audit" || stored === "login") return stored;
  return "users";
}

export function storeUserAdminTab(tab: UserAdminHubTab) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(USER_ADMIN_TAB_STORAGE_KEY, tab);
}

export function resolveUserAdminTabAccess(
  user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
): UserAdminTabAccess {
  if (!user) return { users: false, audit: false, login: false };
  if (user.role === "admin") return { users: true, audit: true, login: true };

  const rawPages = user.allowedPages;
  if (Array.isArray(rawPages) && rawPages.length) {
    const rawSet = new Set(rawPages.filter((page): page is string => typeof page === "string"));
    const hasHub = rawSet.has("usersAdmin");
    return {
      users: hasHub,
      audit: hasHub || rawSet.has("auditLog"),
      login: hasHub || rawSet.has("loginHistory"),
    };
  }

  return { users: false, audit: false, login: false };
}

export function canAccessUserAdminHub(user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined): boolean {
  const access = resolveUserAdminTabAccess(user);
  return access.users || access.audit || access.login;
}

export function firstAccessibleUserAdminTab(access: UserAdminTabAccess): UserAdminHubTab {
  if (access.users) return "users";
  if (access.audit) return "audit";
  return "login";
}
