import { isErpPageKey, type ErpPageDef, type ErpPageKey } from "./pageAccess";

const STORAGE_PREFIX = "teammillimeter-erp-sidebar-order";

export function getSidebarOrderStorageKey(userId: string | number) {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function normalizeSidebarOrder(value: unknown): ErpPageKey[] | null {
  if (!Array.isArray(value)) return null;
  const unique = [...new Set(value.filter((item): item is ErpPageKey => typeof item === "string" && isErpPageKey(item)))];
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

export function resolveSidebarOrder(
  user: { id?: string | number; sidebarOrder?: unknown } | null | undefined,
): ErpPageKey[] | null {
  const fromUser = normalizeSidebarOrder(user?.sidebarOrder);
  if (fromUser) return fromUser;
  return loadSidebarOrder(user?.id);
}

export function cacheSidebarOrderFromUser(user: { id?: string | number; sidebarOrder?: unknown } | null | undefined) {
  if (user?.id == null) return;
  const order = normalizeSidebarOrder(user.sidebarOrder);
  if (order) saveSidebarOrder(user.id, order);
}

export async function syncLocalSidebarOrderIfNeeded<T extends { id?: string | number; sidebarOrder?: unknown }>(
  user: T,
  updateApi: (order: ErpPageKey[]) => Promise<T>,
): Promise<T> {
  if (normalizeSidebarOrder(user.sidebarOrder)) return user;
  const localOrder = loadSidebarOrder(user.id);
  if (!localOrder) return user;
  try {
    return await updateApi(localOrder);
  } catch {
    return user;
  }
}

export function clearSidebarOrder(userId: string | number) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getSidebarOrderStorageKey(userId));
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
