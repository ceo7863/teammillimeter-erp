import React from "react";
import { fetchBankSyncSnapshot, runBankFolderSync, type BankSyncSnapshot } from "@/utils/erpApi";

const LIVE_SYNC_KEY = "teammillimeter-bank-live-sync";

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

type UseBankLiveSyncOptions = {
  enabled: boolean;
  isActive: boolean;
  sinceVersion: number;
  localTransactionCount: number;
  onRemoteUpdate: (snapshot: BankSyncSnapshot) => void;
  intervalMs?: number;
};

export function useBankLiveSync({
  enabled,
  isActive,
  sinceVersion,
  localTransactionCount,
  onRemoteUpdate,
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
  const onRemoteUpdateRef = React.useRef(onRemoteUpdate);

  React.useEffect(() => {
    sinceVersionRef.current = sinceVersion;
  }, [sinceVersion]);

  React.useEffect(() => {
    localCountRef.current = localTransactionCount;
  }, [localTransactionCount]);

  React.useEffect(() => {
    onRemoteUpdateRef.current = onRemoteUpdate;
  }, [onRemoteUpdate]);

  const pullSnapshot = React.useCallback(async (applyChanges = true) => {
    if (!enabled) return null;
    setState((prev) => ({ ...prev, polling: true }));
    try {
      const snapshot = await fetchBankSyncSnapshot(sinceVersionRef.current);
      setState((prev) => ({
        ...prev,
        polling: false,
        enabled: true,
        lastCheckedAt: new Date().toISOString(),
        serverStatus: snapshot.liveSyncStatus,
        bankSyncMeta: snapshot.bankSyncMeta,
      }));

      const serverCount = Array.isArray(snapshot.bankTransactions) ? snapshot.bankTransactions.length : localCountRef.current;
      const localCount = localCountRef.current;
      let shouldApply =
        applyChanges &&
        Array.isArray(snapshot.bankTransactions) &&
        (snapshot.changed
          ? snapshot.version > sinceVersionRef.current || serverCount !== localCount
          : localCount === 0 && serverCount > 0);

      // Local import/save in flight: never overwrite with a smaller server snapshot.
      if (shouldApply && localCount > serverCount) {
        shouldApply = false;
      }

      if (shouldApply) {
        onRemoteUpdateRef.current(snapshot);
        const added = Math.max(0, serverCount - localCountRef.current);
        setState((prev) => ({
          ...prev,
          lastAppliedAt: new Date().toISOString(),
          lastMessage: added > 0 ? `${added}\uAC74 \uC790\uB3D9 \uBC18\uC601\uB428` : "\uC774\uBBF8 \uCD5C\uC2E0 \uC0C1\uD0DC",
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

  const runFolderSync = React.useCallback(async () => {
    if (!enabled) return null;
    setState((prev) => ({ ...prev, polling: true, lastMessage: "\uD3F4\uB354 \uB3D9\uAE30\uD654 \uC911..." }));
    try {
      const result = await runBankFolderSync();
      await pullSnapshot(true);
      const added = result.added ?? 0;
      setState((prev) => ({
        ...prev,
        polling: false,
        lastAppliedAt: new Date().toISOString(),
        lastMessage:
          added > 0
            ? `${added}\uAC74 \uCD94\uAC00 (${result.sourceFile || "IBK"})`
            : result.reason === "no_files"
              ? "\uC2E0\uADDC IBK \uC5D1\uC140 \uC5C6\uC74C"
              : result.reason === "IBK_BANK_IMPORT_DIR not configured"
                ? "\uC11C\uBC84\uC5D0 IBK \uD3F4\uB354\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4"
                : "\uBCC0\uACBD \uC5C6\uC74C",
      }));
      return result;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        polling: false,
        lastMessage: error instanceof Error ? error.message : "\uD3F4\uB354 \uB3D9\uAE30\uD654 \uC2E4\uD328",
      }));
      return null;
    }
  }, [enabled, pullSnapshot]);

  React.useEffect(() => {
    saveBankLiveSyncEnabled(liveSyncEnabled);
  }, [liveSyncEnabled]);

  React.useEffect(() => {
    if (!enabled || !liveSyncEnabled || !isActive) return;
    pullSnapshot(true);
    const timer = window.setInterval(() => {
      pullSnapshot(true);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, liveSyncEnabled, isActive, intervalMs, pullSnapshot]);

  return {
    liveSyncEnabled,
    setLiveSyncEnabled,
    state,
    pullSnapshot,
    runFolderSync,
  };
}
