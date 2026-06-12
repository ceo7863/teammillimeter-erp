import { useEffect } from "react";
import type { ErpUser } from "@/utils/erpApi";
import { isApiModeEnabled } from "@/utils/erpApi";
import { canUserAccessPage } from "@/utils/pageAccess";

type Options = {
  unreadCount: number;
  enabled?: boolean;
  isChatPageActive?: boolean;
  onOpenChat?: () => void;
};

const PERMISSION_KEY = "erp-team-chat-notify-permission-requested";

function canUseNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Request notification permission once; message alerts use SSE (banner / push) instead of unread polling. */
export function useTeamChatNotifications(
  currentUser: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
  options: Options,
) {
  const pageEnabled =
    isApiModeEnabled() && Boolean(currentUser) && canUserAccessPage(currentUser, "teamChat");
  const enabled = pageEnabled && options.enabled !== false;

  useEffect(() => {
    if (!enabled || !canUseNotifications()) return;
    if (Notification.permission !== "default") return;
    try {
      if (window.localStorage.getItem(PERMISSION_KEY) === "1") return;
      window.localStorage.setItem(PERMISSION_KEY, "1");
    } catch {
      // ignore
    }
    void Notification.requestPermission()
      .then((permission) => {
        if (permission === "granted") {
          void import("@/utils/teamChatPush").then(({ subscribeTeamChatPush }) => subscribeTeamChatPush()).catch(() => {});
        }
      })
      .catch(() => {});
  }, [enabled]);
}
