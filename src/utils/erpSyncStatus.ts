type SyncStatusListener = () => void;

let syncStatus = "";
const listeners = new Set<SyncStatusListener>();

function emitSyncStatus() {
  for (const listener of listeners) {
    listener();
  }
}

export function getErpSyncStatus() {
  return syncStatus;
}

export function subscribeErpSyncStatus(listener: SyncStatusListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setErpSyncStatus(next: string) {
  if (syncStatus === next) return;
  syncStatus = next;
  emitSyncStatus();
}

export function clearErpSyncStatus() {
  setErpSyncStatus("");
}
