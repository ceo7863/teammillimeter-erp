import { useEffect, useRef, useState } from "react";
import { getAuthToken, isApiModeEnabled } from "@/utils/erpApi";
import {
  erpDomainEventHub,
  type ErpDomainAuthExpiredReason,
  type ErpDomainStreamEvent,
} from "@/utils/erpDomainEventHub";

export type { ErpDomainStreamEvent, ErpDomainAuthExpiredReason };

const SYNC_DEGRADED_AFTER_MS = 3000;

type Options = {
  /** Defaults to true when api mode + auth token are present. */
  enabled?: boolean;
  onEvent?: (event: ErpDomainStreamEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
  onAuthExpired?: (reason: ErpDomainAuthExpiredReason) => void;
};

/**
 * Subscribes to the shared ERP domain SSE hub.
 * Does not apply payload data — App wires refetch / merge from `onEvent`.
 */
export function useErpDomainRealtime(options: Options = {}) {
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;
  const onConnectionChangeRef = useRef(options.onConnectionChange);
  onConnectionChangeRef.current = options.onConnectionChange;
  const onAuthExpiredRef = useRef(options.onAuthExpired);
  onAuthExpiredRef.current = options.onAuthExpired;

  const [streamConnected, setStreamConnected] = useState(false);
  const [syncDegraded, setSyncDegraded] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);

  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!isApiModeEnabled() || !enabled || !getAuthToken()) {
      setStreamConnected(false);
      setSyncDegraded(false);
      return;
    }

    let degradedTimer: ReturnType<typeof setTimeout> | null = null;

    const clearDegradedTimer = () => {
      if (degradedTimer != null) {
        clearTimeout(degradedTimer);
        degradedTimer = null;
      }
    };

    const unsubscribe = erpDomainEventHub.subscribe(
      (event) => {
        if (event.type === "erp.domain_change" && event.eventId) {
          setLastEventId(String(event.eventId));
        }
        setLastSyncedAt(new Date().toISOString());
        onEventRef.current?.(event);
      },
      (connected) => {
        setStreamConnected(connected);
        onConnectionChangeRef.current?.(connected);
        clearDegradedTimer();
        if (connected) {
          setSyncDegraded(false);
        } else {
          degradedTimer = setTimeout(() => {
            setSyncDegraded(true);
          }, SYNC_DEGRADED_AFTER_MS);
        }
      },
      (reason) => {
        onAuthExpiredRef.current?.(reason);
      },
    );

    return () => {
      clearDegradedTimer();
      unsubscribe();
    };
  }, [enabled]);

  return {
    streamConnected,
    lastSyncedAt,
    syncDegraded,
    lastEventId,
  };
}
