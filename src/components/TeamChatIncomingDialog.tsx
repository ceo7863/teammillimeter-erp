import React, { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { TeamChatPage } from "@/components/TeamChatPage";
import type { ErpUser } from "@/utils/erpApi";
import type { ErpChatAction } from "@/utils/erpChatApi";
import {
  TEAM_CHAT_INCOMING_DIALOG_EVENT,
  clearPendingTeamChatThread,
  stashPendingTeamChatThread,
} from "@/utils/teamChatShare";
import { isTeamChatPopupWindow, openTeamChatPopup } from "@/utils/teamChatPopup";

const L = {
  title: "\uC0AC\uB0B4 \uCC57",
  close: "\uB2EB\uAE30",
  detach: "\uBCC4\uB3C4 \uCC3D",
};

type Props = {
  currentUser: ErpUser | null;
  onUnreadChange?: () => void;
  onErpAction?: (action: ErpChatAction) => void;
};

export function TeamChatIncomingDialog({ currentUser, onUnreadChange, onErpAction }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [channelId, setChannelId] = useState<string | null>(null);

  const closeDialog = useCallback(() => {
    setChannelId(null);
    clearPendingTeamChatThread();
    dialogRef.current?.close();
  }, []);

  useEffect(() => {
    if (isTeamChatPopupWindow()) return;
    const handler = (event: Event) => {
      const id = String((event as CustomEvent<{ channelId?: string }>).detail?.channelId || "").trim();
      if (!id) return;
      stashPendingTeamChatThread(id, { inline: true });
      setChannelId(id);
    };
    window.addEventListener(TEAM_CHAT_INCOMING_DIALOG_EVENT, handler as EventListener);
    return () => window.removeEventListener(TEAM_CHAT_INCOMING_DIALOG_EVENT, handler as EventListener);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (channelId) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (dialog.open) dialog.close();
  }, [channelId]);

  const openDetachedPopup = useCallback(() => {
    if (!channelId) return;
    stashPendingTeamChatThread(channelId, { inline: true });
    openTeamChatPopup({ raise: true });
    closeDialog();
  }, [channelId, closeDialog]);

  if (!currentUser) return null;

  return (
    <dialog
      ref={dialogRef}
      className="erp-team-chat-incoming-dialog"
      aria-labelledby="erp-team-chat-incoming-dialog-title"
      onClose={() => setChannelId(null)}
    >
      <div className="erp-team-chat-incoming-dialog__shell">
        <div className="erp-team-chat-incoming-dialog__head">
          <div id="erp-team-chat-incoming-dialog-title" className="erp-team-chat-incoming-dialog__title">
            {L.title}
          </div>
          <div className="erp-team-chat-incoming-dialog__actions">
            <button type="button" className="erp-team-chat-incoming-dialog__detach" onClick={openDetachedPopup}>
              <ExternalLink size={14} aria-hidden="true" />
              {L.detach}
            </button>
            <button
              type="button"
              className="erp-team-chat-incoming-dialog__close"
              onClick={closeDialog}
              aria-label={L.close}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="erp-team-chat-incoming-dialog__body">
          {channelId ? (
            <TeamChatPage
              key={channelId}
              currentUser={currentUser}
              isPageActive
              standalone
              listOnly
              onUnreadChange={onUnreadChange}
              onErpAction={onErpAction}
            />
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
