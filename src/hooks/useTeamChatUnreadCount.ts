import { useCallback, useEffect, useState } from "react";
import type { ErpUser } from "@/utils/erpApi";
import { isApiModeEnabled } from "@/utils/erpApi";
import { fetchTeamChatUnreadCount } from "@/utils/teamChat";
import { canUserAccessPage } from "@/utils/pageAccess";
import { useTeamChatEvents } from "@/hooks/useTeamChatEvents";
import { TEAM_CHAT_SHARE_CHANNEL } from "@/utils/teamChatShare";

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

  useTeamChatEvents({
    enabled,
    onEvent: (event) => {
      if (
        event.type === "message.new" ||
        event.type === "channel.updated" ||
        event.type === "read.updated"
      ) {
        void refresh();
      }
    },
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(TEAM_CHAT_SHARE_CHANNEL);
      channel.onmessage = (event) => {
        if (event.data?.type === "unread-changed") void refresh();
      };
    } catch {
      // ignore
    }
    return () => channel?.close();
  }, [enabled, refresh]);

  return { count, refresh };
}
