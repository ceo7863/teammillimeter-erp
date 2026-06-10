export function parseErpChatStandaloneRoute() {
  if (typeof window === "undefined") return null;
  if (!/^\/chat\/?$/i.test(window.location.pathname)) return null;
  const params = new URLSearchParams(window.location.search);
  return {
    autoVoice: params.get("voice") !== "0",
  };
}

export const ERP_CHAT_STANDALONE_PATH = "/chat?voice=1";
