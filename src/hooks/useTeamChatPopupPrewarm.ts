import { useEffect } from "react";
import type { ErpUser } from "@/utils/erpApi";
import { isApiModeEnabled } from "@/utils/erpApi";
import { canUserAccessPage } from "@/utils/pageAccess";
import { openTeamChatThread, peekPendingTeamChatThread } from "@/utils/teamChatShare";
import {
  getOpenTeamChatListPopup,
  isTeamChatDesktopPopupMode,
  isTeamChatPopupWindow,
  openTeamChatPopup,
} from "@/utils/teamChatPopup";

/** Register a reusable popup slot on first gesture; open pending threads on later clicks. */
export function useTeamChatPopupPrewarm(
  currentUser: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !isApiModeEnabled() || !currentUser) return;
    if (!canUserAccessPage(currentUser, "teamChat")) return;
    if (!isTeamChatDesktopPopupMode() || isTeamChatPopupWindow()) return;

    let slotRegistered = false;

    const warm = () => {
      const pendingId = peekPendingTeamChatThread();
      if (pendingId) {
        void openTeamChatThread(pendingId);
        return;
      }

      if (getOpenTeamChatListPopup()) return;

      if (!slotRegistered) {
        slotRegistered = true;
        openTeamChatPopup({ focus: false, raise: false });
      }
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
