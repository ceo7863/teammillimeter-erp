import { useEffect, useRef, useState } from "react";
import { isApiModeEnabled } from "@/utils/erpApi";
import { teamChatEventHub, type TeamChatStreamEvent } from "@/utils/teamChatEventHub";

export type { TeamChatStreamEvent };

type Options = {
  enabled?: boolean;
  onEvent: (event: TeamChatStreamEvent) => void;
};

/** One shared SSE connection per browser tab; multiple hooks subscribe to the same stream. */
export function useTeamChatEvents(options: Options) {
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isApiModeEnabled() || options.enabled === false) {
      setConnected(false);
      return;
    }
    return teamChatEventHub.subscribe(
      (event) => onEventRef.current(event),
      (next) => setConnected(next),
    );
  }, [options.enabled]);

  return { connected };
}
