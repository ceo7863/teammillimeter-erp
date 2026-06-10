export type AnalysisHubTab =
  | "accountSummary"
  | "profitLoss"
  | "fixedExpense"
  | "accountTrend"
  | "cashStatus"
  | "cashFlow"
  | "custom";

export const ANALYSIS_TAB_STORAGE_KEY = "teammillimeter-erp-analysis-tab";
export const ANALYSIS_NAV_TAB_KEY = "teammillimeter-erp-analysis-nav-tab";

const VALID_TABS = new Set<AnalysisHubTab>([
  "accountSummary",
  "profitLoss",
  "fixedExpense",
  "accountTrend",
  "cashStatus",
  "cashFlow",
  "custom",
]);

export function readStoredAnalysisTab(): AnalysisHubTab {
  if (typeof window === "undefined") return "accountSummary";
  const stored = window.sessionStorage.getItem(ANALYSIS_TAB_STORAGE_KEY);
  if (stored && VALID_TABS.has(stored as AnalysisHubTab)) return stored as AnalysisHubTab;
  return "accountSummary";
}

export function storeAnalysisTab(tab: AnalysisHubTab) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ANALYSIS_TAB_STORAGE_KEY, tab);
}

export function storeAnalysisNavTab(tab: AnalysisHubTab) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ANALYSIS_NAV_TAB_KEY, tab);
}

export function consumeAnalysisNavTab(): AnalysisHubTab | null {
  if (typeof window === "undefined") return null;
  const stored = window.sessionStorage.getItem(ANALYSIS_NAV_TAB_KEY);
  if (stored) window.sessionStorage.removeItem(ANALYSIS_NAV_TAB_KEY);
  return stored && VALID_TABS.has(stored as AnalysisHubTab) ? (stored as AnalysisHubTab) : null;
}
