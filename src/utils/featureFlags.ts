/**
 * Feature flags for canonical finance UX Phase 2.
 * AP disbursement write UI stays off until AP cutover approval.
 */
export function isDisbursementWriteEnabled(): boolean {
  try {
    if (typeof window !== "undefined") {
      const fromStorage = window.localStorage?.getItem("erp.feature.disbursementWrite");
      if (fromStorage === "1" || fromStorage === "true") return true;
      if (fromStorage === "0" || fromStorage === "false") return false;
    }
  } catch {
    /* ignore */
  }
  const env = String((import.meta as { env?: Record<string, string> }).env?.VITE_DISBURSEMENT_WRITE_ENABLED || "");
  return env === "1" || env.toLowerCase() === "true";
}

export function isCollectionHubEnabled(): boolean {
  return true;
}
