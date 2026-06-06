import React from "react";
import { fetchBankSyncSnapshot } from "@/utils/erpApi";
import { syncBarobillBankNow } from "@/utils/barobillBankApi";

type UseBankAutoSyncOptions = {
  enabled: boolean;
  isActive: boolean;
  onSyncBegin?: () => void;
  onSynced?: (result?: { version?: number }) => void | Promise<void>;
  intervalMs?: number;
  barobillRefreshIntervalMs?: number;
};

/** Auto-fetch Barobill bank rows and refresh the list while the bank tab is visible. */
export function useBankAutoSync({
  enabled,
  isActive,
  onSyncBegin,
  onSynced,
  intervalMs = 15000,
  barobillRefreshIntervalMs = 180000,
}: UseBankAutoSyncOptions) {
  const onSyncBeginRef = React.useRef(onSyncBegin);
  const onSyncedRef = React.useRef(onSynced);
  const barobillBankRef = React.useRef(false);
  const lastBarobillRefreshAtRef = React.useRef(0);
  const tickingRef = React.useRef(false);

  React.useEffect(() => {
    onSyncBeginRef.current = onSyncBegin;
  }, [onSyncBegin]);

  React.useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const tick = React.useCallback(async () => {
    if (!enabled || !isActive || tickingRef.current) return;
    tickingRef.current = true;
    try {
      try {
        const snapshot = await fetchBankSyncSnapshot(0);
        barobillBankRef.current = Boolean(snapshot.liveSyncStatus?.sources?.barobillBank);
      } catch {
        return;
      }

      onSyncBeginRef.current?.();

      if (barobillBankRef.current) {
        try {
          const requestRefresh =
            Date.now() - lastBarobillRefreshAtRef.current >= barobillRefreshIntervalMs;
          const result = await syncBarobillBankNow({ refresh: requestRefresh });
          if (requestRefresh) {
            lastBarobillRefreshAtRef.current = Date.now();
          }
          await onSyncedRef.current?.({ version: result.version });
        } catch {
          await onSyncedRef.current?.();
        }
        return;
      }

      await onSyncedRef.current?.();
    } finally {
      tickingRef.current = false;
    }
  }, [enabled, isActive, barobillRefreshIntervalMs]);

  React.useEffect(() => {
    if (!enabled || !isActive) return;
    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, isActive, intervalMs, tick]);
}
