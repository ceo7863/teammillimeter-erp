import { useEffect } from "react";
import type { ErpUser } from "@/utils/erpApi";
import { isApiModeEnabled } from "@/utils/erpApi";
import { canUserAccessPage } from "@/utils/pageAccess";
import { openTeamChatThread, peekPendingTeamChatThread } from "@/utils/teamChatShare";
import { isTeamChatDesktopPopupMode, isTeamChatPopupWindow } from "@/utils/teamChatPopup";

/** Open a pending incoming thread on user gesture when auto popup was blocked. */
export function useTeamChatPopupPrewarm(
  currentUser: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !isApiModeEnabled() || !currentUser) return;
    if (!canUserAccessPage(currentUser, "teamChat")) return;
    if (!isTeamChatDesktopPopupMode() || isTeamChatPopupWindow()) return;

    const warm = () => {
      const pendingId = peekPendingTeamChatThread();
      if (!pendingId) return;
      void openTeamChatThread(pendingId);
    };

    const opts: AddEventListenerOptions = { capture: true };
    window.addEventListener("pointerdown", warm, opts);
    window.addEventListener("keydown", warm, opts);
    return () => {
      window.removeEventListener("pointerdown", warm, opts);
      window.removeEventListener("keydown", warm, opts);
    };
  }, [currentUser, enabled]);
}
