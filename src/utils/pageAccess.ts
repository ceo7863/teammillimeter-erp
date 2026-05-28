import type { ErpUser } from "./erpApi";

export const ERP_PAGE_KEYS = [
  "dashboard",
  "calendar",
  "salesInput",
  "sales",
  "salesVoucherSearch",
  "receivables",
  "workerPayments",
  "reports",
  "statements",
  "pdfArchive",
  "clients",
  "workers",
  "companyLedger",
  "taxInvoices",
  "bankTransactions",
  "companyNotices",
  "companyProfile",
  "auditLog",
  "usersAdmin",
  "loginHistory",
  "attendance",
] as const;

export type ErpPageKey = (typeof ERP_PAGE_KEYS)[number];

export type ErpPageDef = {
  key: ErpPageKey;
  label: string;
  group: string;
  adminOnly?: boolean;
};

export const ERP_PAGE_DEFS: ErpPageDef[] = [
  { key: "dashboard", label: "대시보드", group: "업무" },
  { key: "calendar", label: "캘린더", group: "업무" },
  { key: "salesInput", label: "매출등록", group: "매출" },
  { key: "sales", label: "매출관리", group: "매출" },
  { key: "salesVoucherSearch", label: "매출전표검색", group: "매출" },
  { key: "receivables", label: "입금/미수금", group: "매출" },
  { key: "workerPayments", label: "시공자 지급", group: "시공" },
  { key: "reports", label: "보고서", group: "보고" },
  { key: "statements", label: "내역서", group: "보고" },
  { key: "pdfArchive", label: "PDF 보관함", group: "보고" },
  { key: "clients", label: "거래처", group: "기준정보" },
  { key: "workers", label: "시공자", group: "기준정보" },
  { key: "companyLedger", label: "회사 가계부", group: "회계" },
  { key: "taxInvoices", label: "계산서 발행", group: "회계" },
  { key: "bankTransactions", label: "통장 거래내역", group: "회계" },
  { key: "companyNotices", label: "회사게시판", group: "게시" },
  { key: "companyProfile", label: "회사정보", group: "설정" },
  { key: "auditLog", label: "감사로그", group: "설정", adminOnly: true },
  { key: "usersAdmin", label: "사용자 관리", group: "관리", adminOnly: true },
  { key: "loginHistory", label: "로그인 이력", group: "관리", adminOnly: true },
  { key: "attendance", label: "근태 관리", group: "업무" },
];

const ERP_PAGE_KEY_SET = new Set<string>(ERP_PAGE_KEYS);

/** 일반(staff) 계정 기본 허용 페이지 */
export const DEFAULT_STAFF_PAGE_KEYS: ErpPageKey[] = [
  "dashboard",
  "calendar",
  "salesInput",
  "sales",
  "salesVoucherSearch",
  "receivables",
  "workerPayments",
  "reports",
  "statements",
  "pdfArchive",
  "companyNotices",
  "clients",
  "workers",
  "attendance",
];

export function isErpPageKey(value: string): value is ErpPageKey {
  return ERP_PAGE_KEY_SET.has(value);
}

export function normalizeAllowedPages(pages: unknown): ErpPageKey[] | null {
  if (!Array.isArray(pages)) return null;
  const unique = [...new Set(pages.filter((page): page is ErpPageKey => typeof page === "string" && isErpPageKey(page)))];
  return unique.length ? unique : null;
}

export function resolveUserAllowedPages(user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined): ErpPageKey[] {
  if (!user) return [];
  if (user.role === "admin") return [...ERP_PAGE_KEYS];

  const custom = normalizeAllowedPages(user.allowedPages);
  if (custom?.length) return custom;

  return [...DEFAULT_STAFF_PAGE_KEYS];
}

export function canUserAccessPage(
  user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
  pageKey: string,
): boolean {
  if (!isErpPageKey(pageKey)) return false;
  return resolveUserAllowedPages(user).includes(pageKey);
}

export function getDefaultPageForUser(user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined): ErpPageKey {
  const allowed = resolveUserAllowedPages(user);
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
