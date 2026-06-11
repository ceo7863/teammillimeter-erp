export type TeamChatStandaloneRoute =
  | { mode: "list" }
  | { mode: "thread"; channelId: string };

export function parseTeamChatStandaloneRoute(): TeamChatStandaloneRoute | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (!/^\/messenger/i.test(path)) return null;

  if (/^\/messenger\/thread$/i.test(path)) {
    const channelId = new URLSearchParams(window.location.search).get("channel")?.trim() || "";
    if (channelId) return { mode: "thread", channelId };
    return { mode: "list" };
  }

  if (/^\/messenger$/i.test(path)) return { mode: "list" };
  return null;
}

export const TEAM_CHAT_STANDALONE_PATH = "/messenger";

export function buildTeamChatThreadPath(channelId: string) {
  const params = new URLSearchParams({ channel: channelId });
  return `/messenger/thread?${params.toString()}`;
}
