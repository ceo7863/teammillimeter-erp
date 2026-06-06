import { useCallback, useEffect, useState } from "react";
import type { ErpUser } from "@/utils/erpApi";
import { isApiModeEnabled } from "@/utils/erpApi";
import { listClientSiteRequests } from "@/utils/clientSiteRequests";
import { canUserAccessPage } from "@/utils/pageAccess";

export function useClientSiteRequestPendingCount(
  currentUser: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
  options?: { pollMs?: number },
) {
  const [count, setCount] = useState(0);
  const pollMs = options?.pollMs ?? 8000;
  const enabled =
    isApiModeEnabled() && Boolean(currentUser) && canUserAccessPage(currentUser, "clientSiteRequests");

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      const rows = await listClientSiteRequests({ status: "pending" });
      setCount(rows.length);
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
