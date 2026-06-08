import { memo, useSyncExternalStore } from "react";
import { getErpSyncStatus, subscribeErpSyncStatus } from "@/utils/erpSyncStatus";

export const ErpSyncStatusLine = memo(function ErpSyncStatusLine() {
  const status = useSyncExternalStore(subscribeErpSyncStatus, getErpSyncStatus, getErpSyncStatus);
  if (!status) return null;
  return <div className="erp-text-caption mt-2 text-emerald-400">{status}</div>;
});
