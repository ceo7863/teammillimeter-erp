import type { ErpChatAction } from "@/utils/erpChatApi";

const PENDING_CHAT_ACTION_KEY = "teammillimeter-erp-pending-chat-action";
export const ERP_PENDING_CHAT_ACTION_CHANNEL = "erp-pending-chat-action";
export const ERP_PENDING_CHAT_ACTION_EVENT = "erp-pending-chat-action";

function notifyPendingChatAction() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ERP_PENDING_CHAT_ACTION_EVENT));
  try {
    new BroadcastChannel(ERP_PENDING_CHAT_ACTION_CHANNEL).postMessage({ type: "stash" });
  } catch {
    // ignore
  }
}

export function stashPendingChatAction(action: ErpChatAction) {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(action);
    window.sessionStorage.setItem(PENDING_CHAT_ACTION_KEY, raw);
    window.localStorage.setItem(PENDING_CHAT_ACTION_KEY, raw);
  } catch {
    // ignore
  }
  notifyPendingChatAction();
}

export function consumePendingChatAction(): ErpChatAction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.sessionStorage.getItem(PENDING_CHAT_ACTION_KEY) ||
      window.localStorage.getItem(PENDING_CHAT_ACTION_KEY);
    window.sessionStorage.removeItem(PENDING_CHAT_ACTION_KEY);
    window.localStorage.removeItem(PENDING_CHAT_ACTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ErpChatAction;
  } catch {
    return null;
  }
}

export function peekPendingChatAction(): ErpChatAction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.sessionStorage.getItem(PENDING_CHAT_ACTION_KEY) ||
      window.localStorage.getItem(PENDING_CHAT_ACTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ErpChatAction;
  } catch {
    return null;
  }
}
