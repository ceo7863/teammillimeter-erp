export type AnalysisHubTab = "cashStatus" | "profitLoss" | "cashFlow" | "custom";

export const ANALYSIS_TAB_STORAGE_KEY = "teammillimeter-erp-analysis-tab";

export function readStoredAnalysisTab(): AnalysisHubTab {
  if (typeof window === "undefined") return "cashStatus";
  const stored = window.sessionStorage.getItem(ANALYSIS_TAB_STORAGE_KEY);
  if (stored === "cashStatus" || stored === "profitLoss" || stored === "cashFlow" || stored === "custom") return stored;
  return "cashStatus";
}

export function storeAnalysisTab(tab: AnalysisHubTab) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ANALYSIS_TAB_STORAGE_KEY, tab);
}
