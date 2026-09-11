import { getAuthToken, isApiModeEnabled } from "@/utils/erpApi";
import { SseJsonStreamParser, computeSseRetryDelayMs } from "@/utils/teamChatSseParser";

export type TeamChatStreamEvent =
  | { type: "message.new"; channelId: string; message: unknown }
  | { type: "message.updated"; channelId: string; message: unknown }
  | { type: "message.deleted"; channelId: string; message: unknown }
  | { type: "read.updated"; channelId: string; userId: number; lastReadMessageId: number }
  | { type: "channel.updated"; channelId: string };

export type TeamChatAuthExpiredReason = "missing_token" | "unauthorized";

type Listener = (event: TeamChatStreamEvent) => void;
type ConnectionListener = (connected: boolean) => void;
type AuthExpiredListener = (reason: TeamChatAuthExpiredReason) => void;

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

function eventsUrl() {
  // Never put JWT / ticket / auth in the query string — nginx access logs capture $request.
  return `${apiBase()}/team-chat/events`;
}

class TeamChatEventHub {
  private listeners = new Set<Listener>();
  private connectionListeners = new Set<ConnectionListener>();
  private authExpiredListeners = new Set<AuthExpiredListener>();
  private abort: AbortController | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private connected = false;
  private authExpired = false;
  private lifecycleBound = false;
  private connectGeneration = 0;

  subscribe(
    listener: Listener,
    onConnection?: ConnectionListener,
    onAuthExpired?: AuthExpiredListener,
  ) {
    this.listeners.add(listener);
    if (onConnection) {
      this.connectionListeners.add(onConnection);
      onConnection(this.connected);
    }
    if (onAuthExpired) this.authExpiredListeners.add(onAuthExpired);
    this.bindLifecycle();
    this.ensureConnection();
    return () => {
      this.listeners.delete(listener);
      if (onConnection) this.connectionListeners.delete(onConnection);
      if (onAuthExpired) this.authExpiredListeners.delete(onAuthExpired);
      if (this.listeners.size === 0) this.teardown();
    };
  }

  /** Test helper */
  getDebugCount() {
    return this.connectGeneration;
  }

  /** Test helper */
  isRetryScheduled() {
    return this.retryTimer != null;
  }

  private setConnected(value: boolean) {
    if (this.connected === value) return;
    this.connected = value;
    for (const fn of this.connectionListeners) fn(value);
  }

  private emit(event: TeamChatStreamEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private emitAuthExpired(reason: TeamChatAuthExpiredReason) {
    this.authExpired = true;
    this.setConnected(false);
    for (const fn of this.authExpiredListeners) fn(reason);
  }

  private bindLifecycle() {
    if (this.lifecycleBound || typeof window === "undefined") return;
    this.lifecycleBound = true;
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private unbindLifecycle() {
    if (!this.lifecycleBound || typeof window === "undefined") return;
    this.lifecycleBound = false;
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  private onOnline = () => {
    if (this.listeners.size === 0 || this.authExpired) return;
    this.attempt = 0;
    this.clearRetryTimer();
    this.ensureConnection({ force: true });
  };

  private onOffline = () => {
    this.clearRetryTimer();
    this.abortActiveStream();
    this.setConnected(false);
  };

  private onVisibility = () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "visible") return;
    if (this.listeners.size === 0 || this.authExpired) return;
    if (this.connected && this.abort && !this.abort.signal.aborted) return;
    this.attempt = 0;
    this.clearRetryTimer();
    this.ensureConnection({ force: true });
  };

  private clearRetryTimer() {
    if (this.retryTimer != null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private abortActiveStream() {
    const reader = this.reader;
    this.reader = null;
    try {
      reader?.cancel().catch(() => undefined);
    } catch {
      // ignore
    }
    if (this.abort) {
      try {
        this.abort.abort();
      } catch {
        // ignore
      }
      this.abort = null;
    }
  }

  private scheduleReconnect() {
    if (this.listeners.size === 0 || this.authExpired) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (this.retryTimer != null) return;
    const delay = computeSseRetryDelayMs(this.attempt);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.ensureConnection();
    }, delay);
  }

  private ensureConnection(options?: { force?: boolean }) {
    if (!isApiModeEnabled()) return;
    if (this.listeners.size === 0) return;
    if (this.authExpired) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (this.abort && !options?.force) return;

    const token = getAuthToken();
    if (!token) {
      this.emitAuthExpired("missing_token");
      return;
    }

    this.abortActiveStream();
    this.clearRetryTimer();

    const abort = new AbortController();
    this.abort = abort;
    const generation = ++this.connectGeneration;
    const parser = new SseJsonStreamParser((payload) => {
      const event = payload as TeamChatStreamEvent;
      if (event && typeof event === "object" && "type" in event && event.type) {
        this.emit(event);
      }
    });

    void (async () => {
      try {
        const response = await fetch(eventsUrl(), {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
          },
          signal: abort.signal,
          cache: "no-store",
        });

        if (abort.signal.aborted || this.abort !== abort) return;

        if (response.status === 401) {
          this.emitAuthExpired("unauthorized");
          this.abortActiveStream();
          return;
        }

        if (!response.ok || !response.body) {
          this.setConnected(false);
          this.abortActiveStream();
          this.scheduleReconnect();
          return;
        }

        this.setConnected(true);
        this.attempt = 0;
        const reader = response.body.getReader();
        this.reader = reader;
        const decoder = new TextDecoder("utf-8");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (abort.signal.aborted || this.abort !== abort) break;
          parser.push(decoder.decode(value, { stream: true }));
        }
        parser.push(decoder.decode());

        if (abort.signal.aborted || this.abort !== abort) return;
        this.setConnected(false);
        this.abortActiveStream();
        this.scheduleReconnect();
      } catch {
        if (abort.signal.aborted || generation !== this.connectGeneration) return;
        this.setConnected(false);
        this.abortActiveStream();
        this.scheduleReconnect();
      }
    })();
  }

  private teardown() {
    this.clearRetryTimer();
    this.abortActiveStream();
    this.unbindLifecycle();
    this.attempt = 0;
    this.authExpired = false;
    this.setConnected(false);
  }
}

export const teamChatEventHub = new TeamChatEventHub();

/** Test-only factory to avoid sharing singleton state across cases. */
export function createTeamChatEventHubForTests() {
  return new TeamChatEventHub();
}
