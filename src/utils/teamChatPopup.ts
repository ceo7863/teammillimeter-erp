import { buildTeamChatThreadPath, TEAM_CHAT_STANDALONE_PATH } from "@/utils/teamChatRoute";

const LIST_POPUP_NAME = "teammillimeter-team-chat";
const LIST_POPUP_FEATURES =
  "width=380,height=760,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no";
const THREAD_POPUP_FEATURES =
  "width=420,height=760,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no";

export function isTeamChatPopupWindow() {
  if (typeof window === "undefined") return false;
  return /^\/messenger(\/thread)?\/?$/i.test(window.location.pathname.replace(/\/+$/, "") || "/");
}

export function isTeamChatThreadPopupWindow() {
  if (typeof window === "undefined") return false;
  return /^\/messenger\/thread$/i.test(window.location.pathname.replace(/\/+$/, "") || "/");
}

export function isTeamChatDesktopPopupMode() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(max-width: 1023px)").matches) return false;
  return window.matchMedia("(pointer: fine)").matches;
}

export function isTeamChatEmbeddedInlineMode() {
  return !isTeamChatDesktopPopupMode();
}

export function canOpenTeamChatThreadPopup() {
  return isTeamChatDesktopPopupMode();
}

export function openTeamChatPopup() {
  if (typeof window === "undefined") return null;
  if (isTeamChatPopupWindow() && !isTeamChatThreadPopupWindow()) {
    window.focus();
    return window;
  }
  const url = `${window.location.origin}${TEAM_CHAT_STANDALONE_PATH}`;
  const popup = window.open(url, LIST_POPUP_NAME, LIST_POPUP_FEATURES);
  popup?.focus();
  return popup;
}

export function openTeamChatThreadPopup(channelId: string) {
  if (typeof window === "undefined") return null;
  const id = String(channelId || "").trim();
  if (!id) return null;

  const url = `${window.location.origin}${buildTeamChatThreadPath(id)}`;
  const windowName = `teammillimeter-team-chat-${id}`;
  const popup = window.open(url, windowName, THREAD_POPUP_FEATURES);
  popup?.focus();
  return popup;
}

export function focusMainErpWindow() {
  if (typeof window === "undefined") return;
  const main = window.open("/", "teammillimeter-erp-main");
  main?.focus();
}
