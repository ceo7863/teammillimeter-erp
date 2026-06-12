import type { TeamChatLink } from "@/utils/teamChatLinks";
import {
  isTeamChatDesktopPopupMode,
  isTeamChatPopupActuallyOpen,
  isTeamChatPopupWindow,
  isTeamChatThreadPopupWindow,
  openTeamChatPopup,
  openTeamChatThreadPopup,
  raiseTeamChatPopup,
} from "@/utils/teamChatPopup";

export type TeamChatSharePayload = {
  link: TeamChatLink;
  body?: string;
  channelId?: string;
};

const PENDING_TEAM_CHAT_SHARE_KEY = "teammillimeter-erp-pending-team-chat-share";
const PENDING_TEAM_CHAT_THREAD_KEY = "teammillimeter-erp-pending-team-chat-thread";
const PENDING_TEAM_CHAT_THREAD_HANDOFF_KEY = "teammillimeter-erp-pending-team-chat-thread-handoff";
const TEAM_CHAT_SHARE_DISMISSED_KEY = "teammillimeter-erp-team-chat-share-dismissed";
const DISMISSED_THREAD_PREFIX = "teammillimeter-erp-team-chat-dismissed-thread:";
const DISMISSED_THREAD_TTL_MS = 5000;

/** Remove share/handoff keys from every storage bucket (legacy session + local). */
function clearTeamChatShareStorageKeys() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_TEAM_CHAT_SHARE_KEY);
    window.localStorage.removeItem(PENDING_TEAM_CHAT_THREAD_HANDOFF_KEY);
    window.sessionStorage.removeItem(PENDING_TEAM_CHAT_SHARE_KEY);
    window.sessionStorage.removeItem(PENDING_TEAM_CHAT_THREAD_HANDOFF_KEY);
  } catch {
    // ignore
  }
}

const incomingBroadcastTimers = new Map<string, number[]>();
export const TEAM_CHAT_OPEN_EVENT = "erp-open-team-chat";
export const TEAM_CHAT_OPEN_INCOMING_EVENT = "erp-open-team-chat-incoming";
export const TEAM_CHAT_RESET_LIST_EVENT = "erp-team-chat-reset-list";
export const TEAM_CHAT_SHARE_CHANNEL = "erp-team-chat-share";
export const TEAM_CHAT_INCOMING_PROMPT_EVENT = "erp-team-chat-incoming-prompt";

export type TeamChatIncomingPromptDetail = {
  channelId: string;
  sender: string;
  preview: string;
};

export function broadcastTeamChatIncoming(payload: { channelId: string; inline?: boolean }) {
  if (typeof window === "undefined") return;
  try {
    new BroadcastChannel(TEAM_CHAT_SHARE_CHANNEL).postMessage({
      type: "incoming",
      channelId: payload.channelId,
      inline: payload.inline === true,
    });
  } catch {
    // ignore
  }
}

export function broadcastTeamChatUnreadChanged() {
  if (typeof window === "undefined") return;
  try {
    new BroadcastChannel(TEAM_CHAT_SHARE_CHANNEL).postMessage({ type: "unread-changed" });
  } catch {
    // ignore
  }
}

export function stashPendingTeamChatThread(channelId: string) {
  const id = String(channelId || "").trim();
  if (!id || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_TEAM_CHAT_THREAD_KEY, id);
  } catch {
    // ignore
  }
  broadcastTeamChatIncoming({ channelId: id, inline: true });
}

function peekPendingTeamChatThread(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = window.sessionStorage.getItem(PENDING_TEAM_CHAT_THREAD_KEY);
    return id ? String(id).trim() || null : null;
  } catch {
    return null;
  }
}

export function consumePendingTeamChatThread(): string | null {
  const id = peekPendingTeamChatThread();
  if (!id || typeof window === "undefined") return null;
  try {
    window.sessionStorage.removeItem(PENDING_TEAM_CHAT_THREAD_KEY);
  } catch {
    // ignore
  }
  return id;
}

export function clearPendingTeamChatThread() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_TEAM_CHAT_THREAD_KEY);
  } catch {
    // ignore
  }
}

export function clearPendingTeamChatThreadIf(channelId: string) {
  const id = String(channelId || "").trim();
  if (!id || peekPendingTeamChatThread() !== id) return;
  clearPendingTeamChatThread();
}

export function stashTeamChatShare(payload: TeamChatSharePayload, options?: { broadcast?: boolean }) {
  if (typeof window === "undefined") return;
  clearTeamChatShareDismissed();
  try {
    window.localStorage.setItem(PENDING_TEAM_CHAT_SHARE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
  if (options?.broadcast === false) return;
  try {
    new BroadcastChannel(TEAM_CHAT_SHARE_CHANNEL).postMessage({ type: "share" });
  } catch {
    // ignore
  }
}

export function peekTeamChatShare(): TeamChatSharePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_TEAM_CHAT_SHARE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TeamChatSharePayload;
  } catch {
    return null;
  }
}

export function clearTeamChatShareDismissed() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TEAM_CHAT_SHARE_DISMISSED_KEY);
  } catch {
    // ignore
  }
}

export function markTeamChatShareDismissed() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEAM_CHAT_SHARE_DISMISSED_KEY, "1");
  } catch {
    // ignore
  }
}

export function isTeamChatShareDismissed() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TEAM_CHAT_SHARE_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function broadcastTeamChatShareDismissed() {
  if (typeof window === "undefined") return;
  try {
    new BroadcastChannel(TEAM_CHAT_SHARE_CHANNEL).postMessage({ type: "share-dismissed" });
  } catch {
    // ignore
  }
}

/** Clear pending share in this window (no broadcast). */
export function clearTeamChatShareLocally() {
  clearTeamChatShareStorageKeys();
  markTeamChatShareDismissed();
}

/** Clear all pending share payloads across list/thread windows. */
export function dismissTeamChatShare() {
  clearTeamChatShareLocally();
  broadcastTeamChatShareDismissed();
}

export function peekTeamChatThreadHandoff(): TeamChatSharePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_TEAM_CHAT_THREAD_HANDOFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TeamChatSharePayload;
  } catch {
    return null;
  }
}

export function consumeTeamChatShare(): TeamChatSharePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_TEAM_CHAT_SHARE_KEY);
    window.localStorage.removeItem(PENDING_TEAM_CHAT_SHARE_KEY);
    window.sessionStorage.removeItem(PENDING_TEAM_CHAT_SHARE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TeamChatSharePayload;
  } catch {
    return null;
  }
}

export function openTeamChatWithShare(payload: TeamChatSharePayload, options?: { popup?: boolean }) {
  stashTeamChatShare(payload);
  if (typeof window === "undefined") return;
  const usePopup = options?.popup ?? isTeamChatDesktopPopupMode();
  if (usePopup) {
    const popup = openTeamChatPopup();
    if (popup && !popup.closed) {
      try {
        popup.focus();
      } catch {
        // ignore
      }
    }
    return;
  }
  window.dispatchEvent(new CustomEvent(TEAM_CHAT_OPEN_EVENT));
}

export function resetTeamChatListView() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TEAM_CHAT_RESET_LIST_EVENT));
  try {
    new BroadcastChannel(TEAM_CHAT_SHARE_CHANNEL).postMessage({ type: "reset-list" });
  } catch {
    // ignore
  }
}

export function cancelTeamChatIncomingBroadcasts(channelId?: string) {
  if (typeof window === "undefined") return;
  const cancelFor = (id: string) => {
    const timers = incomingBroadcastTimers.get(id);
    if (!timers) return;
    for (const timerId of timers) window.clearTimeout(timerId);
    incomingBroadcastTimers.delete(id);
  };
  if (channelId) {
    cancelFor(String(channelId).trim());
    return;
  }
  for (const id of incomingBroadcastTimers.keys()) cancelFor(id);
}

export function scheduleTeamChatIncomingBroadcast(channelId: string, delaysMs = [250, 800, 1600]) {
  const id = String(channelId || "").trim();
  if (!id || typeof window === "undefined") return;
  cancelTeamChatIncomingBroadcasts(id);
  const timers: number[] = [];
  for (const delay of delaysMs) {
    const timerId = window.setTimeout(() => {
      broadcastTeamChatIncoming({ channelId: id, inline: true });
    }, delay);
    timers.push(timerId);
  }
  incomingBroadcastTimers.set(id, timers);
}

export function markTeamChatThreadDismissed(channelId: string) {
  const id = String(channelId || "").trim();
  if (!id || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${DISMISSED_THREAD_PREFIX}${id}`, String(Date.now()));
  } catch {
    // ignore
  }
  cancelTeamChatIncomingBroadcasts(id);
}

export function clearTeamChatThreadDismissed(channelId: string) {
  const id = String(channelId || "").trim();
  if (!id || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(`${DISMISSED_THREAD_PREFIX}${id}`);
  } catch {
    // ignore
  }
}

export function isTeamChatThreadDismissed(channelId: string) {
  const id = String(channelId || "").trim();
  if (!id || typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(`${DISMISSED_THREAD_PREFIX}${id}`);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt) || Date.now() - dismissedAt > DISMISSED_THREAD_TTL_MS) {
      window.sessionStorage.removeItem(`${DISMISSED_THREAD_PREFIX}${id}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** One-time list→thread share handoff (localStorage, not re-broadcast). */
export function stashTeamChatThreadHandoff(payload: TeamChatSharePayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_TEAM_CHAT_THREAD_HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function consumeTeamChatThreadHandoff(): TeamChatSharePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_TEAM_CHAT_THREAD_HANDOFF_KEY);
    window.localStorage.removeItem(PENDING_TEAM_CHAT_THREAD_HANDOFF_KEY);
    window.sessionStorage.removeItem(PENDING_TEAM_CHAT_THREAD_HANDOFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TeamChatSharePayload;
  } catch {
    return null;
  }
}

export function clearTeamChatThreadHandoff() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_TEAM_CHAT_THREAD_HANDOFF_KEY);
    window.sessionStorage.removeItem(PENDING_TEAM_CHAT_THREAD_HANDOFF_KEY);
  } catch {
    // ignore
  }
}

export function openTeamChatIncomingInline(channelId: string) {
  const id = String(channelId || "").trim();
  if (!id || typeof window === "undefined") return;
  clearTeamChatThreadDismissed(id);
  if (isTeamChatDesktopPopupMode()) {
    const threadPopup = openTeamChatThreadPopup(id, { raise: true });
    if (isTeamChatPopupActuallyOpen(threadPopup)) {
      cancelTeamChatIncomingBroadcasts(id);
      clearPendingTeamChatThread();
      return true;
    }
    stashPendingTeamChatThread(id);
    const popup = openTeamChatPopup({ raise: true });
    if (isTeamChatPopupActuallyOpen(popup)) {
      scheduleTeamChatIncomingBroadcast(id);
      return true;
    }
    return false;
  }
  stashPendingTeamChatThread(id);
  window.dispatchEvent(new CustomEvent(TEAM_CHAT_OPEN_INCOMING_EVENT));
  return true;
}

export function openTeamChatList() {
  if (typeof window === "undefined") return;
  // Stale share payloads were opening a thread instead of the channel list.
  consumeTeamChatShare();
  clearTeamChatThreadHandoff();
  clearPendingTeamChatThread();
  resetTeamChatListView();
  if (isTeamChatDesktopPopupMode()) {
    openTeamChatPopup();
    return;
  }
  window.dispatchEvent(new CustomEvent(TEAM_CHAT_OPEN_EVENT));
}

export type TeamChatThreadOpenResult = { listOpened: boolean; threadOpened: boolean };

export function openTeamChatThread(channelId: string): Promise<TeamChatThreadOpenResult> {
  const id = String(channelId || "").trim();
  const failed: TeamChatThreadOpenResult = { listOpened: false, threadOpened: false };
  if (!id || typeof window === "undefined") return Promise.resolve(failed);

  clearPendingTeamChatThread();

  if (isTeamChatDesktopPopupMode()) {
    if (isTeamChatThreadPopupWindow()) {
      const currentId = new URLSearchParams(window.location.search).get("channel")?.trim();
      if (currentId === id) {
        raiseTeamChatPopup(window);
        return Promise.resolve({ listOpened: false, threadOpened: true });
      }
    }

    const threadPopup = openTeamChatThreadPopup(id, { raise: true });
    if (isTeamChatPopupActuallyOpen(threadPopup)) {
      cancelTeamChatIncomingBroadcasts(id);
      clearPendingTeamChatThread();
      return Promise.resolve({ listOpened: false, threadOpened: true });
    }

    const opened = openTeamChatIncomingInline(id);
    return Promise.resolve({ listOpened: opened, threadOpened: opened });
  }

  const opened = openTeamChatIncomingInline(id);
  return Promise.resolve({ listOpened: opened, threadOpened: opened });
}

export function promptTeamChatIncomingOpen(detail: TeamChatIncomingPromptDetail) {
  if (typeof window === "undefined" || isTeamChatPopupWindow()) return;
  clearPendingTeamChatThread();
  window.dispatchEvent(new CustomEvent(TEAM_CHAT_INCOMING_PROMPT_EVENT, { detail }));
}
