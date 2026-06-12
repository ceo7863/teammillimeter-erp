import { useEffect } from "react";
import type { ErpUser } from "@/utils/erpApi";
import { isApiModeEnabled } from "@/utils/erpApi";
import { canUserAccessPage } from "@/utils/pageAccess";
import { isTeamChatDesktopPopupMode, isTeamChatPopupWindow, openTeamChatPopup } from "@/utils/teamChatPopup";

/** Open the named list popup once on first user gesture so later SSE auto-opens can reuse it. */
export function useTeamChatPopupPrewarm(
  currentUser: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !isApiModeEnabled() || !currentUser) return;
    if (!canUserAccessPage(currentUser, "teamChat")) return;
    if (!isTeamChatDesktopPopupMode() || isTeamChatPopupWindow()) return;

    const warm = () => {
      openTeamChatPopup({ focus: false });
    };

    window.addEventListener("pointerdown", warm, { capture: true, once: true });
    return () => window.removeEventListener("pointerdown", warm, { capture: true });
  }, [currentUser, enabled]);
}
