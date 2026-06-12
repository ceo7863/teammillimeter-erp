import React, { useCallback, useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import {
  openTeamChatThread,
  clearPendingTeamChatThread,
  TEAM_CHAT_INCOMING_PROMPT_EVENT,
  type TeamChatIncomingPromptDetail,
} from "@/utils/teamChatShare";
import { isTeamChatPopupWindow } from "@/utils/teamChatPopup";

const L = {
  label: "\uC0C8 \uBA54\uC2DC\uC9C0",
  open: "\uC5F4\uAE30",
  dismiss: "\uB2EB\uAE30",
};

export function TeamChatIncomingBanner() {
  const [prompt, setPrompt] = useState<TeamChatIncomingPromptDetail | null>(null);

  const dismiss = useCallback(() => {
    setPrompt(null);
    clearPendingTeamChatThread();
  }, []);

  useEffect(() => {
    if (isTeamChatPopupWindow()) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TeamChatIncomingPromptDetail>).detail;
      if (!detail?.channelId) return;
      clearPendingTeamChatThread();
      setPrompt(detail);
    };
    window.addEventListener(TEAM_CHAT_INCOMING_PROMPT_EVENT, handler as EventListener);
    return () => window.removeEventListener(TEAM_CHAT_INCOMING_PROMPT_EVENT, handler as EventListener);
  }, []);

  const handleOpen = useCallback(() => {
    if (!prompt?.channelId) return;
    void openTeamChatThread(prompt.channelId);
    setPrompt(null);
  }, [prompt?.channelId]);

  if (!prompt) return null;

  const title = String(prompt.sender || "").trim() || "\uC0AC\uB0B4 \uCC57";
  const preview = String(prompt.preview || "").trim() || "\uC0C8 \uBA54\uC2DC\uC9C0";

  return (
    <div className="erp-team-chat-incoming-banner" role="alert" aria-live="assertive">
      <div className="erp-team-chat-incoming-banner__accent" aria-hidden="true" />
      <div className="erp-team-chat-incoming-banner__main">
        <div className="erp-team-chat-incoming-banner__head">
          <span className="erp-team-chat-incoming-banner__icon" aria-hidden="true">
            <MessageCircle size={20} />
          </span>
          <span className="erp-team-chat-incoming-banner__label">{L.label}</span>
          <button
            type="button"
            className="erp-team-chat-incoming-banner__close"
            onClick={dismiss}
            aria-label={L.dismiss}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="erp-team-chat-incoming-banner__content">
          <div className="erp-team-chat-incoming-banner__title">{title}</div>
          <div className="erp-team-chat-incoming-banner__preview">{preview}</div>
        </div>
        <button type="button" className="erp-team-chat-incoming-banner__open" onClick={handleOpen}>
          {L.open}
        </button>
      </div>
    </div>
  );
}
