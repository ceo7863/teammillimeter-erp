/**
 * Finance information architecture: 4 top-level menus + compatibility redirects.
 *
 * A. 매출·내역서  (sales hub pageKey, absorbs statements)
 * B. 입금·미수    (receivables)
 * C. 시공자 지급  (workerPayments)
 * D. 통장         (accounting, bank-first)
 *
 * NOTE: Do not import pageAccess here — pageAccess imports this module (avoid circular types).
 */

/** Final finance sidebar page keys (order). */
export const FINANCE_TOP_LEVEL_PAGE_KEYS = [
  "sales",
  "receivables",
  "workerPayments",
  "accounting",
] as const;

export type FinanceTopLevelPageKey = (typeof FINANCE_TOP_LEVEL_PAGE_KEYS)[number];

export const FINANCE_TOP_LEVEL_LABELS: Record<FinanceTopLevelPageKey, string> = {
  sales: "매출·내역서",
  receivables: "입금·미수",
  workerPayments: "시공자 지급",
  accounting: "통장",
};

/** Legacy keys hidden from sidebar but still valid for redirects / allowedPages. */
export const FINANCE_SIDEBAR_HIDDEN_PAGE_KEYS = [
  "salesInput",
  "salesVoucherSearch",
  "saleComments",
  "statements",
  "pdfArchive",
  "paymentInput",
  "bankTransactions",
  "companyLedger",
  "taxInvoices",
] as const;

export type SalesStatementsHubTab = "vouchers" | "statements" | "register" | "search" | "comments";

export const SALES_STATEMENTS_HUB_TABS: Array<{ key: SalesStatementsHubTab; label: string; primary?: boolean }> = [
  { key: "vouchers", label: "매출전표", primary: true },
  { key: "statements", label: "내역서", primary: true },
];

export const SALES_HUB_TAB_STORAGE_KEY = "teammillimeter-erp-sales-statements-tab";

export const LEGACY_SALES_PAGE_KEYS = [
  "salesInput",
  "salesVoucherSearch",
  "saleComments",
  "statements",
  "pdfArchive",
] as const;

export type LegacySalesPageKey = (typeof LEGACY_SALES_PAGE_KEYS)[number];

const LEGACY_SALES_TO_TAB: Record<LegacySalesPageKey, SalesStatementsHubTab> = {
  salesInput: "register",
  salesVoucherSearch: "search",
  saleComments: "comments",
  statements: "statements",
  pdfArchive: "statements",
};

export function isLegacySalesPageKey(value: string): value is LegacySalesPageKey {
  return (LEGACY_SALES_PAGE_KEYS as readonly string[]).includes(value);
}

export function legacyPageKeyToSalesTab(value: string): SalesStatementsHubTab | null {
  if (!isLegacySalesPageKey(value)) return null;
  return LEGACY_SALES_TO_TAB[value];
}

export function migrateSalesStatementsPageKey(value: string): {
  page: string;
  salesTab?: SalesStatementsHubTab;
} {
  // Do not force vouchers when already on sales — callers may set tab from statementTab.
  if (value === "sales") return { page: "sales" };
  const tab = legacyPageKeyToSalesTab(value);
  if (tab) return { page: "sales", salesTab: tab };
  return { page: value || "dashboard" };
}

export function migrateSalesSidebarOrderKeys(order: string[] | null | undefined): string[] | null {
  if (!order?.length) return order ?? null;
  const next: string[] = [];
  let hasSales = false;
  for (const key of order) {
    if (key === "sales" || isLegacySalesPageKey(key)) {
      if (!hasSales) {
        next.push("sales");
        hasSales = true;
      }
      continue;
    }
    next.push(key);
  }
  return next.length ? next : null;
}

export function migrateSalesAllowedPageKeys(pages: string[]): string[] {
  const touched = pages.some((key) => key === "sales" || isLegacySalesPageKey(key));
  const next = pages.filter((key) => key !== "sales" && !isLegacySalesPageKey(key));
  if (touched) next.push("sales");
  return next;
}

export function readStoredSalesStatementsTab(): SalesStatementsHubTab {
  if (typeof window === "undefined") return "vouchers";
  const stored = window.sessionStorage.getItem(SALES_HUB_TAB_STORAGE_KEY);
  if (
    stored === "vouchers" ||
    stored === "statements" ||
    stored === "register" ||
    stored === "search" ||
    stored === "comments"
  ) {
    return stored;
  }
  return "vouchers";
}

export function storeSalesStatementsTab(tab: SalesStatementsHubTab) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SALES_HUB_TAB_STORAGE_KEY, tab);
}

/** Unified collection / payout vocabulary for UI + aria. */
export const COLLECTION_STATUS_VOCAB = {
  unpaid: "미입금",
  partial: "부분입금",
  paid: "완납",
  prepaid: "선수금",
  needsReview: "확인 필요",
  cancelled: "취소",
} as const;

export const PAYOUT_STATUS_VOCAB = {
  unpaid: "미지급",
  partial: "부분지급",
  paid: "지급완료",
  advance: "선지급",
  needsReview: "확인 필요",
  cancelled: "취소",
  inactive: "신규 지급원장 비활성",
} as const;

export const AP_INACTIVE_HUB_NOTICE =
  "신규 지급 원장 활성화 전입니다. 이전 지급 방식은 기존 화면에서 유지되며, 과거 기록은 재계산하지 않습니다.";

export const HISTORICAL_EXCEPTION_EXCLUDED = {
  expenseMismatch: 492,
  unattributedPayment: 156,
} as const;

/**
 * Route inventory row for docs/tests.
 */
export type FinanceRouteInventoryRow = {
  legacyKey: string;
  label: string;
  decision: "hub" | "redirect" | "read-only" | "admin" | "keep-separate";
  targetPage: string;
  targetTab?: string;
};

export const FINANCE_ROUTE_INVENTORY: FinanceRouteInventoryRow[] = [
  { legacyKey: "salesInput", label: "매출등록", decision: "redirect", targetPage: "sales", targetTab: "register" },
  { legacyKey: "sales", label: "매출관리", decision: "hub", targetPage: "sales", targetTab: "vouchers" },
  { legacyKey: "salesVoucherSearch", label: "매출전표검색", decision: "redirect", targetPage: "sales", targetTab: "search" },
  { legacyKey: "saleComments", label: "전표 코멘트", decision: "redirect", targetPage: "sales", targetTab: "comments" },
  { legacyKey: "statements", label: "내역서", decision: "redirect", targetPage: "sales", targetTab: "statements" },
  { legacyKey: "pdfArchive", label: "PDF 보관함", decision: "redirect", targetPage: "sales", targetTab: "statements" },
  { legacyKey: "receivables", label: "입금/미수금", decision: "hub", targetPage: "receivables" },
  { legacyKey: "paymentInput", label: "입금입력(legacy)", decision: "redirect", targetPage: "receivables" },
  { legacyKey: "workerPayments", label: "시공자 지급", decision: "hub", targetPage: "workerPayments" },
  { legacyKey: "accounting", label: "회계·통장", decision: "hub", targetPage: "accounting", targetTab: "bank" },
  { legacyKey: "bankTransactions", label: "통장거래", decision: "redirect", targetPage: "accounting", targetTab: "bank" },
  { legacyKey: "companyLedger", label: "가계부", decision: "redirect", targetPage: "accounting", targetTab: "ledger" },
  { legacyKey: "taxInvoices", label: "세금계산서", decision: "redirect", targetPage: "accounting", targetTab: "tax" },
  { legacyKey: "reports", label: "보고서", decision: "keep-separate", targetPage: "reports" },
  { legacyKey: "analysis", label: "분석", decision: "keep-separate", targetPage: "analysis" },
  { legacyKey: "apCutover", label: "AP 컷오버", decision: "admin", targetPage: "apCutover" },
  { legacyKey: "calendar", label: "캘린더(단축경로)", decision: "keep-separate", targetPage: "calendar" },
];

export function listCompatibilityRedirects() {
  return FINANCE_ROUTE_INVENTORY.filter((row) => row.decision === "redirect");
}

export function isFinanceSidebarHiddenPageKey(value: string): boolean {
  return (FINANCE_SIDEBAR_HIDDEN_PAGE_KEYS as readonly string[]).includes(value);
}

/**
 * Reports vs analysis: keep separate — statutory/fixed reports vs management trend analysis.
 */
export const REPORTS_ANALYSIS_DECISION = {
  merge: false,
  reason:
    "보고서는 고정·법정/운영 리포트 성격이고 분석은 추세·계정 분석 허브라 목적이 다르다. 무리한 통합 없이 각각 유지.",
} as const;

/** Exception inbox must never count these historical dry-run findings. */
export function isHistoricalExcludedExceptionKind(kind: string): boolean {
  return (
    kind === "legacy_expense_mismatch" ||
    kind === "legacy_unattributed_payment" ||
    kind === "historical_expense_mismatch_492" ||
    kind === "historical_unattributed_payout_156"
  );
}

export function countActionableExceptionBadge(
  items: Array<{ kind?: string; status?: string; ignored?: boolean }> | null | undefined,
): number {
  if (!items?.length) return 0;
  return items.filter((item) => {
    if (item.ignored) return false;
    if (item.status === "resolved" || item.status === "ignored") return false;
    if (item.kind && isHistoricalExcludedExceptionKind(item.kind)) return false;
    return true;
  }).length;
}
