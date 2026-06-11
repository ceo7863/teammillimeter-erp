import { useEffect } from "react";
import type { ErpUser } from "@/utils/erpApi";
import { isApiModeEnabled } from "@/utils/erpApi";
import { canUserAccessPage } from "@/utils/pageAccess";
import { subscribeTeamChatPush } from "@/utils/teamChatPush";

export function useTeamChatPush(
  currentUser: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
  options?: { enabled?: boolean },
) {
  const pageEnabled =
    isApiModeEnabled() && Boolean(currentUser) && canUserAccessPage(currentUser, "teamChat");
  const enabled = pageEnabled && options?.enabled !== false;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (!("PushManager" in window) || !("serviceWorker" in navigator)) return;
    void subscribeTeamChatPush().catch(() => {});
  }, [enabled]);
}
