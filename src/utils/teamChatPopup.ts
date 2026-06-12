import { buildTeamChatThreadPath, TEAM_CHAT_STANDALONE_PATH } from "@/utils/teamChatRoute";

const LIST_POPUP_NAME = "teammillimeter-team-chat";
const LIST_POPUP_POSITION_KEY = "teammillimeter-erp-team-chat-list-popup-bounds";
const THREAD_POPUP_POSITION_KEY = "teammillimeter-erp-team-chat-thread-popup-bounds";
const POPUP_CHROME = "menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no";

type PopupBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const LIST_POPUP_DEFAULT_SIZE = { width: 380, height: 760 };
const THREAD_POPUP_DEFAULT_SIZE = { width: 420, height: 760 };

let listPopupTracker: number | null = null;

function clampPopupBounds(bounds: PopupBounds, defaults = LIST_POPUP_DEFAULT_SIZE): PopupBounds {
  if (typeof window === "undefined") return { ...defaults, left: 0, top: 0 };
  const width = Math.max(320, Math.min(bounds.width || defaults.width, window.screen.availWidth));
  const height = Math.max(480, Math.min(bounds.height || defaults.height, window.screen.availHeight));
  const minLeft = window.screen.availLeft;
  const minTop = window.screen.availTop;
  const maxLeft = Math.max(minLeft, window.screen.availLeft + window.screen.availWidth - width);
  const maxTop = Math.max(minTop, window.screen.availTop + window.screen.availHeight - height);
  return {
    width,
    height,
    left: Math.min(Math.max(minLeft, bounds.left), maxLeft),
    top: Math.min(Math.max(minTop, bounds.top), maxTop),
  };
}

function defaultListPopupBounds(): PopupBounds {
  if (typeof window === "undefined") {
    return { ...LIST_POPUP_DEFAULT_SIZE, left: 0, top: 0 };
  }
  return clampPopupBounds({
    left: window.screenX + Math.max(0, window.outerWidth - LIST_POPUP_DEFAULT_SIZE.width - 24),
    top: window.screenY + Math.max(0, window.outerHeight - LIST_POPUP_DEFAULT_SIZE.height - 24),
    ...LIST_POPUP_DEFAULT_SIZE,
  });
}

function defaultThreadPopupBounds(): PopupBounds {
  const list = loadListPopupBounds();
  return clampPopupBounds(
    {
      left: list.left + 28,
      top: list.top + 28,
      ...THREAD_POPUP_DEFAULT_SIZE,
    },
    THREAD_POPUP_DEFAULT_SIZE,
  );
}

function loadPopupBounds(storageKey: string, fallback: () => PopupBounds, defaults = LIST_POPUP_DEFAULT_SIZE): PopupBounds {
  if (typeof window === "undefined") return fallback();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback();
    const parsed = JSON.parse(raw) as Partial<PopupBounds>;
    if (
      typeof parsed.left !== "number" ||
      typeof parsed.top !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return fallback();
    }
    return clampPopupBounds(parsed as PopupBounds, defaults);
  } catch {
    return fallback();
  }
}

function savePopupBounds(storageKey: string, bounds: PopupBounds, defaults = LIST_POPUP_DEFAULT_SIZE) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(clampPopupBounds(bounds, defaults)));
}

function loadListPopupBounds() {
  return loadPopupBounds(LIST_POPUP_POSITION_KEY, defaultListPopupBounds, LIST_POPUP_DEFAULT_SIZE);
}

function loadThreadPopupBounds() {
  return loadPopupBounds(THREAD_POPUP_POSITION_KEY, defaultThreadPopupBounds, THREAD_POPUP_DEFAULT_SIZE);
}

function buildPopupFeatures(bounds: PopupBounds) {
  const next = clampPopupBounds(bounds);
  return [
    `left=${Math.round(next.left)}`,
    `top=${Math.round(next.top)}`,
    `width=${Math.round(next.width)}`,
    `height=${Math.round(next.height)}`,
    POPUP_CHROME,
  ].join(",");
}

function readPopupBounds(popup: Window, defaults = LIST_POPUP_DEFAULT_SIZE): PopupBounds | null {
  try {
    return clampPopupBounds(
      {
        left: popup.screenX,
        top: popup.screenY,
        width: popup.outerWidth,
        height: popup.outerHeight,
      },
      defaults,
    );
  } catch {
    return null;
  }
}

function trackListPopupBounds(popup: Window) {
  if (listPopupTracker !== null) window.clearInterval(listPopupTracker);
  listPopupTracker = window.setInterval(() => {
    if (popup.closed) {
      if (listPopupTracker !== null) window.clearInterval(listPopupTracker);
      listPopupTracker = null;
      return;
    }
    const bounds = readPopupBounds(popup, LIST_POPUP_DEFAULT_SIZE);
    if (bounds) savePopupBounds(LIST_POPUP_POSITION_KEY, bounds, LIST_POPUP_DEFAULT_SIZE);
  }, 800);
}

export function captureTeamChatListPopupBounds() {
  if (typeof window === "undefined") return;
  savePopupBounds(
    LIST_POPUP_POSITION_KEY,
    {
      left: window.screenX,
      top: window.screenY,
      width: window.outerWidth,
      height: window.outerHeight,
    },
    LIST_POPUP_DEFAULT_SIZE,
  );
}

export function captureTeamChatThreadPopupBounds() {
  if (typeof window === "undefined") return;
  savePopupBounds(
    THREAD_POPUP_POSITION_KEY,
    {
      left: window.screenX,
      top: window.screenY,
      width: window.outerWidth,
      height: window.outerHeight,
    },
    THREAD_POPUP_DEFAULT_SIZE,
  );
}

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
  return window.matchMedia("(min-width: 1024px)").matches;
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
  const popup = window.open(url, LIST_POPUP_NAME, buildPopupFeatures(loadListPopupBounds()));
  if (popup) {
    try {
      const path = popup.location.pathname.replace(/\/+$/, "") || "/";
      if (!/^\/messenger$/i.test(path)) {
        popup.location.replace(url);
      }
    } catch {
      try {
        popup.location.replace(url);
      } catch {
        // ignore
      }
    }
    popup.focus();
    trackListPopupBounds(popup);
  }
  return popup;
}

export function openTeamChatThreadPopup(channelId: string) {
  if (typeof window === "undefined") return null;
  const id = String(channelId || "").trim();
  if (!id) return null;

  const url = `${window.location.origin}${buildTeamChatThreadPath(id)}`;
  const windowName = `teammillimeter-team-chat-${id}`;
  const popup = window.open(url, windowName, buildPopupFeatures(loadThreadPopupBounds()));
  popup?.focus();
  return popup;
}

export function focusMainErpWindow() {
  if (typeof window === "undefined") return;
  const main = window.open("/", "teammillimeter-erp-main");
  main?.focus();
}
