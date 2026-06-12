import { openTeamChatThread, TEAM_CHAT_OPEN_EVENT } from "@/utils/teamChatShare";

export function installServiceWorkerTeamChatBridge() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", (event) => {
    const type = event.data?.type;
    if (type === "erp-open-team-chat") {
      window.dispatchEvent(new CustomEvent(TEAM_CHAT_OPEN_EVENT));
      return;
    }
    if (type === "erp-open-team-chat-thread") {
      const channelId = String(event.data?.channelId || "").trim();
      if (channelId) void openTeamChatThread(channelId);
    }
  });
}
