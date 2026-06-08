import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

/** Ignore backdrop dismiss briefly after open to block mobile ghost-tap close. */
export function useBackdropCloseGuard(active: boolean, delayMs = 500) {
  const suppressUntilRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    suppressUntilRef.current = performance.now() + delayMs;
  }, [active, delayMs]);

  return useCallback((event: MouseEvent | PointerEvent, onClose: () => void) => {
    if (event.target !== event.currentTarget) return;
    if (performance.now() < suppressUntilRef.current) return;
    onClose();
  }, []);
}
