import type { ErpChatAction } from "@/utils/erpChatApi";

const PENDING_CHAT_ACTION_KEY = "teammillimeter-erp-pending-chat-action";

export function stashPendingChatAction(action: ErpChatAction) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_CHAT_ACTION_KEY, JSON.stringify(action));
  } catch {
    // ignore
  }
}

export function consumePendingChatAction(): ErpChatAction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_CHAT_ACTION_KEY);
    window.sessionStorage.removeItem(PENDING_CHAT_ACTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ErpChatAction;
  } catch {
    return null;
  }
}
