import {
  canUserAccessPage,
  getAccessiblePageDefs,
  isErpPageKey,
  type ErpPageDef,
  type ErpPageKey,
} from "./pageAccess";

/** Sidebar 대신 플로팅 버튼으로 여는 페이지 */
export const FAB_LAUNCHER_PAGE_KEYS: ErpPageKey[] = ["teamChat"];

const STORAGE_PREFIX = "teammillimeter-erp-sidebar-order";
const HIDDEN_STORAGE_PREFIX = "teammillimeter-erp-sidebar-hidden";

export function getSidebarOrderStorageKey(userId: string | number) {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function getSidebarHiddenStorageKey(userId: string | number) {
  return `${HIDDEN_STORAGE_PREFIX}:${userId}`;
}

export function normalizeSidebarOrder(value: unknown): ErpPageKey[] | null {
  if (!Array.isArray(value)) return null;
  const legacyAccountingSet = new Set<string>(["companyLedger", "taxInvoices", "bankTransactions"]);
  const legacyStatementSet = new Set<string>(["pdfArchive"]);
  const legacyBasicInfoSet = new Set<string>(["clients", "workers", "companyProfile"]);
  const legacyUserAdminSet = new Set<string>(["auditLog", "loginHistory"]);
  let hasAccounting = false;
  let hasStatements = false;
  let hasBasicInfo = false;
  let hasUserAdmin = false;
  const unique: ErpPageKey[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") continue;
    if (legacyAccountingSet.has(item)) {
      if (!hasAccounting) {
        hasAccounting = true;
        if (!seen.has("accounting")) {
          seen.add("accounting");
          unique.push("accounting");
        }
      }
      continue;
    }
    if (legacyStatementSet.has(item)) {
      if (!hasStatements) {
        hasStatements = true;
        if (!seen.has("statements")) {
          seen.add("statements");
          unique.push("statements");
        }
      }
      continue;
    }
    if (legacyBasicInfoSet.has(item)) {
      if (!hasBasicInfo) {
        hasBasicInfo = true;
        if (!seen.has("basicInfo")) {
          seen.add("basicInfo");
          unique.push("basicInfo");
        }
      }
      continue;
    }
    if (legacyUserAdminSet.has(item)) {
      if (!hasUserAdmin) {
        hasUserAdmin = true;
        if (!seen.has("usersAdmin")) {
          seen.add("usersAdmin");
          unique.push("usersAdmin");
        }
      }
      continue;
    }
    if (!isErpPageKey(item) || seen.has(item)) continue;
    if (item === "accounting") hasAccounting = true;
    if (item === "statements") hasStatements = true;
    if (item === "basicInfo") hasBasicInfo = true;
    if (item === "usersAdmin") hasUserAdmin = true;
    seen.add(item);
    unique.push(item);
  }

  return unique.length ? unique : null;
}

export function normalizeSidebarHidden(value: unknown): ErpPageKey[] | null {
  if (!Array.isArray(value)) return null;
  const unique: ErpPageKey[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !isErpPageKey(item) || seen.has(item)) continue;
    seen.add(item);
    unique.push(item);
  }
  return unique.length ? unique : null;
}

export function loadSidebarOrder(userId: string | number | null | undefined): ErpPageKey[] | null {
  if (userId == null || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getSidebarOrderStorageKey(userId));
    if (!raw) return null;
    return normalizeSidebarOrder(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSidebarOrder(userId: string | number, order: ErpPageKey[]) {
  if (typeof window === "undefined") return;
  const normalized = normalizeSidebarOrder(order);
  if (!normalized?.length) {
    window.localStorage.removeItem(getSidebarOrderStorageKey(userId));
    return;
  }
  window.localStorage.setItem(getSidebarOrderStorageKey(userId), JSON.stringify(normalized));
}

export function loadSidebarHidden(userId: string | number | null | undefined): ErpPageKey[] | null {
  if (userId == null || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getSidebarHiddenStorageKey(userId));
    if (!raw) return null;
    return normalizeSidebarHidden(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSidebarHidden(userId: string | number, hidden: ErpPageKey[]) {
  if (typeof window === "undefined") return;
  const normalized = normalizeSidebarHidden(hidden);
  if (!normalized?.length) {
    window.localStorage.removeItem(getSidebarHiddenStorageKey(userId));
    return;
  }
  window.localStorage.setItem(getSidebarHiddenStorageKey(userId), JSON.stringify(normalized));
}

export function resolveSidebarOrder(
  user: { id?: string | number; sidebarOrder?: unknown } | null | undefined,
): ErpPageKey[] | null {
  const fromUser = normalizeSidebarOrder(user?.sidebarOrder);
  if (fromUser) return fromUser;
  return loadSidebarOrder(user?.id);
}

export function resolveSidebarHidden(
  user: { id?: string | number; sidebarHidden?: unknown } | null | undefined,
): ErpPageKey[] | null {
  if (user?.sidebarHidden !== undefined) {
    return normalizeSidebarHidden(user.sidebarHidden) || [];
  }
  return loadSidebarHidden(user?.id);
}

export function cacheSidebarOrderFromUser(user: { id?: string | number; sidebarOrder?: unknown } | null | undefined) {
  if (user?.id == null) return;
  const order = normalizeSidebarOrder(user.sidebarOrder);
  if (order) saveSidebarOrder(user.id, order);
}

export function cacheSidebarHiddenFromUser(user: { id?: string | number; sidebarHidden?: unknown } | null | undefined) {
  if (user?.id == null) return;
  if (user.sidebarHidden === undefined) return;
  const hidden = normalizeSidebarHidden(user.sidebarHidden) || [];
  if (hidden.length) saveSidebarHidden(user.id, hidden);
  else clearSidebarHidden(user.id);
}

export async function syncLocalSidebarOrderIfNeeded<T extends { id?: string | number; sidebarOrder?: unknown; sidebarHidden?: unknown }>(
  user: T,
  updateApi: (payload: { sidebarOrder?: ErpPageKey[]; sidebarHidden?: ErpPageKey[] }) => Promise<T>,
): Promise<T> {
  const hasServerOrder = normalizeSidebarOrder(user.sidebarOrder);
  const localOrder = loadSidebarOrder(user.id);
  const localHidden = loadSidebarHidden(user.id);
  const needsOrderSync = !hasServerOrder && !!localOrder;
  const needsHiddenSync = user.sidebarHidden === undefined && !!localHidden;
  if (!needsOrderSync && !needsHiddenSync) return user;

  try {
    return await updateApi({
      ...(needsOrderSync && localOrder ? { sidebarOrder: localOrder } : {}),
      ...(needsHiddenSync && localHidden ? { sidebarHidden: localHidden } : {}),
    });
  } catch {
    return user;
  }
}

export function clearSidebarOrder(userId: string | number) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getSidebarOrderStorageKey(userId));
}

export function clearSidebarHidden(userId: string | number) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getSidebarHiddenStorageKey(userId));
}

export function filterPageDefsByHidden(pages: ErpPageDef[], hidden: ErpPageKey[] | null | undefined): ErpPageDef[] {
  if (!hidden?.length) return pages;
  const hiddenSet = new Set(hidden);
  return pages.filter((page) => !hiddenSet.has(page.key));
}

export function resolveVisibleSidebarPages(
  user: { role?: string; allowedPages?: unknown } | null | undefined,
  order: ErpPageKey[] | null | undefined,
  hidden: ErpPageKey[] | null | undefined,
): ErpPageDef[] {
  return filterPageDefsByHidden(sortPageDefsByOrder(getAccessiblePageDefs(user), order), hidden).filter(
    (page) => !FAB_LAUNCHER_PAGE_KEYS.includes(page.key),
  );
}

export function isFabLauncherPageKey(key: string): key is ErpPageKey {
  return isErpPageKey(key) && FAB_LAUNCHER_PAGE_KEYS.includes(key);
}

/** Sidebar에 없어도 FAB 등으로 열 수 있는 페이지는 active를 유지합니다. */
export function resolveShellActivePage(
  active: ErpPageKey,
  user: { role?: string; allowedPages?: unknown } | null | undefined,
  order: ErpPageKey[] | null | undefined,
  hidden: ErpPageKey[] | null | undefined,
): ErpPageKey {
  if (!user) return active;
  if (isFabLauncherPageKey(active) && canUserAccessPage(user, active)) {
    return active;
  }
  const visible = resolveVisibleSidebarPages(user, order, hidden);
  if (visible.length && !visible.some((page) => page.key === active)) {
    return visible.find((page) => page.key === "dailyReport")?.key ?? visible[0]?.key ?? "dailyReport";
  }
  return active;
}

export function sortPageDefsByOrder(pages: ErpPageDef[], order: ErpPageKey[] | null | undefined): ErpPageDef[] {
  let sorted: ErpPageDef[];
  if (!order?.length) {
    sorted = pages;
  } else {
    const rank = new Map(order.map((key, index) => [key, index]));
    sorted = [...pages].sort((left, right) => {
      const leftRank = rank.has(left.key) ? rank.get(left.key)! : Number.MAX_SAFE_INTEGER;
      const rightRank = rank.has(right.key) ? rank.get(right.key)! : Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.label.localeCompare(right.label, "ko");
    });
  }

  const attendancePage = sorted.find((page) => page.key === "attendance");
  if (!attendancePage) return sorted;
  return [...sorted.filter((page) => page.key !== "attendance"), attendancePage];
}

export function buildSidebarHiddenDraft(
  pages: ErpPageDef[],
  savedHidden: ErpPageKey[] | null | undefined,
): ErpPageKey[] {
  const accessibleSet = new Set(pages.map((page) => page.key));
  return (savedHidden || []).filter((key) => accessibleSet.has(key));
}

export function buildSidebarOrderDraft(pages: ErpPageDef[], savedOrder: ErpPageKey[] | null | undefined): ErpPageKey[] {
  const accessibleKeys = pages.map((page) => page.key);
  const accessibleSet = new Set(accessibleKeys);

  if (!savedOrder?.length) return accessibleKeys;

  const ordered = savedOrder.filter((key) => accessibleSet.has(key));
  accessibleKeys.forEach((key) => {
    if (!ordered.includes(key)) ordered.push(key);
  });

  return ordered;
}
