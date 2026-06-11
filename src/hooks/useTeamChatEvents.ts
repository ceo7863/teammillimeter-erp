import { useEffect, useRef, useState } from "react";
import { getAuthToken, isApiModeEnabled } from "@/utils/erpApi";

export type TeamChatStreamEvent =
  | { type: "message.new"; channelId: string; message: unknown }
  | { type: "message.updated"; channelId: string; message: unknown }
  | { type: "message.deleted"; channelId: string; message: unknown }
  | { type: "read.updated"; channelId: string; userId: number; lastReadMessageId: number }
  | { type: "channel.updated"; channelId: string };

type Options = {
  enabled?: boolean;
  onEvent: (event: TeamChatStreamEvent) => void;
};

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

export function useTeamChatEvents(options: Options) {
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isApiModeEnabled() || options.enabled === false) {
      setConnected(false);
      return;
    }
    const token = getAuthToken();
    if (!token) return;

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof window.setTimeout> | null = null;
    let retryMs = 2000;

    const connect = () => {
      const url = `${apiBase()}/team-chat/events?token=${encodeURIComponent(token)}`;
      es = new EventSource(url);
      es.onopen = () => {
        setConnected(true);
        retryMs = 2000;
      };
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as TeamChatStreamEvent;
          if (payload?.type) onEventRef.current(payload);
        } catch {
          // ignore
        }
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        es = null;
        retryTimer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 1.5, 30000);
      };
    };

    connect();
    return () => {
      setConnected(false);
      if (retryTimer) window.clearTimeout(retryTimer);
      es?.close();
    };
  }, [options.enabled]);

  return { connected };
}
