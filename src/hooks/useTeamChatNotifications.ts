import { useEffect, useRef } from "react";
import type { ErpUser } from "@/utils/erpApi";
import { isApiModeEnabled } from "@/utils/erpApi";
import { canUserAccessPage } from "@/utils/pageAccess";
import { showErpNotification } from "@/utils/showErpNotification";

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

export function useTeamChatNotifications(
  currentUser: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
  options: Options,
) {
  const prevCountRef = useRef(0);
  const pageEnabled =
    isApiModeEnabled() && Boolean(currentUser) && canUserAccessPage(currentUser, "teamChat");
  const enabled = pageEnabled && options.enabled !== false && !options.isChatPageActive;

  useEffect(() => {
    if (!pageEnabled || !canUseNotifications()) return;
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
  }, [pageEnabled]);

  useEffect(() => {
    if (!enabled || !canUseNotifications()) {
      prevCountRef.current = options.unreadCount;
      return;
    }
    if (Notification.permission !== "granted") {
      prevCountRef.current = options.unreadCount;
      return;
    }

    const prev = prevCountRef.current;
    const next = options.unreadCount;
    prevCountRef.current = next;

    if (next <= prev || next <= 0) return;
    if (typeof document !== "undefined" && document.visibilityState === "visible" && options.isChatPageActive) {
      return;
    }

    const delta = next - prev;
    const body =
      delta > 0 && prev > 0
        ? `\uC0C8 \uBA54\uC2DC\uC9C0 ${delta}\uAC1C (\uC804\uCCB4 ${next}\uAC1C)`
        : `\uBBF8\uC751\uC740 \uBA54\uC2DC\uC9C0 ${next}\uAC1C`;

    void showErpNotification("\uC0AC\uB0B4 \uCC57", {
      body,
      tag: "erp-team-chat-unread",
      renotify: true,
      data: { action: "openTeamChat" },
      onClick: () => options.onOpenChat?.(),
    });
  }, [enabled, options.isChatPageActive, options.onOpenChat, options.unreadCount]);
}
