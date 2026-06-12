import { buildTeamChatThreadPath, TEAM_CHAT_STANDALONE_PATH } from "@/utils/teamChatRoute";
import {
  cancelTeamChatIncomingBroadcasts,
  clearPendingTeamChatThreadIf,
  clearTeamChatThreadHandoff,
  markTeamChatThreadDismissed,
} from "@/utils/teamChatShare";

const LIST_POPUP_NAME = "teammillimeter-team-chat";
const LIST_POPUP_POSITION_KEY = "teammillimeter-erp-team-chat-list-popup-bounds";
const THREAD_POPUP_BOUNDS_PREFIX = "teammillimeter-erp-team-chat-thread-popup-bounds";
const TEAM_CHAT_MINIMIZED_KEY = "teammillimeter-erp-team-chat-minimized";
const POPUP_CHROME = "menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no";
const MINIMIZED_POPUP_SCREEN_POS = { left: 32000, top: 32000 };

type PopupBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const LIST_POPUP_DEFAULT_SIZE = { width: 380, height: 760 };
const THREAD_POPUP_DEFAULT_SIZE = { width: 420, height: 760 };

let listPopupTracker: number | null = null;
let cachedListPopup: Window | null = null;
const threadPopupCache = new Map<string, Window>();
const threadPopupTrackers = new Map<string, number>();

function rememberListPopup(popup: Window | null) {
  if (isTeamChatPopupActuallyOpen(popup)) {
    cachedListPopup = popup;
    return popup;
  }
  if (cachedListPopup === popup) cachedListPopup = null;
  return null;
}

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

function threadPopupWindowName(channelId: string) {
  const safe = String(channelId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return `teammillimeter-team-chat-thread-${safe || "unknown"}`;
}

function threadPopupBoundsKey(channelId: string) {
  return `${THREAD_POPUP_BOUNDS_PREFIX}:${channelId}`;
}

function countOpenThreadPopups(excludeChannelId?: string) {
  let count = 0;
  for (const [id, popup] of threadPopupCache) {
    if (id === excludeChannelId) continue;
    if (isTeamChatPopupActuallyOpen(popup)) count += 1;
    else threadPopupCache.delete(id);
  }
  return count;
}

function defaultThreadPopupBounds(channelId: string): PopupBounds {
  const list = loadListPopupBounds();
  const openCount = countOpenThreadPopups(channelId);
  const hash = [...channelId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const cascade = 28 + openCount * 32 + (hash % 5) * 6;
  return clampPopupBounds(
    {
      left: list.left + cascade,
      top: list.top + cascade,
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

function loadThreadPopupBounds(channelId: string) {
  return loadPopupBounds(
    threadPopupBoundsKey(channelId),
    () => defaultThreadPopupBounds(channelId),
    THREAD_POPUP_DEFAULT_SIZE,
  );
}

function rememberThreadPopup(channelId: string, popup: Window | null) {
  if (isTeamChatPopupActuallyOpen(popup)) {
    threadPopupCache.set(channelId, popup);
    return popup;
  }
  if (threadPopupCache.get(channelId) === popup) threadPopupCache.delete(channelId);
  return null;
}

export function getOpenTeamChatThreadPopup(channelId: string): Window | null {
  const id = String(channelId || "").trim();
  if (!id) return null;
  const cached = threadPopupCache.get(id);
  if (cached && !cached.closed) return cached;
  threadPopupCache.delete(id);
  return null;
}

function trackThreadPopupBounds(channelId: string, popup: Window) {
  rememberThreadPopup(channelId, popup);
  const existing = threadPopupTrackers.get(channelId);
  if (existing !== undefined) window.clearInterval(existing);
  const tracker = window.setInterval(() => {
    if (popup.closed) {
      if (threadPopupCache.get(channelId) === popup) threadPopupCache.delete(channelId);
      const current = threadPopupTrackers.get(channelId);
      if (current === tracker) threadPopupTrackers.delete(channelId);
      window.clearInterval(tracker);
      markTeamChatThreadDismissed(channelId);
      cancelTeamChatIncomingBroadcasts(channelId);
      clearTeamChatThreadHandoff();
      clearPendingTeamChatThreadIf(channelId);
      return;
    }
    const bounds = readPopupBounds(popup, THREAD_POPUP_DEFAULT_SIZE);
    if (bounds) savePopupBounds(threadPopupBoundsKey(channelId), bounds, THREAD_POPUP_DEFAULT_SIZE);
  }, 800);
  threadPopupTrackers.set(channelId, tracker);
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
  rememberListPopup(popup);
  if (listPopupTracker !== null) window.clearInterval(listPopupTracker);
  listPopupTracker = window.setInterval(() => {
    if (popup.closed) {
      if (cachedListPopup === popup) cachedListPopup = null;
      if (listPopupTracker !== null) window.clearInterval(listPopupTracker);
      listPopupTracker = null;
      return;
    }
    const bounds = readPopupBounds(popup, LIST_POPUP_DEFAULT_SIZE);
    if (bounds) savePopupBounds(LIST_POPUP_POSITION_KEY, bounds, LIST_POPUP_DEFAULT_SIZE);
  }, 800);
}

export function isTeamChatPopupActuallyOpen(popup: Window | null): popup is Window {
  return popup != null && !popup.closed;
}

/** Returns the named list popup when it is already open (never creates a window). */
export function getOpenTeamChatListPopup(): Window | null {
  if (cachedListPopup && !cachedListPopup.closed) return cachedListPopup;
  cachedListPopup = null;
  return null;
}

export function isTeamChatListPopupMinimized() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(TEAM_CHAT_MINIMIZED_KEY) === "1";
  } catch {
    return false;
  }
}

export function restoreTeamChatListPopup(popup: Window) {
  if (!isTeamChatPopupActuallyOpen(popup)) return;
  const bounds = loadListPopupBounds();
  try {
    popup.moveTo(Math.round(bounds.left), Math.round(bounds.top));
    popup.resizeTo(Math.round(bounds.width), Math.round(bounds.height));
    window.sessionStorage.removeItem(TEAM_CHAT_MINIMIZED_KEY);
  } catch {
    // ignore
  }
}

/** Move the list popup off-screen so SSE can reopen it without a user gesture. */
export function minimizeTeamChatListPopup() {
  const popup = getOpenTeamChatListPopup();
  if (!popup) return;
  const bounds = readPopupBounds(popup, LIST_POPUP_DEFAULT_SIZE);
  if (bounds) savePopupBounds(LIST_POPUP_POSITION_KEY, bounds, LIST_POPUP_DEFAULT_SIZE);
  try {
    popup.moveTo(MINIMIZED_POPUP_SCREEN_POS.left, MINIMIZED_POPUP_SCREEN_POS.top);
    window.sessionStorage.setItem(TEAM_CHAT_MINIMIZED_KEY, "1");
  } catch {
    // ignore
  }
}

/** Bring a popup above sibling windows (list/thread/ERP). */
export function raiseTeamChatPopup(popup: Window | null) {
  if (!isTeamChatPopupActuallyOpen(popup)) return;
  try {
    popup.focus();
  } catch {
    return;
  }
  for (const delay of [60, 180, 400]) {
    window.setTimeout(() => {
      try {
        if (!popup.closed) popup.focus();
      } catch {
        // ignore
      }
    }, delay);
  }
}

type OpenPopupOptions = {
  onOpened?: (popup: Window) => void;
  focus?: boolean;
  raise?: boolean;
};

/** Reuse a named popup when possible (avoids popup blockers after the user opened chat once). */
function focusOrOpenNamedPopup(
  name: string,
  url: string,
  bounds: PopupBounds,
  options: OpenPopupOptions = {},
): Window | null {
  if (typeof window === "undefined") return null;
  const features = buildPopupFeatures(bounds);
  let popup = window.open("", name, features);
  if (isTeamChatPopupActuallyOpen(popup)) {
    if (name === LIST_POPUP_NAME && isTeamChatListPopupMinimized()) {
      restoreTeamChatListPopup(popup);
    }
    try {
      const currentPath = popup.location.pathname.replace(/\/+$/, "") || "/";
      const targetPath = new URL(url, window.location.origin).pathname.replace(/\/+$/, "") || "/";
      if (currentPath !== targetPath) {
        popup.location.replace(url);
      }
    } catch {
      try {
        popup.location.replace(url);
      } catch {
        // ignore
      }
    }
    if (options.raise) {
      raiseTeamChatPopup(popup);
    } else if (options.focus !== false) {
      popup.focus();
    }
    options.onOpened?.(popup);
    if (name === LIST_POPUP_NAME) rememberListPopup(popup);
    return popup;
  }
  popup = window.open(url, name, features);
  if (isTeamChatPopupActuallyOpen(popup)) {
    if (name === LIST_POPUP_NAME) rememberListPopup(popup);
    if (options.raise) {
      raiseTeamChatPopup(popup);
    } else if (options.focus !== false) {
      popup.focus();
    }
    options.onOpened?.(popup);
    return popup;
  }
  return null;
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

export function captureTeamChatThreadPopupBounds(channelId?: string) {
  if (typeof window === "undefined") return;
  const id =
    String(channelId || "").trim() ||
    new URLSearchParams(window.location.search).get("channel")?.trim() ||
    "";
  if (!id) return;
  savePopupBounds(
    threadPopupBoundsKey(id),
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

export function isTeamChatListPopupWindow() {
  return isTeamChatPopupWindow() && !isTeamChatThreadPopupWindow();
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

/** List popups are ~380px wide; desktop pointer users still get one thread popup per channel. */
export function shouldOpenTeamChatThreadFromList(options: {
  listOnly?: boolean;
  threadOnly?: boolean;
  standalone?: boolean;
  mobileLayout?: boolean;
}) {
  if (!options.listOnly || options.threadOnly) return false;
  if (options.standalone && isTeamChatListPopupWindow()) {
    return typeof window === "undefined" || window.matchMedia("(pointer: fine)").matches;
  }
  return !options.mobileLayout && isTeamChatDesktopPopupMode();
}

export function openTeamChatPopup(options?: { focus?: boolean; raise?: boolean }) {
  if (typeof window === "undefined") return null;
  if (isTeamChatPopupWindow() && !isTeamChatThreadPopupWindow()) {
    if (options?.raise) {
      raiseTeamChatPopup(window);
    } else if (options?.focus !== false) {
      window.focus();
    }
    return window;
  }
  const url = `${window.location.origin}${TEAM_CHAT_STANDALONE_PATH}`;
  const popup = focusOrOpenNamedPopup(LIST_POPUP_NAME, url, loadListPopupBounds(), {
    onOpened: trackListPopupBounds,
    focus: options?.focus,
    raise: options?.raise,
  });
  if (isTeamChatPopupActuallyOpen(popup)) return popup;
  const fallback = window.open(url, LIST_POPUP_NAME, buildPopupFeatures(loadListPopupBounds()));
  if (isTeamChatPopupActuallyOpen(fallback)) {
    rememberListPopup(fallback);
    if (options?.raise) raiseTeamChatPopup(fallback);
    else if (options?.focus !== false) fallback.focus();
    trackListPopupBounds(fallback);
    return fallback;
  }
  return null;
}

export function openTeamChatThreadPopup(channelId: string, options?: { focus?: boolean; raise?: boolean }) {
  if (typeof window === "undefined") return null;
  const id = String(channelId || "").trim();
  if (!id) return null;

  const url = `${window.location.origin}${buildTeamChatThreadPath(id)}`;
  if (isTeamChatThreadPopupWindow()) {
    const currentId = new URLSearchParams(window.location.search).get("channel")?.trim();
    if (currentId === id) {
      if (options?.raise) {
        raiseTeamChatPopup(window);
      } else if (options?.focus !== false) {
        window.focus();
      }
      return window;
    }
  }

  const popupName = threadPopupWindowName(id);
  const bounds = loadThreadPopupBounds(id);
  const popup = focusOrOpenNamedPopup(popupName, url, bounds, {
    focus: options?.focus,
    raise: options?.raise ?? true,
    onOpened: (opened) => trackThreadPopupBounds(id, opened),
  });
  if (isTeamChatPopupActuallyOpen(popup)) return popup;

  const fallback = window.open(url, popupName, buildPopupFeatures(bounds));
  if (isTeamChatPopupActuallyOpen(fallback)) {
    trackThreadPopupBounds(id, fallback);
    if (options?.raise) raiseTeamChatPopup(fallback);
    else if (options?.focus !== false) fallback.focus();
    return fallback;
  }
  return null;
}

export function focusMainErpWindow() {
  if (typeof window === "undefined") return;
  const main = window.open("/", "teammillimeter-erp-main");
  main?.focus();
}
