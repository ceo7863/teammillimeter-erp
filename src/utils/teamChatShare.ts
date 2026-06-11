import type { TeamChatLink } from "@/utils/teamChatLinks";
import { openTeamChatPopup } from "@/utils/teamChatPopup";

export type TeamChatSharePayload = {
  link: TeamChatLink;
  body?: string;
  channelId?: string;
};

const PENDING_TEAM_CHAT_SHARE_KEY = "teammillimeter-erp-pending-team-chat-share";
export const TEAM_CHAT_OPEN_EVENT = "erp-open-team-chat";
export const TEAM_CHAT_SHARE_CHANNEL = "erp-team-chat-share";

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
  if (options?.popup !== false) {
    openTeamChatPopup();
    return;
  }
  window.dispatchEvent(new CustomEvent(TEAM_CHAT_OPEN_EVENT));
}
