export function parseTeamChatStandaloneRoute() {
  if (typeof window === "undefined") return null;
  if (!/^\/messenger\/?$/i.test(window.location.pathname)) return null;
  return {};
}

export const TEAM_CHAT_STANDALONE_PATH = "/messenger";
