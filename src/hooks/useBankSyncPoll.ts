import React from "react";
import { fetchBankSyncSnapshot } from "@/utils/erpApi";

function normalizeBankSyncAt(value: string) {
  return String(value || "")
    .trim()
    .replace(/\.\d{3}Z?$/i, "")
    .slice(0, 19);
}

type UseBankSyncPollOptions = {
  enabled: boolean;
  sinceVersionRef: React.RefObject<number>;
  localTransactionCount: number;
  localLatestTransactionAt?: string;
  localImportAt?: string;
  onRefresh: () => Promise<{ applied?: boolean; addedCount?: number; totalCount?: number } | void>;
  intervalMs?: number;
};

/** Lightweight server-only poll; never calls Barobill or folder sync APIs. */
export function useBankSyncPoll({
  enabled,
  sinceVersionRef,
  localTransactionCount,
  localLatestTransactionAt = "",
  localImportAt = "",
  onRefresh,
  intervalMs = 30000,
}: UseBankSyncPollOptions) {
  const localCountRef = React.useRef(localTransactionCount);
  const localLatestAtRef = React.useRef(localLatestTransactionAt);
  const localImportAtRef = React.useRef(localImportAt);
  const onRefreshRef = React.useRef(onRefresh);
  const tickingRef = React.useRef(false);

  React.useEffect(() => {
    localCountRef.current = localTransactionCount;
  }, [localTransactionCount]);

  React.useEffect(() => {
    localLatestAtRef.current = localLatestTransactionAt;
  }, [localLatestTransactionAt]);

  React.useEffect(() => {
    localImportAtRef.current = localImportAt;
  }, [localImportAt]);

  React.useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const pollOnce = React.useCallback(async () => {
    if (!enabled || tickingRef.current) return;
    tickingRef.current = true;
    try {
      const snapshot = await fetchBankSyncSnapshot(
        sinceVersionRef.current,
        localCountRef.current,
        localLatestAtRef.current,
        localImportAtRef.current,
      );

      const serverCount =
        typeof snapshot.bankTransactionCount === "number"
          ? snapshot.bankTransactionCount
          : Array.isArray(snapshot.bankTransactions)
            ? snapshot.bankTransactions.length
            : localCountRef.current;
      const serverLatestAt = normalizeBankSyncAt(snapshot.bankSyncMeta?.lastImportLatestAt || "");
      const localLatestAt = normalizeBankSyncAt(localLatestAtRef.current || "");
      const serverImportAt = String(snapshot.bankSyncMeta?.lastImportAt || "").trim();
      const localImportAtValue = String(localImportAtRef.current || "").trim();
      const hasNewerImport = Boolean(
        serverLatestAt && (!localLatestAt || serverLatestAt.localeCompare(localLatestAt) > 0),
      );
      const importRunChanged = Boolean(serverImportAt && serverImportAt !== localImportAtValue);
      const countMismatch = serverCount !== localCountRef.current;
      const shouldRefresh =
        snapshot.changed || countMismatch || hasNewerImport || importRunChanged;

      if (!shouldRefresh) return;

      const result = await onRefreshRef.current();
      if (result && typeof result.totalCount === "number") {
        localCountRef.current = result.totalCount;
      } else if (serverCount >= 0) {
        localCountRef.current = serverCount;
      }
      if (serverLatestAt) {
        localLatestAtRef.current = serverLatestAt;
      }
      if (serverImportAt) {
        localImportAtRef.current = serverImportAt;
      }
      if (snapshot.version > sinceVersionRef.current) {
        sinceVersionRef.current = snapshot.version;
      }
    } catch {
      // ignore transient poll errors
    } finally {
      tickingRef.current = false;
    }
  }, [enabled, sinceVersionRef]);

  React.useEffect(() => {
    if (!enabled) return;
    void pollOnce();
    const timer = window.setInterval(() => {
      void pollOnce();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pollOnce();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs, pollOnce]);
}
