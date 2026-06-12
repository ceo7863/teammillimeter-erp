import type { TeamChatLink } from "@/utils/teamChatLinks";
import {
  isTeamChatDesktopPopupMode,
  isTeamChatPopupActuallyOpen,
  isTeamChatPopupWindow,
  isTeamChatThreadPopupWindow,
  openTeamChatPopup,
  openTeamChatThreadPopup,
  raiseTeamChatPopup,
} from "@/utils/teamChatPopup";

export type TeamChatSharePayload = {
  link: TeamChatLink;
  body?: string;
  channelId?: string;
};

const PENDING_TEAM_CHAT_SHARE_KEY = "teammillimeter-erp-pending-team-chat-share";
const PENDING_TEAM_CHAT_THREAD_KEY = "teammillimeter-erp-pending-team-chat-thread";
export const TEAM_CHAT_OPEN_EVENT = "erp-open-team-chat";
export const TEAM_CHAT_RESET_LIST_EVENT = "erp-team-chat-reset-list";
export const TEAM_CHAT_OPEN_THREAD_EVENT = "erp-open-team-chat-thread";
export const TEAM_CHAT_SHARE_CHANNEL = "erp-team-chat-share";
export const TEAM_CHAT_INCOMING_PROMPT_EVENT = "erp-team-chat-incoming-prompt";

export type TeamChatIncomingPromptDetail = {
  channelId: string;
  sender: string;
  preview: string;
};

export function broadcastTeamChatIncoming(payload: {
  channelId: string;
  openThread?: boolean;
  inline?: boolean;
}) {
  if (typeof window === "undefined") return;
  try {
    new BroadcastChannel(TEAM_CHAT_SHARE_CHANNEL).postMessage({
      type: "incoming",
      channelId: payload.channelId,
      openThread: payload.openThread !== false,
      inline: payload.inline === true,
    });
  } catch {
    // ignore
  }
}

export function stashPendingTeamChatThread(channelId: string, options?: { inline?: boolean }) {
  const id = String(channelId || "").trim();
  if (!id || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_TEAM_CHAT_THREAD_KEY, id);
  } catch {
    // ignore
  }
  broadcastTeamChatIncoming({
    channelId: id,
    openThread: options?.inline ? false : true,
    inline: options?.inline === true,
  });
}

export function peekPendingTeamChatThread(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = window.sessionStorage.getItem(PENDING_TEAM_CHAT_THREAD_KEY);
    return id ? String(id).trim() || null : null;
  } catch {
    return null;
  }
}

export function consumePendingTeamChatThread(): string | null {
  const id = peekPendingTeamChatThread();
  if (!id || typeof window === "undefined") return null;
  try {
    window.sessionStorage.removeItem(PENDING_TEAM_CHAT_THREAD_KEY);
  } catch {
    // ignore
  }
  return id;
}

export function stashTeamChatShare(payload: TeamChatSharePayload) {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(payload);
    window.localStorage.setItem(PENDING_TEAM_CHAT_SHARE_KEY, raw);
    window.sessionStorage.setItem(PENDING_TEAM_CHAT_SHARE_KEY, raw);
  } catch {
    // ignore
  }
  try {
    new BroadcastChannel(TEAM_CHAT_SHARE_CHANNEL).postMessage({ type: "share" });
  } catch {
    // ignore
  }
}

export function peekTeamChatShare(): TeamChatSharePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.sessionStorage.getItem(PENDING_TEAM_CHAT_SHARE_KEY) ||
      window.localStorage.getItem(PENDING_TEAM_CHAT_SHARE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TeamChatSharePayload;
  } catch {
    return null;
  }
}

export function consumeTeamChatShare(): TeamChatSharePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.sessionStorage.getItem(PENDING_TEAM_CHAT_SHARE_KEY) ||
      window.localStorage.getItem(PENDING_TEAM_CHAT_SHARE_KEY);
    window.sessionStorage.removeItem(PENDING_TEAM_CHAT_SHARE_KEY);
    window.localStorage.removeItem(PENDING_TEAM_CHAT_SHARE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TeamChatSharePayload;
  } catch {
    return null;
  }
}

export function openTeamChatWithShare(payload: TeamChatSharePayload, options?: { popup?: boolean }) {
  stashTeamChatShare(payload);
  if (typeof window === "undefined") return;
  const usePopup = options?.popup ?? isTeamChatDesktopPopupMode();
  if (usePopup) {
    const popup = openTeamChatPopup();
    if (popup && !popup.closed) {
      try {
        popup.focus();
      } catch {
        // ignore
      }
    }
    return;
  }
  window.dispatchEvent(new CustomEvent(TEAM_CHAT_OPEN_EVENT));
}

export function resetTeamChatListView() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TEAM_CHAT_RESET_LIST_EVENT));
  try {
    new BroadcastChannel(TEAM_CHAT_SHARE_CHANNEL).postMessage({ type: "reset-list" });
  } catch {
    // ignore
  }
}

export function openTeamChatList() {
  if (typeof window === "undefined") return;
  // Stale share payloads were opening a thread instead of the channel list.
  consumeTeamChatShare();
  resetTeamChatListView();
  if (isTeamChatDesktopPopupMode()) {
    openTeamChatPopup();
    return;
  }
  window.dispatchEvent(new CustomEvent(TEAM_CHAT_OPEN_EVENT));
}

export type TeamChatThreadOpenResult = { listOpened: boolean; threadOpened: boolean };

export function openTeamChatThread(channelId: string): Promise<TeamChatThreadOpenResult> {
  const id = String(channelId || "").trim();
  const failed: TeamChatThreadOpenResult = { listOpened: false, threadOpened: false };
  if (!id || typeof window === "undefined") return Promise.resolve(failed);

  if (isTeamChatDesktopPopupMode()) {
    stashPendingTeamChatThread(id, { inline: true });

    if (isTeamChatPopupWindow() && !isTeamChatThreadPopupWindow()) {
      raiseTeamChatPopup(window);
      return Promise.resolve({ listOpened: true, threadOpened: true });
    }

    const listPopup = openTeamChatPopup({ focus: false, raise: true });
    if (isTeamChatPopupActuallyOpen(listPopup)) {
      return Promise.resolve({ listOpened: true, threadOpened: true });
    }

    const threadPopup = openTeamChatThreadPopup(id, { raise: true });
    if (isTeamChatPopupActuallyOpen(threadPopup)) {
      return Promise.resolve({ listOpened: false, threadOpened: true });
    }

    return Promise.resolve(failed);
  }

  stashPendingTeamChatThread(id);
  window.dispatchEvent(new CustomEvent(TEAM_CHAT_OPEN_EVENT));
  window.dispatchEvent(new CustomEvent(TEAM_CHAT_OPEN_THREAD_EVENT, { detail: { channelId: id } }));
  return Promise.resolve({ listOpened: true, threadOpened: true });
}

export function promptTeamChatIncomingOpen(detail: TeamChatIncomingPromptDetail) {
  if (typeof window === "undefined" || isTeamChatPopupWindow()) return;
  window.dispatchEvent(new CustomEvent(TEAM_CHAT_INCOMING_PROMPT_EVENT, { detail }));
}
