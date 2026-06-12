import React, { useCallback, useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import {
  openTeamChatThread,
  TEAM_CHAT_INCOMING_PROMPT_EVENT,
  TEAM_CHAT_INCOMING_DIALOG_EVENT,
  type TeamChatIncomingPromptDetail,
} from "@/utils/teamChatShare";
import { isTeamChatPopupWindow } from "@/utils/teamChatPopup";

const L = {
  open: "\uC5F4\uAE30",
  dismiss: "\uB2EB\uAE30",
};

export function TeamChatIncomingBanner() {
  const [prompt, setPrompt] = useState<TeamChatIncomingPromptDetail | null>(null);

  useEffect(() => {
    if (isTeamChatPopupWindow()) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TeamChatIncomingPromptDetail>).detail;
      if (!detail?.channelId) return;
      setPrompt(detail);
    };
    window.addEventListener(TEAM_CHAT_INCOMING_PROMPT_EVENT, handler as EventListener);
    window.addEventListener(TEAM_CHAT_INCOMING_DIALOG_EVENT, dismiss as EventListener);
    return () => {
      window.removeEventListener(TEAM_CHAT_INCOMING_PROMPT_EVENT, handler as EventListener);
      window.removeEventListener(TEAM_CHAT_INCOMING_DIALOG_EVENT, dismiss as EventListener);
    };
  }, []);

  const dismiss = useCallback(() => setPrompt(null), []);

  const handleOpen = useCallback(() => {
    if (!prompt?.channelId) return;
    void openTeamChatThread(prompt.channelId);
    setPrompt(null);
  }, [prompt?.channelId]);

  if (!prompt) return null;

  const title = String(prompt.sender || "").trim() || "\uC0AC\uB0B4 \uCC57";
  const preview = String(prompt.preview || "").trim() || "\uC0C8 \uBA54\uC2DC\uC9C0";

  return (
    <div className="erp-team-chat-incoming-banner" role="status" aria-live="polite">
      <span className="erp-team-chat-incoming-banner__icon" aria-hidden="true">
        <MessageCircle size={18} />
      </span>
      <div className="erp-team-chat-incoming-banner__body">
        <div className="erp-team-chat-incoming-banner__title">{title}</div>
        <div className="erp-team-chat-incoming-banner__preview">{preview}</div>
      </div>
      <button type="button" className="erp-team-chat-incoming-banner__open" onClick={handleOpen}>
        {L.open}
      </button>
      <button
        type="button"
        className="erp-team-chat-incoming-banner__close"
        onClick={dismiss}
        aria-label={L.dismiss}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
