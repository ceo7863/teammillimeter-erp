import type { ErpUser } from "./erpApi";
import {
  canAccessBasicInfoHub,
  isLegacyBasicInfoPageKey,
  migrateAllowedPageKeys as migrateBasicInfoAllowedPageKeys,
  resolveBasicInfoTabAccess,
} from "./basicInfoHub";
import {
  canAccessUserAdminHub,
  isLegacyUserAdminPageKey,
  migrateAllowedPageKeys as migrateUserAdminAllowedPageKeys,
  resolveUserAdminTabAccess,
} from "./userAdminHub";

export const ERP_PAGE_KEYS = [
  "dashboard",
  "calendar",
  "salesInput",
  "sales",
  "salesVoucherSearch",
  "saleComments",
  "receivables",
  "workerPayments",
  "reports",
  "statements",
  "pdfArchive",
  "basicInfo",
  "clients",
  "workers",
  "accounting",
  "analysis",
  "companyNotices",
  "companyProfile",
  "clientSiteRequests",
  "clientSiteRequestCalendars",
  "scCalendar",
  "scAlimtalk",
  "auditLog",
  "usersAdmin",
  "loginHistory",
  "attendance",
  "dailyReport",
  "taskBoard",
  "teamChat",
  "officePayroll",
] as const;

export type ErpPageKey = (typeof ERP_PAGE_KEYS)[number];

export type ErpPageDef = {
  key: ErpPageKey;
  label: string;
  group: string;
  adminOnly?: boolean;
};

export const ERP_PAGE_DEFS: ErpPageDef[] = [
  { key: "dailyReport", label: "\uC77C\uC77C\uBCF4\uACE0", group: "\uC5C5\uBB34" },
  { key: "taskBoard", label: "업무보드", group: "업무" },
  { key: "teamChat", label: "팀밀 톡", group: "\uC5C5\uBB34" },
  { key: "dashboard", label: "대시보드", group: "업무" },
  { key: "calendar", label: "캘린더", group: "업무" },
  { key: "clientSiteRequests", label: "현장 접수", group: "업무" },
  { key: "clientSiteRequestCalendars", label: "업체별 캘린더", group: "업무" },
  { key: "scCalendar", label: "SC 스케줄", group: "업무" },
  { key: "scAlimtalk", label: "\uC54C\uB9BC\uD1A1", group: "\uC5C5\uBB34" },
  { key: "salesInput", label: "매출등록", group: "매출" },
  { key: "sales", label: "매출관리", group: "매출" },
  { key: "salesVoucherSearch", label: "매출전표검색", group: "매출" },
  { key: "saleComments", label: "전표 코멘트", group: "매출" },
  { key: "receivables", label: "입금/미수금", group: "매출" },
  { key: "workerPayments", label: "시공자 지급", group: "시공" },
  { key: "officePayroll", label: "급여 관리", group: "회계", adminOnly: true },
  { key: "reports", label: "보고서", group: "보고" },
  { key: "statements", label: "내역서", group: "보고" },
  { key: "basicInfo", label: "기본정보", group: "기준정보" },
  { key: "accounting", label: "회계·통장", group: "회계" },
  { key: "analysis", label: "분석", group: "회계" },
  { key: "companyNotices", label: "회사게시판", group: "게시" },
  { key: "usersAdmin", label: "사용자 관리", group: "관리", adminOnly: true },
  { key: "attendance", label: "근태 관리", group: "업무" },
];

const ERP_PAGE_KEY_SET = new Set<string>(ERP_PAGE_KEYS);

/** 일반(staff) 계정 기본 허용 페이지 */
export const DEFAULT_STAFF_PAGE_KEYS: ErpPageKey[] = [
  "dailyReport",
  "taskBoard",
  "teamChat",
  "dashboard",
  "calendar",
  "clientSiteRequests",
  "clientSiteRequestCalendars",
  "scCalendar",
  "scAlimtalk",
  "salesInput",
  "sales",
  "salesVoucherSearch",
  "saleComments",
  "receivables",
  "workerPayments",
  "reports",
  "statements",
  "accounting",
  "analysis",
  "companyNotices",
  "basicInfo",
  "attendance",
];

export function isErpPageKey(value: string): value is ErpPageKey {
  return ERP_PAGE_KEY_SET.has(value);
}

const LEGACY_ACCOUNTING_PAGE_KEYS = ["companyLedger", "taxInvoices", "bankTransactions"] as const;
const LEGACY_STATEMENT_PAGE_KEYS = ["pdfArchive"] as const;

export function normalizeAllowedPages(pages: unknown): ErpPageKey[] | null {
  if (!Array.isArray(pages)) return null;
  const legacyAccountingSet = new Set<string>(LEGACY_ACCOUNTING_PAGE_KEYS);
  const legacyStatementSet = new Set<string>(LEGACY_STATEMENT_PAGE_KEYS);
  let hasLegacyAccounting = false;
  let hasLegacyStatement = false;
  let hasLegacyBasicInfo = false;
  let hasLegacyUserAdmin = false;
  const unique: ErpPageKey[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    if (typeof page !== "string") continue;
    if (legacyAccountingSet.has(page)) {
      hasLegacyAccounting = true;
      continue;
    }
    if (legacyStatementSet.has(page)) {
      hasLegacyStatement = true;
      continue;
    }
    if (isLegacyBasicInfoPageKey(page)) {
      hasLegacyBasicInfo = true;
      continue;
    }
    if (isLegacyUserAdminPageKey(page)) {
      hasLegacyUserAdmin = true;
      continue;
    }
    if (!isErpPageKey(page) || seen.has(page)) continue;
    seen.add(page);
    unique.push(page);
  }

  if (!unique.length && !hasLegacyAccounting && !hasLegacyStatement && !hasLegacyBasicInfo && !hasLegacyUserAdmin) return null;
  if (hasLegacyAccounting && !unique.includes("accounting")) unique.push("accounting");
  if (hasLegacyStatement && !unique.includes("statements")) unique.push("statements");
  if (hasLegacyBasicInfo && !unique.includes("basicInfo")) unique.push("basicInfo");
  if (hasLegacyUserAdmin && !unique.includes("usersAdmin")) unique.push("usersAdmin");
  if (unique.includes("clientSiteRequests") && !unique.includes("clientSiteRequestCalendars")) {
    unique.push("clientSiteRequestCalendars");
  }
  if (!unique.length) {
    if (hasLegacyAccounting) return ["accounting"];
    if (hasLegacyStatement) return ["statements"];
    if (hasLegacyBasicInfo) return ["basicInfo"];
    if (hasLegacyUserAdmin) return ["usersAdmin"];
  }
  return unique.length ? unique : null;
}

export function resolveUserAllowedPages(user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined): ErpPageKey[] {
  if (!user) return [];
  if (user.role === "admin") return migrateUserAdminAllowedPageKeys(migrateBasicInfoAllowedPageKeys([...ERP_PAGE_KEYS]));

  const custom = normalizeAllowedPages(user.allowedPages);
  if (custom?.length) return custom;

  return [...DEFAULT_STAFF_PAGE_KEYS];
}

export function canUserAccessPage(
  user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
  pageKey: string,
): boolean {
  if (pageKey === "basicInfo") return canAccessBasicInfoHub(user);
  if (pageKey === "clients") return resolveBasicInfoTabAccess(user).clients;
  if (pageKey === "workers") return resolveBasicInfoTabAccess(user).workers;
  if (pageKey === "companyProfile") return resolveBasicInfoTabAccess(user).company;
  if (pageKey === "usersAdmin") return canAccessUserAdminHub(user);
  if (pageKey === "auditLog") return resolveUserAdminTabAccess(user).audit;
  if (pageKey === "loginHistory") return resolveUserAdminTabAccess(user).login;
  if (!isErpPageKey(pageKey)) return false;
  return resolveUserAllowedPages(user).includes(pageKey);
}

export function getDefaultPageForUser(user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined): ErpPageKey {
  const allowed = resolveUserAllowedPages(user);
  if (allowed.includes("dailyReport")) return "dailyReport";
  return allowed[0] || "dashboard";
}

export function getAccessiblePageDefs(user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined) {
  const allowed = new Set(resolveUserAllowedPages(user));
  return ERP_PAGE_DEFS.filter((page) => allowed.has(page.key));
}

export function getPageLabel(pageKey: string) {
  return ERP_PAGE_DEFS.find((page) => page.key === pageKey)?.label || "ERP";
}

export function getPageAccessGroups() {
  const groups = new Map<string, ErpPageDef[]>();
  ERP_PAGE_DEFS.forEach((page) => {
    if (page.adminOnly) return;
    const list = groups.get(page.group) || [];
    list.push(page);
    groups.set(page.group, list);
  });
  return [...groups.entries()];
}
