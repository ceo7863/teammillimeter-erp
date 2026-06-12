import { useRef } from "react";
import type { ErpUser } from "@/utils/erpApi";
import { isApiModeEnabled } from "@/utils/erpApi";
import { canUserAccessPage } from "@/utils/pageAccess";
import { useTeamChatEvents, type TeamChatStreamEvent } from "@/hooks/useTeamChatEvents";
import type { TeamChatMessage } from "@/utils/teamChat";
import { openTeamChatThread, promptTeamChatIncomingOpen } from "@/utils/teamChatShare";
import { isTeamChatPopupWindow } from "@/utils/teamChatPopup";
import { showErpNotification } from "@/utils/showErpNotification";

type TeamChatViewState = {
  inlineActive: boolean;
  selectedChannelId: string | null;
};

type Options = {
  enabled?: boolean;
  getViewState: () => TeamChatViewState;
};

/** Open the sender's thread popup when a new message arrives and the recipient is not viewing it. */
export function useTeamChatIncomingAutoOpen(
  currentUser: Pick<ErpUser, "id" | "role" | "allowedPages"> | null | undefined,
  options: Options,
) {
  const getViewStateRef = useRef(options.getViewState);
  getViewStateRef.current = options.getViewState;
  const selfId = Number(currentUser?.id) || 0;
  const pageEnabled =
    isApiModeEnabled() && Boolean(currentUser) && canUserAccessPage(currentUser, "teamChat");
  const enabled =
    pageEnabled && options.enabled !== false && selfId > 0 && !isTeamChatPopupWindow();

  useTeamChatEvents({
    enabled,
    onEvent: (event: TeamChatStreamEvent) => {
      if (event.type !== "message.new") return;
      const message = event.message as TeamChatMessage | undefined;
      if (!message?.id) return;
      if (Number(message.userId) === selfId) return;

      const channelId = String(event.channelId || message.channelId || "").trim();
      if (!channelId) return;

      const { inlineActive, selectedChannelId } = getViewStateRef.current();
      const viewingThisThread =
        inlineActive &&
        selectedChannelId === channelId &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible";

      if (viewingThisThread) return;

      const preview =
        String(message.body || "").trim() ||
        (message.attachments?.length ? "\uCCA8\uBD80\uD30C\uC77C" : "\uC0C8 \uBA54\uC2DC\uC9C0");
      const sender = String(message.userName || "").trim() || "\uC0AC\uB0B4 \uCC57";

      void openTeamChatThread(channelId).then(({ listOpened, threadOpened }) => {
        if (listOpened || threadOpened) return;

        if (!isTeamChatPopupWindow()) {
          promptTeamChatIncomingOpen({
            channelId,
            sender,
            preview: preview.slice(0, 120),
          });
        }

        void showErpNotification(sender, {
          body: preview.slice(0, 120),
          tag: `team-chat-${channelId}`,
          renotify: true,
          data: { action: "openTeamChatThread", channelId },
          onClick: () => {
            void openTeamChatThread(channelId);
          },
        });
      });
    },
  });
}
