/**
 * Feature flags for canonical finance UX.
 * AP disbursement write stays OFF until cutover activation + explicit flag.
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

/** Server cutover must also be activated; client flag alone is never enough. */
export function isApCanonicalPayoutUiEnabled(): boolean {
  return isDisbursementWriteEnabled();
}

export function isCollectionHubEnabled(): boolean {
  return true;
}

export const LEGACY_PAYOUT_READ_ONLY_NOTICE =
  "이전 지급 기록 — 기존 방식으로 보존되며 신규 원장으로 재계산하지 않습니다.";

export const AP_LEDGER_INACTIVE_NOTICE =
  "신규 지급 원장 활성화 전입니다. 컷오버 승인 전까지 저장할 수 없습니다.";

export const AP_LEDGER_ACTIVE_BANNER =
  "신규 지급원장이 활성화되었습니다. 이전 기록은 조회 전용이며 기초 미지급·신규 미지급을 합산하지 않습니다.";
