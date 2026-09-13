/**
 * Live actionable exception count for sidebar / hub badges.
 * Never reports 0 on fetch failure (keeps last good count; exposes fetchFailed).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchUnresolvedDepositsApi } from "@/utils/erpApi";
import {
  countActionableExceptionBadge,
  filterActionableFinanceExceptions,
  mapUnresolvedQueueToExceptionItems,
} from "@/utils/financeExceptionInbox";

export type ActionableExceptionState = {
  count: number | null;
  fetchFailed: boolean;
  refresh: () => Promise<void>;
  setCountFromChild: (count: number | null, meta?: { fetchFailed?: boolean }) => void;
};

export function useActionableExceptionCount(options: {
  enabled: boolean;
  pollMs?: number;
  refreshToken?: number;
}): ActionableExceptionState {
  const { enabled, pollMs = 60000, refreshToken = 0 } = options;
  const [count, setCount] = useState<number | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const lastGoodRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const payload = await fetchUnresolvedDepositsApi();
      const mapped = mapUnresolvedQueueToExceptionItems(payload?.actionable || payload?.unresolved || []);
      const actionable = filterActionableFinanceExceptions(mapped);
      const next =
        typeof payload?.actionableCount === "number"
          ? payload.actionableCount
          : countActionableExceptionBadge(actionable);
      lastGoodRef.current = next;
      setCount(next);
      setFetchFailed(false);
    } catch {
      setFetchFailed(true);
      // Keep lastGoodRef; do not force 0.
      setCount(lastGoodRef.current);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh, refreshToken]);

  useEffect(() => {
    if (!enabled || !pollMs) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [enabled, pollMs, refresh]);

  const setCountFromChild = useCallback((next: number | null, meta?: { fetchFailed?: boolean }) => {
    if (meta?.fetchFailed) {
      setFetchFailed(true);
      setCount(lastGoodRef.current);
      return;
    }
    if (typeof next === "number") {
      lastGoodRef.current = next;
      setCount(next);
      setFetchFailed(false);
    }
  }, []);

  return { count, fetchFailed, refresh, setCountFromChild };
}
