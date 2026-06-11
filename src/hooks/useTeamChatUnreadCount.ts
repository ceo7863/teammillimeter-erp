import { useCallback, useEffect, useState } from "react";
import type { ErpUser } from "@/utils/erpApi";
import { isApiModeEnabled } from "@/utils/erpApi";
import { fetchTeamChatUnreadCount } from "@/utils/teamChat";
import { canUserAccessPage } from "@/utils/pageAccess";

export function useTeamChatUnreadCount(
  currentUser: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
  options?: { pollMs?: number; enabled?: boolean },
) {
  const [count, setCount] = useState(0);
  const pollMs = options?.pollMs ?? 10000;
  const pageEnabled =
    isApiModeEnabled() && Boolean(currentUser) && canUserAccessPage(currentUser, "teamChat");
  const enabled = pageEnabled && options?.enabled !== false;

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      setCount(await fetchTeamChatUnreadCount());
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

  return { count, refresh };
}
