import React from "react";
import { fetchBankSyncSnapshot } from "@/utils/erpApi";
import { syncBarobillBankNow } from "@/utils/barobillBankApi";

type BankAutoSyncCallbackPayload = {
  version?: number;
  bankTransactions?: unknown[];
  bankTransactionFolders?: unknown[];
  bankSyncMeta?: { lastImportAt?: string | null } | null;
};

type UseBankAutoSyncOptions = {
  enabled: boolean;
  isActive: boolean;
  isBankSyncBusy?: () => boolean;
  onSyncBegin?: () => void;
  onSynced?: (result?: BankAutoSyncCallbackPayload) => void | Promise<void>;
  listRefreshIntervalMs?: number;
  barobillSyncIntervalMs?: number;
};

/** Keep bank list fresh on the bank tab: poll server often, fetch Barobill occasionally. */
export function useBankAutoSync({
  enabled,
  isActive,
  isBankSyncBusy,
  onSyncBegin,
  onSynced,
  listRefreshIntervalMs = 15000,
  barobillSyncIntervalMs = 180000,
}: UseBankAutoSyncOptions) {
  const onSyncBeginRef = React.useRef(onSyncBegin);
  const onSyncedRef = React.useRef(onSynced);
  const isBankSyncBusyRef = React.useRef(isBankSyncBusy);
  const barobillBankRef = React.useRef(false);
  const lastBarobillSyncAtRef = React.useRef(0);
  const listTickingRef = React.useRef(false);
  const barobillTickingRef = React.useRef(false);

  React.useEffect(() => {
    onSyncBeginRef.current = onSyncBegin;
  }, [onSyncBegin]);

  React.useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  React.useEffect(() => {
    isBankSyncBusyRef.current = isBankSyncBusy;
  }, [isBankSyncBusy]);

  const refreshSources = React.useCallback(async () => {
    const snapshot = await fetchBankSyncSnapshot(0);
    barobillBankRef.current = Boolean(snapshot.liveSyncStatus?.sources?.barobillBank);
    return snapshot;
  }, []);

  const refreshListFromServer = React.useCallback(async () => {
    if (!enabled || !isActive || listTickingRef.current) return;
    if (isBankSyncBusyRef.current?.()) return;
    listTickingRef.current = true;
    try {
      if (isBankSyncBusyRef.current?.()) return;
      onSyncBeginRef.current?.();
      await onSyncedRef.current?.();
    } finally {
      listTickingRef.current = false;
    }
  }, [enabled, isActive]);

  const syncBarobillIfDue = React.useCallback(async () => {
    if (!enabled || !isActive || barobillTickingRef.current) return;
    if (isBankSyncBusyRef.current?.()) return;
    if (!barobillBankRef.current) return;
    if (Date.now() - lastBarobillSyncAtRef.current < barobillSyncIntervalMs) return;

    barobillTickingRef.current = true;
    try {
      if (isBankSyncBusyRef.current?.()) return;
      onSyncBeginRef.current?.();
      const result = await syncBarobillBankNow({ refresh: false });
      lastBarobillSyncAtRef.current = Date.now();
      await onSyncedRef.current?.({
        version: result.version,
        bankTransactions: result.bankTransactions,
        bankTransactionFolders: result.bankTransactionFolders,
        bankSyncMeta: result.bankSyncMeta ?? null,
      });
    } catch {
      if (!isBankSyncBusyRef.current?.()) {
        await onSyncedRef.current?.();
      }
    } finally {
      barobillTickingRef.current = false;
    }
  }, [enabled, isActive, barobillSyncIntervalMs]);

  const tick = React.useCallback(async () => {
    if (!enabled || !isActive) return;
    try {
      await refreshSources();
    } catch {
      return;
    }
    await refreshListFromServer();
    void syncBarobillIfDue();
  }, [enabled, isActive, refreshListFromServer, refreshSources, syncBarobillIfDue]);

  React.useEffect(() => {
    if (!enabled || !isActive) return;
    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, listRefreshIntervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, isActive, listRefreshIntervalMs, tick]);
}
