import { TEAM_CHAT_STANDALONE_PATH } from "@/utils/teamChatRoute";

const POPUP_NAME = "teammillimeter-team-chat";
const POPUP_FEATURES = "width=960,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no";

export function isTeamChatPopupWindow() {
  if (typeof window === "undefined") return false;
  return /^\/messenger\/?$/i.test(window.location.pathname);
}

export function openTeamChatPopup() {
  if (typeof window === "undefined") return null;
  if (isTeamChatPopupWindow()) {
    window.focus();
    return window;
  }
  const url = `${window.location.origin}${TEAM_CHAT_STANDALONE_PATH}`;
  const popup = window.open(url, POPUP_NAME, POPUP_FEATURES);
  popup?.focus();
  return popup;
}

export function focusMainErpWindow() {
  if (typeof window === "undefined") return;
  const main = window.open("/", "teammillimeter-erp-main");
  main?.focus();
}
