import { TEAM_CHAT_OPEN_EVENT } from "@/utils/teamChatShare";

export function installServiceWorkerTeamChatBridge() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "erp-open-team-chat") return;
    window.dispatchEvent(new CustomEvent(TEAM_CHAT_OPEN_EVENT));
  });
}
