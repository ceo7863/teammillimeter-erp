import type { TeamChatLink } from "@/utils/teamChatLinks";

export type TeamChatSharePayload = {
  link: TeamChatLink;
  body?: string;
  channelId?: string;
};

const PENDING_TEAM_CHAT_SHARE_KEY = "teammillimeter-erp-pending-team-chat-share";
export const TEAM_CHAT_OPEN_EVENT = "erp-open-team-chat";

export function stashTeamChatShare(payload: TeamChatSharePayload) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_TEAM_CHAT_SHARE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function consumeTeamChatShare(): TeamChatSharePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_TEAM_CHAT_SHARE_KEY);
    window.sessionStorage.removeItem(PENDING_TEAM_CHAT_SHARE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TeamChatSharePayload;
  } catch {
    return null;
  }
}

export function openTeamChatWithShare(payload: TeamChatSharePayload) {
  stashTeamChatShare(payload);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(TEAM_CHAT_OPEN_EVENT));
  }
}
