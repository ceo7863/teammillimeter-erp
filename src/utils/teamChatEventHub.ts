import { getAuthToken, isApiModeEnabled } from "@/utils/erpApi";

export type TeamChatStreamEvent =
  | { type: "message.new"; channelId: string; message: unknown }
  | { type: "message.updated"; channelId: string; message: unknown }
  | { type: "message.deleted"; channelId: string; message: unknown }
  | { type: "read.updated"; channelId: string; userId: number; lastReadMessageId: number }
  | { type: "channel.updated"; channelId: string };

type Listener = (event: TeamChatStreamEvent) => void;
type ConnectionListener = (connected: boolean) => void;

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

class TeamChatEventHub {
  private es: EventSource | null = null;
  private listeners = new Set<Listener>();
  private connectionListeners = new Set<ConnectionListener>();
  private retryTimer: ReturnType<typeof window.setTimeout> | null = null;
  private retryMs = 300;
  private connected = false;

  subscribe(listener: Listener, onConnection?: ConnectionListener) {
    this.listeners.add(listener);
    if (onConnection) {
      this.connectionListeners.add(onConnection);
      onConnection(this.connected);
    }
    this.ensureConnection();
    return () => {
      this.listeners.delete(listener);
      if (onConnection) this.connectionListeners.delete(onConnection);
      if (this.listeners.size === 0) this.teardown();
    };
  }

  private setConnected(value: boolean) {
    if (this.connected === value) return;
    this.connected = value;
    for (const fn of this.connectionListeners) fn(value);
  }

  private emit(event: TeamChatStreamEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private ensureConnection() {
    if (!isApiModeEnabled() || this.es) return;
    const token = getAuthToken();
    if (!token) return;

    const url = `${apiBase()}/team-chat/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    this.es = es;

    es.onopen = () => {
      this.setConnected(true);
      this.retryMs = 300;
    };
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as TeamChatStreamEvent;
        if (payload?.type) this.emit(payload);
      } catch {
        // ignore malformed payloads
      }
    };
    es.onerror = () => {
      this.setConnected(false);
      es.close();
      if (this.es === es) this.es = null;
      if (this.listeners.size === 0) return;
      if (this.retryTimer) window.clearTimeout(this.retryTimer);
      const delay = this.retryMs;
      this.retryTimer = window.setTimeout(() => {
        this.retryTimer = null;
        this.retryMs = Math.min(this.retryMs * 1.4, 5000);
        this.ensureConnection();
      }, delay);
    };
  }

  private teardown() {
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.es?.close();
    this.es = null;
    this.setConnected(false);
  }
}

export const teamChatEventHub = new TeamChatEventHub();
