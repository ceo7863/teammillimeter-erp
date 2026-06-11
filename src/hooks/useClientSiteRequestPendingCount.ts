import { useCallback, useEffect, useState } from "react";
import type { ErpUser } from "@/utils/erpApi";
import { isApiModeEnabled } from "@/utils/erpApi";
import { listClientSiteRequests, countsAsClientSiteRequestInbox } from "@/utils/clientSiteRequests";
import { canUserAccessPage } from "@/utils/pageAccess";

export function useClientSiteRequestPendingCount(
  currentUser: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
  options?: { pollMs?: number; enabled?: boolean },
) {
  const [count, setCount] = useState(0);
  const pollMs = options?.pollMs ?? 8000;
  const pageEnabled =
    isApiModeEnabled() && Boolean(currentUser) && canUserAccessPage(currentUser, "clientSiteRequests");
  const enabled = pageEnabled && options?.enabled !== false;

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      const rows = await listClientSiteRequests({ status: "all" });
      setCount(rows.filter((row) => countsAsClientSiteRequestInbox(row)).length);
    } catch {
      // ignore polling errors
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
    if (!enabled) return;
    const timer = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(timer);
  }, [enabled, pollMs, refresh]);

  return count;
}
