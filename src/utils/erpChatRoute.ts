export function parseErpChatStandaloneRoute() {
  if (typeof window === "undefined") return null;
  if (!/^\/chat\/?$/i.test(window.location.pathname)) return null;
  return {};
}

export const ERP_CHAT_STANDALONE_PATH = "/chat";
