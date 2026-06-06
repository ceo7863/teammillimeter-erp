import React from "react";
import { fetchBankSyncSnapshot, runBankFolderSync, type BankSyncSnapshot } from "@/utils/erpApi";
import { syncBarobillBankNow, type BarobillBankSyncResult } from "@/utils/barobillBankApi";

const LIVE_SYNC_KEY = "teammillimeter-bank-live-sync";

function normalizeBankSyncAt(value: string) {
  return String(value || "")
    .trim()
    .replace(/\.\d{3}Z?$/i, "")
    .slice(0, 19);
}

function formatBarobillSyncMessage(result: BarobillBankSyncResult, addedCount = 0): string {
  if (result.collecting || result.scrapStatus?.collecting) {
    return (
      result.notices?.[0] ||
      result.scrapStatus?.message ||
      "\uBC14\uB85C\uBE4C\uC5D0\uC11C \uAC70\uB798\uB0B4\uC5AD\uC744 \uC218\uC9D1 \uC911\uC785\uB2C8\uB2E4. 1~3\uBD84 \uD6C4 \uB2E4\uC2DC \uAC00\uC838\uC624\uAE30\uB97C \uB20C\uB7EC \uC8FC\uC138\uC694."
    );
  }
  if (!result.ok) {
    if (result.reason === "sync_in_progress") return "\uB3D9\uAE30\uD654\uAC00 \uC774\uBBF8 \uC9C4\uD589 \uC911\uC785\uB2C8\uB2E4.";
    return result.error || "\uAC00\uC838\uC624\uAE30 \uC2E4\uD328";
  }
  const added = Math.max(0, addedCount, result.added ?? 0);
  if (added > 0) {
    return `${added}\uAC74 \uBC18\uC601\uB428 (\uBC14\uB85C\uBE4C)`;
  }
  if ((result.fetched ?? 0) > 0) {
    return `\uC870\uD68C ${result.fetched}\uAC74 \u00B7 \uC774\uBBF8 \uCD5C\uC2E0 \uC0C1\uD0DC`;
  }
  if (result.notices?.length) return result.notices[0];
  return "\uC774\uBBF8 \uCD5C\uC2E0 \uC0C1\uD0DC";
}

export function loadBankLiveSyncEnabled() {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(LIVE_SYNC_KEY);
  if (raw === "0") return false;
  return true;
}

export function saveBankLiveSyncEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIVE_SYNC_KEY, enabled ? "1" : "0");
}

export type BankLiveSyncState = {
  enabled: boolean;
  polling: boolean;
  lastCheckedAt: string | null;
  lastAppliedAt: string | null;
  lastMessage: string;
  serverStatus: BankSyncSnapshot["liveSyncStatus"] | null;
  bankSyncMeta: BankSyncSnapshot["bankSyncMeta"];
};

export type BankLiveSyncApi = Pick<
  ReturnType<typeof useBankLiveSync>,
  "liveSyncEnabled" | "setLiveSyncEnabled" | "state" | "pullSnapshot" | "syncNow" | "runFolderSync" | "forceRefreshBank"
>;

type UseBankLiveSyncOptions = {
  enabled: boolean;
  isActive: boolean;
  sinceVersion: number;
  localTransactionCount: number;
  localLatestTransactionAt?: string;
  localImportAt?: string;
  onRemoteUpdate: (snapshot: BankSyncSnapshot) => Promise<{ addedCount: number; totalCount: number; applied: boolean } | void>;
  onForceRefresh?: () => Promise<{ addedCount: number; totalCount: number; applied?: boolean } | void>;
  intervalMs?: number;
};

export function useBankLiveSync({
  enabled,
  isActive,
  sinceVersion,
  localTransactionCount,
  localLatestTransactionAt = "",
  localImportAt = "",
  onRemoteUpdate,
  onForceRefresh,
  intervalMs = 20000,
}: UseBankLiveSyncOptions) {
  const [liveSyncEnabled, setLiveSyncEnabled] = React.useState(loadBankLiveSyncEnabled);
  const [state, setState] = React.useState<BankLiveSyncState>({
    enabled: false,
    polling: false,
    lastCheckedAt: null,
    lastAppliedAt: null,
    lastMessage: "",
    serverStatus: null,
    bankSyncMeta: null,
  });

  const sinceVersionRef = React.useRef(sinceVersion);
  const localCountRef = React.useRef(localTransactionCount);
  const localLatestAtRef = React.useRef(localLatestTransactionAt);
  const localImportAtRef = React.useRef(localImportAt);
  const onRemoteUpdateRef = React.useRef(onRemoteUpdate);
  const onForceRefreshRef = React.useRef(onForceRefresh);
  const barobillBankRef = React.useRef(false);
  const lastServerSyncAtRef = React.useRef(0);
  const lastBarobillRefreshAtRef = React.useRef(0);
  const barobillRefreshIntervalRef = React.useRef(180000);
  const serverSyncIntervalRef = React.useRef(Math.max(intervalMs * 2, 45000));

  React.useEffect(() => {
    sinceVersionRef.current = sinceVersion;
  }, [sinceVersion]);

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
    onRemoteUpdateRef.current = onRemoteUpdate;
  }, [onRemoteUpdate]);

  const refreshSyncSources = React.useCallback(async () => {
    if (!enabled) return;
    try {
      const snapshot = await fetchBankSyncSnapshot(
        sinceVersionRef.current,
        localCountRef.current,
        localLatestAtRef.current,
        localImportAtRef.current,
      );
      barobillBankRef.current = Boolean(snapshot.liveSyncStatus?.sources?.barobillBank);
      if (barobillBankRef.current) {
        serverSyncIntervalRef.current = intervalMs;
        barobillRefreshIntervalRef.current = Math.max(
          180000,
          snapshot.liveSyncStatus?.intervalMs ?? 180000,
        );
      } else if (snapshot.liveSyncStatus?.intervalMs) {
        serverSyncIntervalRef.current = Math.max(
          45000,
          Math.min(snapshot.liveSyncStatus.intervalMs, intervalMs * 2),
        );
      }
      setState((prev) => ({
        ...prev,
        enabled: true,
        serverStatus: snapshot.liveSyncStatus,
        bankSyncMeta: snapshot.bankSyncMeta,
      }));
    } catch {
      // ignore source refresh errors; pullSnapshot will surface them
    }
  }, [enabled, intervalMs]);

  const pullSnapshot = React.useCallback(async (applyChanges = true) => {
    if (!enabled) return null;
    setState((prev) => ({ ...prev, polling: true }));
    try {
      const snapshot = await fetchBankSyncSnapshot(
        sinceVersionRef.current,
        localCountRef.current,
        localLatestAtRef.current,
        localImportAtRef.current,
      );
      barobillBankRef.current = Boolean(snapshot.liveSyncStatus?.sources?.barobillBank);
      if (barobillBankRef.current) {
        serverSyncIntervalRef.current = intervalMs;
        barobillRefreshIntervalRef.current = Math.max(
          180000,
          snapshot.liveSyncStatus?.intervalMs ?? 180000,
        );
      } else if (snapshot.liveSyncStatus?.intervalMs) {
        serverSyncIntervalRef.current = Math.max(
          45000,
          Math.min(snapshot.liveSyncStatus.intervalMs, intervalMs * 2),
        );
      }
      setState((prev) => ({
        ...prev,
        polling: false,
        enabled: true,
        lastCheckedAt: new Date().toISOString(),
        serverStatus: snapshot.liveSyncStatus,
        bankSyncMeta: snapshot.bankSyncMeta,
      }));

      const serverCount =
        typeof snapshot.bankTransactionCount === "number"
          ? snapshot.bankTransactionCount
          : Array.isArray(snapshot.bankTransactions)
            ? snapshot.bankTransactions.length
            : localCountRef.current;
      const localCount = localCountRef.current;
      const serverLatestAt = normalizeBankSyncAt(snapshot.bankSyncMeta?.lastImportLatestAt || "");
      const localLatestAt = normalizeBankSyncAt(localLatestAtRef.current || "");
      const serverImportAt = String(snapshot.bankSyncMeta?.lastImportAt || "").trim();
      const localImportAtValue = String(localImportAtRef.current || "").trim();
      const hasNewerImport = Boolean(
        serverLatestAt && (!localLatestAt || serverLatestAt.localeCompare(localLatestAt) > 0),
      );
      const importRunChanged = Boolean(serverImportAt && serverImportAt !== localImportAtValue);
      const countMismatch = serverCount !== localCount;
      let shouldApply =
        applyChanges &&
        (hasNewerImport ||
          importRunChanged ||
          countMismatch ||
          (snapshot.changed && snapshot.version > sinceVersionRef.current));

      if (shouldApply) {
        const applyResult = onForceRefreshRef.current
          ? await onForceRefreshRef.current()
          : await onRemoteUpdateRef.current(snapshot);
        const appliedTotal =
          applyResult && typeof applyResult.totalCount === "number"
            ? applyResult.totalCount
            : serverCount;
        const applied =
          applyResult && typeof applyResult === "object" && "applied" in applyResult
            ? applyResult.applied !== false
            : applyResult != null;
        if (applied) {
          localCountRef.current = appliedTotal;
          if (serverLatestAt) {
            localLatestAtRef.current = serverLatestAt;
          }
          if (serverImportAt) {
            localImportAtRef.current = serverImportAt;
          }
        }
        const added = Math.max(0, appliedTotal - localCount);
        setState((prev) => ({
          ...prev,
          lastAppliedAt: new Date().toISOString(),
          lastMessage:
            !applied
              ? "\uB3D9\uAE30\uD654 \uC801\uC6A9 \uC2E4\uD328"
              : added > 0
                ? `${added}\uAC74 \uC790\uB3D9 \uBC18\uC601\uB428`
                : "\uC774\uBBF8 \uCD5C\uC2E0 \uC0C1\uD0DC",
        }));
      }

      return snapshot;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        polling: false,
        lastMessage: error instanceof Error ? error.message : "\uB3D9\uAE30\uD654 \uC2E4\uD328",
      }));
      return null;
    }
  }, [enabled]);

  const runServerBankSyncIfDue = React.useCallback(
    async (options?: { refresh?: boolean }) => {
      if (!enabled) return null;
      const syncIntervalMs = serverSyncIntervalRef.current;
      if (Date.now() - lastServerSyncAtRef.current < syncIntervalMs) return null;
      lastServerSyncAtRef.current = Date.now();
      try {
        if (barobillBankRef.current) {
          return await syncBarobillBankNow({ refresh: options?.refresh === true });
        }
        return await runBankFolderSync({ refresh: options?.refresh === true });
      } catch {
        lastServerSyncAtRef.current = 0;
        return null;
      }
    },
    [enabled, intervalMs],
  );

  React.useEffect(() => {
    onForceRefreshRef.current = onForceRefresh;
  }, [onForceRefresh]);

  const forceRefreshBank = React.useCallback(async () => {
    if (!enabled) return null;
    if (onForceRefreshRef.current) {
      return onForceRefreshRef.current();
    }
    await pullSnapshot(true);
    return null;
  }, [enabled, pullSnapshot]);

  const syncNow = React.useCallback(async (options?: { refresh?: boolean }) => {
    if (!enabled) return null;
    setState((prev) => ({
      ...prev,
      polling: true,
      lastMessage: barobillBankRef.current
        ? "\uBC14\uB85C\uBE4C\uC5D0\uC11C \uAC00\uC838\uC624\uB294 \uC911..."
        : "\uC740\uD589 \uB3D9\uAE30\uD654 \uC911...",
    }));
    const beforeCount = localCountRef.current;
    try {
      await refreshSyncSources();
      const refresh = options?.refresh === true;
      let result: Awaited<ReturnType<typeof runBankFolderSync>> | BarobillBankSyncResult | null = null;
      if (barobillBankRef.current) {
        result = await syncBarobillBankNow({ refresh });
      } else {
        result = await runBankFolderSync({ refresh });
      }
      lastServerSyncAtRef.current = Date.now();
      const refreshResult = await onForceRefreshRef.current?.();
      if (refreshResult?.totalCount != null) {
        localCountRef.current = refreshResult.totalCount;
      }
      await pullSnapshot(true);
      const afterCount = refreshResult?.totalCount ?? localCountRef.current;
      const added = Math.max(
        0,
        refreshResult?.addedCount ?? 0,
        result && "added" in result ? Number(result.added) || 0 : 0,
        afterCount - beforeCount,
      );
      setState((prev) => ({
        ...prev,
        polling: false,
        lastAppliedAt: new Date().toISOString(),
        lastMessage:
          barobillBankRef.current && result && "ok" in result
            ? formatBarobillSyncMessage(result as BarobillBankSyncResult, added)
            : added > 0
              ? `${added}\uAC74 \uBC18\uC601\uB428${result && "source" in result && result.source ? ` (${result.source})` : ""}`
              : result && "collecting" in result && result.collecting
                ? "\uBC14\uB85C\uBE4C \uC218\uC9D1 \uC911\uC785\uB2C8\uB2E4. 1~3\uBD84 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694."
                : result && "fetched" in result && (result.fetched ?? 0) > 0
                  ? `\uC870\uD68C ${result.fetched}\uAC74 \u00B7 \uC774\uBBF8 \uCD5C\uC2E0 \uC0C1\uD0DC`
                  : result && "reason" in result && result.reason === "no_files"
                    ? "\uC2E0\uADDC IBK \uC5D1\uC140 \uC5C6\uC74C"
                    : result &&
                        "reason" in result &&
                        result.reason === "IBK_BANK_IMPORT_DIR not configured" &&
                        result.ok === false
                      ? "\uC740\uD589 \uB3D9\uAE30\uD654 \uC644\uB8CC (\uBCC0\uACBD \uC5C6\uC74C)"
                      : "\uC774\uBBF8 \uCD5C\uC2E0 \uC0C1\uD0DC",
      }));
      return result;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        polling: false,
        lastMessage: error instanceof Error ? error.message : "\uB3D9\uAE30\uD654 \uC2E4\uD328",
      }));
      return null;
    }
  }, [enabled, pullSnapshot, refreshSyncSources, runServerBankSyncIfDue]);

  const runFolderSync = React.useCallback(
    (options?: { refresh?: boolean }) => syncNow(options),
    [syncNow],
  );

  React.useEffect(() => {
    saveBankLiveSyncEnabled(liveSyncEnabled);
  }, [liveSyncEnabled]);

  React.useEffect(() => {
    if (!enabled || !liveSyncEnabled || !isActive) return;
    let ticking = false;
    const tick = async () => {
      if (ticking) return;
      ticking = true;
      try {
        await refreshSyncSources();
        const beforeCount = localCountRef.current;
        let syncResult: Awaited<ReturnType<typeof syncBarobillBankNow>> | Awaited<
          ReturnType<typeof runBankFolderSync>
        > | null = null;
        if (barobillBankRef.current) {
          try {
            const requestRefresh =
              Date.now() - lastBarobillRefreshAtRef.current >= barobillRefreshIntervalRef.current;
            syncResult = await syncBarobillBankNow({ refresh: requestRefresh });
            if (requestRefresh) {
              lastBarobillRefreshAtRef.current = Date.now();
            }
          } catch {
            syncResult = null;
          }
        } else {
          syncResult = await runServerBankSyncIfDue();
        }
        const refreshResult = await onForceRefreshRef.current?.();
        if (refreshResult?.totalCount != null) {
          localCountRef.current = refreshResult.totalCount;
        }
        const added = Math.max(
          0,
          refreshResult?.addedCount ?? 0,
          syncResult && "added" in syncResult ? Number(syncResult.added) || 0 : 0,
          (refreshResult?.totalCount ?? beforeCount) - beforeCount,
        );
        if (syncResult && barobillBankRef.current && "ok" in syncResult) {
          setState((prev) => ({
            ...prev,
            lastAppliedAt: new Date().toISOString(),
            lastMessage: formatBarobillSyncMessage(syncResult as BarobillBankSyncResult, added),
          }));
        } else if (added > 0) {
          setState((prev) => ({
            ...prev,
            lastAppliedAt: new Date().toISOString(),
            lastMessage: `${added}\uAC74 \uC790\uB3D9 \uBC18\uC601\uB428`,
          }));
        }
        await refreshSyncSources();
      } finally {
        ticking = false;
      }
    };
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
  }, [enabled, liveSyncEnabled, isActive, intervalMs, refreshSyncSources, runServerBankSyncIfDue]);

  return {
    liveSyncEnabled,
    setLiveSyncEnabled,
    state,
    pullSnapshot,
    syncNow,
    runFolderSync,
    forceRefreshBank,
  };
}
